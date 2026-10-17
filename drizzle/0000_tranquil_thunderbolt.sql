CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`province` text DEFAULT '待补充' NOT NULL,
	`salesperson` text DEFAULT '' NOT NULL,
	`order_count` integer DEFAULT 0 NOT NULL,
	`latest_order_date` text DEFAULT '' NOT NULL,
	`latest_order_no` text DEFAULT '' NOT NULL,
	`customer_level` text DEFAULT '一般客户' NOT NULL,
	`communication_cycle` text DEFAULT '每季度' NOT NULL,
	`communicated` integer DEFAULT false NOT NULL,
	`last_communication_at` text,
	`communication_summary` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_phone` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_name` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `idx_customers_province` ON `customers` (`province`);--> statement-breakpoint
CREATE INDEX `idx_customers_cycle_communicated` ON `customers` (`communication_cycle`,`communicated`);--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`communicated_at` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_interactions_customer_date` ON `interactions` (`customer_id`,`communicated_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_name` text NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_phone` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '主动拓展' NOT NULL,
	`status` text DEFAULT '新线索' NOT NULL,
	`province` text DEFAULT '待补充' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leads_status` ON `leads` (`status`);