import { ensureDatabase } from '@/db/raw';
import { getSessionActor, unauthorized } from '@/app/auth';

/** Direct manager only: pending follow-ups of subordinates past next_contact_at. Read-only. */
export async function GET(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return unauthorized();
  if (actor.id == null) return Response.json({ overdue: [] });
  try {
    const db = await ensureDatabase();
    const now = new Date().toISOString();
    const rows = await db
      .prepare(
        `SELECT f.id, f.owner_user_id AS ownerUserId, u.display_name AS ownerName,
          f.target_type AS targetType, f.target_id AS targetId, f.content,
          f.next_contact_at AS nextContactAt, f.created_at AS createdAt
         FROM follow_ups f
         JOIN crm_users u ON u.id = f.owner_user_id
         WHERE u.manager_id=? AND f.status='pending' AND f.next_contact_at IS NOT NULL AND f.next_contact_at < ?
         ORDER BY f.next_contact_at ASC`,
      )
      .bind(actor.id, now)
      .all();
    return Response.json({ overdue: rows.results || [], readOnly: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}
