/**
 * Controlador de aplicación - V2
 * 
 * File: src/v2/controllers/appController.js
 * 
 * Descripción: Controlador para funcionalidades específicas de la aplicación
 * 
 * Cambios en V2:
 * - Integración con Turso
 * - Información sobre SSE
 * - Registro de aplicaciones migrado a Turso
 * - Recuperación de tokens migrado a Turso
 */

import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import dbTurso from "../../database/db-turso.js";

const SECRET_APP_KEY = process.env.SECRET_APP_KEY; // secret para firmar el token
const APPKEY_INICIAL = process.env.APPKEY_INICIAL; // token inicial para registrar la app

const appController = {
    // Registro inicial de aplicaciones - V2 con Turso
    registrarApp: async (req, res) => {
        try {
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

            await dbTurso.execute({
                sql: query,
                args: [nuevoAppId, nuevoToken, req.body?.nombre || null, ip]
            });

            return res.status(201).json({
                mensaje: "Nueva app registrada con Turso",
                app_id: nuevoAppId,
                token: nuevoToken,
                database: "Turso"
            });

        } catch (error) {
            console.error('Error al registrar app en Turso:', error);
            return res.status(500).json({ error: "Error al registrar la nueva app" });
        }
    },

    // Recuperación de token por expiración o pérdida - V2 con Turso  
    recuperarToken: async (req, res) => {
        try {
            const authHeader = req.headers["x-app-key"];

            if (!authHeader || !authHeader.startsWith("AppKey ")) {
                return res.status(401).json({ error: "AppKey no proporcionado o formato incorrecto" });
            }

            const token = authHeader.split(" ")[1];

            // Verificar si el token es válido
            jwt.verify(token, SECRET_APP_KEY, async (err, decoded) => {
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

                try {
                    await dbTurso.execute({
                        sql: query,
                        args: [nuevoToken, decoded.app_id]
                    });

                    return res.status(200).json({
                        mensaje: "Token actualizado con Turso",
                        nuevo_token: nuevoToken,
                        database: "Turso"
                    });

                } catch (updateError) {
                    console.error('Error al actualizar token en Turso:', updateError);
                    return res.status(500).json({ error: "Error al actualizar el token" });
                }
            });

        } catch (error) {
            console.error('Error en recuperarToken:', error);
            return res.status(500).json({ error: "Error al procesar recuperación de token" });
        }
    },

    obtenerVersion: async (req, res) => {
        try {
            res.json({
                version: "2.0.0",
                api_version: "v2",
                environment: process.env.NODE_ENV || "development",
                database: "Turso (@libsql/client)",
                realtime: "Server-Sent Events (SSE)",
                features: [
                    "Gestión de clientes",
                    "Gestión de medidores", 
                    "Control de lecturas",
                    "Sistema de facturación",
                    "Gestión de pagos",
                    "Sistema de tarifas",
                    "Rutas de lectura",
                    "Autenticación JWT",
                    "Server-Sent Events (SSE)",
                    "Turso Database",
                    "Health check endpoints",
                    "Real-time notifications"
                ],
                changes_from_v1: [
                    "WebSockets → Server-Sent Events (SSE)",
                    "SQLite3 → Turso Database",
                    "Improved real-time notifications"
                ],
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error obteniendo versión v2:', error);
            res.status(500).json({ error: "Error al obtener información de versión" });
        }
    },

    verificarEstado: async (req, res) => {
        try {
            // Verificar conexión a base de datos
            let dbStatus = 'OK';
            let dbError = null;
            
            try {
                await dbTurso.execute({ sql: 'SELECT 1 as test' });
            } catch (error) {
                dbStatus = 'ERROR';
                dbError = error.message;
            }

            res.json({
                status: dbStatus === 'OK' ? 'OK' : 'DEGRADED',
                version: '2.0.0',
                timestamp: new Date().toISOString(),
                services: {
                    api: 'OK',
                    database: dbStatus,
                    sse: 'OK'
                },
                database: {
                    type: 'Turso',
                    status: dbStatus,
                    error: dbError
                },
                realtime: {
                    type: 'SSE',
                    status: 'OK'
                },
                uptime: process.uptime(),
                memory_usage: process.memoryUsage()
            });
        } catch (error) {
            console.error('Error verificando estado v2:', error);
            res.status(500).json({ 
                status: 'ERROR',
                error: "Error al verificar estado de la aplicación" 
            });
        }
    }
};

export default appController;
