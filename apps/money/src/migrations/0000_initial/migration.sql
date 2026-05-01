CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY,
	`usd_to_idr` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `manual_items` (
	`id` text PRIMARY KEY,
	`monthly_item_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL CHECK (`type` IN ('income', 'expense')),
	`amount` integer NOT NULL,
	`currency` text NOT NULL DEFAULT 'USD' CHECK (`currency` IN ('USD', 'IDR')),
	`category` text NOT NULL DEFAULT 'other',
	`note` text DEFAULT '',
	`month_key` text NOT NULL,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_manual_items_monthly_item_id_monthly_items_id_fk` FOREIGN KEY (`monthly_item_id`) REFERENCES `monthly_items`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_items` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`type` text NOT NULL CHECK (`type` IN ('income', 'expense')),
	`amount` integer NOT NULL,
	`currency` text NOT NULL DEFAULT 'USD' CHECK (`currency` IN ('USD', 'IDR')),
	`category` text NOT NULL DEFAULT 'other',
	`note` text DEFAULT '',
	`sort_order` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_toggles` (
	`monthly_item_id` text NOT NULL,
	`month_key` text NOT NULL,
	`active` integer NOT NULL DEFAULT 1,
	CONSTRAINT `uq_monthly_toggle` UNIQUE(`monthly_item_id`, `month_key`),
	CONSTRAINT `fk_monthly_toggles_monthly_item_id_monthly_items_id_fk` FOREIGN KEY (`monthly_item_id`) REFERENCES `monthly_items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_manual_items_month_key` ON `manual_items` (`month_key`);--> statement-breakpoint
CREATE INDEX `idx_manual_items_type` ON `manual_items` (`type`);--> statement-breakpoint
CREATE INDEX `idx_manual_items_category` ON `manual_items` (`category`);--> statement-breakpoint
CREATE INDEX `idx_monthly_items_type` ON `monthly_items` (`type`);--> statement-breakpoint
CREATE INDEX `idx_monthly_items_category` ON `monthly_items` (`category`);--> statement-breakpoint
CREATE INDEX `idx_monthly_toggles_month` ON `monthly_toggles` (`month_key`);