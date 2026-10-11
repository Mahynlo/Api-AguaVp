-- Migración de Seguridad V2
-- Agrega campos de seguridad a tablas existentes

-- USUARIOS: Campos de seguridad
ALTER TABLE usuarios ADD COLUMN ultimo_acceso DATETIME;
ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN bloqueado_hasta DATETIME;
ALTER TABLE usuarios ADD COLUMN requiere_cambio_password INTEGER DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN ultimo_cambio_password DATETIME;

-- SESIONES: Campos para gestión mejorada
ALTER TABLE sesiones ADD COLUMN ultimo_uso DATETIME;
ALTER TABLE sesiones ADD COLUMN expira_en DATETIME;
ALTER TABLE sesiones ADD COLUMN user_agent TEXT;
ALTER TABLE sesiones ADD COLUMN tipo_sesion TEXT DEFAULT 'web';

-- APPS: Campos de control
ALTER TABLE apps ADD COLUMN ultimo_uso DATETIME;
ALTER TABLE apps ADD COLUMN expira_en DATETIME;
ALTER TABLE apps ADD COLUMN version_app TEXT;
ALTER TABLE apps ADD COLUMN plataforma TEXT;
ALTER TABLE apps ADD COLUMN descripcion TEXT;

-- TABLA NUEVA: auditoria_seguridad
CREATE TABLE IF NOT EXISTS auditoria_seguridad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento TEXT NOT NULL,
    usuario_id INTEGER,
    app_id TEXT,
    ip TEXT,
    dispositivo TEXT,
    user_agent TEXT,
    exitoso INTEGER DEFAULT 1,
    detalles TEXT,
    severidad TEXT DEFAULT 'info',
    fecha DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria_seguridad(fecha);
CREATE INDEX IF NOT EXISTS idx_auditoria_evento ON auditoria_seguridad(evento);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_seguridad(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_ip ON auditoria_seguridad(ip);

-- TABLA NUEVA: tokens_revocados
CREATE TABLE IF NOT EXISTS tokens_revocados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    tipo TEXT NOT NULL,
    usuario_id INTEGER,
    app_id TEXT,
    razon TEXT,
    revocado_por INTEGER,
    fecha_revocacion DATETIME DEFAULT (datetime('now')),
    expira_original DATETIME,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (revocado_por) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_tokens_revocados_token ON tokens_revocados(token);
CREATE INDEX IF NOT EXISTS idx_tokens_revocados_tipo ON tokens_revocados(tipo);

-- TABLA NUEVA: historial_passwords
CREATE TABLE IF NOT EXISTS historial_passwords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    password_hash TEXT NOT NULL,
    fecha_cambio DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_historial_passwords_usuario ON historial_passwords(usuario_id);

-- NOTA: Los triggers tienen problemas de parsing en Turso con el cliente LibSQL
-- Se pueden crear manualmente en la consola de Turso si se necesitan
-- O implementar la lógica en el código de la aplicación

-- TRIGGER: Registrar cambios de contraseña
-- CREATE TRIGGER IF NOT EXISTS registrar_cambio_password AFTER UPDATE OF contraseña ON usuarios FOR EACH ROW WHEN OLD.contraseña != NEW.contraseña BEGIN INSERT INTO historial_passwords (usuario_id, password_hash) VALUES (OLD.id, OLD.contraseña); END;

-- TRIGGER: Limpiar sesiones expiradas  
-- CREATE TRIGGER IF NOT EXISTS limpiar_sesiones_expiradas AFTER INSERT ON sesiones BEGIN UPDATE sesiones SET activo = 0 WHERE expira_en < datetime('now') AND activo = 1; END;

-- VISTA: Sesiones activas con información de usuario
CREATE VIEW IF NOT EXISTS v_sesiones_activas AS SELECT s.id as sesion_id, s.token, s.usuario_id, u.correo, u.nombre, u.username, u.rol, s.fecha_inicio, s.expira_en, s.direccion_ip, s.dispositivo FROM sesiones s JOIN usuarios u ON s.usuario_id = u.id WHERE s.activo = 1 AND (s.expira_en IS NULL OR s.expira_en > datetime('now'));

-- VISTA: Usuarios bloqueados
CREATE VIEW IF NOT EXISTS v_usuarios_bloqueados AS SELECT id, correo, nombre, username, intentos_fallidos, bloqueado_hasta, ultimo_acceso FROM usuarios WHERE bloqueado_hasta > datetime('now');

-- VISTA: Aplicaciones activas
CREATE VIEW IF NOT EXISTS v_apps_activas AS SELECT app_id, nombre, version_app, plataforma, fecha_registro, ultimo_uso, expira_en, ip_registro FROM apps WHERE activo = 1 AND (expira_en IS NULL OR expira_en > datetime('now'));
