import { ensureDatabase } from '@/db/raw';
import { canAccessCustomer, forbidden } from '@/app/auth';

const fields: Record<string, string> = { province:'province', city:'city', address:'address', latitude:'latitude', longitude:'longitude', locationPrecision:'location_precision', salesperson:'salesperson', customerLevel:'customer_level', communicationCycle:'communication_cycle', communicated:'communicated', lastCommunicationAt:'last_communication_at', communicationSummary:'communication_summary', contactName:'contact_name', contactPhone:'contact_phone', tags:'tags' };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const actor=await canAccessCustomer(request,Number(id),'write');if(!actor)return forbidden();
    const body = await request.json() as Record<string, unknown> & { addInteraction?: boolean };
    const entries = Object.entries(body).filter(([key]) => fields[key]&&!(actor.role==='sales'&&['customerLevel','communicationCycle','salesperson'].includes(key)));
    if (!entries.length) return Response.json({ error: '没有可更新内容' }, { status: 400 });
    const now = new Date().toISOString();
    const assignments = entries.map(([key]) => `${fields[key]} = ?`).join(', ');
    const values = entries.map(([key, value]) => key === 'communicated' ? (value ? 1 : 0) : value);
    const db = await ensureDatabase();
    const updates = [db.prepare(`UPDATE customers SET ${assignments}, updated_at = ? WHERE id = ?`).bind(...values, now, Number(id))];
    if (body.addInteraction && typeof body.communicationSummary === 'string') updates.push(db.prepare('INSERT INTO interactions (customer_id, communicated_at, summary) VALUES (?, ?, ?)').bind(Number(id), now, body.communicationSummary));
    await db.batch(updates);
    const customer = await db.prepare(`SELECT id, name, province, city, address, latitude, longitude, location_precision AS locationPrecision, salesperson, order_count AS orderCount, latest_order_date AS latestOrderDate, latest_order_no AS latestOrderNo, customer_level AS customerLevel, communication_cycle AS communicationCycle, communicated, last_communication_at AS lastCommunicationAt, communication_summary AS communicationSummary, contact_name AS contactName, contact_phone AS contactPhone, tags FROM customers WHERE id = ?`).bind(Number(id)).first();
    return Response.json({ customer });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 500 }); }
}
