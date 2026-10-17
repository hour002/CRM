CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_actor_created` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `crm_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_crm_sessions_token_hash` ON `crm_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_crm_sessions_user_expiry` ON `crm_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `crm_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'sales' NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_iterations` integer DEFAULT 120000 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_crm_users_username` ON `crm_users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_crm_users_role_active` ON `crm_users` (`role`,`active`);