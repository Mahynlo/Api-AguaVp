import jwt from "jsonwebtoken";
import db from "../../database/db.js";

const SECRET_APP_KEY = process.env.SECRET_APP_KEY //secret para firmar el token

function appKeyMiddleware(req, res, next) {
    const authHeader = req.headers["x-app-key"];

    if (!authHeader || !authHeader.startsWith("AppKey ")) {
        return res.status(401).json({ error: "Token no proporcionado o formato incorrecto (MidAppkey)" });
    }

    const token = authHeader.split(" ")[1]; // Extrae solo el token 

    try {
        const decoded = jwt.verify(token, SECRET_APP_KEY); // Verifica el token usando la clave secreta

        const query = `SELECT * FROM apps WHERE app_id = ? AND activo = 1`; // Verifica que la app esté activa

        db.get(query, [decoded.app_id], (err, app) => {
            if (err) {
                return res.status(500).json({ error: "Error al verificar appKey" });
            }

            if (!app) {
                return res.status(403).json({ error: "AppKey inválido o no autorizado" });
            }

            req.appInstancia = { // Agrega la información de la app a la solicitud
                id: app.app_id,
                nombre: app.nombre || "Sin nombre"
            };

            next();
        });
    } catch (error) {
        return res.status(403).json({ error: "Token inválido o expirado" });
    }
}

export default appKeyMiddleware;


