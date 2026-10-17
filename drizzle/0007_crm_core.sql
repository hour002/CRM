-- Lead six-stage + convert fields (keep status for dual-write with old UI)
ALTER TABLE `leads` ADD `stage` text DEFAULT '待处理' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `invalid_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `converted_account_id` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `converted_at` text;--> statement-breakpoint
CREATE INDEX `idx_leads_stage` ON `leads` (`stage`);--> statement-breakpoint
CREATE INDEX `idx_leads_converted_account` ON `leads` (`converted_account_id`);--> statement-breakpoint
-- Backfill stage from legacy status
UPDATE `leads` SET `stage` = CASE `status`
  WHEN '新线索' THEN '待处理'
  WHEN '已联系' THEN '跟进中'
  WHEN '需求确认' THEN '确认需求'
  WHEN '方案报价' THEN '提交需求'
  WHEN '赢单' THEN '已转化'
  WHEN '暂缓' THEN '无效'
  WHEN '待处理' THEN '待处理'
  WHEN '跟进中' THEN '跟进中'
  WHEN '提交需求' THEN '提交需求'
  WHEN '确认需求' THEN '确认需求'
  WHEN '已转化' THEN '已转化'
  WHEN '无效' THEN '无效'
  ELSE '待处理'
END;--> statement-breakpoint
-- Customer stage (account stage machine)
ALTER TABLE `customers` ADD `stage` text DEFAULT '潜在' NOT NULL;--> statement-breakpoint
-- Account contacts (CRM contacts under customers; distinct from network_contacts)
CREATE TABLE `account_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`wechat` text DEFAULT '' NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`owner_user_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `idx_account_contacts_account` ON `account_contacts` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_account_contacts_owner` ON `account_contacts` (`owner_user_id`);--> statement-breakpoint
-- Opportunities
CREATE TABLE `opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`lead_id` integer,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`contact_id` integer,
	`stage` text DEFAULT '需求确认' NOT NULL,
	`sales_estimated_amount` real DEFAULT 0 NOT NULL,
	`project_amount` real DEFAULT 0 NOT NULL,
	`expected_close_date` text DEFAULT '' NOT NULL,
	`importance` text DEFAULT '普通' NOT NULL,
	`owner_user_id` integer,
	`requirement` text DEFAULT '' NOT NULL,
	`product_match` text DEFAULT '' NOT NULL,
	`tech_owner` text DEFAULT '' NOT NULL,
	`supporting_docs` text DEFAULT '' NOT NULL,
	`social_insurance_count` integer DEFAULT 0 NOT NULL,
	`review_opinion` text DEFAULT '' NOT NULL,
	`action_plan` text DEFAULT '' NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`requirement_date` text DEFAULT '' NOT NULL,
	`sales_opinion` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`is_draft` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_opportunities_code` ON `opportunities` (`code`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_account` ON `opportunities` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_owner_stage` ON `opportunities` (`owner_user_id`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_lead` ON `opportunities` (`lead_id`);--> statement-breakpoint
-- Polymorphic follow-ups
CREATE TABLE `follow_ups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`next_contact_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_follow_ups_owner_status` ON `follow_ups` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_follow_ups_target` ON `follow_ups` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_follow_ups_next_contact` ON `follow_ups` (`status`,`next_contact_at`);--> statement-breakpoint
-- Stage histories
CREATE TABLE `stage_histories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`from_stage` text NOT NULL,
	`to_stage` text NOT NULL,
	`changed_by` integer NOT NULL,
	`changed_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_stage_histories_target` ON `stage_histories` (`target_type`,`target_id`,`changed_at`);
