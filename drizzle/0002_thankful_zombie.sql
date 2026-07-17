CREATE TABLE `batch_action_devices` (
	`action_id` text NOT NULL,
	`device_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`action_id`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE `batch_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
