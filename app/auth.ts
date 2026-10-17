import { env } from 'cloudflare:workers';
import { getD1 } from '@/db/raw';

const COOKIE_NAME = 'crm_session';
const encoder = new TextEncoder();
const SESSION_DAYS = 7;

export type SessionActor = {
  id: number | null;
  username: string;
  displayName: string;
  role: 'admin' | 'sales';
  managerId: number | null;
  legacy: boolean;
};

/** read = view; write = edit business fields / complete todos; assign = change owner */
export type AccessMode = 'read' | 'write' | 'assign';

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function getSecret() {
  if (!env.CRM_ACCESS_PASSWORD) throw new Error('访问密码尚未配置');
  return env.CRM_ACCESS_PASSWORD;
}
function readCookie(request: Request, name: string) {
  const item = (request.headers.get('cookie') || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}
function cookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function verifyPassword(password: string) {
  return equalBytes(await sha256(password), await sha256(getSecret()));
}
async function legacyToken() {
  return toHex(await sha256(`${getSecret()}:customer-crm-session-v1`));
}

export async function hashPassword(password: string, salt?: string, iterations = 120000) {
  const saltBytes = salt ? fromBase64(salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    key,
    256,
  );
  return { salt: toBase64(saltBytes), hash: toBase64(new Uint8Array(bits)), iterations };
}

export async function verifyUserCredentials(username: string, password: string) {
  const row = await getD1()
    .prepare(
      'SELECT id, username, display_name AS displayName, role, manager_id AS managerId, password_salt AS passwordSalt, password_hash AS passwordHash, password_iterations AS passwordIterations, active FROM crm_users WHERE username=? LIMIT 1',
    )
    .bind(username.trim().toLowerCase())
    .first<any>();
  if (!row || !row.active) return null;
  const calculated = await hashPassword(password, row.passwordSalt, row.passwordIterations);
  if (!equalBytes(fromBase64(calculated.hash), fromBase64(row.passwordHash))) return null;
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.displayName,
    role: row.role as 'admin' | 'sales',
    managerId: row.managerId == null ? null : Number(row.managerId),
    legacy: false,
  } satisfies SessionActor;
}

export async function createUserSession(request: Request, user: SessionActor) {
  if (user.id === null) return cookie(request, await legacyToken(), SESSION_DAYS * 86400);
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = toHex(await sha256(token));
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000).toISOString();
  const db = getD1();
  await db.batch([
    db.prepare('DELETE FROM crm_sessions WHERE expires_at<=?').bind(now.toISOString()),
    db
      .prepare('INSERT INTO crm_sessions (user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(user.id, tokenHash, expires, now.toISOString()),
  ]);
  return cookie(request, token, SESSION_DAYS * 86400);
}

export async function getSessionActor(request: Request): Promise<SessionActor | null> {
  const actual = readCookie(request, COOKIE_NAME);
  if (!actual) return null;
  if (equalBytes(await sha256(actual), await sha256(await legacyToken()))) {
    return { id: null, username: 'admin', displayName: '陶帅', role: 'admin', managerId: null, legacy: true };
  }
  try {
    const row = await getD1()
      .prepare(
        'SELECT u.id,u.username,u.display_name AS displayName,u.role,u.manager_id AS managerId FROM crm_sessions s JOIN crm_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 LIMIT 1',
      )
      .bind(toHex(await sha256(actual)), new Date().toISOString())
      .first<any>();
    return row
      ? {
          id: Number(row.id),
          username: row.username,
          displayName: row.displayName,
          role: row.role,
          managerId: row.managerId == null ? null : Number(row.managerId),
          legacy: false,
        }
      : null;
  } catch {
    return null;
  }
}

export async function isAuthorized(request: Request) {
  return Boolean(await getSessionActor(request));
}
export async function requireAdmin(request: Request) {
  const actor = await getSessionActor(request);
  return actor?.role === 'admin' ? actor : null;
}

function decideAccess(
  actor: SessionActor,
  ownerUserId: number | null | undefined,
  ownerManagerId: number | null | undefined,
  mode: AccessMode,
): SessionActor | null {
  if (actor.role === 'admin') return actor;
  if (actor.id === null) return null;
  const isOwner = ownerUserId != null && ownerUserId === actor.id;
  const isDirectManager = ownerManagerId != null && ownerManagerId === actor.id;
  if (mode === 'read' || mode === 'assign') return isOwner || isDirectManager ? actor : null;
  // write: owner only — manager is read+assign, cannot edit business fields or complete subordinate todos
  return isOwner ? actor : null;
}

export async function canAccessCustomer(
  request: Request,
  customerId: number,
  mode: AccessMode = 'write',
): Promise<SessionActor | null> {
  const actor = await getSessionActor(request);
  if (!actor) return null;
  if (actor.role === 'admin') return actor;
  const row = await getD1()
    .prepare(
      `SELECT c.owner_user_id AS ownerUserId, u.manager_id AS ownerManagerId
       FROM customers c LEFT JOIN crm_users u ON u.id = c.owner_user_id
       WHERE c.id = ?`,
    )
    .bind(customerId)
    .first<{ ownerUserId: number | null; ownerManagerId: number | null }>();
  if (!row) return null;
  return decideAccess(actor, row.ownerUserId, row.ownerManagerId, mode);
}

export async function canAccessLead(
  request: Request,
  leadId: number,
  mode: AccessMode = 'write',
): Promise<SessionActor | null> {
  const actor = await getSessionActor(request);
  if (!actor) return null;
  if (actor.role === 'admin') return actor;
  const row = await getD1()
    .prepare(
      `SELECT l.owner_user_id AS ownerUserId, u.manager_id AS ownerManagerId
       FROM leads l LEFT JOIN crm_users u ON u.id = l.owner_user_id
       WHERE l.id = ?`,
    )
    .bind(leadId)
    .first<{ ownerUserId: number | null; ownerManagerId: number | null }>();
  if (!row) return null;
  return decideAccess(actor, row.ownerUserId, row.ownerManagerId, mode);
}

/** Visibility SQL fragment: own rows + direct subordinates' rows (bind actor.id twice). */
export function ownedOrSubordinateSql(aliasOwnerCol: string) {
  return `(${aliasOwnerCol}=? OR ${aliasOwnerCol} IN (SELECT id FROM crm_users WHERE manager_id=?))`;
}

export function forbidden() {
  return Response.json({ error: '无权访问该数据' }, { status: 403, headers: { 'cache-control': 'no-store' } });
}
export async function revokeSession(request: Request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return;
  try {
    await getD1().prepare('DELETE FROM crm_sessions WHERE token_hash=?').bind(toHex(await sha256(token))).run();
  } catch {
    /* ignore */
  }
}
export function clearSessionCookie(request: Request) {
  return cookie(request, '', 0);
}
export function unauthorized() {
  return Response.json({ error: '请先登录' }, { status: 401, headers: { 'cache-control': 'no-store' } });
}


export async function canAccessOpportunity(
  request: Request,
  opportunityId: number,
  mode: AccessMode = 'write',
): Promise<SessionActor | null> {
  const actor = await getSessionActor(request);
  if (!actor) return null;
  if (actor.role === 'admin') return actor;
  const row = await getD1()
    .prepare(
      `SELECT o.owner_user_id AS ownerUserId, u.manager_id AS ownerManagerId
       FROM opportunities o LEFT JOIN crm_users u ON u.id = o.owner_user_id
       WHERE o.id = ?`,
    )
    .bind(opportunityId)
    .first<{ ownerUserId: number | null; ownerManagerId: number | null }>();
  if (!row) return null;
  return decideAccess(actor, row.ownerUserId, row.ownerManagerId, mode);
}

/** Resolve access for a polymorphic follow-up target. */
export async function canAccessFollowUpTarget(
  request: Request,
  targetType: string,
  targetId: number,
  mode: AccessMode = 'write',
): Promise<SessionActor | null> {
  if (targetType === 'lead') return canAccessLead(request, targetId, mode);
  if (targetType === 'account' || targetType === 'customer') return canAccessCustomer(request, targetId, mode);
  if (targetType === 'opportunity') return canAccessOpportunity(request, targetId, mode);
  return null;
}

/** Pure helper for tests: manager may read/assign, not write. */
export function evaluateOwnershipAccess(
  actor: { id: number | null; role: 'admin' | 'sales' },
  ownerUserId: number | null,
  ownerManagerId: number | null,
  mode: AccessMode,
): boolean {
  return (
    decideAccess(
      {
        id: actor.id,
        username: '',
        displayName: '',
        role: actor.role,
        managerId: null,
        legacy: false,
      },
      ownerUserId,
      ownerManagerId,
      mode,
    ) !== null
  );
}
