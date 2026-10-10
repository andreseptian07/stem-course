CREATE TABLE `account_principals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`proof` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `authorization_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text NOT NULL,
	`capability` text,
	`scope_id` text,
	`reason` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `authorization_events_target_idx` ON `authorization_events` (`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `staff_grants` (
	`user_id` text NOT NULL,
	`capability` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`granted_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`proof` text NOT NULL,
	PRIMARY KEY(`user_id`, `capability`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_grants_capability_idx` ON `staff_grants` (`capability`,`active`,`user_id`);--> statement-breakpoint
ALTER TABLE `cohorts` ADD `mentor_grant_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `curriculum_members` ADD `grant_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `authorization_id` text DEFAULT '' NOT NULL;