CREATE TABLE `password_recovery_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expira_en` text NOT NULL,
	`usado_en` text,
	`requested_ip` text,
	`user_agent` text,
	`creado_en` text DEFAULT (datetime('now')),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_recovery_tokens_token_hash_unique` ON `password_recovery_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_recovery_tokens_usuario_id_idx` ON `password_recovery_tokens` (`usuario_id`);--> statement-breakpoint
CREATE INDEX `password_recovery_tokens_expira_en_idx` ON `password_recovery_tokens` (`expira_en`);--> statement-breakpoint