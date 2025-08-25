/**
 * Controlador de autenticación - V2
 * File: src/v2/controllers/authController.js
 * 
 * Descripción: Controlador de autenticación adaptado para Turso y SSE.
 * 
 * Cambios en V2:
 * - Migrado de SQLite3 a Turso (@libsql/client)
 * - Reemplazado WebSockets por SSE para notificaciones
 * - Mantiene la misma funcionalidad de autenticación
 * 
 * Funciones:
 * - login: Maneja el inicio de sesión de un usuario
 * - registrar: Maneja el registro de un nuevo usuario
 * - logout: Maneja el cierre de sesión de un usuario
 */

import bcrypt from "bcryptjs";
import dbTurso from "../../database/db-turso.js";
import generateToken from "../../utils/generateToken.js";

// Helper para obtener los managers SSE
let sseManager = null;
let notificationManager = null;

// Función para establecer los managers SSE
export function setSSEManagers(sse, notification) {
    sseManager = sse;
    notificationManager = notification;
}

const authController = {
    login: async (req, res) => {
        try {
            const { correo, contraseña, dispositivo } = req.body;

            if (!correo || !contraseña) {
                return res.status(400).json({ error: "Correo y contraseña requeridos" });
            }

            // Buscar usuario en Turso
            const query = `SELECT * FROM usuarios WHERE correo = ?`;
            const result = await dbTurso.execute({
                sql: query,
                args: [correo]
            });

            if (result.rows.length === 0) {
                return res.status(401).json({ error: "Usuario no encontrado" });
            }

            const user = result.rows[0];

            // Verificar contraseña
            const validPassword = await bcrypt.compare(contraseña, user.contraseña);
            if (!validPassword) {
                return res.status(401).json({ error: "Contraseña incorrecta" });
            }

            // Generar token
            const token = generateToken(user);

            // Guardar sesión en Turso
            const insertQuery = `
                INSERT INTO sesiones (usuario_id, token, direccion_ip, dispositivo)
                VALUES (?, ?, ?, ?)
            `;
            const ip = req.ip || "";
            
            await dbTurso.execute({
                sql: insertQuery,
                args: [user.id, token, ip, dispositivo || 'unknown']
            });

            // Datos para SSE
            const userData = {
                id: user.id,
                email: user.correo,
                name: user.nombre,
                username: user.username,
                role: user.rol,
                login_time: new Date().toISOString(),
                ip: ip,
                dispositivo: dispositivo || 'unknown'
            };

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Usuario ${user.nombre} ha iniciado sesión`,
                        'info',
                        { 
                            usuario: userData,
                            accion: 'login'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE de login:', sseError);
                }
            }

            res.json({
                success: true,
                mensaje: "Inicio de sesión exitoso",
                token,
                user: {
                    id: user.id,
                    email: user.correo,
                    nombre: user.nombre,
                    username: user.username,
                    rol: user.rol
                }
            });

        } catch (error) {
            console.error('Error en login v2:', error);
            res.status(500).json({ error: "Error en el servidor" });
        }
    },

    registrar: async (req, res) => {
        try {
            const { correo, nombre, contrasena, username, rol } = req.body;

            if (!correo || !contrasena || !username || !rol) {
                return res.status(400).json({ error: "Todos los campos son obligatorios" });
            }

            // Verificar si el usuario ya existe (correo o username)
            const verificarQuery = `SELECT id FROM usuarios WHERE correo = ? OR username = ?`;
            const existingResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [correo, username]
            });

            if (existingResult.rows.length > 0) {
                return res.status(409).json({ error: "Correo o username ya existe" });
            }

            // Cifrar contraseña
            const hashedPassword = await bcrypt.hash(contrasena, 10);

            // Insertar nuevo usuario
            const insertQuery = `
                INSERT INTO usuarios (correo, nombre, contraseña, username, rol)
                VALUES (?, ?, ?, ?, ?)
            `;

            const insertResult = await dbTurso.execute({
                sql: insertQuery,
                args: [correo, nombre, hashedPassword, username, rol]
            });

            const nuevoUsuarioId = Number(insertResult.lastInsertRowid); // Convertir BigInt a Number

            // Datos del usuario creado
            const usuarioCreado = {
                id: nuevoUsuarioId,
                correo,
                nombre,
                username,
                rol,
                fecha_creacion: new Date().toISOString()
            };

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Nuevo usuario registrado: ${nombre} (${username})`,
                        'success',
                        { 
                            usuario: usuarioCreado,
                            accion: 'registro'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE de registro:', sseError);
                }
            }

            res.status(201).json({
                mensaje: "Usuario registrado con éxito",
                usuario: usuarioCreado
            });

        } catch (error) {
            if (error.message && error.message.includes("UNIQUE")) {
                return res.status(409).json({ error: "Correo o username ya existe" });
            }
            console.error('Error al registrar usuario v2:', error);
            res.status(500).json({ error: "Error al registrar usuario" });
        }
    },

    logout: async (req, res) => {
        try {
            const { token } = req.body;

            if (!token) {
                return res.status(400).json({ error: "Token requerido" });
            }

            // Marcar sesión como inactiva en Turso
            const updateQuery = `
                UPDATE sesiones 
                SET activo = 0, fecha_fin = datetime('now')
                WHERE token = ? AND activo = 1
            `;

            const result = await dbTurso.execute({
                sql: updateQuery,
                args: [token]
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({ error: "Sesión no encontrada o ya cerrada" });
            }

            // Obtener información del usuario para notificación
            const userQuery = `
                SELECT u.nombre, u.correo, u.username
                FROM usuarios u 
                JOIN sesiones s ON u.id = s.usuario_id 
                WHERE s.token = ?
            `;

            const userResult = await dbTurso.execute({
                sql: userQuery,
                args: [token]
            });

            // Enviar notificación SSE
            if (notificationManager && userResult.rows.length > 0) {
                try {
                    const userData = userResult.rows[0];
                    notificationManager.alertaSistema(
                        `Usuario ${userData.nombre} ha cerrado sesión`,
                        'info',
                        { 
                            usuario: userData,
                            accion: 'logout'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE de logout:', sseError);
                }
            }

            res.status(200).json({
                mensaje: "Sesión cerrada con éxito"
            });

        } catch (error) {
            console.error('Error al cerrar sesión v2:', error);
            res.status(500).json({ error: "Error al cerrar sesión" });
        }
    },

    sesionesActivas: async (req, res) => {
        try {
            const { usuarioId } = req.params;

            if (!usuarioId) {
                return res.status(400).json({ error: "ID de usuario requerido" });
            }

            // Obtener sesiones activas del usuario desde Turso
            const query = `
                SELECT id, usuario_id, direccion_ip, dispositivo, fecha_inicio, ubicacion
                FROM sesiones
                WHERE usuario_id = ? AND activo = 1
            `;

            const result = await dbTurso.execute({
                sql: query,
                args: [usuarioId]
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ mensaje: "No se encontraron sesiones activas" });
            }

            // Convertir rows a objetos con propiedades nombradas
            const sesiones = result.rows.map(row => ({
                id: row.id,
                usuario_id: row.usuario_id,
                direccion_ip: row.direccion_ip,
                dispositivo: row.dispositivo,
                fecha_inicio: row.fecha_inicio,
                ubicacion: row.ubicacion
            }));

            // Enviar notificación SSE (opcional)
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Consulta de sesiones activas para usuario ${usuarioId}`,
                        'info',
                        { 
                            usuario_id: usuarioId,
                            sesiones_encontradas: sesiones.length,
                            accion: 'consulta_sesiones'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE de consulta sesiones:', sseError);
                }
            }

            res.json({
                usuario_id: usuarioId,
                sesiones_activas: sesiones,
                total: sesiones.length
            });

        } catch (error) {
            console.error('Error al obtener sesiones activas v2:', error);
            res.status(500).json({ error: "Error al obtener sesiones activas" });
        }
    }
};

export default authController;
