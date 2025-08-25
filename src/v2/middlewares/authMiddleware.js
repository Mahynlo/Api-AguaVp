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

import dbTurso from "../../database/db-turso.js";

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization; // Obtiene el encabezado de autorización

    // si el encabezado no existe o no comienza con "Bearer"
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token no proporcionado o formato incorrecto" });
    }

    const token = authHeader.split(" ")[1]; // Extrae solo el token

    try {
        // Verifica si el token es válido y está activo en la base de datos
        const query = `SELECT * FROM sesiones WHERE token = ? AND activo = 1`;
        const result = await dbTurso.execute({
            sql: query,
            args: [token]
        });

        if (result.rows.length === 0) {
            return res.status(403).json({ error: "Token inválido o sesión expirada" });
        }

        const session = result.rows[0];

        req.usuario = { // Agrega la información del usuario a la solicitud
            id: session.usuario_id, // ID del usuario asociado a la sesión 
            token: session.token // Token de la sesión
        };

        next(); // continuar a la ruta
    } catch (err) {
        console.error('Error en authMiddleware v2:', err);
        return res.status(500).json({ error: "Error al verificar sesión" });
    }
}

export default authMiddleware;
