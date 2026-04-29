ALTER TABLE `campaigns` ADD `max_attempts` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `retry_after_minutes` integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `prioritize_voicemails` integer DEFAULT true NOT NULL;