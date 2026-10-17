/**
 * Pure business-rule tests for Prompt 0 core (no D1 required).
 * 1) unconverted lead → opportunity blocked (400 semantics)
 * 2) manager cannot write subordinate customer
 * 3) convert keeps lead row (simulated)
 * Plus stage dual-write mapping & follow-up rules.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- inline mirrors of app/lib/crm-stages.ts (keep in sync) ---
const OLD_STATUS_TO_STAGE = {
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
const STAGE_TO_OLD_STATUS = {
  待处理: '新线索',
  跟进中: '已联系',
  提交需求: '方案报价',
  确认需求: '需求确认',
  已转化: '赢单',
  无效: '暂缓',
};

function normalizeLeadStage(input) {
  if (!input) return '待处理';
  return OLD_STATUS_TO_STAGE[input] || (['待处理','跟进中','提交需求','确认需求','已转化','无效'].includes(input) ? input : '待处理');
}

function canCreateOpportunityFromLead(lead) {
  const stage = normalizeLeadStage(lead.stage);
  const accountId = lead.convertedAccountId ?? lead.converted_account_id ?? null;
  if (stage !== '已转化' || accountId == null) {
    return { ok: false, error: '未转化线索不能创建销售机会', status: 400 };
  }
  return { ok: true, accountId: Number(accountId) };
}

function decide(actor, ownerUserId, ownerManagerId, mode) {
  if (actor.role === 'admin') return true;
  if (actor.id == null) return false;
  const isOwner = ownerUserId != null && ownerUserId === actor.id;
  const isDirectManager = ownerManagerId != null && ownerManagerId === actor.id;
  if (mode === 'read' || mode === 'assign') return isOwner || isDirectManager;
  return isOwner;
}

function simulateConvert(store, leadId) {
  const lead = store.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error('missing lead');
  const account = { id: store.nextAccountId++, name: lead.companyName };
  store.accounts.push(account);
  lead.stage = '已转化';
  lead.status = STAGE_TO_OLD_STATUS['已转化'];
  lead.convertedAccountId = account.id;
  lead.convertedAt = new Date().toISOString();
  // lead row must still exist
  return { accountId: account.id, leadKept: store.leads.some((l) => l.id === leadId) };
}

function validatePending(nextContactAt) {
  if (!nextContactAt || !String(nextContactAt).trim()) return '待处理跟进必须填写下次联系时间';
  return null;
}
function validateComplete(content) {
  if (!String(content || '').trim()) return '完成跟进必须填写内容';
  return null;
}
function shouldSpawn(next) {
  return Boolean(next && String(next).trim());
}

let failed = 0;
function assert(cond, label) {
  if (!cond) {
    console.error('FAIL', label);
    failed++;
  } else {
    console.log('OK', label);
  }
}

// 1) unconverted lead → opportunity 400
{
  const blocked = canCreateOpportunityFromLead({ stage: '跟进中', convertedAccountId: null });
  assert(!blocked.ok && blocked.status === 400, 'unconverted lead → opportunity 400');
  const blocked2 = canCreateOpportunityFromLead({ stage: '已转化', convertedAccountId: null });
  assert(!blocked2.ok, 'converted without account still blocked');
  const ok = canCreateOpportunityFromLead({ stage: '已转化', convertedAccountId: 7 });
  assert(ok.ok && ok.accountId === 7, 'converted lead allows opportunity');
}

// 2) manager cannot write subordinate customer
{
  assert(decide({ id: 9, role: 'sales' }, 1, 9, 'write') === false, 'manager cannot write subordinate customer');
  assert(decide({ id: 9, role: 'sales' }, 1, 9, 'read') === true, 'manager can read subordinate customer');
  assert(decide({ id: 9, role: 'sales' }, 1, 9, 'assign') === true, 'manager can assign subordinate customer');
  assert(decide({ id: 1, role: 'sales' }, 1, 9, 'write') === true, 'owner can write');
}

// 3) convert keeps lead row
{
  const store = {
    nextAccountId: 100,
    accounts: [],
    leads: [{ id: 1, companyName: 'Acme', stage: '确认需求', status: '需求确认', convertedAccountId: null }],
  };
  const result = simulateConvert(store, 1);
  assert(result.leadKept === true, 'convert lead keeps lead row');
  assert(store.leads[0].stage === '已转化', 'convert sets stage 已转化');
  assert(store.leads[0].convertedAccountId === 100, 'convert sets converted_account_id');
  assert(store.accounts.length === 1, 'convert creates account');
}

// dual-write mapping
{
  assert(normalizeLeadStage('新线索') === '待处理', 'map 新线索→待处理');
  assert(normalizeLeadStage('赢单') === '已转化', 'map 赢单→已转化');
  assert(STAGE_TO_OLD_STATUS['无效'] === '暂缓', 'reverse 无效→暂缓');
}

// follow-up rules
{
  assert(validatePending(null) !== null, 'pending requires next_contact_at');
  assert(validatePending('2026-10-18T10:00:00Z') === null, 'pending with next_contact_at ok');
  assert(validateComplete('') !== null, 'complete requires content');
  assert(validateComplete('谈妥了') === null, 'complete with content ok');
  assert(shouldSpawn('2026-10-20') === true, 'spawn next when next_contact_at set');
  assert(shouldSpawn(null) === false, 'no empty pending spawn');
}

// source files exist
{
  const files = [
    'drizzle/0007_crm_core.sql',
    'app/lib/crm-stages.ts',
    'app/api/leads/[id]/convert/route.ts',
    'app/api/leads/[id]/invalid/route.ts',
    'app/api/opportunities/route.ts',
    'app/api/follow-ups/route.ts',
    'app/api/follow-ups/[id]/complete/route.ts',
    'app/api/dashboard/todos/route.ts',
    'app/api/dashboard/subordinate-overdue/route.ts',
    'app/api/customers/[id]/contacts/route.ts',
    'app/api/account-contacts/[id]/route.ts',
  ];
  for (const f of files) {
    try {
      readFileSync(join(root, f));
      console.log('OK file', f);
    } catch {
      console.error('FAIL missing', f);
      failed++;
    }
  }
  const mig = readFileSync(join(root, 'drizzle/0007_crm_core.sql'), 'utf8');
  assert(mig.includes('account_contacts'), 'migration has account_contacts');
  assert(mig.includes('opportunities'), 'migration has opportunities');
  assert(mig.includes('follow_ups'), 'migration has follow_ups');
  assert(mig.includes('stage_histories'), 'migration has stage_histories');
  assert(mig.includes('converted_account_id'), 'migration has converted_account_id');
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nOK crm-core business rules');
