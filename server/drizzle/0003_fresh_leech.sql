CREATE TABLE `project_budgets` (
	`project_id` integer NOT NULL,
	`category` text NOT NULL,
	`budget_ore` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`project_id`, `category`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_budgets_nonneg" CHECK("project_budgets"."budget_ore" >= 0)
);
