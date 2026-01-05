-- Custom SQL migration file, put your code below! --
-- ============================================================================
-- MIGRACIÓN 003: VISTAS DE SEGURIDAD Y MONITOREO
-- ============================================================================

-- 1. VISTA: SESIONES ACTIVAS
-- Muestra quién está logueado, desde dónde y cuándo expira su sesión.
-- Útil para: "Cerrar sesión a usuarios sospechosos"
CREATE VIEW IF NOT EXISTS v_sesiones_activas AS 
SELECT 
    s.id AS sesion_id, 
    s.token, 
    s.usuario_id, 
    u.correo, 
    u.nombre, 
    u.username, 
    u.rol, 
    s.fecha_inicio, 
    s.expira_en, 
    s.direccion_ip, 
    s.dispositivo,
    s.tipo_sesion 
FROM sesiones s 
JOIN usuarios u ON s.usuario_id = u.id 
WHERE s.activo = 1 
  AND (s.expira_en IS NULL OR datetime(s.expira_en) > datetime('now'));

--> statement-breakpoint

-- 2. VISTA: USUARIOS BLOQUEADOS
-- Muestra usuarios que han fallado demasiados intentos de login y están en "tiempo fuera".
-- Útil para: Ver ataques de fuerza bruta en tiempo real.
CREATE VIEW IF NOT EXISTS v_usuarios_bloqueados AS 
SELECT 
    id, 
    correo, 
    nombre, 
    username, 
    intentos_fallidos, 
    bloqueado_hasta, 
    ultimo_acceso 
FROM usuarios 
WHERE bloqueado_hasta IS NOT NULL 
  AND datetime(bloqueado_hasta) > datetime('now');

--> statement-breakpoint

-- 3. VISTA: APLICACIONES ACTIVAS
-- Muestra qué aplicaciones externas tienen acceso al sistema.
CREATE VIEW IF NOT EXISTS v_apps_activas AS 
SELECT 
    id AS app_internal_id,
    app_id, 
    nombre, 
    version_app, 
    plataforma, 
    fecha_registro, 
    ultimo_uso, 
    expira_en, 
    ip_registro 
FROM apps 
WHERE activo = 1 
  AND (expira_en IS NULL OR datetime(expira_en) > datetime('now'));

--> statement-breakpoint

-- 4. VISTA: REFRESH TOKENS ACTIVOS
-- Muestra los tokens de larga duración válidos (quién tiene "Recuérdame" activo).
CREATE VIEW IF NOT EXISTS v_refresh_tokens_activos AS
SELECT 
    rt.id, 
    rt.token, 
    rt.usuario_id, 
    u.nombre AS usuario_nombre, 
    u.correo AS usuario_email,
    rt.app_id, 
    rt.expira_en, 
    rt.ultimo_uso,
    rt.user_agent,
    rt.ip,
    CAST((julianday(rt.expira_en) - julianday('now')) * 24 AS INTEGER) AS horas_restantes
FROM refresh_tokens rt
LEFT JOIN usuarios u ON rt.usuario_id = u.id
WHERE rt.revocado = 0 
  AND datetime(rt.expira_en) > datetime('now');

--> statement-breakpoint

-- 5. VISTA: REFRESH TOKENS EXPIRADOS (Basura)
-- Muestra tokens viejos que ya deberían limpiarse de la BD.
CREATE VIEW IF NOT EXISTS v_refresh_tokens_expirados AS
SELECT 
    rt.id, 
    rt.token, 
    rt.usuario_id, 
    u.correo AS usuario_email, 
    rt.expira_en, 
    rt.creado_en
FROM refresh_tokens rt
LEFT JOIN usuarios u ON rt.usuario_id = u.id
WHERE datetime(rt.expira_en) <= datetime('now')
   OR rt.revocado = 1;