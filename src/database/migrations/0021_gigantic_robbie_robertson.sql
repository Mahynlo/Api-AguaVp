PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_configuracion_servicio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`facturas_para_primer_aviso` integer DEFAULT 1 NOT NULL,
	`facturas_para_segundo_aviso` integer DEFAULT 2 NOT NULL,
	`facturas_para_tercer_aviso` integer DEFAULT 3 NOT NULL,
	`facturas_para_corte` integer DEFAULT 4 NOT NULL,
	`dias_gracia` integer DEFAULT 7,
	`dias_vencimiento_factura` integer DEFAULT 15 NOT NULL,
	`activo` integer DEFAULT 1 NOT NULL,
	`modificado_por` integer,
	`fecha_modificacion` text,
	`fecha_creacion` text DEFAULT (datetime('now')),
	FOREIGN KEY (`modificado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_configuracion_servicio`("id", "facturas_para_primer_aviso", "facturas_para_segundo_aviso", "facturas_para_tercer_aviso", "facturas_para_corte", "dias_gracia", "dias_vencimiento_factura", "activo", "modificado_por", "fecha_modificacion", "fecha_creacion") SELECT "id", "facturas_para_primer_aviso", "facturas_para_segundo_aviso", "facturas_para_tercer_aviso", "facturas_para_corte", "dias_gracia", "dias_vencimiento_factura", "activo", "modificado_por", "fecha_modificacion", "fecha_creacion" FROM `configuracion_servicio`;--> statement-breakpoint
DROP TABLE `configuracion_servicio`;--> statement-breakpoint
ALTER TABLE `__new_configuracion_servicio` RENAME TO `configuracion_servicio`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `medidores` ADD `fecha_eliminacion` text;--> statement-breakpoint
ALTER TABLE `medidores` ADD `eliminado_por` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `medidores` ADD `razon_eliminacion` text;