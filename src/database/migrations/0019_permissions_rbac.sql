CREATE TABLE IF NOT EXISTS `permissions_catalog` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `permission_key` text NOT NULL,
  `module` text NOT NULL,
  `action` text NOT NULL,
  `description` text,
  `is_active` integer DEFAULT 1,
  `created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `permissions_catalog_key_unique` ON `permissions_catalog` (`permission_key`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `role` text NOT NULL,
  `permission_key` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')),
  FOREIGN KEY (`permission_key`) REFERENCES `permissions_catalog`(`permission_key`) ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `role_permissions_role_key_unique` ON `role_permissions` (`role`, `permission_key`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `user_permission_overrides` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `permission_key` text NOT NULL,
  `effect` text NOT NULL,
  `updated_by` integer,
  `updated_at` text DEFAULT (datetime('now')),
  FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  FOREIGN KEY (`updated_by`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (`permission_key`) REFERENCES `permissions_catalog`(`permission_key`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CHECK (`effect` IN ('allow', 'deny'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_permission_overrides_user_key_unique` ON `user_permission_overrides` (`user_id`, `permission_key`);
--> statement-breakpoint

INSERT OR IGNORE INTO permissions_catalog (permission_key, module, action, description) VALUES
  ('clientes.crear', 'clientes', 'crear', 'Crear clientes'),
  ('clientes.modificar', 'clientes', 'modificar', 'Modificar clientes'),
  ('medidores.crear', 'medidores', 'crear', 'Crear medidores'),
  ('medidores.modificar', 'medidores', 'modificar', 'Modificar medidores'),
  ('tarifas.crear', 'tarifas', 'crear', 'Crear tarifas y rangos'),
  ('tarifas.modificar', 'tarifas', 'modificar', 'Modificar tarifas y rangos'),
  ('rutas.crear', 'rutas', 'crear', 'Crear rutas'),
  ('rutas.modificar', 'rutas', 'modificar', 'Modificar rutas'),
  ('lecturas.tomar', 'lecturas', 'tomar', 'Registrar lecturas'),
  ('lecturas.modificar', 'lecturas', 'modificar', 'Modificar lecturas'),
  ('lecturas.recalcular', 'lecturas', 'recalcular', 'Recalcular vencimientos/lecturas'),
  ('usuarios.gestionar_permisos', 'usuarios', 'gestionar_permisos', 'Gestionar permisos de usuarios');
--> statement-breakpoint

INSERT OR IGNORE INTO role_permissions (role, permission_key)
SELECT 'superadmin', permission_key FROM permissions_catalog WHERE is_active = 1;
--> statement-breakpoint

INSERT OR IGNORE INTO role_permissions (role, permission_key)
SELECT 'administrador', permission_key FROM permissions_catalog WHERE is_active = 1;
--> statement-breakpoint

INSERT OR IGNORE INTO role_permissions (role, permission_key)
VALUES ('operador', 'lecturas.tomar');
