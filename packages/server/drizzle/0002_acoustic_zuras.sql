ALTER TABLE `campaigns` ADD `transcription_mode` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
-- Backfill: campaigns that had real-time streaming enabled keep that behavior
UPDATE `campaigns` SET `transcription_mode` = 'realtime' WHERE `enable_transcription` = 1;