CREATE TABLE `experiences` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`workplace` text NOT NULL,
	`url` text NOT NULL,
	`tags` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`body` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`show_on_home` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`tags` text NOT NULL,
	`image` text NOT NULL,
	`url` text NOT NULL,
	`github_url` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`desc` text NOT NULL,
	`show_on_home` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
