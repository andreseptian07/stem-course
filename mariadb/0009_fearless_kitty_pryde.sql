CREATE TABLE `account_principals` (
	`user_id` varchar(191) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`updated_by` varchar(191) NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	`proof` varchar(80) NOT NULL,
	CONSTRAINT `account_principals_user_id` PRIMARY KEY(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `authorization_events` (
	`id` varchar(80) NOT NULL,
	`actor_id` varchar(191) NOT NULL,
	`target_id` varchar(191) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`capability` varchar(32),
	`scope_id` varchar(191),
	`reason` longtext NOT NULL,
	`data` longtext NOT NULL,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `authorization_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `staff_grants` (
	`user_id` varchar(191) NOT NULL,
	`capability` varchar(32) NOT NULL,
	`active` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`granted_by` varchar(191) NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	`proof` varchar(80) NOT NULL,
	CONSTRAINT `staff_grants_user_id_capability_pk` PRIMARY KEY(`user_id`,`capability`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `cohorts` ADD `mentor_grant_version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `curriculum_members` ADD `grant_version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `authorization_id` varchar(48) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_principals` ADD CONSTRAINT `account_principals_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_grants` ADD CONSTRAINT `staff_grants_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `authorization_events_target_idx` ON `authorization_events` (`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `staff_grants_capability_idx` ON `staff_grants` (`capability`,`active`,`user_id`);