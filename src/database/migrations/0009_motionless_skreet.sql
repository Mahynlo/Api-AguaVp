ALTER TABLE `usuarios` ADD `estado_usuario` text DEFAULT 'Activo' NOT NULL;--> statement-breakpoint
ALTER TABLE `usuarios` ADD `fecha_eliminacion` text;--> statement-breakpoint
ALTER TABLE `usuarios` ADD `eliminado_por` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `usuarios` ADD `razon_eliminacion` text;