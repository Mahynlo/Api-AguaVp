/**
 * Middleware para verificar la autenticación de un usuario.
 * 
 * File: src/middlewares/authMiddleware.js
 * 
 * Descripción: Este middleware verifica si el usuario está autenticado mediante un token JWT.
 * Si el token es válido y la sesión está activa, se permite el acceso a la ruta solicitada.
 * 
 * Uso:
 * - Se utiliza en rutas que requieren autenticación.
 * - Se espera que el token se envíe en el encabezado de autorización en formato "Bearer <token>".
 * 
 * Notas:
 * - Se utiliza sqlite3 para interactuar con la base de datos SQLite.
 * - Se espera que la tabla "sesiones" contenga los campos "token" y "activo".
 * 
 * Pendiente de implementar:
 * - Manejo de errores más detallado.
 * - Registro de actividad del usuario (por ejemplo, intentos fallidos de autenticación).
 * - Mejora de la seguridad (por ejemplo, limitación de intentos de inicio de sesión).
 * - Implementación de un sistema de expiración de tokens.
 *
 * pruebas de implementación:
 * 
 */

import db from "../../database/db.js";

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization; // Obtiene el encabezado de autorización

    // si el encabezado no existe o no comienza con "Bearer"
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token no proporcionado o formato incorrecto" });
    }

    const token = authHeader.split(" ")[1]; // Extrae solo el token

    // Verifica si el token es válido y está activo en la base de datos
    const query = `SELECT * FROM sesiones WHERE token = ? AND activo = 1`;

    db.get(query, [token], (err, session) => {
        if (err) {
            return res.status(500).json({ error: "Error al verificar sesión" });
        }

        if (!session) {
            return res.status(403).json({ error: "Token inválido o sesión expirada" });
        }

        req.usuario = { // Agrega la información del usuario a la solicitud
            id: session.usuario_id, // ID del usuario asociado a la sesión 
            token: session.token // Token de la sesión
        };

        next(); // continuar a la ruta
    });
}

export default authMiddleware;








