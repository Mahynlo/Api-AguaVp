ALTER TABLE `apps` ADD `scopes` text;--> statement-breakpoint
ALTER TABLE `apps` ADD `client_secret` text;--> statement-breakpoint
ALTER TABLE `apps` ADD `redirect_uris` text;--> statement-breakpoint
ALTER TABLE `sesiones` ADD `app_id` integer REFERENCES apps(id);