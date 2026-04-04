CREATE TABLE `call_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`contact_id` integer NOT NULL,
	`telnyx_call_control_id` text,
	`started_at` text,
	`ended_at` text,
	`duration_seconds` integer,
	`disposition` text,
	`recording_url` text,
	`human_took_over` integer DEFAULT false NOT NULL,
	`notes` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`caller_id` text NOT NULL,
	`opener_recording_id` integer,
	`voicemail_recording_id` integer,
	`enable_transcription` integer DEFAULT false NOT NULL,
	`transcription_engine` text DEFAULT 'telnyx',
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`opener_recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voicemail_recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`name` text,
	`phone` text NOT NULL,
	`company` text,
	`email` text,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`call_count` integer DEFAULT 0 NOT NULL,
	`last_called_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`file_path` text NOT NULL,
	`duration_seconds` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`call_log_id` integer NOT NULL,
	`speaker` text NOT NULL,
	`content` text NOT NULL,
	`confidence` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`call_log_id`) REFERENCES `call_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
