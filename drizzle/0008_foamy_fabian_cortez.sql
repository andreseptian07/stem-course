CREATE TABLE `project_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`submission_id` text,
	`scope` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_files_owner` ON `project_files` (`owner_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `project_files_submission` ON `project_files` (`submission_id`);