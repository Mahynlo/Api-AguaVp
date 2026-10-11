CREATE TABLE `configuracion_servicio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`facturas_para_primer_aviso` integer DEFAULT 1 NOT NULL,
	`facturas_para_segundo_aviso` integer DEFAULT 2 NOT NULL,
	`facturas_para_tercer_aviso` integer DEFAULT 3 NOT NULL,
	`facturas_para_corte` integer DEFAULT 4 NOT NULL,
	`dias_gracia` integer DEFAULT 0,
	`activo` integer DEFAULT 1 NOT NULL,
	`modificado_por` integer,
	`fecha_modificacion` text,
	`fecha_creacion` text DEFAULT (datetime('now')),
	FOREIGN KEY (`modificado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cortes_servicio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`medidor_id` integer NOT NULL,
	`fecha_corte` text NOT NULL,
	`motivo` text NOT NULL,
	`autorizado_por` integer NOT NULL,
	`fecha_reconexion` text,
	`reconectado_por` integer,
	`observaciones` text,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`medidor_id`) REFERENCES `medidores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`autorizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reconectado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cortes_medidor_idx` ON `cortes_servicio` (`medidor_id`);--> statement-breakpoint
CREATE TABLE `convenios_pago` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`medidor_id` integer NOT NULL,
	`monto_total` real NOT NULL,
	`monto_inicial` real NOT NULL,
	`saldo_restante` real NOT NULL,
	`numero_parcialidades` integer NOT NULL,
	`periodicidad` text NOT NULL,
	`estado` text NOT NULL,
	`fecha_inicio` text NOT NULL,
	`fecha_fin` text,
	`autorizado_por` integer NOT NULL,
	`observaciones` text,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`medidor_id`) REFERENCES `medidores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`autorizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `convenios_estado_idx` ON `convenios_pago` (`estado`);--> statement-breakpoint
ALTER TABLE `medidores` ADD `estado_servicio` text DEFAULT 'Activo';--> statement-breakpoint
ALTER TABLE `medidores` ADD `fecha_corte` text;