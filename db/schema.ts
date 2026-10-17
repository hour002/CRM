import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }), name: text('name').notNull(),
  province: text('province').notNull().default('待补充'), city: text('city').notNull().default(''), address: text('address').notNull().default(''),
  latitude: real('latitude'), longitude: real('longitude'), locationPrecision: text('location_precision').notNull().default('province'), salesperson: text('salesperson').notNull().default(''),
  orderCount: integer('order_count').notNull().default(0), latestOrderDate: text('latest_order_date').notNull().default(''),
  latestOrderNo: text('latest_order_no').notNull().default(''), customerLevel: text('customer_level').notNull().default('一般客户'), communicationCycle: text('communication_cycle').notNull().default('每季度'),
  communicated: integer('communicated', { mode: 'boolean' }).notNull().default(false), lastCommunicationAt: text('last_communication_at'),
  communicationSummary: text('communication_summary').notNull().default(''), contactName: text('contact_name').notNull().default(''),
  contactPhone: text('contact_phone').notNull().default(''), tags: text('tags').notNull().default(''),
  ownerUserId: integer('owner_user_id'),
  stage: text('stage').notNull().default('潜在'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_customers_name').on(table.name), index('idx_customers_province').on(table.province), index('idx_customers_province_city').on(table.province, table.city), index('idx_customers_cycle_communicated').on(table.communicationCycle, table.communicated), index('idx_customers_owner').on(table.ownerUserId)]);

export const interactions = sqliteTable('interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }), customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  communicatedAt: text('communicated_at').notNull(), summary: text('summary').notNull().default(''),
}, (table) => [index('idx_interactions_customer_date').on(table.customerId, table.communicatedAt)]);

export const leads = sqliteTable('leads', {
  id: integer('id').primaryKey({ autoIncrement: true }), companyName: text('company_name').notNull(),
  contactName: text('contact_name').notNull().default(''), contactPhone: text('contact_phone').notNull().default(''),
  source: text('source').notNull().default('主动拓展'), status: text('status').notNull().default('新线索'),
  stage: text('stage').notNull().default('待处理'),
  province: text('province').notNull().default('待补充'),
  ownerUserId: integer('owner_user_id'),
  notes: text('notes').notNull().default(''),
  invalidReason: text('invalid_reason').notNull().default(''),
  convertedAccountId: integer('converted_account_id'),
  convertedAt: text('converted_at'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_leads_status').on(table.status), index('idx_leads_owner_status').on(table.ownerUserId, table.status), index('idx_leads_stage').on(table.stage), index('idx_leads_converted_account').on(table.convertedAccountId)]);

export const customerVisits = sqliteTable('customer_visits', {
  id: integer('id').primaryKey({ autoIncrement: true }), customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  plannedAt: text('planned_at').notNull(), status: text('status').notNull().default('待拜访'), purpose: text('purpose').notNull().default(''),
  summary: text('summary').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_customer_visits_customer_planned').on(table.customerId, table.plannedAt), index('idx_customer_visits_status_planned').on(table.status, table.plannedAt)]);

export const prototypeSpecs = sqliteTable('prototype_specs', {
  id: integer('id').primaryKey(), content: text('content').notNull().default('{}'), updatedAt: text('updated_at').notNull(),
});

export const networkContacts = sqliteTable('network_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }), sequence: integer('sequence').notNull(), name: text('name').notNull(),
  importance: text('importance').notNull().default(''), frequency: text('frequency').notNull().default('待设定'), category: text('category').notNull().default('未分类'),
  organization: text('organization').notNull().default(''), industry: text('industry').notNull().default(''), notes: text('notes').notNull().default(''), initialContact: text('initial_contact').notNull().default(''),
  contacted: integer('contacted', { mode: 'boolean' }).notNull().default(false), lastContactAt: text('last_contact_at'), contactSummary: text('contact_summary').notNull().default(''),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_network_contacts_category').on(table.category), index('idx_network_contacts_frequency_contacted').on(table.frequency, table.contacted)]);

export const networkInteractions = sqliteTable('network_interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }), contactId: integer('contact_id').notNull().references(() => networkContacts.id, { onDelete: 'cascade' }),
  contactedAt: text('contacted_at').notNull(), summary: text('summary').notNull().default(''),
}, (table) => [index('idx_network_interactions_contact_date').on(table.contactId, table.contactedAt)]);

export const crmUsers = sqliteTable('crm_users', {
  id: integer('id').primaryKey({ autoIncrement: true }), username: text('username').notNull(), displayName: text('display_name').notNull(),
  role: text('role').notNull().default('sales'), passwordSalt: text('password_salt').notNull(), passwordHash: text('password_hash').notNull(),
  passwordIterations: integer('password_iterations').notNull().default(120000), active: integer('active', { mode: 'boolean' }).notNull().default(true),
  managerId: integer('manager_id'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_crm_users_username').on(table.username), index('idx_crm_users_role_active').on(table.role, table.active), index('idx_crm_users_manager').on(table.managerId)]);
export const crmSessions = sqliteTable('crm_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }), userId: integer('user_id').notNull().references(() => crmUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(), expiresAt: text('expires_at').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_crm_sessions_token_hash').on(table.tokenHash), index('idx_crm_sessions_user_expiry').on(table.userId, table.expiresAt)]);
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }), actorUserId: integer('actor_user_id').references(() => crmUsers.id, { onDelete: 'set null' }),
  actorName: text('actor_name').notNull(), action: text('action').notNull(), targetType: text('target_type').notNull(), targetId: text('target_id').notNull().default(''),
  detail: text('detail').notNull().default(''), createdAt: text('created_at').notNull(),
}, (table) => [index('idx_audit_logs_created').on(table.createdAt), index('idx_audit_logs_actor_created').on(table.actorUserId, table.createdAt)]);

/** CRM contacts belonging to a customer (account). Distinct from network_contacts. */
export const accountContacts = sqliteTable('account_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  title: text('title').notNull().default(''),
  email: text('email').notNull().default(''),
  wechat: text('wechat').notNull().default(''),
  remark: text('remark').notNull().default(''),
  ownerUserId: integer('owner_user_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_account_contacts_account').on(table.accountId), index('idx_account_contacts_owner').on(table.ownerUserId)]);

export const opportunities = sqliteTable('opportunities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  leadId: integer('lead_id'),
  name: text('name').notNull(),
  code: text('code').notNull(),
  contactId: integer('contact_id'),
  stage: text('stage').notNull().default('需求确认'),
  salesEstimatedAmount: real('sales_estimated_amount').notNull().default(0),
  projectAmount: real('project_amount').notNull().default(0),
  expectedCloseDate: text('expected_close_date').notNull().default(''),
  importance: text('importance').notNull().default('普通'),
  ownerUserId: integer('owner_user_id'),
  requirement: text('requirement').notNull().default(''),
  productMatch: text('product_match').notNull().default(''),
  techOwner: text('tech_owner').notNull().default(''),
  supportingDocs: text('supporting_docs').notNull().default(''),
  socialInsuranceCount: integer('social_insurance_count').notNull().default(0),
  reviewOpinion: text('review_opinion').notNull().default(''),
  actionPlan: text('action_plan').notNull().default(''),
  remark: text('remark').notNull().default(''),
  requirementDate: text('requirement_date').notNull().default(''),
  salesOpinion: text('sales_opinion').notNull().default(''),
  quantity: integer('quantity').notNull().default(0),
  isDraft: integer('is_draft', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_opportunities_code').on(table.code),
  index('idx_opportunities_account').on(table.accountId),
  index('idx_opportunities_owner_stage').on(table.ownerUserId, table.stage),
  index('idx_opportunities_lead').on(table.leadId),
]);

export const followUps = sqliteTable('follow_ups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerUserId: integer('owner_user_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: integer('target_id').notNull(),
  status: text('status').notNull().default('pending'),
  content: text('content').notNull().default(''),
  nextContactAt: text('next_contact_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_follow_ups_owner_status').on(table.ownerUserId, table.status),
  index('idx_follow_ups_target').on(table.targetType, table.targetId),
  index('idx_follow_ups_next_contact').on(table.status, table.nextContactAt),
]);

export const stageHistories = sqliteTable('stage_histories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  targetType: text('target_type').notNull(),
  targetId: integer('target_id').notNull(),
  fromStage: text('from_stage').notNull(),
  toStage: text('to_stage').notNull(),
  changedBy: integer('changed_by').notNull(),
  changedAt: text('changed_at').notNull(),
}, (table) => [index('idx_stage_histories_target').on(table.targetType, table.targetId, table.changedAt)]);
