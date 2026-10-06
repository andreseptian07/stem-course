CREATE TABLE `access_events` (
	`id` varchar(191) NOT NULL,
	`actor_id` varchar(191) NOT NULL,
	`target_id` varchar(191) NOT NULL,
	`status` varchar(32) NOT NULL,
	`reason` longtext NOT NULL,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `access_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`lesson_id` varchar(191) NOT NULL,
	`revision` int NOT NULL,
	`kind` varchar(32) NOT NULL,
	`state` varchar(32) NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`data` longtext NOT NULL,
	`poll_at` bigint NOT NULL DEFAULT 0,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `attempts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `class_assignments` (
	`id` varchar(191) NOT NULL,
	`class_id` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`instructions` longtext NOT NULL,
	`due_at` varchar(32),
	`status` varchar(32) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `class_assignments_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `cohort_feedback` (
	`id` varchar(191) NOT NULL,
	`class_id` varchar(191) NOT NULL,
	`student_id` varchar(191) NOT NULL,
	`mentor_id` varchar(191) NOT NULL,
	`mentor_name` longtext NOT NULL,
	`body` longtext NOT NULL,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `cohort_feedback_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `cohort_members` (
	`class_id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`status` varchar(32) NOT NULL,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `cohort_members_class_id_user_id_pk` PRIMARY KEY(`class_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `cohort_posts` (
	`id` varchar(191) NOT NULL,
	`class_id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`name` longtext NOT NULL,
	`role` varchar(32) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`body` longtext NOT NULL,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `cohort_posts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `cohort_sessions` (
	`id` varchar(191) NOT NULL,
	`class_id` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`kind` varchar(32) NOT NULL,
	`starts_at` varchar(32) NOT NULL,
	`duration` int NOT NULL,
	`location` longtext NOT NULL,
	`url` longtext NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `cohort_sessions_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `cohorts` (
	`id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`mentor_id` varchar(191),
	`name` longtext NOT NULL,
	`description` longtext NOT NULL DEFAULT '',
	`starts_at` varchar(32),
	`ends_at` varchar(32),
	`capacity` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'open',
	`version` int NOT NULL DEFAULT 1,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `cohorts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` varchar(191) NOT NULL,
	`data` longtext NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `enrollments` (
	`user_id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `enrollments_user_id_course_id_pk` PRIMARY KEY(`user_id`,`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`lesson_id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`name` longtext NOT NULL,
	`role` varchar(32) NOT NULL,
	`body` longtext NOT NULL,
	`parent_id` varchar(191),
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` varchar(191) NOT NULL,
	`data` longtext NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `profiles_user_id` PRIMARY KEY(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `progress` (
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
	CONSTRAINT `progress_user_id_course_id_lesson_id_pk` PRIMARY KEY(`user_id`,`course_id`,`lesson_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `project_submissions` (
	`id` varchar(191) NOT NULL,
	`assignment_id` varchar(191) NOT NULL,
	`student_id` varchar(191) NOT NULL,
	`attempt` int NOT NULL,
	`assignment_version` int NOT NULL,
	`instructions` longtext NOT NULL,
	`body` longtext NOT NULL,
	`url` longtext NOT NULL,
	`submitted_at` varchar(32) NOT NULL,
	`late` int NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL DEFAULT 'submitted',
	`feedback` longtext NOT NULL DEFAULT '',
	`score` int,
	`reviewer_name` longtext,
	`reviewed_at` varchar(32),
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `project_submissions_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `rsvps` (
	`session_id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	CONSTRAINT `rsvps_session_id_user_id_pk` PRIMARY KEY(`session_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`kind` varchar(32) NOT NULL,
	`starts_at` varchar(32) NOT NULL,
	`duration` int NOT NULL,
	`location` longtext NOT NULL,
	`url` longtext NOT NULL,
	`capacity` int NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(191) NOT NULL,
	`value` longtext NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `user_access` (
	`user_id` varchar(191) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`version` int NOT NULL DEFAULT 1,
	`created_at` varchar(32) NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `user_access_user_id` PRIMARY KEY(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(191) NOT NULL,
	`name` longtext NOT NULL,
	`role` varchar(32) NOT NULL DEFAULT 'student',
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `access_events_time` ON `access_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_user_course` ON `attempts` (`user_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `attempts_user_time` ON `attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_code_state_time` ON `attempts` (`kind`,`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `assignments_class` ON `class_assignments` (`class_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cohort_feedback_recipient` ON `cohort_feedback` (`class_id`,`student_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cohort_members_user` ON `cohort_members` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `cohort_posts_class_time` ON `cohort_posts` (`class_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cohort_sessions_class_time` ON `cohort_sessions` (`class_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `messages_course_lesson` ON `messages` (`course_id`,`lesson_id`);--> statement-breakpoint
CREATE INDEX `submissions_assignment_student` ON `project_submissions` (`assignment_id`,`student_id`,`attempt`);--> statement-breakpoint
CREATE INDEX `sessions_course_start` ON `sessions` (`course_id`,`starts_at`);