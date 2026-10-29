CREATE TABLE `materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`surface` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`color_code` text,
	`color_hex` text,
	`finish` text,
	`quantity` text,
	`applied_on` text,
	`project_id` integer,
	`expense_id` integer,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "materials_color_hex" CHECK("materials"."color_hex" IS NULL OR "materials"."color_hex" GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]')
);
--> statement-breakpoint
CREATE INDEX `materials_room_idx` ON `materials` (`room_id`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `task_id` integer REFERENCES tasks(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `expenses` ADD `contractor_id` integer REFERENCES contractors(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `expenses_task_idx` ON `expenses` (`task_id`);--> statement-breakpoint
CREATE INDEX `expenses_contractor_idx` ON `expenses` (`contractor_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `kind` text DEFAULT 'forbattring' NOT NULL;