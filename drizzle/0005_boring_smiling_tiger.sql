ALTER TABLE `customers` ADD `owner_user_id` integer;--> statement-breakpoint
CREATE INDEX `idx_customers_owner` ON `customers` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `leads` ADD `owner_user_id` integer;--> statement-breakpoint
CREATE INDEX `idx_leads_owner_status` ON `leads` (`owner_user_id`,`status`);