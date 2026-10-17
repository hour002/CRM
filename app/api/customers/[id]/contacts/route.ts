import { ensureDatabase } from '@/db/raw';
import { canAccessCustomer, forbidden } from '@/app/auth';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const accountId = Number(id);
    if (!(await canAccessCustomer(request, accountId, 'read'))) return forbidden();
    const db = await ensureDatabase();
    const rows = await db
      .prepare(
        `SELECT id, account_id AS accountId, name, phone, title, email, wechat, remark,
          owner_user_id AS ownerUserId, created_at AS createdAt, updated_at AS updatedAt
         FROM account_contacts WHERE account_id=? ORDER BY id`,
      )
      .bind(accountId)
      .all();
    return Response.json({ contacts: rows.results || [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const accountId = Number(id);
    const actor = await canAccessCustomer(request, accountId, 'write');
    if (!actor) return forbidden();
    const body = (await request.json()) as Record<string, string>;
    const name = String(body.name || '').trim();
    if (!name) return Response.json({ error: '请填写联系人姓名' }, { status: 400 });
    const now = new Date().toISOString();
    const db = await ensureDatabase();
    const result = await db
      .prepare(
        `INSERT INTO account_contacts (account_id, name, phone, title, email, wechat, remark, owner_user_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        accountId,
        name,
        String(body.phone || ''),
        String(body.title || ''),
        String(body.email || ''),
        String(body.wechat || ''),
        String(body.remark || ''),
        actor.id,
        now,
        now,
      )
      .run();
    return Response.json({ id: result.meta?.last_row_id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '新增失败' }, { status: 500 });
  }
}
