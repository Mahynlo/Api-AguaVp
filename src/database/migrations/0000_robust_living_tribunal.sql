CREATE TABLE `apps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` text NOT NULL,
	`token` text NOT NULL,
	`fecha_registro` text DEFAULT CURRENT_TIMESTAMP,
	`nombre` text,
	`ip_registro` text,
	`activo` integer DEFAULT 1,
	`fecha_creacion` text DEFAULT (datetime('now')),
	`ultimo_uso` text,
	`expira_en` text,
	`version_app` text,
	`plataforma` text,
	`descripcion` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_app_id_unique` ON `apps` (`app_id`);--> statement-breakpoint
CREATE TABLE `auditoria_seguridad` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evento` text NOT NULL,
	`usuario_id` integer,
	`app_id` text,
	`ip` text,
	`dispositivo` text,
	`user_agent` text,
	`exitoso` integer DEFAULT 1,
	`detalles` text,
	`severidad` text DEFAULT 'info',
	`fecha` text DEFAULT (datetime('now')),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `historial_passwords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`password_hash` text NOT NULL,
	`fecha_cambio` text DEFAULT (datetime('now')),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`usuario_id` integer NOT NULL,
	`app_id` integer,
	`expira_en` text NOT NULL,
	`creado_en` text DEFAULT (datetime('now')),
	`ultimo_uso` text,
	`user_agent` text,
	`ip` text,
	`revocado` integer DEFAULT 0,
	`revocado_en` text,
	`razon_revocacion` text,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_unique` ON `refresh_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `sesiones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`token` text NOT NULL,
	`fecha_inicio` text DEFAULT (datetime('now')),
	`fecha_fin` text,
	`direccion_ip` text,
	`dispositivo` text,
	`ubicacion` text,
	`activo` integer DEFAULT true,
	`ultimo_uso` text,
	`expira_en` text,
	`user_agent` text,
	`tipo_sesion` text DEFAULT 'web',
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sesiones_token_unique` ON `sesiones` (`token`);--> statement-breakpoint
CREATE TABLE `tokens_revocados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`tipo` text NOT NULL,
	`usuario_id` integer,
	`app_id` text,
	`razon` text,
	`revocado_por` integer,
	`fecha_revocacion` text DEFAULT (datetime('now')),
	`expira_original` text,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revocado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_revocados_token_unique` ON `tokens_revocados` (`token`);--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`correo` text NOT NULL,
	`nombre` text,
	`contraseña` text NOT NULL,
	`username` text NOT NULL,
	`rol` text NOT NULL,
	`fecha_creacion` text DEFAULT (datetime('now')),
	`ultimo_acceso` text,
	`intentos_fallidos` integer DEFAULT 0,
	`bloqueado_hasta` text,
	`requiere_cambio_password` integer DEFAULT 0,
	`ultimo_cambio_password` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_correo_unique` ON `usuarios` (`correo`);--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_username_unique` ON `usuarios` (`username`);--> statement-breakpoint
CREATE TABLE `cliente_medidor_historial` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`medidor_id` integer NOT NULL,
	`fecha_inicio` text DEFAULT (date('now')) NOT NULL,
	`fecha_fin` text,
	`asignado_por` integer,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`medidor_id`) REFERENCES `medidores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asignado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`direccion` text NOT NULL,
	`telefono` text NOT NULL,
	`ciudad` text NOT NULL,
	`correo` text,
	`estado_cliente` text DEFAULT 'Activo' NOT NULL,
	`tarifa_id` integer,
	`modificado_por` integer,
	`fecha_creacion` text DEFAULT (datetime('now')),
	FOREIGN KEY (`tarifa_id`) REFERENCES `tarifas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modificado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `medidores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer,
	`numero_serie` text NOT NULL,
	`ubicacion` text,
	`fecha_instalacion` text,
	`latitud` text,
	`longitud` text,
	`estado_medidor` text NOT NULL,
	`fecha_creacion` text DEFAULT (datetime('now')),
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `medidores_numero_serie_unique` ON `medidores` (`numero_serie`);--> statement-breakpoint
CREATE TABLE `historial_tarifas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tarifa_id` integer,
	`rango_id` integer,
	`fecha_cambio` text DEFAULT (datetime('now')),
	`consumo_min` integer,
	`consumo_max` integer,
	`precio_anterior` real,
	`precio_nuevo` real NOT NULL,
	FOREIGN KEY (`tarifa_id`) REFERENCES `tarifas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rango_id`) REFERENCES `rangos_tarifas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rangos_tarifas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tarifa_id` integer NOT NULL,
	`consumo_min` integer NOT NULL,
	`consumo_max` integer,
	`precio_por_m3` real NOT NULL,
	FOREIGN KEY (`tarifa_id`) REFERENCES `tarifas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tarifas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text NOT NULL,
	`fecha_inicio` text NOT NULL,
	`fecha_fin` text,
	`modificado_por` integer,
	`fecha_creacion` text DEFAULT (datetime('now')),
	FOREIGN KEY (`modificado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lecturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`medidor_id` integer,
	`ruta_id` integer,
	`fecha_lectura` text NOT NULL,
	`consumo_m3` real NOT NULL,
	`periodo` text,
	`modificado_por` integer,
	`fecha_creacion` text DEFAULT (datetime('now')),
	FOREIGN KEY (`medidor_id`) REFERENCES `medidores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ruta_id`) REFERENCES `rutas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modificado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `facturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer,
	`lectura_id` integer,
	`tarifa_id` integer,
	`fecha_emision` text NOT NULL,
	`fecha_vencimiento` text NOT NULL,
	`total` real NOT NULL,
	`saldo_pendiente` real DEFAULT 0 NOT NULL,
	`estado` text NOT NULL,
	`modificado_por` integer,
	`fecha_creacion` text DEFAULT (datetime('now')),
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lectura_id`) REFERENCES `lecturas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tarifa_id`) REFERENCES `tarifas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modificado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pagos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`factura_id` integer,
	`fecha_pago` text NOT NULL,
	`monto` real NOT NULL,
	`cantidad_entregada` real,
	`cambio` real,
	`metodo_pago` text NOT NULL,
	`comentario` text,
	`modificado_por` integer,
	`fecha_creacion` text DEFAULT (datetime('now')),
	FOREIGN KEY (`factura_id`) REFERENCES `facturas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modificado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rutas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`fecha_creacion` text DEFAULT (DATE('now')),
	`creado_por` integer,
	`distancia_km` real,
	`ruta_json` text,
	`instrucciones_json` text,
	FOREIGN KEY (`creado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rutas_puntos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ruta_id` integer NOT NULL,
	`medidor_id` integer NOT NULL,
	`orden` integer NOT NULL,
	FOREIGN KEY (`ruta_id`) REFERENCES `rutas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medidor_id`) REFERENCES `medidores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `historial_cambios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tabla` text NOT NULL,
	`operacion` text NOT NULL,
	`registro_id` integer NOT NULL,
	`modificado_por` integer,
	`fecha_modificacion` text DEFAULT (datetime('now')),
	`cambios` text,
	FOREIGN KEY (`modificado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
