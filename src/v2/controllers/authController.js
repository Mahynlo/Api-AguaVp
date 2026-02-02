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
import dbTurso from "../../database/db-sqlite.js";
import { generateTokenPair, generateAccessToken } from "../../utils/generateToken.js";
import { validatePassword, formatValidationErrors } from "../../utils/passwordValidator.js";

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

            // Verificar estado del usuario (Soft Delete / Bloqueo)
            // Si el campo estado_usuario no existe (migración pendiente), asumimos activo.
            // Pero como ya corrimos la migración con default 'Activo', debe existir.
            if (user.estado_usuario && user.estado_usuario !== 'Activo') {
                return res.status(403).json({
                    error: "Cuenta desactivada",
                    mensaje: `Tu cuenta se encuentra en estado: ${user.estado_usuario}. Contacta al administrador.`
                });
            }

            // Verificar contraseña
            const validPassword = await bcrypt.compare(contraseña, user.contraseña);
            if (!validPassword) {
                return res.status(401).json({ error: "Contraseña incorrecta" });
            }

            // Generar par de tokens (access + refresh)
            const { accessToken, refreshToken, refreshExpiresAt } = generateTokenPair(user, 'user');

            // Guardar sesión en Turso
            const insertQuery = `
                INSERT INTO sesiones (usuario_id, token, direccion_ip, dispositivo)
                VALUES (?, ?, ?, ?)
            `;
            const ip = req.ip || "";

            await dbTurso.execute({
                sql: insertQuery,
                args: [user.id, accessToken, ip, dispositivo || 'unknown']
            });

            // Guardar refresh token en la base de datos
            const insertRefreshQuery = `
                INSERT INTO refresh_tokens (token, usuario_id, expira_en, user_agent, ip)
                VALUES (?, ?, ?, ?, ?)
            `;

            await dbTurso.execute({
                sql: insertRefreshQuery,
                args: [
                    refreshToken,
                    user.id,
                    refreshExpiresAt,
                    req.headers['user-agent'] || 'unknown',
                    ip
                ]
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
                accessToken,
                refreshToken,
                expiresIn: '15m',
                refreshExpiresIn: '7d',
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

            // Validar que el rol sea uno de los permitidos (case-insensitive)
            const rolesPermitidos = ['superadmin', 'administrador', 'operador'];
            const rolNormalizado = rol.toLowerCase().trim();

            if (!rolesPermitidos.includes(rolNormalizado)) {
                return res.status(400).json({
                    error: "Rol no válido",
                    rolesPermitidos: rolesPermitidos,
                    rolRecibido: rol
                });
            }

            // Validar fortaleza de la contraseña
            const validation = validatePassword(contrasena);
            if (!validation.valid) {
                return res.status(400).json({
                    error: "Contraseña no válida",
                    detalles: validation.errors,
                    mensaje: formatValidationErrors(validation.errors)
                });
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
                args: [correo, nombre, hashedPassword, username, rolNormalizado]
            });

            const nuevoUsuarioId = Number(insertResult.lastInsertRowid); // Convertir BigInt a Number

            // Datos del usuario creado
            const usuarioCreado = {
                id: nuevoUsuarioId,
                correo,
                nombre,
                username,
                rol: rolNormalizado,
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

            // Obtener información de la sesión a cerrar
            const sesionQuery = `
                SELECT usuario_id FROM sesiones 
                WHERE token = ? AND activo = 1
            `;

            const sesionResult = await dbTurso.execute({
                sql: sesionQuery,
                args: [token]
            });

            if (sesionResult.rows.length === 0) {
                return res.status(404).json({ error: "Sesión no encontrada o ya cerrada" });
            }

            const sesionUsuarioId = sesionResult.rows[0].usuario_id;

            // Verificar permisos: solo el mismo usuario o superadmin pueden cerrar la sesión
            const usuarioAutenticadoId = req.usuario.id;

            // Obtener rol del usuario autenticado
            const rolQuery = `SELECT rol FROM usuarios WHERE id = ?`;
            const rolResult = await dbTurso.execute({
                sql: rolQuery,
                args: [usuarioAutenticadoId]
            });

            const rolUsuario = rolResult.rows[0]?.rol;

            // Validar permisos
            if (sesionUsuarioId !== usuarioAutenticadoId && rolUsuario !== 'superadmin') {
                return res.status(403).json({
                    error: "No autorizado para cerrar esta sesión",
                    mensaje: "Solo puedes cerrar tus propias sesiones, o ser superadmin"
                });
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
            // Incluimos token para comparar, pero no lo enviamos al cliente final
            const query = `
                SELECT id, usuario_id, direccion_ip, dispositivo, fecha_inicio, ubicacion, token
                FROM sesiones
                WHERE usuario_id = ? AND activo = 1
            `;

            const result = await dbTurso.execute({
                sql: query,
                args: [usuarioId]
            });

            if (result.rows.length === 0) {
                // Retornar array vacío en lugar de 404 para que la UI no falle
                // Retornar array vacío en lugar de 404 para que la UI no falle
                return res.json({
                    success: true,
                    usuario_id: usuarioId,
                    sesiones_activas: [],
                    total: 0
                });
            }

            // Obtener token actual del header
            const authHeader = req.headers['authorization'];
            const currentToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

            // Convertir rows a objetos con propiedades nombradas y flag 'actual'
            const sesiones = result.rows.map(row => ({
                id: row.id,
                usuario_id: row.usuario_id,
                direccion_ip: row.direccion_ip,
                dispositivo: row.dispositivo,
                fecha_inicio: row.fecha_inicio,
                ubicacion: row.ubicacion,
                actual: row.token === currentToken // Flag True si es la sesión actual
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
    },

    /**
     * Refresh Token - Renueva el access token usando un refresh token válido
     * POST /api/v2/auth/refresh
     * Body: { refreshToken }
     */
    refresh: async (req, res) => {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({ error: "Refresh token requerido" });
            }

            // Verificar que el refresh token existe y está activo
            const query = `
                SELECT 
                    u.id as usuario_id,
                    u.correo,
                    u.nombre,
                    u.username,
                    u.rol,
                    u.fecha_creacion
                FROM refresh_tokens rt
                JOIN usuarios u ON rt.usuario_id = u.id
                WHERE rt.token = ? 
                  AND rt.revocado = 0 
                  AND datetime(rt.expira_en) > datetime('now')
            `;

            const result = await dbTurso.execute({
                sql: query,
                args: [refreshToken]
            });

            if (result.rows.length === 0) {
                return res.status(401).json({
                    error: "Refresh token inválido o expirado",
                    code: "INVALID_REFRESH_TOKEN"
                });
            }

            const tokenData = result.rows[0];

            // Construir objeto de usuario
            const user = {
                id: tokenData.usuario_id,
                correo: tokenData.correo,
                nombre: tokenData.nombre,
                username: tokenData.username,
                rol: tokenData.rol,
                fecha_creacion: tokenData.fecha_creacion
            };

            // Generar nuevo access token
            const newAccessToken = generateAccessToken(user, 'user');

            // Actualizar la sesión activa más reciente del usuario con el nuevo token
            // En lugar de crear una nueva sesión
            const updateSessionQuery = `
                UPDATE sesiones 
                SET token = ?,
                    ultimo_uso = datetime('now')
                WHERE usuario_id = ? 
                  AND activo = 1
                  AND id = (
                      SELECT id FROM sesiones 
                      WHERE usuario_id = ? AND activo = 1 
                      ORDER BY fecha_inicio DESC 
                      LIMIT 1
                  )
            `;

            await dbTurso.execute({
                sql: updateSessionQuery,
                args: [
                    newAccessToken,
                    user.id,
                    user.id
                ]
            });

            // Actualizar último uso del refresh token
            const updateQuery = `
                UPDATE refresh_tokens 
                SET ultimo_uso = datetime('now')
                WHERE token = ?
            `;

            await dbTurso.execute({
                sql: updateQuery,
                args: [refreshToken]
            });

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Token renovado para usuario ${user.nombre}`,
                        'info',
                        {
                            usuario_id: user.id,
                            accion: 'refresh_token'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE de refresh:', sseError);
                }
            }

            res.json({
                success: true,
                accessToken: newAccessToken,
                expiresIn: '15m',
                user: {
                    id: user.id,
                    email: user.correo,
                    nombre: user.nombre,
                    username: user.username,
                    rol: user.rol
                }
            });

        } catch (error) {
            console.error('Error en refresh token v2:', error);
            res.status(500).json({ error: "Error al renovar token" });
        }
    },

    /**
     * Revoke Refresh Token - Revoca un refresh token específico
     * POST /api/v2/auth/revoke
     * Body: { refreshToken }
     * Headers: Authorization: Bearer <access_token>
     */
    revokeRefreshToken: async (req, res) => {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({ error: "Refresh token requerido" });
            }

            // Verificar que el refresh token pertenece al usuario autenticado
            const query = `
                SELECT usuario_id 
                FROM refresh_tokens 
                WHERE token = ? AND revocado = 0
            `;

            const result = await dbTurso.execute({
                sql: query,
                args: [refreshToken]
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Refresh token no encontrado" });
            }

            const tokenUserId = result.rows[0].usuario_id;

            // Verificar que el usuario del token coincide con el usuario autenticado
            if (tokenUserId !== req.user.id) {
                return res.status(403).json({
                    error: "No autorizado para revocar este token"
                });
            }

            // Revocar el token
            const updateQuery = `
                UPDATE refresh_tokens 
                SET revocado = 1,
                    revocado_en = datetime('now'),
                    razon_revocacion = 'Revocación manual por usuario'
                WHERE token = ?
            `;

            await dbTurso.execute({
                sql: updateQuery,
                args: [refreshToken]
            });

            res.json({
                success: true,
                mensaje: "Refresh token revocado exitosamente"
            });

        } catch (error) {
            console.error('Error revocando refresh token v2:', error);
            res.status(500).json({ error: "Error al revocar token" });
        }
    },

    // Cerrar una sesión específica por ID
    cerrarSesion: async (req, res) => {
        try {
            const { sesionId } = req.params;

            if (!sesionId) {
                return res.status(400).json({ error: "ID de sesión requerido" });
            }

            // Obtener información de la sesión a cerrar
            const sesionQuery = `
                SELECT usuario_id FROM sesiones 
                WHERE id = ? AND activo = 1
            `;

            const sesionResult = await dbTurso.execute({
                sql: sesionQuery,
                args: [sesionId]
            });

            if (sesionResult.rows.length === 0) {
                return res.status(404).json({ error: "Sesión no encontrada o ya cerrada" });
            }

            const sesionUsuarioId = sesionResult.rows[0].usuario_id;

            // Verificar permisos: solo el mismo usuario o superadmin
            const usuarioAutenticadoId = req.usuario.id;

            const rolQuery = `SELECT rol FROM usuarios WHERE id = ?`;
            const rolResult = await dbTurso.execute({
                sql: rolQuery,
                args: [usuarioAutenticadoId]
            });

            const rolUsuario = rolResult.rows[0]?.rol;

            // Validar permisos
            if (sesionUsuarioId !== usuarioAutenticadoId && rolUsuario !== 'superadmin') {
                return res.status(403).json({
                    error: "No autorizado para cerrar esta sesión",
                    mensaje: "Solo puedes cerrar tus propias sesiones, o ser superadmin"
                });
            }

            // Cerrar la sesión
            const updateQuery = `
                UPDATE sesiones 
                SET activo = 0, fecha_fin = datetime('now')
                WHERE id = ? AND activo = 1
            `;

            const result = await dbTurso.execute({
                sql: updateQuery,
                args: [sesionId]
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({ error: "Sesión no encontrada o ya cerrada" });
            }

            res.json({
                success: true,
                mensaje: "Sesión cerrada exitosamente",
                sesion_id: sesionId
            });

        } catch (error) {
            console.error('Error cerrando sesión v2:', error);
            res.status(500).json({ error: "Error al cerrar sesión" });
        }
    },

    // Cerrar todas las sesiones de un usuario
    cerrarTodasSesiones: async (req, res) => {
        try {
            const { usuarioId } = req.params;
            const { excepto_actual } = req.query; // Opcional: mantener sesión actual

            if (!usuarioId) {
                return res.status(400).json({ error: "ID de usuario requerido" });
            }

            // Verificar permisos: solo el mismo usuario o superadmin
            const usuarioAutenticadoId = req.usuario.id;

            const rolQuery = `SELECT rol FROM usuarios WHERE id = ?`;
            const rolResult = await dbTurso.execute({
                sql: rolQuery,
                args: [usuarioAutenticadoId]
            });

            const rolUsuario = rolResult.rows[0]?.rol;

            // Validar permisos
            if (Number(usuarioId) !== usuarioAutenticadoId && rolUsuario !== 'superadmin') {
                return res.status(403).json({
                    error: "No autorizado para cerrar sesiones de este usuario",
                    mensaje: "Solo puedes cerrar tus propias sesiones, o ser superadmin"
                });
            }

            // Construir query según si se excluye la sesión actual
            let updateQuery;
            let args;

            if (excepto_actual === 'true') {
                // Cerrar todas EXCEPTO la sesión actual
                const tokenActual = req.usuario.token;
                updateQuery = `
                    UPDATE sesiones 
                    SET activo = 0, fecha_fin = datetime('now')
                    WHERE usuario_id = ? AND activo = 1 AND token != ?
                `;
                args = [usuarioId, tokenActual];
            } else {
                // Cerrar TODAS las sesiones
                updateQuery = `
                    UPDATE sesiones 
                    SET activo = 0, fecha_fin = datetime('now')
                    WHERE usuario_id = ? AND activo = 1
                `;
                args = [usuarioId];
            }

            const result = await dbTurso.execute({
                sql: updateQuery,
                args: args
            });

            const sesiones_cerradas = Number(result.rowsAffected) || 0;

            res.json({
                success: true,
                mensaje: `${sesiones_cerradas} sesión(es) cerrada(s) exitosamente`,
                sesiones_cerradas: sesiones_cerradas,
                usuario_id: usuarioId
            });

        } catch (error) {
            console.error('Error cerrando todas las sesiones v2:', error);
            res.status(500).json({ error: "Error al cerrar sesiones" });
        }
    }
};

export default authController;
