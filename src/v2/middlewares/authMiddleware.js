/**
 * Middleware para verificar la autenticación de un usuario - V2
 * 
 * File: src/v2/middlewares/authMiddleware.js
 * 
 * Descripción: Este middleware verifica si el usuario está autenticado mediante un token JWT.
 * Si el token es válido y la sesión está activa, se permite el acceso a la ruta solicitada.
 * 
 * Cambios en V2:
 * - Migrado de SQLite3 a Turso (@libsql/client)
 * - Mantiene la misma funcionalidad de autenticación
 * 
 * Uso:
 * - Se utiliza en rutas que requieren autenticación.
 * - Se espera que el token se envíe en el encabezado de autorización en formato "Bearer <token>".
 * 
 * Notas:
 * - Se utiliza @libsql/client para interactuar con la base de datos Turso.
 * - Se espera que la tabla "sesiones" contenga los campos "token" y "activo".
 */

import jwt from 'jsonwebtoken';
import dbTurso from "../../database/db-sqlite.js";

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization; // Obtiene el encabezado de autorización

    // si el encabezado no existe o no comienza con "Bearer"
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token no proporcionado o formato incorrecto" });
    }

    const token = authHeader.split(" ")[1]; // Extrae solo el token

    try {
        // 1. Verificar si el token está revocado explícitamente
        const revokeCheck = await dbTurso.execute({
            sql: `SELECT id FROM tokens_revocados WHERE token = ? LIMIT 1`,
            args: [token]
        });

        if (revokeCheck.rows.length > 0) {
            return res.status(401).json({
                error: "Token revocado",
                code: "TOKEN_REVOKED"
            });
        }

        // 2. Verifica si el token es válido y está activo en la base de datos (Legacy Session Check)
        const query = `SELECT * FROM sesiones WHERE token = ? AND activo = 1`;
        const result = await dbTurso.execute({
            sql: query,
            args: [token]
        });

        if (result.rows.length === 0) {
            return res.status(403).json({ error: "Token inválido o sesión expirada" });
        }

        const session = result.rows[0];

        // 3. Verificar firma y expiración del JWT — se rechaza si falla, sin excepciones
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            // Token con firma inválida, expirado o manipulado — rechazar siempre
            // NO usar fallback: permitir tokens inválidos es una vulnerabilidad de seguridad
            return res.status(401).json({
                error: "Token inválido o expirado",
                code: "TOKEN_INVALID"
            });
        }

        // 4. Verificar si algún refresh token del usuario fue revocado DESPUÉS de que
        //    se emitió este access token (decoded.iat). Esto garantiza que:
        //    - Un logout/revocación ANTES del login actual no afecte la nueva sesión.
        //    - Un logout/revocación DESPUÉS del login actual sí invalide la sesión activa.
        //    Los tokens revocados con razon_revocacion = 'rotation' son parte del flujo normal
        //    y NO deben invalidar la sesión activa.
        const refreshCheck = await dbTurso.execute({
            sql: `
                SELECT id 
                FROM refresh_tokens 
                WHERE usuario_id = ? 
                  AND revocado = 1
                  AND (razon_revocacion IS NULL OR razon_revocacion != 'rotation')
                  AND datetime(revocado_en) > datetime(?, 'unixepoch')
                LIMIT 1
            `,
            args: [session.usuario_id, decoded.iat] // Solo revocaciones DESPUÉS de emitir este token
        });

        // Si se revocó un refresh token hace menos de 15 min por logout/revocación manual, invalidar sesión
        if (refreshCheck.rows.length > 0) {
            return res.status(401).json({
                error: "Sesión revocada",
                code: "SESSION_REVOKED"
            });
        }

        req.usuario = { // Agrega la información del usuario a la solicitud
            id: session.usuario_id, // ID del usuario asociado a la sesión 
            token: session.token, // Token de la sesión
            scope: decoded.scope ? decoded.scope.split(' ') : [], // Array de scopes
            rol: decoded.rol, // Rol del usuario (desde el token)
            app_id: session.app_id // ID de la app si existe
        };

        // Actualizar ultimo_uso de la sesión en cada request (fire-and-forget, sin bloquear)
        dbTurso.execute({
            sql: `UPDATE sesiones SET ultimo_uso = datetime('now') WHERE token = ?`,
            args: [token]
        }).catch(err => console.warn('[authMiddleware] ultimo_uso update failed:', err.message));

        next(); // continuar a la ruta
    } catch (err) {
        console.error('Error en authMiddleware v2:', err);
        return res.status(500).json({ error: "Error al verificar sesión" });
    }
}

/**
 * Middleware para validar Scopes
 * Uso: router.get('/ruta', authMiddleware, requireScope('read:reports'), controller)
 */
export const requireScope = (requiredScope) => {
    return (req, res, next) => {
        if (!req.usuario || !req.usuario.scope) {
            return res.status(403).json({ error: "Permisos insuficientes (No scopes)" });
        }

        const userScopes = req.usuario.scope;
        // Si tiene el scope requerido O es superadmin (scope root opcional)
        // Aquí asumimos simple string match. Podría ser más complejo.
        if (userScopes.includes(requiredScope) || userScopes.includes('admin')) {
            return next();
        }

        return res.status(403).json({
            error: "Permisos insuficientes",
            required: requiredScope
        });
    };
};

/**
 * Middleware para autorización basada en Roles
 * Uso: router.get('/admin', authMiddleware, authorize(['admin', 'superadmin']), controller)
 */
export const authorize = (roles = []) => {
    // Si se pasa un string único, lo convertimos a array
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return (req, res, next) => {
        // Verificar si existe el usuario y su rol
        if (!req.usuario || !req.usuario.rol) {
            return res.status(403).json({ error: "Acceso denegado: usuario no identificado o sin rol" });
        }

        // Verificar si el rol del usuario está permitido
        if (!roles.includes(req.usuario.rol)) {
            return res.status(403).json({
                error: "Acceso denegado: privilegios insuficientes",
                message: `El rol '${req.usuario.rol}' no tiene acceso a este recurso.`,
                required_roles: roles
            });
        }

        next();
    };
};

export default authMiddleware;
