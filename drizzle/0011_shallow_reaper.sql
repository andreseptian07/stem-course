CREATE TABLE `curriculum_drafts` (
	`course_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`base_version` integer NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`note` text NOT NULL,
	`proof` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `curriculum_events` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `curriculum_events_course_time` ON `curriculum_events` (`course_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `curriculum_members` (
	`course_id` text NOT NULL,
	`user_id` text NOT NULL,
	`proof` text NOT NULL,
	`active` integer NOT NULL,
	`version` integer NOT NULL,
	`granted_by` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`course_id`, `user_id`)
);
