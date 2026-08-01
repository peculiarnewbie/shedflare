-- Legacy versions created this table from the tail worker before migrations existed.
CREATE TABLE IF NOT EXISTS `error_logs` (
	`id` text PRIMARY KEY,
	`outcome` text NOT NULL,
	`script_name` text NOT NULL,
	`method` text,
	`url` text,
	`status` integer,
	`exception_name` text,
	`exception_message` text,
	`stack` text,
	`cpu_time_us` integer,
	`created_at` text NOT NULL
);
