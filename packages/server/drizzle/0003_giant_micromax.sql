ALTER TABLE `call_logs` ADD `original_operator_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `call_logs` ADD `transferred_at` text;