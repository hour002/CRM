import { ensureDatabase } from '@/db/raw';
import { canAccessLead, forbidden } from '@/app/auth';
import { dualWriteFromStage } from '@/app/lib/crm-stages';
import { recordStageChange } from '@/app/lib/stage-history';

/**
 * Convert lead → customer. Keeps the lead row (stage=已转化).
 * Body optional: { accountId?: number, createContact?: boolean }
 * If accountId omitted, creates a new customer from lead fields.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const leadId = Number(id);
    const actor = await canAccessLead(request, leadId, 'write');
    if (!actor) return forbidden();
    const body = (await request.json().catch(() => ({}))) as {
      accountId?: number;
      createContact?: boolean;
    };
    const db = await ensureDatabase();
    const lead = await db
      .prepare(
        `SELECT id, company_name AS companyName, contact_name AS contactName, contact_phone AS contactPhone,
                province, stage, owner_user_id AS ownerUserId, converted_account_id AS convertedAccountId
         FROM leads WHERE id=?`,
      )
      .bind(leadId)
      .first<{
        id: number;
        companyName: string;
        contactName: string;
        contactPhone: string;
        province: string;
        stage: string;
        ownerUserId: number | null;
        convertedAccountId: number | null;
      }>();
    if (!lead) return Response.json({ error: '线索不存在' }, { status: 404 });
    if (lead.stage === '已转化' && lead.convertedAccountId) {
      return Response.json({ ok: true, accountId: lead.convertedAccountId, alreadyConverted: true, leadId });
    }
    if (lead.stage === '无效') {
      return Response.json({ error: '无效线索不能转化' }, { status: 400 });
    }

    const now = new Date().toISOString();
    let accountId = body.accountId ? Number(body.accountId) : null;

    if (accountId) {
      const existing = await db.prepare('SELECT id FROM customers WHERE id=?').bind(accountId).first();
      if (!existing) return Response.json({ error: '指定客户不存在' }, { status: 400 });
    } else {
      const insert = await db
        .prepare(
          `INSERT INTO customers (name, province, city, address, salesperson, customer_level, communication_cycle,
            communicated, communication_summary, contact_name, contact_phone, tags, owner_user_id, stage, created_at, updated_at)
           VALUES (?, ?, '', '', '', '一般客户', '每季度', 0, '', ?, ?, '', ?, '潜在', ?, ?)`,
        )
        .bind(
          lead.companyName,
          lead.province || '待补充',
          lead.contactName || '',
          lead.contactPhone || '',
          lead.ownerUserId,
          now,
          now,
        )
        .run();
      accountId = Number(insert.meta?.last_row_id);
      if (body.createContact !== false && (lead.contactName || lead.contactPhone)) {
        await db
          .prepare(
            `INSERT INTO account_contacts (account_id, name, phone, title, email, wechat, remark, owner_user_id, created_at, updated_at)
             VALUES (?, ?, ?, '', '', '', '', ?, ?, ?)`,
          )
          .bind(accountId, lead.contactName || lead.companyName, lead.contactPhone || '', lead.ownerUserId, now, now)
          .run();
      }
    }

    const dual = dualWriteFromStage('已转化');
    const fromStage = lead.stage;
    await db
      .prepare(
        `UPDATE leads SET stage=?, status=?, converted_account_id=?, converted_at=?, updated_at=? WHERE id=?`,
      )
      .bind(dual.stage, dual.status, accountId, now, now, leadId)
      .run();

    if (actor.id != null) {
      await recordStageChange(db, {
        targetType: 'lead',
        targetId: leadId,
        fromStage,
        toStage: dual.stage,
        changedBy: actor.id,
        at: now,
      });
      await db
        .prepare(
          `INSERT INTO audit_logs (actor_user_id, actor_name, action, target_type, target_id, detail, created_at)
           VALUES (?, ?, 'convert', 'lead', ?, ?, ?)`,
        )
        .bind(actor.id, actor.displayName, String(leadId), `converted_account_id=${accountId}`, now)
        .run();
    }

    // Verify lead row still exists
    const kept = await db.prepare('SELECT id, stage FROM leads WHERE id=?').bind(leadId).first();
    return Response.json({
      ok: true,
      leadId,
      accountId,
      stage: dual.stage,
      leadKept: Boolean(kept),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '转化失败' }, { status: 500 });
  }
}
