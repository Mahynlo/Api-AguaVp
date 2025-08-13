/**
 * * Controlador de autenticación 
 * File: src/controllers/authController.js
 * Descripción: Controlador de autenticación para manejar el inicio de sesión, registro y cierre de sesión de usuarios.
 * 
 * @module authController
 * Funciones:
 * - login: Maneja el inicio de sesión de un usuario. Verifica las credenciales y genera un token.
 * - registrar: Maneja el registro de un nuevo usuario. Cifra la contraseña y almacena el usuario en la base de datos.
 * - logout: Maneja el cierre de sesión de un usuario. Marca la sesión como inactiva y registra la fecha de cierre.
 * 
 * 
 * 
 * Notas:
 * - Se utiliza bcryptjs para cifrar las contraseñas.
 * - Se utiliza sqlite3 para interactuar con la base de datos SQLite.
 * - Se utiliza un middleware para verificar la autenticación de los usuarios.
 * - Se utiliza un módulo externo para generar tokens JWT.
 * 
 * 
 * Pendiente de implementar:
 * - Validaciones más robustas para los datos de entrada.
 * - Manejo de errores más detallado.
 * - Registro de actividad del usuario (por ejemplo, intentos fallidos de inicio de sesión).
 * - Mejora de la seguridad (por ejemplo, limitación de intentos de inicio de sesión).
 * - Implementación de un sistema de recuperación de contraseña.
 * - Implementación de un sistema de verificación de correo electrónico.
 * - Implementación de un sistema de roles y permisos.
 * - Implementación de un sistema de auditoría para registrar cambios en los datos de los usuarios.
 * * - Implementación de un sistema de bloqueo de cuenta después de múltiples intentos fallidos de inicio de sesión.
 * * - Implementación de un sistema de expiración de tokens.
 * 
 * pruebas de implementación:
 * 
*/

import bcrypt from "bcryptjs";
import db from "../../database/db.js"; // conexión con createClient()
import generateToken from "../../utils/generateToken.js";
import ControllerIntegration from "../sockets/enhanced/controllerIntegration.js";

const authController = {
    login: async (req, res) => {
        try {
            const { correo, contraseña, dispositivo } = req.body;

            if (!correo || !contraseña) {
                return res.status(400).json({ error: "Correo y contraseña requeridos" });
            }

            const query = `SELECT * FROM usuarios WHERE correo = ?`;
            const user = await new Promise((resolve, reject) => {
                db.get(query, [correo], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!user) return res.status(401).json({ error: "Usuario no encontrado" });

            const validPassword = await bcrypt.compare(contraseña, user.contraseña);
            if (!validPassword) return res.status(401).json({ error: "Contraseña incorrecta" });

            const token = generateToken(user);

            // Guardar sesión
            const insertQuery = `
                INSERT INTO sesiones (usuario_id, token, direccion_ip, dispositivo)
                VALUES (?, ?, ?, ?)
            `;
            const ip = req.ip || "";
            db.run(insertQuery, [user.id, token, ip, dispositivo], function(err) {
                if (err) {
                    console.error("Error al guardar sesión:", err);
                }
            });

            // Datos para WebSocket
            const userData = {
                id: user.id,
                email: user.correo,
                name: user.nombre,
                username: user.username,
                role: user.rol,
                login_time: new Date().toISOString(),
                ip: ip,
                dispositivo: dispositivo
            };

            try {
                if (res.websocket && typeof res.websocket.trackOperation === "function") {
                    ControllerIntegration.onUserLogin(userData);
                    res.websocket.trackOperation("user_login", {
                        user_id: user.id,
                        username: user.username
                    });
                }
            } catch (error) {
                console.log("WebSocket no disponible para login - esto es normal:", error.message);
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
                    rol: user.rol,
                    activo: user.activo
                }
            });

        } catch (err) {
            console.error("Error en login:", err);
            res.status(500).json({ error: "Error en el servidor" });
        }
    },

    registrar: async (req, res) => {
        try {
            const { correo, nombre, contrasena, username, rol } = req.body;

            if (!correo || !contrasena || !username || !rol) {
                return res.status(400).json({ error: "Todos los campos son obligatorios" });
            }

            const hashedPassword = bcrypt.hashSync(contrasena, 10);

            const query = `
                INSERT INTO usuarios (correo, nombre, contraseña, username, rol)
                VALUES (?, ?, ?, ?, ?)
            `;

            db.run(query, [correo, nombre, hashedPassword, username, rol], function(err) {
                if (err) {
                    throw err;
                }
            });

            res.status(201).json({ mensaje: "Usuario registrado con éxito" });

        } catch (err) {
            if (err.message.includes("UNIQUE")) {
                return res.status(409).json({ error: "Correo o username ya existe" });
            }
            console.error("Error al registrar usuario:", err);
            res.status(500).json({ error: "Error al registrar usuario" });
        }
    },

    logout: async (req, res) => {
        try {
            const { token } = req.body;

            if (!token) {
                return res.status(400).json({ error: "Token requerido" });
            }

            const updateQuery = `
                UPDATE sesiones
                SET activo = 0,
                    fecha_fin = datetime('now')
                WHERE token = ? AND activo = 1
            `;

            db.run(updateQuery, [token], function(err) {
                if (err) {
                    console.error("Error al cerrar sesión:", err);
                }
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({ error: "Sesión no encontrada o ya cerrada" });
            }

            res.status(200).json({ mensaje: "Sesión cerrada con éxito" });

        } catch (err) {
            console.error("Error al cerrar sesión:", err);
            res.status(500).json({ error: "Error al cerrar sesión" });
        }
    },

    sesionesActivas: async (req, res) => {
        try {
            const { usuarioId } = req.params;

            if (!usuarioId) {
                return res.status(400).json({ error: "ID de usuario requerido" });
            }

            const query = `
                SELECT id, usuario_id, direccion_ip, dispositivo, fecha_inicio, ubicacion
                FROM sesiones
                WHERE usuario_id = ? AND activo = 1
            `;

            const sesiones = await new Promise((resolve, reject) => {
                db.all(query, [usuarioId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            if (sesiones.length === 0) {
                return res.status(404).json({ mensaje: "No se encontraron sesiones activas" });
            }

            res.json(sesiones);

        } catch (err) {
            console.error("Error al obtener sesiones activas:", err);
            res.status(500).json({ error: "Error al obtener sesiones activas" });
        }
    }
};

export default authController;





