/** Lead / opportunity / account stage machines + legacy status dual-write mapping. */

export const LEAD_STAGES = ['待处理', '跟进中', '提交需求', '确认需求', '已转化', '无效'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_TERMINAL = new Set<string>(['已转化', '无效']);

export const OPP_STAGES = ['需求确认', '方案报价', '商务谈判', '赢单', '丢单'] as const;
export type OppStage = (typeof OPP_STAGES)[number];
export const OPP_TERMINAL = new Set<string>(['赢单', '丢单']);

export const ACCOUNT_STAGES = ['潜在', '意向', '合作中', '流失'] as const;

/** Legacy UI `status` → Prompt-0 `stage` */
export const OLD_STATUS_TO_STAGE: Record<string, LeadStage> = {
  新线索: '待处理',
  已联系: '跟进中',
  需求确认: '确认需求',
  方案报价: '提交需求',
  赢单: '已转化',
  暂缓: '无效',
  待处理: '待处理',
  跟进中: '跟进中',
  提交需求: '提交需求',
  确认需求: '确认需求',
  已转化: '已转化',
  无效: '无效',
};

/** Prompt-0 `stage` → legacy UI `status` (keep old dropdown options working) */
export const STAGE_TO_OLD_STATUS: Record<string, string> = {
  待处理: '新线索',
  跟进中: '已联系',
  提交需求: '方案报价',
  确认需求: '需求确认',
  已转化: '赢单',
  无效: '暂缓',
};

export function normalizeLeadStage(input: string | null | undefined): LeadStage {
  if (!input) return '待处理';
  const mapped = OLD_STATUS_TO_STAGE[input];
  if (mapped) return mapped;
  if ((LEAD_STAGES as readonly string[]).includes(input)) return input as LeadStage;
  return '待处理';
}

export function dualWriteFromStatus(status: string): { stage: LeadStage; status: string } {
  const stage = normalizeLeadStage(status);
  return { stage, status: STAGE_TO_OLD_STATUS[stage] || status };
}

export function dualWriteFromStage(stageInput: string): { stage: LeadStage; status: string } {
  const stage = normalizeLeadStage(stageInput);
  return { stage, status: STAGE_TO_OLD_STATUS[stage] };
}

export function assertLeadNotTerminalForAdvance(stage: string): string | null {
  if (LEAD_TERMINAL.has(stage)) return '线索已结束，不能再推进阶段';
  return null;
}

export function canCreateOpportunityFromLead(lead: {
  stage?: string | null;
  converted_account_id?: number | null;
  convertedAccountId?: number | null;
}): { ok: true; accountId: number } | { ok: false; error: string } {
  const stage = normalizeLeadStage(lead.stage || undefined);
  const accountId = lead.convertedAccountId ?? lead.converted_account_id ?? null;
  if (stage !== '已转化' || accountId == null) {
    return { ok: false, error: '未转化线索不能创建销售机会' };
  }
  return { ok: true, accountId: Number(accountId) };
}

export function validatePendingFollowUp(content: string, nextContactAt: string | null | undefined): string | null {
  if (!nextContactAt || !String(nextContactAt).trim()) return '待处理跟进必须填写下次联系时间';
  return null;
}

export function validateCompleteFollowUp(content: string): string | null {
  if (!String(content || '').trim()) return '完成跟进必须填写内容';
  return null;
}

/** Pure: should spawn next pending after complete? */
export function shouldSpawnNextPending(nextContactAt: string | null | undefined): boolean {
  return Boolean(nextContactAt && String(nextContactAt).trim());
}

export function formatOppCode(date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `OPP-${y}${m}${d}-${String(seq).padStart(4, '0')}`;
}
