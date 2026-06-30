CREATE TABLE `decks` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#d87c4a' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY,
	`deck_id` text NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`due_at` text NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`ease_factor` integer DEFAULT 250 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_cards_deck_id_decks_id_fk` FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY,
	`card_id` text NOT NULL,
	`grade` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`next_due_at` text NOT NULL,
	`interval_days` integer NOT NULL,
	`ease_factor` integer NOT NULL,
	CONSTRAINT `fk_reviews_card_id_cards_id_fk` FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_decks_updated_at` ON `decks` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_cards_deck_id` ON `cards` (`deck_id`);--> statement-breakpoint
CREATE INDEX `idx_cards_due_at` ON `cards` (`due_at`);--> statement-breakpoint
CREATE INDEX `idx_cards_suspended_due_at` ON `cards` (`suspended`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_reviews_card_id_reviewed_at` ON `reviews` (`card_id`,`reviewed_at`);
