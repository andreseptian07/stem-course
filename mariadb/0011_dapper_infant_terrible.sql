ALTER TABLE `tutor_invitations` ADD `capability` varchar(32) DEFAULT 'tutor' NOT NULL;--> statement-breakpoint
ALTER TABLE `tutor_invitations` ADD `course_id` varchar(191);