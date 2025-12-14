ALTER TABLE `clientes` ADD `fecha_eliminacion` text;--> statement-breakpoint
ALTER TABLE `clientes` ADD `eliminado_por` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `clientes` ADD `razon_eliminacion` text;