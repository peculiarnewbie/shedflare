CREATE TABLE `accounts` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`offbudget` integer DEFAULT false NOT NULL,
	`closed` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`balance_current` integer,
	`balance_available` integer,
	`balance_limit` integer,
	`mask` text,
	`official_name` text,
	`last_reconciled` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budget_months` (
	`id` text PRIMARY KEY,
	`buffered` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY,
	`month` integer NOT NULL,
	`category_id` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`carryover` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_budgets_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`is_income` integer DEFAULT false NOT NULL,
	`group_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`goal_def` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_categories_group_id_category_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `category_groups`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `category_groups` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`is_income` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_reports` (
	`id` text PRIMARY KEY,
	`name` text,
	`start_date` text,
	`end_date` text,
	`date_static` integer DEFAULT false NOT NULL,
	`date_range` text,
	`mode` text,
	`group_by` text,
	`sort_by` text DEFAULT 'desc' NOT NULL,
	`interval` text,
	`balance_type` text,
	`show_empty` integer DEFAULT false NOT NULL,
	`show_offbudget` integer DEFAULT false NOT NULL,
	`show_hidden` integer DEFAULT false NOT NULL,
	`show_uncategorized` integer DEFAULT false NOT NULL,
	`trim_intervals` integer DEFAULT false NOT NULL,
	`include_current` integer DEFAULT true NOT NULL,
	`graph_type` text,
	`conditions` text DEFAULT '[]' NOT NULL,
	`conditions_op` text DEFAULT 'and' NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dashboard_widgets` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`meta` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY,
	`usd_to_idr` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY,
	`noteable_type` text NOT NULL,
	`noteable_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payees` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`transfer_account_id` text,
	`favorite` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_payees_transfer_account_id_accounts_id_fk` FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY,
	`stage` text DEFAULT 'pre' NOT NULL,
	`conditions_op` text DEFAULT 'and' NOT NULL,
	`conditions` text NOT NULL,
	`actions` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY,
	`name` text,
	`account_id` text,
	`payee_id` text,
	`category_id` text,
	`amount` integer,
	`start_date` text,
	`recurrence_rules` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`posts_transaction` integer DEFAULT false NOT NULL,
	`custom_upcoming_length` integer,
	`next_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_schedules_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_schedules_payee_id_payees_id_fk` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_schedules_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_filters` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`conditions` text NOT NULL,
	`conditions_op` text DEFAULT 'and' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_tags` (
	`transaction_id` text NOT NULL,
	`tag_id` text NOT NULL,
	CONSTRAINT `transaction_tags_pk` PRIMARY KEY(`transaction_id`, `tag_id`),
	CONSTRAINT `fk_transaction_tags_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_transaction_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`category_id` text,
	`amount` integer NOT NULL,
	`payee` text,
	`notes` text,
	`date` text NOT NULL,
	`cleared` integer DEFAULT true NOT NULL,
	`reconciled` integer DEFAULT false NOT NULL,
	`imported_description` text,
	`starting_balance_flag` integer DEFAULT false NOT NULL,
	`sort_order` integer,
	`is_parent` integer DEFAULT false NOT NULL,
	`is_child` integer DEFAULT false NOT NULL,
	`parent_id` text,
	`transfer_id` text,
	`schedule_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_transactions_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_transactions_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `idx_budgets_month` ON `budgets` (`month`);--> statement-breakpoint
CREATE INDEX `idx_budgets_category` ON `budgets` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_categories_group` ON `categories` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_payees_name` ON `payees` (`name`);--> statement-breakpoint
CREATE INDEX `idx_transactions_account` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_category` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_parent` ON `transactions` (`parent_id`);