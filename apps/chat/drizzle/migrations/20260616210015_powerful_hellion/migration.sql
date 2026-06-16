CREATE TABLE `account_settings` (
	`id` text PRIMARY KEY,
	`expand_reasoning_by_default` integer NOT NULL,
	`show_traces` integer NOT NULL,
	`title_generation_model_id` text,
	`title_generation_model_interleaved_field` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`optimistic` integer,
	`op_id` text
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY,
	`thread_id` text NOT NULL,
	`message_id` text,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text,
	`width` integer,
	`height` integer,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`optimistic` integer,
	`op_id` text
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`op_id` text PRIMARY KEY,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`response_json` text,
	`created_at` text NOT NULL,
	`acked_seq` integer
);
--> statement-breakpoint
CREATE TABLE `comparison_groups` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`thread_ids` text NOT NULL,
	`created_at` text NOT NULL,
	`optimistic` integer,
	`op_id` text
);
--> statement-breakpoint
CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`event_id` text NOT NULL UNIQUE,
	`op_id` text,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `extract_runs` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`url` text NOT NULL,
	`status` text NOT NULL,
	`step` integer NOT NULL,
	`char_count` integer NOT NULL,
	`original_length` integer,
	`truncated` integer NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_parts` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`json` text
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY,
	`thread_id` text NOT NULL,
	`parent_message_id` text,
	`source_message_id` text,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`model_id` text NOT NULL,
	`reasoning_level` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`search_enabled` integer NOT NULL,
	`duration_ms` integer,
	`ttft_ms` integer,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`optimistic` integer,
	`op_id` text
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_turns` (
	`message_id` text PRIMARY KEY,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_results` (
	`id` text PRIMARY KEY,
	`search_run_id` text NOT NULL,
	`message_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`snippet` text NOT NULL,
	`published_at` text,
	`domain` text NOT NULL,
	`score` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_runs` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`query` text NOT NULL,
	`status` text NOT NULL,
	`step` integer NOT NULL,
	`num_results` integer NOT NULL,
	`result_count` integer NOT NULL,
	`preview_text` text NOT NULL,
	`error_message` text,
	`mode` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`pinned` integer NOT NULL,
	`head_message_id` text,
	`model_id` text,
	`reasoning_level` text,
	`search_enabled` integer,
	`search_limit` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_message_at` text NOT NULL,
	`archived_at` text,
	`forked_from_thread_id` text,
	`forked_from_message_id` text,
	`thread_type` text,
	`comparison_group_id` text,
	`optimistic` integer,
	`op_id` text
);
--> statement-breakpoint
CREATE TABLE `trace_runs` (
	`id` text PRIMARY KEY,
	`message_id` text,
	`thread_id` text,
	`workspace_id` text,
	`trace_id` text NOT NULL,
	`root_span_id` text NOT NULL,
	`model_id` text,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_ms` integer,
	`error_code` text,
	`error_message` text,
	`attrs_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trace_spans` (
	`id` text PRIMARY KEY,
	`trace_run_id` text,
	`trace_id` text NOT NULL,
	`parent_span_id` text,
	`message_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_ms` integer,
	`error_code` text,
	`error_message` text,
	`attrs_json` text NOT NULL,
	`events_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`system_prompt` text NOT NULL,
	`default_model_id` text NOT NULL,
	`default_reasoning_level` text NOT NULL,
	`default_search_mode` integer NOT NULL,
	`default_search_limit` integer NOT NULL,
	`prefer_free_search` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`sort_key` integer NOT NULL,
	`optimistic` integer,
	`op_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_thread` ON `attachments` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_commands_seq` ON `commands` (`acked_seq`);--> statement-breakpoint
CREATE INDEX `idx_events_seq` ON `events` (`seq`);--> statement-breakpoint
CREATE INDEX `idx_extract_runs_message` ON `extract_runs` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_parts_message_seq` ON `message_parts` (`message_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_messages_thread` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_search_results_message` ON `search_results` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_search_runs_message` ON `search_runs` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_threads_workspace` ON `threads` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_threads_comparison_group` ON `threads` (`comparison_group_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_runs_message` ON `trace_runs` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_spans_trace_run` ON `trace_spans` (`trace_run_id`);