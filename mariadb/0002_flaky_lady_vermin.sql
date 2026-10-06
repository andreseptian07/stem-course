CREATE TABLE `tutor_accounts` (
	`user_id` varchar(191) NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`granted_by` varchar(191) NOT NULL,
	`granted_at` varchar(32) NOT NULL,
	`revoked_at` varchar(32),
	CONSTRAINT `tutor_accounts_user_id` PRIMARY KEY(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `tutor_events` (
	`id` varchar(191) NOT NULL,
	`actor_id` varchar(191) NOT NULL,
	`target_email` varchar(254) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`reason` longtext NOT NULL,
	`created_at` varchar(32) NOT NULL,
	CONSTRAINT `tutor_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `tutor_invitations` (
	`id` varchar(191) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`email` varchar(254) NOT NULL,
	`display_name` longtext NOT NULL,
	`class_id` varchar(191),
	`created_by` varchar(191) NOT NULL,
	`created_at` varchar(32) NOT NULL,
	`expires_at` bigint NOT NULL,
	`accepted_user_id` varchar(191),
	`accepted_at` varchar(32),
	`activation_id` varchar(191),
	`revoked_at` varchar(32),
	CONSTRAINT `tutor_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `tutor_invitation_token_unique` UNIQUE(`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `tutor_events_time_idx` ON `tutor_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `tutor_invitation_email_idx` ON `tutor_invitations` (`email`);
