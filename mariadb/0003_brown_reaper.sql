CREATE TABLE `notification_reads` (
	`user_id` varchar(191) NOT NULL,
	`event_id` varchar(64) NOT NULL,
	`read_at` varchar(32) NOT NULL,
	CONSTRAINT `notification_reads_user_id_event_id_pk` PRIMARY KEY(`user_id`,`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
