/**
 * Middleware para verificar la clave de aplicación - V2
 * 
 * File: src/v2/middlewares/appKeyMiddleware.js
 * 
 * Descripción: Este middleware verifica la clave de aplicación mediante un token JWT.
 * 
 * Cambios en V2:
 * - Migrado de SQLite3 a Turso (@libsql/client)
 * - Mantiene la misma funcionalidad de verificación de app key
 */

import jwt from "jsonwebtoken";
import dbTurso from "../../database/db-turso.js";

const SECRET_APP_KEY = process.env.SECRET_APP_KEY; //secret para firmar el token

async function appKeyMiddleware(req, res, next) {
    const authHeader = req.headers["x-app-key"];

    if (!authHeader || !authHeader.startsWith("AppKey ")) {
        return res.status(401).json({ error: "Token no proporcionado o formato incorrecto (MidAppkey)" });
    }

    const token = authHeader.split(" ")[1]; // Extrae solo el token 

    try {
        const decoded = jwt.verify(token, SECRET_APP_KEY); // Verifica el token usando la clave secreta

        const query = `SELECT * FROM apps WHERE app_id = ? AND activo = 1`; // Verifica que la app esté activa

        const result = await dbTurso.execute({
            sql: query,
            args: [decoded.app_id]
        });

        if (result.rows.length === 0) {
            return res.status(403).json({ error: "AppKey inválido o no autorizado" });
        }

        const app = result.rows[0];

        req.appInstancia = { // Agrega la información de la app a la solicitud
            id: app.app_id,
            nombre: app.nombre || "Sin nombre"
        };

        next();
    } catch (error) {
        console.error('Error en appKeyMiddleware v2:', error);
        return res.status(403).json({ error: "Token inválido o expirado" });
    }
}

export default appKeyMiddleware;
