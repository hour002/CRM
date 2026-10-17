import { canAccessCustomer, forbidden } from '@/app/auth';
import { ensureDatabase } from '@/db/raw';

const validStatuses = new Set(['待拜访', '已计划', '已完成', '已取消']);

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const customerId = Number(body.customerId); const plannedAt = String(body.plannedAt || '').trim();
    if (!Number.isInteger(customerId) || customerId < 1 || !plannedAt) return Response.json({ error: '请选择客户和拜访时间' }, { status: 400 });
    if(!(await canAccessCustomer(request,customerId,'write')))return forbidden();
    const status = validStatuses.has(String(body.status)) ? String(body.status) : '已计划'; const now = new Date().toISOString(); const db = await ensureDatabase();
    const customer = await db.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first();
    if (!customer) return Response.json({ error: '客户不存在' }, { status: 404 });
    const result = await db.prepare('INSERT INTO customer_visits (customer_id, planned_at, status, purpose, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(customerId, plannedAt, status, String(body.purpose || '').trim().slice(0, 500), String(body.summary || '').trim().slice(0, 2000), now, now).run();
    const visit = await db.prepare('SELECT id, customer_id AS customerId, planned_at AS plannedAt, status, purpose, summary, created_at AS createdAt, updated_at AS updatedAt FROM customer_visits WHERE id = ?').bind(result.meta.last_row_id).first();
    return Response.json({ visit });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 500 }); }
}
