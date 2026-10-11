CREATE TABLE `parcialidades_convenio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`convenio_id` integer NOT NULL,
	`numero_parcialidad` integer NOT NULL,
	`monto_esperado` real NOT NULL,
	`fecha_vencimiento` text NOT NULL,
	`monto_pagado` real,
	`fecha_pago` text,
	`pago_id` integer,
	`estado` text DEFAULT 'Pendiente' NOT NULL,
	FOREIGN KEY (`convenio_id`) REFERENCES `convenios_pago`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pago_id`) REFERENCES `pagos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `parcialidades_convenio_idx` ON `parcialidades_convenio` (`convenio_id`);--> statement-breakpoint
CREATE INDEX `parcialidades_estado_idx` ON `parcialidades_convenio` (`estado`);--> statement-breakpoint
DROP INDEX "apps_app_id_unique";--> statement-breakpoint
DROP INDEX "refresh_tokens_token_unique";--> statement-breakpoint
DROP INDEX "sesiones_token_unique";--> statement-breakpoint
DROP INDEX "tokens_revocados_token_unique";--> statement-breakpoint
DROP INDEX "usuarios_correo_unique";--> statement-breakpoint
DROP INDEX "usuarios_username_unique";--> statement-breakpoint
DROP INDEX "medidores_numero_serie_unique";--> statement-breakpoint
DROP INDEX "cortes_medidor_idx";--> statement-breakpoint
DROP INDEX "convenios_estado_idx";--> statement-breakpoint
DROP INDEX "parcialidades_convenio_idx";--> statement-breakpoint
DROP INDEX "parcialidades_estado_idx";--> statement-breakpoint
ALTER TABLE `configuracion_servicio` ALTER COLUMN "dias_gracia" TO "dias_gracia" integer DEFAULT 7;--> statement-breakpoint
CREATE UNIQUE INDEX `apps_app_id_unique` ON `apps` (`app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_unique` ON `refresh_tokens` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sesiones_token_unique` ON `sesiones` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_revocados_token_unique` ON `tokens_revocados` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_correo_unique` ON `usuarios` (`correo`);--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_username_unique` ON `usuarios` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `medidores_numero_serie_unique` ON `medidores` (`numero_serie`);--> statement-breakpoint
CREATE INDEX `cortes_medidor_idx` ON `cortes_servicio` (`medidor_id`);--> statement-breakpoint
CREATE INDEX `convenios_estado_idx` ON `convenios_pago` (`estado`);