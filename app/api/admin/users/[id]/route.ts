import { hashPassword, requireAdmin } from '@/app/auth';
import { getD1 } from '@/db/raw';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin(request);
  if (!actor) return Response.json({ error: '无管理员权限' }, { status: 403 });
  try {
    const { id } = await params;
    const userId = Number(id);
    const body = (await request.json()) as any;
    const fields: string[] = [];
    const values: unknown[] = [];
    const db = getD1();
    const now = new Date().toISOString();

    if (typeof body.active === 'boolean') {
      if (body.active === false) {
        const transferToUserId = Number(body.transferToUserId);
        if (!Number.isInteger(transferToUserId) || transferToUserId < 1) {
          return Response.json(
            { error: '停用账号必须指定数据接收人 transferToUserId' },
            { status: 400 },
          );
        }
        if (transferToUserId === userId) {
          return Response.json({ error: '接收人不能是被停用账号本人' }, { status: 400 });
        }
        const recipient = await db
          .prepare('SELECT id, display_name AS displayName FROM crm_users WHERE id=? AND active=1')
          .bind(transferToUserId)
          .first<{ id: number; displayName: string }>();
        if (!recipient) {
          return Response.json({ error: '接收人不存在或已停用' }, { status: 400 });
        }

        const customerCount =
          (
            await db
              .prepare('SELECT COUNT(*) AS c FROM customers WHERE owner_user_id=?')
              .bind(userId)
              .first<{ c: number }>()
          )?.c || 0;
        const leadCount =
          (
            await db
              .prepare('SELECT COUNT(*) AS c FROM leads WHERE owner_user_id=?')
              .bind(userId)
              .first<{ c: number }>()
          )?.c || 0;

        await db.batch([
          db
            .prepare('UPDATE customers SET owner_user_id=?, updated_at=? WHERE owner_user_id=?')
            .bind(transferToUserId, now, userId),
          db
            .prepare('UPDATE leads SET owner_user_id=?, updated_at=? WHERE owner_user_id=?')
            .bind(transferToUserId, now, userId),
          db.prepare('UPDATE crm_users SET manager_id=NULL, updated_at=? WHERE manager_id=?').bind(now, userId),
          db.prepare('UPDATE crm_users SET active=0, updated_at=? WHERE id=?').bind(now, userId),
          db.prepare('DELETE FROM crm_sessions WHERE user_id=?').bind(userId),
          db
            .prepare(
              'INSERT INTO audit_logs (actor_user_id,actor_name,action,target_type,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)',
            )
            .bind(
              actor.id,
              actor.displayName,
              '停用并转移',
              '用户',
              String(userId),
              JSON.stringify({
                transferToUserId,
                transferToName: recipient.displayName,
                customers: customerCount,
                leads: leadCount,
              }),
              now,
            ),
        ]);
        return Response.json({
          ok: true,
          transferred: { customers: customerCount, leads: leadCount, transferToUserId },
        });
      }
      fields.push('active=?');
      values.push(1);
    }

    if (body.role === 'admin' || body.role === 'sales') {
      fields.push('role=?');
      values.push(body.role);
    }
    if (String(body.displayName || '').trim()) {
      fields.push('display_name=?');
      values.push(String(body.displayName).trim());
    }
    if (body.managerId !== undefined) {
      const managerId =
        body.managerId === null || body.managerId === '' ? null : Number(body.managerId);
      if (managerId !== null) {
        if (!Number.isInteger(managerId) || managerId < 1)
          return Response.json({ error: '直属上级无效' }, { status: 400 });
        if (managerId === userId)
          return Response.json({ error: '直属上级不能是本人' }, { status: 400 });
        const manager = await db
          .prepare('SELECT id FROM crm_users WHERE id=? AND active=1')
          .bind(managerId)
          .first();
        if (!manager) return Response.json({ error: '直属上级不存在或已停用' }, { status: 400 });
      }
      fields.push('manager_id=?');
      values.push(managerId);
    }
    if (body.password !== undefined) {
      const password = String(body.password);
      if (password.length < 8) return Response.json({ error: '新密码至少 8 位' }, { status: 400 });
      const secret = await hashPassword(password);
      fields.push('password_salt=?', 'password_hash=?', 'password_iterations=?');
      values.push(secret.salt, secret.hash, secret.iterations);
    }

    if (!fields.length) return Response.json({ error: '没有可更新内容' }, { status: 400 });
    fields.push('updated_at=?');
    values.push(now, userId);
    await db.prepare(`UPDATE crm_users SET ${fields.join(',')} WHERE id=?`).bind(...values).run();
    if (body.password !== undefined) {
      await db.prepare('DELETE FROM crm_sessions WHERE user_id=?').bind(userId).run();
    }
    await db
      .prepare(
        'INSERT INTO audit_logs (actor_user_id,actor_name,action,target_type,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(
        actor.id,
        actor.displayName,
        body.password !== undefined ? '重置密码' : '更新账号',
        '用户',
        String(userId),
        JSON.stringify({
          active: body.active,
          role: body.role,
          displayName: body.displayName,
          managerId: body.managerId,
        }),
        now,
      )
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '更新失败' }, { status: 400 });
  }
}
