ALTER TABLE `attempts` ADD `poll_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `attempts_user_time` ON `attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_code_state_time` ON `attempts` (`kind`,`state`,`created_at`);