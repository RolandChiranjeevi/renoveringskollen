CREATE TABLE `quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`contractor_id` integer,
	`supplier_name` text,
	`amount_ore` integer NOT NULL,
	`description` text,
	`received_on` text,
	`valid_until` text,
	`chosen` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contractor_id`) REFERENCES `contractors`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "quotes_amount_nonneg" CHECK("quotes"."amount_ore" >= 0)
);
--> statement-breakpoint
CREATE INDEX `quotes_project_idx` ON `quotes` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_one_chosen_per_project` ON `quotes` (`project_id`) WHERE "quotes"."chosen" = 1;