CREATE TABLE `media_files` (
	`id` varchar(36) NOT NULL,
	`owner_id` varchar(191) NOT NULL,
	`course_id` varchar(191),
	`purpose` varchar(16) NOT NULL,
	`scope` varchar(64) NOT NULL,
	`name` varchar(180) NOT NULL,
	`mime` varchar(80) NOT NULL,
	`size` int NOT NULL,
	`ready` int NOT NULL DEFAULT 0,
	`bound` int NOT NULL DEFAULT 0,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `media_files_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `media_owner_scope` ON `media_files` (`owner_id`,`scope`);--> statement-breakpoint
CREATE INDEX `media_course` ON `media_files` (`course_id`);