ALTER TABLE `files` ADD `is_public` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `idx_files_is_public_created_at` ON `files` (`is_public`, `created_at`);
