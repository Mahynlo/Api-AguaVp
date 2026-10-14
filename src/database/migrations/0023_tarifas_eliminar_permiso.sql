-- Permiso para eliminar tarifas (solo tarifas sin clientes ni facturas; ver tarifasRangos.eliminarTarifa)
INSERT OR IGNORE INTO permissions_catalog (permission_key, module, action, description) VALUES
  ('tarifas.eliminar', 'tarifas', 'eliminar', 'Eliminar tarifas sin clientes ni facturas');
--> statement-breakpoint

INSERT OR IGNORE INTO role_permissions (role, permission_key) VALUES
  ('superadmin', 'tarifas.eliminar'),
  ('administrador', 'tarifas.eliminar');
