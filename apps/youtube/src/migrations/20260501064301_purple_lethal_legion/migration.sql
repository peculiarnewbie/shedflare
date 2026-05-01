CREATE TABLE `notifications` (
	`id` text PRIMARY KEY,
	`channel_id` text,
	`channel_name` text NOT NULL,
	`channel_avatar_url` text,
	`video_id` text,
	`title` text NOT NULL,
	`type` text DEFAULT 'upload' NOT NULL,
	`timestamp` text NOT NULL,
	`synced_at` text NOT NULL,
	`read` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watch_later_videos` (
	`video_id` text PRIMARY KEY,
	`title` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text NOT NULL,
	`duration_seconds` integer,
	`thumbnail_url` text,
	`published_at` text,
	`added_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`synced_at` text NOT NULL,
	`pruned` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notif_channel` ON `notifications` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_notif_timestamp` ON `notifications` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_notif_read` ON `notifications` (`read`);--> statement-breakpoint
CREATE INDEX `idx_wlv_channel` ON `watch_later_videos` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_wlv_synced` ON `watch_later_videos` (`synced_at`);--> statement-breakpoint
CREATE INDEX `idx_wlv_pruned` ON `watch_later_videos` (`pruned`);