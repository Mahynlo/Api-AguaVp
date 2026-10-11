DROP INDEX "apps_app_id_unique";--> statement-breakpoint
DROP INDEX "refresh_tokens_token_unique";--> statement-breakpoint
DROP INDEX "sesiones_token_unique";--> statement-breakpoint
DROP INDEX "tokens_revocados_token_unique";--> statement-breakpoint
DROP INDEX "usuarios_correo_unique";--> statement-breakpoint
DROP INDEX "usuarios_username_unique";--> statement-breakpoint
DROP INDEX "medidores_numero_serie_unique";--> statement-breakpoint
DROP INDEX "cortes_medidor_idx";--> statement-breakpoint
DROP INDEX "convenios_estado_idx";--> statement-breakpoint
ALTER TABLE `medidores` ALTER COLUMN "latitud" TO "latitud" numeric;--> statement-breakpoint
CREATE UNIQUE INDEX `apps_app_id_unique` ON `apps` (`app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_unique` ON `refresh_tokens` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sesiones_token_unique` ON `sesiones` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_revocados_token_unique` ON `tokens_revocados` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_correo_unique` ON `usuarios` (`correo`);--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_username_unique` ON `usuarios` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `medidores_numero_serie_unique` ON `medidores` (`numero_serie`);--> statement-breakpoint
CREATE INDEX `cortes_medidor_idx` ON `cortes_servicio` (`medidor_id`);--> statement-breakpoint
CREATE INDEX `convenios_estado_idx` ON `convenios_pago` (`estado`);--> statement-breakpoint
ALTER TABLE `medidores` ALTER COLUMN "longitud" TO "longitud" numeric;--> statement-breakpoint
ALTER TABLE `historial_tarifas` ALTER COLUMN "precio_anterior" TO "precio_anterior" numeric;--> statement-breakpoint
ALTER TABLE `historial_tarifas` ALTER COLUMN "precio_nuevo" TO "precio_nuevo" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE `rangos_tarifas` ALTER COLUMN "precio_por_m3" TO "precio_por_m3" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE `lecturas` ALTER COLUMN "consumo_m3" TO "consumo_m3" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE `facturas` ALTER COLUMN "total" TO "total" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE `facturas` ALTER COLUMN "saldo_pendiente" TO "saldo_pendiente" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE `pagos` ALTER COLUMN "monto" TO "monto" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE `pagos` ALTER COLUMN "cantidad_entregada" TO "cantidad_entregada" numeric;--> statement-breakpoint
ALTER TABLE `pagos` ALTER COLUMN "cambio" TO "cambio" numeric;