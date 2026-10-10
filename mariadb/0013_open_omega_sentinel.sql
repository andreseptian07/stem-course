CREATE TABLE `academic_change_events` (
	`id` varchar(191) NOT NULL,
	`actor_id` varchar(191) NOT NULL,
	`object_id` varchar(191) NOT NULL,
	`kind` varchar(80) NOT NULL,
	`data` longtext NOT NULL,
	`created_at` varchar(80) NOT NULL,
	CONSTRAINT `academic_change_events_id_pk` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `academic_mutation_receipts` (
	`actor_id` varchar(191) NOT NULL,
	`action` varchar(80) NOT NULL,
	`request_id` varchar(191) NOT NULL,
	`digest` varchar(80) NOT NULL,
	`result` longtext NOT NULL,
	`created_at` varchar(80) NOT NULL,
	CONSTRAINT `academic_mutation_receipts_actor_id_action_request_id_pk` PRIMARY KEY(`actor_id`,`action`,`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `assignment_revisions` (
	`assignment_id` varchar(191) NOT NULL,
	`version` int NOT NULL,
	`assessment_revision` int NOT NULL,
	`content_revision` int NOT NULL,
	`data` longtext NOT NULL,
	`actor_id` varchar(191) NOT NULL,
	`created_at` varchar(80) NOT NULL,
	CONSTRAINT `assignment_revisions_assignment_id_version_pk` PRIMARY KEY(`assignment_id`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `class_assignment_requirements` (
	`class_id` varchar(191) NOT NULL,
	`requirement_id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`lesson_id` varchar(191) NOT NULL,
	`assignment_id` varchar(191) NOT NULL,
	`requirement_revision` int NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `class_assignment_requirements_class_id_requirement_id_pk` PRIMARY KEY(`class_id`,`requirement_id`),
	CONSTRAINT `academic_binding_assignment` UNIQUE(`assignment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `learning_progress_revisions` (
	`user_id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`lesson_id` varchar(191) NOT NULL,
	`revision` int NOT NULL,
	`complete` int NOT NULL DEFAULT 0,
	`quiz_passed` int NOT NULL DEFAULT 0,
	`code_passed` int NOT NULL DEFAULT 0,
	`quiz_attempts` int NOT NULL DEFAULT 0,
	`code_attempts` int NOT NULL DEFAULT 0,
	`score` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`quiz_evidence_id` varchar(191),
	`code_evidence_id` varchar(191),
	`provenance` varchar(80) NOT NULL DEFAULT 'native',
	CONSTRAINT `academic_progress_pk` PRIMARY KEY(`user_id`,`course_id`,`lesson_id`,`revision`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `project_reviews` (
	`id` varchar(191) NOT NULL,
	`submission_id` varchar(191) NOT NULL,
	`sequence` int NOT NULL,
	`reviewer_id` varchar(191) NOT NULL,
	`reviewer_name` longtext NOT NULL,
	`status` varchar(80) NOT NULL,
	`score` int,
	`feedback` longtext NOT NULL,
	`snapshot` longtext NOT NULL,
	`request_id` varchar(191) NOT NULL,
	`created_at` varchar(80) NOT NULL,
	CONSTRAINT `project_reviews_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `academic_review_sequence` UNIQUE(`submission_id`,`sequence`),
	CONSTRAINT `academic_review_request` UNIQUE(`reviewer_id`,`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `class_assignments` ADD `assessment_revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `class_assignments` ADD `content_revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `class_assignments` ADD `rubric` longtext DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_submissions` ADD `assessment_revision` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_submissions` ADD `lesson_revision` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_submissions` ADD `requirement_revision` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_submissions` ADD `snapshot` longtext DEFAULT '{}' NOT NULL;
--> statement-breakpoint
INSERT INTO learning_progress_revisions(user_id,course_id,lesson_id,revision,complete,quiz_passed,code_passed,quiz_attempts,code_attempts,score,provenance) SELECT user_id,course_id,lesson_id,revision,complete,quiz_passed,code_passed,quiz_attempts,code_attempts,score,'legacy' FROM progress;

--> statement-breakpoint
INSERT INTO assignment_revisions(assignment_id,version,assessment_revision,content_revision,data,actor_id,created_at) SELECT id,version,assessment_revision,content_revision,json_object('title',title,'instructions',instructions,'rubric',rubric,'status',status,'dueAt',due_at,'provenance','legacy_current_snapshot'),'legacy_unknown',created_at FROM class_assignments;
