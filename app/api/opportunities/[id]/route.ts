import { ensureDatabase } from '@/db/raw';
import { canAccessOpportunity, getSessionActor, forbidden, unauthorized } from '@/app/auth';
import { OPP_STAGES } from '@/app/lib/crm-stages';
import { recordStageChange } from '@/app/lib/stage-history';

const fields: Record<string, string> = {
  name: 'name',
  contactId: 'contact_id',
  salesEstimatedAmount: 'sales_estimated_amount',
  projectAmount: 'project_amount',
  expectedCloseDate: 'expected_close_date',
  importance: 'importance',
  requirement: 'requirement',
  productMatch: 'product_match',
  techOwner: 'tech_owner',
  supportingDocs: 'supporting_docs',
  socialInsuranceCount: 'social_insurance_count',
  reviewOpinion: 'review_opinion',
  actionPlan: 'action_plan',
  remark: 'remark',
  requirementDate: 'requirement_date',
  salesOpinion: 'sales_opinion',
  quantity: 'quantity',
  isDraft: 'is_draft',
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const oppId = Number(id);
    if (!(await canAccessOpportunity(request, oppId, 'read'))) return forbidden();
    const db = await ensureDatabase();
    const row = await db
      .prepare(
        `SELECT o.*, c.name AS accountName, u.display_name AS ownerName
         FROM opportunities o
         LEFT JOIN customers c ON c.id=o.account_id
         LEFT JOIN crm_users u ON u.id=o.owner_user_id
         WHERE o.id=?`,
      )
      .bind(oppId)
      .first();
    if (!row) return Response.json({ error: '机会不存在' }, { status: 404 });
    const histories = await db
      .prepare(
        `SELECT id, from_stage AS fromStage, to_stage AS toStage, changed_by AS changedBy, changed_at AS changedAt
         FROM stage_histories WHERE target_type='opportunity' AND target_id=? ORDER BY changed_at DESC LIMIT 50`,
      )
      .bind(oppId)
      .all();
    return Response.json({ opportunity: row, stageHistories: histories.results || [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionActor(request);
    if (!session) return unauthorized();
    const { id } = await context.params;
    const oppId = Number(id);
    const body = (await request.json()) as Record<string, unknown>;
    const db = await ensureDatabase();
    const current = await db.prepare('SELECT stage FROM opportunities WHERE id=?').bind(oppId).first<{ stage: string }>();
    if (!current) return Response.json({ error: '机会不存在' }, { status: 404 });

    const businessKeys = Object.keys(body).filter((k) => k in fields || k === 'stage');
    const wantsAssign = body.ownerUserId !== undefined;
    const wantsWrite = businessKeys.length > 0;

    if (wantsWrite) {
      const actor = await canAccessOpportunity(request, oppId, 'write');
      if (!actor) return forbidden();
    }
    if (wantsAssign) {
      const actor = await canAccessOpportunity(request, oppId, 'assign');
      if (!actor) return forbidden();
    }
    if (!wantsWrite && !wantsAssign) {
      return Response.json({ error: '没有可更新内容' }, { status: 400 });
    }

    const writeActor = wantsWrite ? await canAccessOpportunity(request, oppId, 'write') : null;
    const sets: string[] = [];
    const values: unknown[] = [];

    if (wantsWrite) {
      for (const [key, col] of Object.entries(fields)) {
        if (key in body) {
          sets.push(`${col}=?`);
          let v = body[key];
          if (key === 'isDraft') v = v ? 1 : 0;
          values.push(v);
        }
      }
    }

    let nextStage = current.stage;
    if (typeof body.stage === 'string') {
      if (!(OPP_STAGES as readonly string[]).includes(body.stage)) {
        return Response.json({ error: '无效的销售阶段' }, { status: 400 });
      }
      sets.push('stage=?');
      values.push(body.stage);
      nextStage = body.stage;
    }

    if (wantsAssign) {
      sets.push('owner_user_id=?');
      values.push(body.ownerUserId == null ? null : Number(body.ownerUserId));
    }

    if (!sets.length) return Response.json({ error: '没有可更新内容' }, { status: 400 });
    const now = new Date().toISOString();
    sets.push('updated_at=?');
    values.push(now, oppId);
    await db.prepare(`UPDATE opportunities SET ${sets.join(',')} WHERE id=?`).bind(...values).run();
    const changer = writeActor?.id ?? session.id;
    if (nextStage !== current.stage && changer != null) {
      await recordStageChange(db, {
        targetType: 'opportunity',
        targetId: oppId,
        fromStage: current.stage,
        toStage: nextStage,
        changedBy: changer,
        at: now,
      });
    }
    return Response.json({ ok: true, stage: nextStage });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 500 });
  }
}
