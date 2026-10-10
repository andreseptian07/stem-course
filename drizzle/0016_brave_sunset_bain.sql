CREATE TABLE `academic_change_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`object_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `academic_mutation_receipts` (
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`request_id` text NOT NULL,
	`digest` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`actor_id`, `action`, `request_id`)
);
--> statement-breakpoint
CREATE TABLE `assignment_revisions` (
	`assignment_id` text NOT NULL,
	`version` integer NOT NULL,
	`assessment_revision` integer NOT NULL,
	`content_revision` integer NOT NULL,
	`data` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`assignment_id`, `version`)
);
--> statement-breakpoint
CREATE TABLE `class_assignment_requirements` (
	`class_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`requirement_revision` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`class_id`, `requirement_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_binding_assignment` ON `class_assignment_requirements` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `learning_progress_revisions` (
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
	`version` integer DEFAULT 1 NOT NULL,
	`quiz_evidence_id` text,
	`code_evidence_id` text,
	`provenance` text DEFAULT 'native' NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `lesson_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `project_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`reviewer_id` text NOT NULL,
	`reviewer_name` text NOT NULL,
	`status` text NOT NULL,
	`score` integer,
	`feedback` text NOT NULL,
	`snapshot` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_review_sequence` ON `project_reviews` (`submission_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `academic_review_request` ON `project_reviews` (`reviewer_id`,`request_id`);--> statement-breakpoint
ALTER TABLE `class_assignments` ADD `assessment_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `class_assignments` ADD `content_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `class_assignments` ADD `rubric` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_submissions` ADD `assessment_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_submissions` ADD `lesson_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_submissions` ADD `requirement_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_submissions` ADD `snapshot` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
INSERT INTO learning_progress_revisions(user_id,course_id,lesson_id,revision,complete,quiz_passed,code_passed,quiz_attempts,code_attempts,score,provenance) SELECT user_id,course_id,lesson_id,revision,complete,quiz_passed,code_passed,quiz_attempts,code_attempts,score,'legacy' FROM progress;

--> statement-breakpoint
INSERT INTO assignment_revisions(assignment_id,version,assessment_revision,content_revision,data,actor_id,created_at) SELECT id,version,assessment_revision,content_revision,json_object('title',title,'instructions',instructions,'rubric',rubric,'status',status,'dueAt',due_at,'provenance','legacy_current_snapshot'),'legacy_unknown',created_at FROM class_assignments;
