import { ensureDatabase } from '@/db/raw';
import {
  canAccessCustomer,
  canAccessLead,
  getSessionActor,
  ownedOrSubordinateSql,
  unauthorized,
  forbidden,
} from '@/app/auth';
import { canCreateOpportunityFromLead, formatOppCode, OPP_STAGES } from '@/app/lib/crm-stages';
import { recordStageChange } from '@/app/lib/stage-history';

async function nextOppCode(db: Awaited<ReturnType<typeof ensureDatabase>>, now = new Date()) {
  const prefix = formatOppCode(now, 0).slice(0, -4); // OPP-YYYYMMDD-
  const row = await db
    .prepare(`SELECT code FROM opportunities WHERE code LIKE ? ORDER BY code DESC LIMIT 1`)
    .bind(`${prefix}%`)
    .first<{ code: string }>();
  let seq = 1;
  if (row?.code) {
    const part = row.code.split('-').pop();
    const n = Number(part);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return formatOppCode(now, seq);
}

export async function GET(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return unauthorized();
  try {
    const db = await ensureDatabase();
    const url = new URL(request.url);
    const accountId = url.searchParams.get('accountId');
    const base = `SELECT o.id, o.account_id AS accountId, o.lead_id AS leadId, o.name, o.code, o.contact_id AS contactId,
      o.stage, o.sales_estimated_amount AS salesEstimatedAmount, o.project_amount AS projectAmount,
      o.expected_close_date AS expectedCloseDate, o.importance, o.owner_user_id AS ownerUserId,
      u.display_name AS ownerName, c.name AS accountName, o.is_draft AS isDraft,
      o.created_at AS createdAt, o.updated_at AS updatedAt
      FROM opportunities o
      LEFT JOIN crm_users u ON u.id = o.owner_user_id
      LEFT JOIN customers c ON c.id = o.account_id`;
    const vis = ownedOrSubordinateSql('o.owner_user_id');
    const admin = actor.role === 'admin';
    let sql = base + ' WHERE COALESCE(o.is_draft,0)=0';
    const binds: unknown[] = [];
    if (!admin) {
      sql += ` AND ${vis}`;
      binds.push(actor.id, actor.id);
    }
    if (accountId) {
      sql += ' AND o.account_id=?';
      binds.push(Number(accountId));
    }
    sql += ' ORDER BY o.updated_at DESC';
    const rows = binds.length ? await db.prepare(sql).bind(...binds).all() : await db.prepare(sql).all();
    return Response.json({ opportunities: rows.results || [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return unauthorized();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const db = await ensureDatabase();
    let accountId = body.accountId != null ? Number(body.accountId) : null;
    const leadId = body.leadId != null ? Number(body.leadId) : null;

    if (leadId) {
      const leadActor = await canAccessLead(request, leadId, 'read');
      if (!leadActor) return forbidden();
      const lead = await db
        .prepare(
          `SELECT stage, converted_account_id AS convertedAccountId FROM leads WHERE id=?`,
        )
        .bind(leadId)
        .first<{ stage: string; convertedAccountId: number | null }>();
      if (!lead) return Response.json({ error: '线索不存在' }, { status: 404 });
      const check = canCreateOpportunityFromLead(lead);
      if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
      if (!accountId) accountId = check.accountId;
      else if (accountId !== check.accountId) {
        return Response.json({ error: '机会客户必须与线索转化客户一致' }, { status: 400 });
      }
    }

    if (!accountId) return Response.json({ error: 'account_id 必填' }, { status: 400 });
    const custActor = await canAccessCustomer(request, accountId, 'write');
    if (!custActor) return forbidden();

    const name = String(body.name || '').trim();
    if (!name) return Response.json({ error: '请填写机会名称' }, { status: 400 });

    const stage = String(body.stage || '需求确认');
    if (!(OPP_STAGES as readonly string[]).includes(stage)) {
      return Response.json({ error: '无效的销售阶段' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const code = await nextOppCode(db);
    const ownerUserId = actor.role === 'sales' ? actor.id : body.ownerUserId != null ? Number(body.ownerUserId) : actor.id;

    const result = await db
      .prepare(
        `INSERT INTO opportunities (
          account_id, lead_id, name, code, contact_id, stage,
          sales_estimated_amount, project_amount, expected_close_date, importance, owner_user_id,
          requirement, product_match, tech_owner, supporting_docs, social_insurance_count,
          review_opinion, action_plan, remark, requirement_date, sales_opinion, quantity, is_draft,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        accountId,
        leadId,
        name,
        code,
        body.contactId != null ? Number(body.contactId) : null,
        stage,
        Number(body.salesEstimatedAmount ?? 0),
        Number(body.projectAmount ?? 0),
        String(body.expectedCloseDate || ''),
        String(body.importance || '普通'),
        ownerUserId,
        String(body.requirement || ''),
        String(body.productMatch || ''),
        String(body.techOwner || ''),
        String(body.supportingDocs || ''),
        Number(body.socialInsuranceCount ?? 0),
        String(body.reviewOpinion || ''),
        String(body.actionPlan || ''),
        String(body.remark || ''),
        String(body.requirementDate || ''),
        String(body.salesOpinion || ''),
        Number(body.quantity ?? 0),
        body.isDraft ? 1 : 0,
        now,
        now,
      )
      .run();

    const oppId = Number(result.meta?.last_row_id);
    if (actor.id != null) {
      await recordStageChange(db, {
        targetType: 'opportunity',
        targetId: oppId,
        fromStage: '',
        toStage: stage,
        changedBy: actor.id,
        at: now,
      });
    }
    return Response.json({ id: oppId, code, accountId, stage }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '创建失败' }, { status: 500 });
  }
}
