CREATE TABLE `cohort_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`mentor_id` text NOT NULL,
	`mentor_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cohort_feedback_recipient` ON `cohort_feedback` (`class_id`,`student_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cohort_members` (
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`class_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `cohort_members_user` ON `cohort_members` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `cohort_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cohort_posts_class_time` ON `cohort_posts` (`class_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cohort_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration` integer NOT NULL,
	`location` text NOT NULL,
	`url` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cohort_sessions_class_time` ON `cohort_sessions` (`class_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `cohorts` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`mentor_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`capacity` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
