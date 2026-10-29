CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`expense_id` integer,
	`room_id` integer,
	`kind` text NOT NULL,
	`original_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attachments_has_owner" CHECK("attachments"."project_id" IS NOT NULL OR "attachments"."expense_id" IS NOT NULL OR "attachments"."room_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_stored_name_unique` ON `attachments` (`stored_name`);--> statement-breakpoint
CREATE INDEX `attachments_project_idx` ON `attachments` (`project_id`);--> statement-breakpoint
CREATE INDEX `attachments_expense_idx` ON `attachments` (`expense_id`);--> statement-breakpoint
CREATE TABLE `contractors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`org_number` text,
	`phone` text,
	`email` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`room_id` integer,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`store` text,
	`category` text NOT NULL,
	`amount_ore` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "expenses_amount_nonneg" CHECK("expenses"."amount_ore" >= 0)
);
--> statement-breakpoint
CREATE INDEX `expenses_project_idx` ON `expenses` (`project_id`);--> statement-breakpoint
CREATE INDEX `expenses_room_idx` ON `expenses` (`room_id`);--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`label` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `measurements_room_idx` ON `measurements` (`room_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`room_id` integer,
	`content` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notes_has_owner" CHECK("notes"."project_id" IS NOT NULL OR "notes"."room_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `notes_project_idx` ON `notes` (`project_id`);--> statement-breakpoint
CREATE INDEX `notes_room_idx` ON `notes` (`room_id`);--> statement-breakpoint
CREATE TABLE `project_rooms` (
	`project_id` integer NOT NULL,
	`room_id` integer NOT NULL,
	PRIMARY KEY(`project_id`, `room_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_rooms_room_idx` ON `project_rooms` (`room_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planerad' NOT NULL,
	`start_date` text,
	`end_date` text,
	`budget_ore` integer DEFAULT 0 NOT NULL,
	`contractor_id` integer,
	`warranty_until` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`contractor_id`) REFERENCES `contractors`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "projects_budget_nonneg" CHECK("projects"."budget_ore" >= 0)
);
--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`floor` text,
	`area_m2` real,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name_unique` ON `rooms` (`name`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`room_id` integer,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`priority` text DEFAULT 'medel' NOT NULL,
	`budget_ore` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);