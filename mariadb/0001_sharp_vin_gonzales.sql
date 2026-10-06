CREATE TABLE `auth_credentials` (
	`user_id` varchar(191) NOT NULL,
	`email` varchar(254) NOT NULL,
	`display_name` longtext NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`password_version` int NOT NULL DEFAULT 1,
	`created_at` varchar(32) NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `auth_credentials_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `auth_credentials_email_unique` UNIQUE(`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `auth_limits` (
	`bucket_id` varchar(64) NOT NULL,
	`hits` int NOT NULL,
	`expires_at` bigint NOT NULL,
	CONSTRAINT `auth_limits_bucket_id` PRIMARY KEY(`bucket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` varchar(64) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`password_version` int NOT NULL,
	`created_at` bigint NOT NULL,
	`last_seen` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	CONSTRAINT `auth_sessions_token_hash` PRIMARY KEY(`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `auth_limits_expiry_idx` ON `auth_limits` (`expires_at`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);