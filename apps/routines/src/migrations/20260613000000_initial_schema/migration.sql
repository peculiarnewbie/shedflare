CREATE TABLE `settings` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`color` text DEFAULT '#5b8def' NOT NULL,
	`duration_minutes` integer NOT NULL,
	`weekly_target` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_completions` (
	`id` text PRIMARY KEY,
	`routine_id` text NOT NULL,
	`date` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_routine_completions_routine_id_routines_id_fk` FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON DELETE CASCADE,
	UNIQUE(`routine_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `idx_routines_sort_order` ON `routines` (`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_routine_completions_date` ON `routine_completions` (`date`);--> statement-breakpoint
CREATE INDEX `idx_routine_completions_routine_date` ON `routine_completions` (`routine_id`, `date`);
