CREATE TABLE `customer_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`planned_at` text NOT NULL,
	`status` text DEFAULT '待拜访' NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_customer_visits_customer_planned` ON `customer_visits` (`customer_id`,`planned_at`);--> statement-breakpoint
CREATE INDEX `idx_customer_visits_status_planned` ON `customer_visits` (`status`,`planned_at`);--> statement-breakpoint
CREATE TABLE `prototype_specs` (
	`id` integer PRIMARY KEY NOT NULL,
	`content` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL
);
