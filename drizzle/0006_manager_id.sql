ALTER TABLE `crm_users` ADD `manager_id` integer;--> statement-breakpoint
CREATE INDEX `idx_crm_users_manager` ON `crm_users` (`manager_id`);
