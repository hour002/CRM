import { ensureDatabase } from '@/db/raw';
import { canAccessLead, forbidden } from '@/app/auth';
import { dualWriteFromStage, dualWriteFromStatus, LEAD_TERMINAL } from '@/app/lib/crm-stages';
import { recordStageChange } from '@/app/lib/stage-history';

const fields: Record<string, string> = {
  companyName: 'company_name',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  source: 'source',
  province: 'province',
  notes: 'notes',
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const leadId = Number(id);
    const actor = await canAccessLead(request, leadId, 'write');
    if (!actor) return forbidden();
    const body = (await request.json()) as Record<string, unknown>;
    const db = await ensureDatabase();
    const current = await db
      .prepare('SELECT stage, status FROM leads WHERE id=?')
      .bind(leadId)
      .first<{ stage: string; status: string }>();
    if (!current) return Response.json({ error: '线索不存在' }, { status: 404 });

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(fields)) {
      if (key in body) {
        sets.push(`${col}=?`);
        values.push(body[key]);
      }
    }

    let nextStage = current.stage;
    if (typeof body.stage === 'string') {
      const dual = dualWriteFromStage(body.stage);
      if (LEAD_TERMINAL.has(current.stage) && dual.stage !== current.stage) {
        return Response.json({ error: '线索已结束，不能再推进阶段' }, { status: 400 });
      }
      if (dual.stage === '无效' && !String(body.invalidReason || '').trim()) {
        return Response.json({ error: '标记无效必须填写原因' }, { status: 400 });
      }
      sets.push('stage=?', 'status=?');
      values.push(dual.stage, dual.status);
      nextStage = dual.stage;
      if (dual.stage === '无效') {
        sets.push('invalid_reason=?');
        values.push(String(body.invalidReason || ''));
      }
    } else if (typeof body.status === 'string') {
      const dual = dualWriteFromStatus(body.status);
      if (LEAD_TERMINAL.has(current.stage) && dual.stage !== current.stage) {
        return Response.json({ error: '线索已结束，不能再推进阶段' }, { status: 400 });
      }
      sets.push('stage=?', 'status=?');
      values.push(dual.stage, dual.status);
      nextStage = dual.stage;
    }

    if (!sets.length) return Response.json({ error: '没有可更新内容' }, { status: 400 });
    const now = new Date().toISOString();
    sets.push('updated_at=?');
    values.push(now, leadId);
    await db.prepare(`UPDATE leads SET ${sets.join(',')} WHERE id=?`).bind(...values).run();
    if (nextStage !== current.stage && actor.id != null) {
      await recordStageChange(db, {
        targetType: 'lead',
        targetId: leadId,
        fromStage: current.stage,
        toStage: nextStage,
        changedBy: actor.id,
        at: now,
      });
    }
    return Response.json({ ok: true, stage: nextStage });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 500 });
  }
}
