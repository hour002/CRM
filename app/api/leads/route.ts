import { ensureDatabase } from '@/db/raw';
import { getSessionActor, unauthorized } from '@/app/auth';

export async function POST(request: Request) {
  const actor=await getSessionActor(request);if(!actor)return unauthorized();
  try {
    const body = await request.json() as Record<string, string | number>;
    if (!String(body.companyName || '').trim()) return Response.json({ error: '请填写公司名称' }, { status: 400 });
    const db = await ensureDatabase(); const now = new Date().toISOString();
    const ownerUserId=actor.role==='sales'?actor.id:null;
    const result = await db.prepare(`INSERT INTO leads (company_name, contact_name, contact_phone, source, status, province, notes, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(String(body.companyName).trim(), String(body.contactName || ''), String(body.contactPhone || ''), String(body.source || '主动拓展'), String(body.status || '新线索'), String(body.province || '待补充'), String(body.notes || ''), ownerUserId, now, now).run();
    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '新增失败' }, { status: 500 }); }
}
