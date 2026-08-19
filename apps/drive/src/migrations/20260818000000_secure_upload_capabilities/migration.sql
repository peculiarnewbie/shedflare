CREATE TABLE `secure_upload_start_capabilities` (
	`nonce` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_secure_upload_starts_expires_at` ON `secure_upload_start_capabilities` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `secure_upload_sessions` (
	`upload_id` text PRIMARY KEY,
	`file_id` text NOT NULL UNIQUE,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_secure_upload_sessions_expires_at` ON `secure_upload_sessions` (`expires_at`);
