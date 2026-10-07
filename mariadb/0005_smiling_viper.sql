CREATE TABLE `project_files` (
	`id` varchar(36) NOT NULL,
	`owner_id` varchar(191) NOT NULL,
	`assignment_id` varchar(191) NOT NULL,
	`submission_id` varchar(191),
	`scope` varchar(64) NOT NULL,
	`name` varchar(180) NOT NULL,
	`mime` varchar(80) NOT NULL,
	`size` int NOT NULL,
	`ready` int NOT NULL DEFAULT 0,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `project_files_id` PRIMARY KEY(`id`)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `project_files_owner` ON `project_files` (`owner_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `project_files_submission` ON `project_files` (`submission_id`);