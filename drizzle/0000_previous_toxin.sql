CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempts_user_course` ON `attempts` (`user_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`parent_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_course_lesson` ON `messages` (`course_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `progress` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`revision` integer NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL,
	`quiz_passed` integer DEFAULT 0 NOT NULL,
	`code_passed` integer DEFAULT 0 NOT NULL,
	`quiz_attempts` integer DEFAULT 0 NOT NULL,
	`code_attempts` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `rsvps` (
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration` integer NOT NULL,
	`location` text NOT NULL,
	`url` text NOT NULL,
	`capacity` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_course_start` ON `sessions` (`course_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL
);
