CREATE TABLE `file_tags` (
	`file_id` text NOT NULL,
	`tag_id` text NOT NULL,
	CONSTRAINT `file_tags_pk` PRIMARY KEY(`file_id`, `tag_id`),
	CONSTRAINT `fk_file_tags_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_file_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY,
	`object_key` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_files_created_at` ON `files` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_files_name` ON `files` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tags_normalized_name` ON `tags` (`normalized_name`);