CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`subscriber_count` integer DEFAULT 0,
	`video_count` integer DEFAULT 0,
	`view_count` integer DEFAULT 0,
	`published_at` text,
	`thumbnails` text,
	`fetched_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `classification_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`flag_type` text NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `classifications` (
	`video_id` text PRIMARY KEY NOT NULL,
	`risk_level` text NOT NULL,
	`risk_score` real,
	`flag_count` integer DEFAULT 0,
	`warning_count` integer DEFAULT 0,
	`info_count` integer DEFAULT 0,
	`analyzed_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`channel_id` text NOT NULL,
	`channel_title` text,
	`published_at` text,
	`category_id` text,
	`tags` text,
	`duration` text,
	`has_caption` integer,
	`content_rating` text,
	`region_restriction` text,
	`view_count` integer DEFAULT 0,
	`like_count` integer DEFAULT 0,
	`comment_count` integer DEFAULT 0,
	`privacy_status` text,
	`made_for_kids` integer,
	`embeddable` integer,
	`fetched_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `watch_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`watched_at` text NOT NULL,
	`title` text,
	`channel` text
);
