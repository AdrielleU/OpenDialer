PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`caller_id` text NOT NULL,
	`opener_recording_id` integer,
	`voicemail_recording_id` integer,
	`enable_transcription` integer DEFAULT false NOT NULL,
	`transcription_mode` text DEFAULT 'off' NOT NULL,
	`drop_if_no_operator` integer DEFAULT true NOT NULL,
	`max_attempts` integer DEFAULT 1 NOT NULL,
	`retry_after_minutes` integer DEFAULT 60 NOT NULL,
	`prioritize_voicemails` integer DEFAULT true NOT NULL,
	`ivr_sequence` text,
	`ivr_greeting_type` text DEFAULT 'none',
	`ivr_greeting_template` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`opener_recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voicemail_recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_campaigns`("id", "name", "caller_id", "opener_recording_id", "voicemail_recording_id", "enable_transcription", "transcription_mode", "drop_if_no_operator", "max_attempts", "retry_after_minutes", "prioritize_voicemails", "ivr_sequence", "ivr_greeting_type", "ivr_greeting_template", "status", "created_at", "updated_at") SELECT "id", "name", "caller_id", "opener_recording_id", "voicemail_recording_id", "enable_transcription", "transcription_mode", "drop_if_no_operator", "max_attempts", "retry_after_minutes", "prioritize_voicemails", "ivr_sequence", "ivr_greeting_type", "ivr_greeting_template", "status", "created_at", "updated_at" FROM `campaigns`;--> statement-breakpoint
DROP TABLE `campaigns`;--> statement-breakpoint
ALTER TABLE `__new_campaigns` RENAME TO `campaigns`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `contacts` DROP COLUMN `hubspot_contact_id`;