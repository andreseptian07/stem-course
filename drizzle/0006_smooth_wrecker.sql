CREATE TABLE `tutor_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`granted_by` text NOT NULL,
	`granted_at` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE TABLE `tutor_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`target_email` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tutor_events_time_idx` ON `tutor_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `tutor_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`class_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_user_id` text,
	`accepted_at` text,
	`activation_id` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_invitations_token_hash_unique` ON `tutor_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `tutor_invitation_email_idx` ON `tutor_invitations` (`email`);
