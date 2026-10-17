import { ensureDatabase } from '@/db/raw';
import { getSessionActor, unauthorized } from '@/app/auth';

export async function GET(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return unauthorized();
  if (actor.id == null) return Response.json({ todos: [] });
  try {
    const db = await ensureDatabase();
    const rows = await db
      .prepare(
        `SELECT id, owner_user_id AS ownerUserId, target_type AS targetType, target_id AS targetId,
          status, content, next_contact_at AS nextContactAt, created_at AS createdAt
         FROM follow_ups
         WHERE owner_user_id=? AND status='pending'
         ORDER BY next_contact_at ASC`,
      )
      .bind(actor.id)
      .all();
    return Response.json({ todos: rows.results || [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}
