import { ensureDatabase } from '@/db/raw';
import { requireAdmin, forbidden } from '@/app/auth';

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();
  try {
    const body = await request.json() as Record<string, string>;
    const name = String(body.name || '').trim();
    if (!name) return Response.json({ error: '请填写姓名' }, { status: 400 });
    const db = await ensureDatabase(); const now = new Date().toISOString();
    const sequence = await db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM network_contacts').first<{ value:number }>();
    const result = await db.prepare(`INSERT INTO network_contacts (sequence, name, importance, frequency, category, organization, industry, notes, initial_contact, contacted, last_contact_at, contact_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, '', ?, ?)`).bind(sequence?.value || 1, name, String(body.importance || '待设定'), String(body.frequency || '待设定'), String(body.category || '未分类'), String(body.organization || ''), String(body.industry || ''), String(body.notes || ''), String(body.initialContact || ''), now, now).run();
    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '新增失败' }, { status: 500 }); }
}
