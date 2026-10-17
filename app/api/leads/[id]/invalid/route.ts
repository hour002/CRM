import { ensureDatabase } from '@/db/raw';
import { canAccessLead, forbidden } from '@/app/auth';
import { dualWriteFromStage } from '@/app/lib/crm-stages';
import { recordStageChange } from '@/app/lib/stage-history';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const leadId = Number(id);
    const actor = await canAccessLead(request, leadId, 'write');
    if (!actor) return forbidden();
    const body = (await request.json()) as { invalidReason?: string };
    const reason = String(body.invalidReason || '').trim();
    if (!reason) return Response.json({ error: '标记无效必须填写原因' }, { status: 400 });
    const db = await ensureDatabase();
    const lead = await db.prepare('SELECT stage FROM leads WHERE id=?').bind(leadId).first<{ stage: string }>();
    if (!lead) return Response.json({ error: '线索不存在' }, { status: 404 });
    if (lead.stage === '已转化') return Response.json({ error: '已转化线索不能标记无效' }, { status: 400 });
    const dual = dualWriteFromStage('无效');
    const now = new Date().toISOString();
    await db
      .prepare(`UPDATE leads SET stage=?, status=?, invalid_reason=?, updated_at=? WHERE id=?`)
      .bind(dual.stage, dual.status, reason, now, leadId)
      .run();
    if (actor.id != null) {
      await recordStageChange(db, {
        targetType: 'lead',
        targetId: leadId,
        fromStage: lead.stage,
        toStage: dual.stage,
        changedBy: actor.id,
        at: now,
      });
    }
    return Response.json({ ok: true, stage: dual.stage });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status: 500 });
  }
}
