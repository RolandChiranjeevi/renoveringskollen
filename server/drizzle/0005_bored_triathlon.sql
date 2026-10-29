CREATE TABLE `maintenance_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`maintenance_id` integer NOT NULL,
	`done_on` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_log_task_idx` ON `maintenance_log` (`maintenance_id`,`done_on`);--> statement-breakpoint
CREATE TABLE `maintenance_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`room_id` integer,
	`interval_months` integer NOT NULL,
	`first_due_on` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "maintenance_interval" CHECK("maintenance_tasks"."interval_months" BETWEEN 1 AND 600)
);
--> statement-breakpoint
CREATE INDEX `maintenance_tasks_room_idx` ON `maintenance_tasks` (`room_id`);