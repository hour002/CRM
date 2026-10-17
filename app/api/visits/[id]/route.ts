import { canAccessCustomer, forbidden, getSessionActor } from '@/app/auth';
import { ensureDatabase } from '@/db/raw';

const fields: Record<string, string> = { plannedAt: 'planned_at', status: 'status', purpose: 'purpose', summary: 'summary' };
const validStatuses = new Set(['待拜访', '已计划', '已完成', '已取消']);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const visitId = Number(id);
    const body = await request.json() as Record<string, unknown>;
    const actor = await getSessionActor(request);
    if (!actor) return forbidden();
    const db = await ensureDatabase();
    const visitRow = await db
      .prepare('SELECT customer_id AS customerId FROM customer_visits WHERE id = ?')
      .bind(visitId)
      .first<{ customerId: number }>();
    if (!visitRow) return Response.json({ error: '拜访计划不存在' }, { status: 404 });
    // Managers may read subordinate visits via /api/data but cannot edit/complete them
    if (!(await canAccessCustomer(request, visitRow.customerId, 'write'))) return forbidden();

    const entries = Object.entries(body).filter(([key]) => fields[key]);
    if (!Number.isInteger(visitId) || !entries.length) return Response.json({ error: '没有可更新内容' }, { status: 400 });
    if (body.status && !validStatuses.has(String(body.status))) return Response.json({ error: '拜访状态无效' }, { status: 400 });
    const assignments = entries.map(([key]) => `${fields[key]} = ?`).join(', ');
    const values = entries.map(([key, value]) =>
      key === 'purpose' ? String(value || '').slice(0, 500) : key === 'summary' ? String(value || '').slice(0, 2000) : String(value || ''),
    );
    await db
      .prepare(`UPDATE customer_visits SET ${assignments}, updated_at = ? WHERE id = ?`)
      .bind(...values, new Date().toISOString(), visitId)
      .run();
    const visit = await db
      .prepare(
        'SELECT id, customer_id AS customerId, planned_at AS plannedAt, status, purpose, summary, created_at AS createdAt, updated_at AS updatedAt FROM customer_visits WHERE id = ?',
      )
      .bind(visitId)
      .first();
    if (!visit) return Response.json({ error: '拜访计划不存在' }, { status: 404 });
    return Response.json({ visit });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 500 });
  }
}
