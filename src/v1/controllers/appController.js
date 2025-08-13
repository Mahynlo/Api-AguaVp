import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import db from "../../database/db.js";

const SECRET_APP_KEY = process.env.SECRET_APP_KEY //secret para firmar el token
const APPKEY_INICIAL = process.env.APPKEY_INICIAL // token inicial para registrar la app 

export const registrarApp = (req, res) => {
    const authHeader = req.headers["x-app-key"];

    if (!authHeader || !authHeader.startsWith("AppKey ")) {
        return res.status(401).json({ error: "AppKey no proporcionado o formato incorrecto" });
    }

    const token = authHeader.split(" ")[1];

    if (token !== APPKEY_INICIAL) {
        return res.status(403).json({ error: "AppKey inicial inválido" });
    }

    const nuevoAppId = uuidv4();
    const nuevoToken = jwt.sign({ app_id: nuevoAppId }, SECRET_APP_KEY, { expiresIn: "365d" });

    console.log("Nuevo App ID:", nuevoAppId);
    console.log("Nuevo Token:", nuevoToken);
    console.log("IP de registro:", req.ip);
    console.log("Body recibido:", req.body);
    console.log("Nombre de la app:", req.body?.nombre || "Sin nombre");

    const ip = req.headers["x-forwarded-for"] || req.ip; // Obtener la IP del cliente si está detrás de un proxy

    const query = `
        INSERT INTO apps (app_id, token, nombre, ip_registro)
        VALUES (?, ?, ?, ?)
    `;

    db.run(query, [nuevoAppId, nuevoToken, req.body?.nombre || null, ip], function (err) {
        if (err) {
            return res.status(500).json({ error: "Error al registrar la nueva app" });
        }

        return res.status(201).json({
            mensaje: "Nueva app registrada",
            app_id: nuevoAppId,
            token: nuevoToken
        });
    });
};

//recuperacion de token por expiracion,  o perdida de token
export const recuperarToken = (req, res) => {
    const authHeader = req.headers["x-app-key"];

    if (!authHeader || !authHeader.startsWith("AppKey ")) {
        return res.status(401).json({ error: "AppKey no proporcionado o formato incorrecto" });
    }

    const token = authHeader.split(" ")[1];

    // Verificar si el token es válido
    jwt.verify(token, SECRET_APP_KEY, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: "Token inválido o expirado" });
        }

        const nuevoToken = jwt.sign({ app_id: decoded.app_id }, SECRET_APP_KEY, { expiresIn: "365d" });

        console.log("Nuevo Token:", nuevoToken);

        const query = `
            UPDATE apps
            SET token = ?
            WHERE app_id = ?
        `;

        db.run(query, [nuevoToken, decoded.app_id], function (err) {
            if (err) {
                return res.status(500).json({ error: "Error al actualizar el token" });
            }

            return res.status(200).json({
                mensaje: "Token actualizado",
                nuevo_token: nuevoToken
            });
        });
    });
};

export default {
    registrarApp,
    recuperarToken
};
