import { hashPassword, requireAdmin } from '@/app/auth';
import { getD1 } from '@/db/raw';

const userSelect =
  'SELECT id,username,display_name AS displayName,role,active,manager_id AS managerId,created_at AS createdAt,updated_at AS updatedAt FROM crm_users ORDER BY active DESC,role,display_name';

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return Response.json({ error: '无管理员权限' }, { status: 403 });
  try {
    const rows = await getD1().prepare(userSelect).all();
    return Response.json({ users: rows.results }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await requireAdmin(request);
  if (!actor) return Response.json({ error: '无管理员权限' }, { status: 403 });
  try {
    const body = (await request.json()) as any;
    const username = String(body.username || '')
      .trim()
      .toLowerCase();
    const displayName = String(body.displayName || '').trim();
    const password = String(body.password || '');
    const role = body.role === 'admin' ? 'admin' : 'sales';
    let managerId: number | null =
      body.managerId === null || body.managerId === undefined || body.managerId === ''
        ? null
        : Number(body.managerId);

    if (!/^[a-z0-9_.-]{3,32}$/.test(username))
      return Response.json({ error: '用户名需为 3–32 位英文、数字或 ._-' }, { status: 400 });
    if (!displayName || password.length < 8)
      return Response.json({ error: '请填写姓名，初始密码至少 8 位' }, { status: 400 });

    const db = getD1();
    if (managerId !== null) {
      if (!Number.isInteger(managerId) || managerId < 1)
        return Response.json({ error: '直属上级无效' }, { status: 400 });
      const manager = await db
        .prepare('SELECT id FROM crm_users WHERE id=? AND active=1')
        .bind(managerId)
        .first();
      if (!manager) return Response.json({ error: '直属上级不存在或已停用' }, { status: 400 });
    }

    const secret = await hashPassword(password);
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        'INSERT INTO crm_users (username,display_name,role,password_salt,password_hash,password_iterations,active,manager_id,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?,?)',
      )
      .bind(username, displayName, role, secret.salt, secret.hash, secret.iterations, managerId, now, now)
      .run();
    const id = String(result.meta.last_row_id || '');
    await db
      .prepare(
        'INSERT INTO audit_logs (actor_user_id,actor_name,action,target_type,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(
        actor.id,
        actor.displayName,
        '创建账号',
        '用户',
        id,
        `${displayName} · ${role}${managerId ? ` · 上级#${managerId}` : ''}`,
        now,
      )
      .run();
    const rows = await db.prepare(userSelect).all();
    return Response.json({ users: rows.results });
  } catch (error: any) {
    return Response.json(
      {
        error: String(error?.message || '').includes('UNIQUE')
          ? '用户名已存在'
          : error?.message || '创建失败',
      },
      { status: 400 },
    );
  }
}
