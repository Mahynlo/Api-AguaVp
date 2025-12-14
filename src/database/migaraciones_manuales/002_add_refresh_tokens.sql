-- ============================================
-- MIGRACIÓN 002: Sistema de Refresh Tokens
-- ============================================
-- Fecha: 2025-12-09
-- Descripción: Implementa sistema de refresh tokens para mejorar
--              la seguridad y experiencia de usuario
-- 
-- Cambios:
-- 1. Crear tabla refresh_tokens para almacenar tokens de refresco
-- 2. Índices para optimizar consultas
-- ============================================

-- Tabla: refresh_tokens
-- Almacena los refresh tokens activos con su metadata
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    usuario_id INTEGER NOT NULL,
    app_id INTEGER,
    expira_en TEXT NOT NULL,
    creado_en TEXT DEFAULT (datetime('now')),
    ultimo_uso TEXT,
    user_agent TEXT,
    ip TEXT,
    revocado INTEGER DEFAULT 0,
    revocado_en TEXT,
    razon_revocacion TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

-- Índice para búsqueda rápida por token
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Índice para búsqueda por usuario
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_usuario ON refresh_tokens(usuario_id);

-- Índice para búsqueda por app
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_app ON refresh_tokens(app_id);

-- Índice para tokens activos (no revocados y no expirados)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_activos ON refresh_tokens(revocado, expira_en);

-- Vista: refresh_tokens_activos
-- Muestra solo los refresh tokens válidos
CREATE VIEW IF NOT EXISTS v_refresh_tokens_activos AS
SELECT 
    rt.id,
    rt.token,
    rt.usuario_id,
    u.nombre as usuario_nombre,
    u.correo as usuario_email,
    rt.app_id,
    a.nombre as app_nombre,
    rt.expira_en,
    rt.creado_en,
    rt.ultimo_uso,
    rt.user_agent,
    rt.ip,
    CAST((julianday(rt.expira_en) - julianday('now')) * 24 AS INTEGER) as horas_restantes
FROM refresh_tokens rt
LEFT JOIN usuarios u ON rt.usuario_id = u.id
LEFT JOIN apps a ON rt.app_id = a.id
WHERE rt.revocado = 0 
  AND datetime(rt.expira_en) > datetime('now');

-- Vista: refresh_tokens_expirados
-- Tokens que necesitan limpieza
CREATE VIEW IF NOT EXISTS v_refresh_tokens_expirados AS
SELECT 
    rt.id,
    rt.token,
    rt.usuario_id,
    u.correo as usuario_email,
    rt.expira_en,
    rt.creado_en
FROM refresh_tokens rt
LEFT JOIN usuarios u ON rt.usuario_id = u.id
WHERE rt.revocado = 0 
  AND datetime(rt.expira_en) <= datetime('now');
