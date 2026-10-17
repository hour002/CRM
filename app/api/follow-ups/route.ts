import { ensureDatabase } from '@/db/raw';
import { canAccessFollowUpTarget, getSessionActor, unauthorized, forbidden } from '@/app/auth';
import { validatePendingFollowUp } from '@/app/lib/crm-stages';

const TARGETS = new Set(['lead', 'account', 'opportunity', 'customer']);

function normalizeTarget(t: string) {
  return t === 'customer' ? 'account' : t;
}

export async function GET(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return unauthorized();
  try {
    const url = new URL(request.url);
    const targetType = url.searchParams.get('targetType') || url.searchParams.get('target');
    const targetId = url.searchParams.get('targetId');
    const db = await ensureDatabase();

    if (targetType && targetId) {
      const tt = normalizeTarget(targetType);
      if (!TARGETS.has(targetType) && !TARGETS.has(tt)) {
        return Response.json({ error: '无效的 target_type' }, { status: 400 });
      }
      if (!(await canAccessFollowUpTarget(request, tt, Number(targetId), 'read'))) return forbidden();
      const rows = await db
        .prepare(
          `SELECT id, owner_user_id AS ownerUserId, target_type AS targetType, target_id AS targetId,
            status, content, next_contact_at AS nextContactAt, completed_at AS completedAt,
            created_at AS createdAt, updated_at AS updatedAt
           FROM follow_ups WHERE target_type=? AND target_id=? ORDER BY created_at DESC`,
        )
        .bind(tt, Number(targetId))
        .all();
      return Response.json({ followUps: rows.results || [] });
    }

    // default: actor's own follow-ups
    if (actor.id == null) return Response.json({ followUps: [] });
    const rows = await db
      .prepare(
        `SELECT id, owner_user_id AS ownerUserId, target_type AS targetType, target_id AS targetId,
          status, content, next_contact_at AS nextContactAt, completed_at AS completedAt,
          created_at AS createdAt, updated_at AS updatedAt
         FROM follow_ups WHERE owner_user_id=? ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, next_contact_at ASC`,
      )
      .bind(actor.id)
      .all();
    return Response.json({ followUps: rows.results || [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return unauthorized();
  if (actor.id == null) return Response.json({ error: '请使用个人账号创建跟进' }, { status: 400 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rawType = String(body.targetType || '');
    const targetType = normalizeTarget(rawType);
    const targetId = Number(body.targetId);
    if (!TARGETS.has(rawType) && !TARGETS.has(targetType)) {
      return Response.json({ error: '无效的 target_type' }, { status: 400 });
    }
    if (!targetId) return Response.json({ error: 'target_id 必填' }, { status: 400 });
    if (!(await canAccessFollowUpTarget(request, targetType, targetId, 'write'))) return forbidden();

    const status = String(body.status || 'pending');
    const content = String(body.content || '');
    const nextContactAt = body.nextContactAt != null ? String(body.nextContactAt) : null;

    if (status === 'pending') {
      const err = validatePendingFollowUp(content, nextContactAt);
      if (err) return Response.json({ error: err }, { status: 400 });
    } else if (status === 'completed') {
      if (!content.trim()) return Response.json({ error: '完成跟进必须填写内容' }, { status: 400 });
    } else {
      return Response.json({ error: '无效的 status' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const db = await ensureDatabase();
    const result = await db
      .prepare(
        `INSERT INTO follow_ups (owner_user_id, target_type, target_id, status, content, next_contact_at, completed_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        actor.id,
        targetType,
        targetId,
        status,
        content,
        nextContactAt,
        status === 'completed' ? now : null,
        now,
        now,
      )
      .run();
    return Response.json({ id: result.meta?.last_row_id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '创建失败' }, { status: 500 });
  }
}
