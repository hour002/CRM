import {
  canAccessCustomer,
  canAccessLead,
  forbidden,
  getSessionActor,
  requireAdmin,
} from '@/app/auth';
import { getD1 } from '@/db/raw';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();
  try {
    const db = getD1();
    const [users, customers, leads] = await Promise.all([
      db
        .prepare(
          'SELECT id,display_name AS displayName,username,role,manager_id AS managerId FROM crm_users WHERE active=1 ORDER BY role,display_name',
        )
        .all(),
      db
        .prepare(
          'SELECT c.id,c.name,c.province,c.owner_user_id AS ownerUserId,u.display_name AS ownerName FROM customers c LEFT JOIN crm_users u ON u.id=c.owner_user_id ORDER BY c.name',
        )
        .all(),
      db
        .prepare(
          'SELECT l.id,l.company_name AS companyName,l.status,l.owner_user_id AS ownerUserId,u.display_name AS ownerName FROM leads l LEFT JOIN crm_users u ON u.id=l.owner_user_id ORDER BY l.created_at DESC',
        )
        .all(),
    ]);
    return Response.json(
      { users: users.results, customers: customers.results, leads: leads.results },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return forbidden();
  try {
    const body = (await request.json()) as any;
    const type = body.type === 'lead' ? 'lead' : 'customer';
    const id = Number(body.id);
    const ownerUserId =
      body.ownerUserId === null || body.ownerUserId === '' ? null : Number(body.ownerUserId);
    const db = getD1();
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: '记录无效' }, { status: 400 });

    if (actor.role !== 'admin') {
      const allowed =
        type === 'lead'
          ? await canAccessLead(request, id, 'assign')
          : await canAccessCustomer(request, id, 'assign');
      if (!allowed) return forbidden();
    }

    if (ownerUserId !== null) {
      const user = await db
        .prepare('SELECT id FROM crm_users WHERE id=? AND active=1')
        .bind(ownerUserId)
        .first();
      if (!user) return Response.json({ error: '负责人不存在或已停用' }, { status: 400 });
    }

    const table = type === 'lead' ? 'leads' : 'customers';
    const result = await db
      .prepare(`UPDATE ${table} SET owner_user_id=?,updated_at=? WHERE id=?`)
      .bind(ownerUserId, new Date().toISOString(), id)
      .run();
    if (!result.meta.changes) return Response.json({ error: '记录不存在' }, { status: 404 });
    await db
      .prepare(
        'INSERT INTO audit_logs (actor_user_id,actor_name,action,target_type,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(
        actor.id,
        actor.displayName,
        '分配负责人',
        type === 'lead' ? '线索' : '客户',
        String(id),
        ownerUserId === null ? '设为未分配' : `负责人用户 #${ownerUserId}`,
        new Date().toISOString(),
      )
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '分配失败' }, { status: 400 });
  }
}
