PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`expense_id` integer,
	`room_id` integer,
	`kind` text NOT NULL,
	`original_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`caption` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attachments_has_owner" CHECK("__new_attachments"."project_id" IS NOT NULL OR "__new_attachments"."expense_id" IS NOT NULL OR "__new_attachments"."room_id" IS NOT NULL OR "__new_attachments"."kind" = 'kvitto')
);
--> statement-breakpoint
INSERT INTO `__new_attachments`("id", "project_id", "expense_id", "room_id", "kind", "original_name", "stored_name", "mime_type", "size_bytes", "caption", "created_at", "updated_at") SELECT "id", "project_id", "expense_id", "room_id", "kind", "original_name", "stored_name", "mime_type", "size_bytes", "caption", "created_at", "updated_at" FROM `attachments`;--> statement-breakpoint
DROP TABLE `attachments`;--> statement-breakpoint
ALTER TABLE `__new_attachments` RENAME TO `attachments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_stored_name_unique` ON `attachments` (`stored_name`);--> statement-breakpoint
CREATE INDEX `attachments_project_idx` ON `attachments` (`project_id`);--> statement-breakpoint
CREATE INDEX `attachments_expense_idx` ON `attachments` (`expense_id`);