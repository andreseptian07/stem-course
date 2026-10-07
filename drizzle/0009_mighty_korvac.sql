CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`course_id` text,
	`purpose` text NOT NULL,
	`scope` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`bound` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_owner_scope` ON `media_files` (`owner_id`,`scope`);--> statement-breakpoint
CREATE INDEX `media_course` ON `media_files` (`course_id`);