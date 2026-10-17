CREATE TABLE `network_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sequence` integer NOT NULL,
	`name` text NOT NULL,
	`importance` text DEFAULT '' NOT NULL,
	`frequency` text DEFAULT '待设定' NOT NULL,
	`category` text DEFAULT '未分类' NOT NULL,
	`organization` text DEFAULT '' NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`initial_contact` text DEFAULT '' NOT NULL,
	`contacted` integer DEFAULT false NOT NULL,
	`last_contact_at` text,
	`contact_summary` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_network_contacts_category` ON `network_contacts` (`category`);--> statement-breakpoint
CREATE INDEX `idx_network_contacts_frequency_contacted` ON `network_contacts` (`frequency`,`contacted`);--> statement-breakpoint
CREATE TABLE `network_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`contacted_at` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `network_contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_network_interactions_contact_date` ON `network_interactions` (`contact_id`,`contacted_at`);