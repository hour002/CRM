import { ensureDatabase } from '@/db/raw';
import { canAccessFollowUpTarget, getSessionActor, unauthorized, forbidden } from '@/app/auth';
import { shouldSpawnNextPending, validateCompleteFollowUp } from '@/app/lib/crm-stages';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getSessionActor(request);
  if (!actor) return unauthorized();
  try {
    const { id } = await context.params;
    const followUpId = Number(id);
    const body = (await request.json()) as { content?: string; nextContactAt?: string | null };
    const content = String(body.content || '');
    const err = validateCompleteFollowUp(content);
    if (err) return Response.json({ error: err }, { status: 400 });

    const db = await ensureDatabase();
    const row = await db
      .prepare(
        `SELECT id, owner_user_id AS ownerUserId, target_type AS targetType, target_id AS targetId, status
         FROM follow_ups WHERE id=?`,
      )
      .bind(followUpId)
      .first<{ id: number; ownerUserId: number; targetType: string; targetId: number; status: string }>();
    if (!row) return Response.json({ error: '跟进不存在' }, { status: 404 });
    if (row.status === 'completed') return Response.json({ error: '跟进已完成' }, { status: 400 });

    // Manager cannot complete subordinate todos (write access required on target + must be owner or admin)
    const targetActor = await canAccessFollowUpTarget(request, row.targetType, row.targetId, 'write');
    if (!targetActor) return forbidden();
    if (actor.role !== 'admin' && actor.id !== row.ownerUserId) {
      return Response.json({ error: '不能完成他人的待办' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const nextContactAt = body.nextContactAt != null && String(body.nextContactAt).trim() ? String(body.nextContactAt) : null;

    await db
      .prepare(
        `UPDATE follow_ups SET status='completed', content=?, completed_at=?, next_contact_at=COALESCE(?, next_contact_at), updated_at=? WHERE id=?`,
      )
      .bind(content, now, nextContactAt, now, followUpId)
      .run();

    let nextId: number | null = null;
    if (shouldSpawnNextPending(nextContactAt) && actor.id != null) {
      const spawned = await db
        .prepare(
          `INSERT INTO follow_ups (owner_user_id, target_type, target_id, status, content, next_contact_at, completed_at, created_at, updated_at)
           VALUES (?,?,?,'pending','',?,?,?,?)`,
        )
        .bind(row.ownerUserId, row.targetType, row.targetId, nextContactAt, null, now, now)
        .run();
      nextId = Number(spawned.meta?.last_row_id) || null;
    }

    return Response.json({ ok: true, nextFollowUpId: nextId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '完成失败' }, { status: 500 });
  }
}
