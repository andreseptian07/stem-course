CREATE TABLE `class_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text NOT NULL,
	`due_at` text,
	`status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assignments_class` ON `class_assignments` (`class_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`assignment_version` integer NOT NULL,
	`instructions` text NOT NULL,
	`body` text NOT NULL,
	`url` text NOT NULL,
	`submitted_at` text NOT NULL,
	`late` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`score` integer,
	`reviewer_name` text,
	`reviewed_at` text,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `submissions_assignment_student` ON `project_submissions` (`assignment_id`,`student_id`,`attempt`);