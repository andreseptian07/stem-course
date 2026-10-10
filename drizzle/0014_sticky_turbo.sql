ALTER TABLE `tutor_invitations` ADD `capability` text DEFAULT 'tutor' NOT NULL;--> statement-breakpoint
ALTER TABLE `tutor_invitations` ADD `course_id` text;