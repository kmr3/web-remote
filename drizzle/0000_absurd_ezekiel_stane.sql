CREATE TABLE `published_items` (
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`kind`, `id`)
);
