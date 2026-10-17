import { ensureDatabase } from '@/db/raw';
import { canAccessCustomer, forbidden } from '@/app/auth';

const fields: Record<string, string> = {
  name: 'name',
  phone: 'phone',
  title: 'title',
  email: 'email',
  wechat: 'wechat',
  remark: 'remark',
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const contactId = Number(id);
    const db = await ensureDatabase();
    const row = await db
      .prepare('SELECT account_id AS accountId FROM account_contacts WHERE id=?')
      .bind(contactId)
      .first<{ accountId: number }>();
    if (!row) return Response.json({ error: '联系人不存在' }, { status: 404 });
    if (!(await canAccessCustomer(request, row.accountId, 'write'))) return forbidden();
    const body = (await request.json()) as Record<string, unknown>;
    const entries = Object.entries(body).filter(([k]) => fields[k]);
    if (!entries.length) return Response.json({ error: '没有可更新内容' }, { status: 400 });
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE account_contacts SET ${entries.map(([k]) => `${fields[k]}=?`).join(',')}, updated_at=? WHERE id=?`,
      )
      .bind(...entries.map(([, v]) => v), now, contactId)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const contactId = Number(id);
    const db = await ensureDatabase();
    const row = await db
      .prepare('SELECT account_id AS accountId FROM account_contacts WHERE id=?')
      .bind(contactId)
      .first<{ accountId: number }>();
    if (!row) return Response.json({ error: '联系人不存在' }, { status: 404 });
    if (!(await canAccessCustomer(request, row.accountId, 'write'))) return forbidden();
    await db.prepare('DELETE FROM account_contacts WHERE id=?').bind(contactId).run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '删除失败' }, { status: 500 });
  }
}
