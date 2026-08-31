CREATE TABLE `ai_interrupts` (
	`interrupt_id` text PRIMARY KEY,
	`run_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	`payload_json` text NOT NULL,
	`response_json` text
);
--> statement-breakpoint
CREATE TABLE `ai_metadata` (
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	CONSTRAINT `ai_metadata_pk` PRIMARY KEY(`namespace`, `key`)
);
--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`run_id` text PRIMARY KEY,
	`thread_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`error_code` text,
	`usage_json` text,
	`sandbox_key` text,
	`detached_since` integer,
	`cancel_requested` integer,
	`driver_epoch` integer
);
--> statement-breakpoint
CREATE TABLE `ai_threads` (
	`thread_id` text PRIMARY KEY,
	`messages_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_interrupts_thread_requested` ON `ai_interrupts` (`thread_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `ai_interrupts_run_requested` ON `ai_interrupts` (`run_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `ai_runs_thread_started` ON `ai_runs` (`thread_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `ai_runs_status_detached` ON `ai_runs` (`status`,`detached_since`);