CREATE TABLE `certificates` (
	`number` varchar(48) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`course_id` varchar(191) NOT NULL,
	`class_id` varchar(191) NOT NULL,
	`course_version` int NOT NULL,
	`recipient_name` longtext NOT NULL,
	`course_title` longtext NOT NULL,
	`class_name` longtext NOT NULL,
	`evidence` longtext NOT NULL,
	`issued_at` varchar(32) NOT NULL,
	`revoked_at` varchar(32),
	`revoked_by` varchar(191),
	`revoke_reason` longtext,
	CONSTRAINT `certificates_number` PRIMARY KEY(`number`),
	CONSTRAINT `certificates_learner_class` UNIQUE(`user_id`,`course_id`,`class_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `certificates_course_time` ON `certificates` (`course_id`,`issued_at`);