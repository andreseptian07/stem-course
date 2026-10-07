CREATE TABLE `certificates` (
	`number` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`class_id` text NOT NULL,
	`course_version` integer NOT NULL,
	`recipient_name` text NOT NULL,
	`course_title` text NOT NULL,
	`class_name` text NOT NULL,
	`evidence` text NOT NULL,
	`issued_at` text NOT NULL,
	`revoked_at` text,
	`revoked_by` text,
	`revoke_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_learner_class` ON `certificates` (`user_id`,`course_id`,`class_id`);--> statement-breakpoint
CREATE INDEX `certificates_course_time` ON `certificates` (`course_id`,`issued_at`);