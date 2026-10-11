-- Migración: Soft Delete para Clientes
-- Fecha: 2024-12-11
-- Solo agregamos los 3 campos nuevos a la tabla clientes

ALTER TABLE `clientes` ADD `fecha_eliminacion` text;--> statement-breakpoint
ALTER TABLE `clientes` ADD `eliminado_por` integer REFERENCES `usuarios`(`id`);--> statement-breakpoint
ALTER TABLE `clientes` ADD `razon_eliminacion` text;
