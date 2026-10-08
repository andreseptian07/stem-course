CREATE TABLE `curriculum_drafts` (
	`course_id` varchar(191) NOT NULL,
	`data` longtext NOT NULL,
	`base_version` int NOT NULL,
	`version` int NOT NULL,
	`state` varchar(191) NOT NULL,
	`updated_by` varchar(191) NOT NULL,
	`updated_at` varchar(191) NOT NULL,
	`note` longtext NOT NULL,
	`proof` varchar(191) NOT NULL,
	CONSTRAINT `curriculum_drafts_course_id` PRIMARY KEY(`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `curriculum_events` (
	`id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`actor_id` varchar(191) NOT NULL,
	`kind` varchar(191) NOT NULL,
	`detail` longtext NOT NULL,
	`created_at` varchar(191) NOT NULL,
	CONSTRAINT `curriculum_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `curriculum_members` (
	`course_id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`proof` varchar(191) NOT NULL,
	`active` int NOT NULL,
	`version` int NOT NULL,
	`granted_by` varchar(191) NOT NULL,
	`updated_at` varchar(191) NOT NULL,
	CONSTRAINT `curriculum_members_course_id_user_id_pk` PRIMARY KEY(`course_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `curriculum_events_course_time` ON `curriculum_events` (`course_id`,`created_at`);