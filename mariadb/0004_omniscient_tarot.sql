CREATE TABLE `auth_email_status` (
	`user_id` varchar(191) NOT NULL,
	`email` varchar(254) NOT NULL,
	`verified_at` varchar(32) NOT NULL,
	CONSTRAINT `auth_email_status_user_id` PRIMARY KEY(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `auth_email_tokens` (
	`token_hash` varchar(64) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`email` varchar(254) NOT NULL,
	`purpose` varchar(16) NOT NULL,
	`password_version` int NOT NULL,
	`created_at` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	`used_at` bigint,
	`claim_id` varchar(36),
	CONSTRAINT `auth_email_tokens_token_hash` PRIMARY KEY(`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `auth_email_tokens_user_idx` ON `auth_email_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_email_tokens_expiry_idx` ON `auth_email_tokens` (`expires_at`);