ALTER TABLE `expenses` ADD `created_by` integer REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `notes` ADD `created_by` integer REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tasks` ADD `created_by` integer REFERENCES users(id) ON DELETE set null;