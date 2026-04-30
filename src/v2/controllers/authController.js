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
import crypto from "crypto";
import dbTurso from "../../database/db-sqlite.js";
import { generateTokenPair, generateAccessToken } from "../../utils/generateToken.js";
import { validatePassword, formatValidationErrors } from "../../utils/passwordValidator.js";
import { sendPasswordRecoveryEmail, sendPasswordChangedEmail } from "../services/emailService.js";

// Helper para obtener los managers SSE
let sseManager = null;
let notificationManager = null;

// Función para establecer los managers SSE
export function setSSEManagers(sse, notification) {
    sseManager = sse;
    notificationManager = notification;
}

// ── Helpers internos ────────────────────────────────────────────────────────

/**
 * Registra un evento en la tabla auditoria_seguridad.
 * Falla silenciosamente para no interrumpir el flujo principal.
 */
async function registrarAuditoria(db, {
    evento, usuario_id = null, app_id = null,
    ip = '', dispositivo = '', user_agent = '',
    exitoso = 1, detalles = {}, severidad = 'info'
}) {
    try {
        await db.execute({
            sql: `INSERT INTO auditoria_seguridad
                    (evento, usuario_id, app_id, ip, dispositivo, user_agent, exitoso, detalles, severidad)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                evento, usuario_id, app_id, ip, dispositivo, user_agent,
                exitoso ? 1 : 0, JSON.stringify(detalles), severidad
            ]
        });
    } catch (err) {
        console.warn('[Auditoría] No se pudo registrar evento:', evento, '-', err.message);
    }
}

/**
 * Construye un objeto normalizado de información de dispositivo.
 * Acepta el campo legacy "dispositivo" (string) o el nuevo "dispositivo_info" (objeto enriquecido).
 */
function resolverInfoDispositivo(dispositivo, dispositivoInfo, userAgent) {
    if (dispositivoInfo && typeof dispositivoInfo === 'object') {
        return {
            nombre:           dispositivoInfo.hostname || dispositivoInfo.nombre || dispositivo || 'unknown',
            os:               dispositivoInfo.os || '',
            os_version:       dispositivoInfo.os_version || '',
            arch:             dispositivoInfo.arch || '',
            plataforma:       dispositivoInfo.plataforma || 'electron',
            electron_version: dispositivoInfo.electron_version || '',
            app_version:      dispositivoInfo.app_version || '',
            pantalla:         dispositivoInfo.pantalla || ''
        };
    }
    return {
        nombre: dispositivo || userAgent?.slice(0, 80) || 'unknown',
        os: '', os_version: '', arch: '',
        plataforma: 'electron',
        electron_version: '', app_version: '', pantalla: ''
    };
}

function generarTokenRecuperacion() {
    return crypto.randomBytes(32).toString('hex');
}

function hashTokenRecuperacion(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function registrarHistorialPassword(db, usuarioId, passwordHash) {
    try {
        await db.execute({
            sql: `INSERT INTO historial_passwords (usuario_id, password_hash) VALUES (?, ?)`,
            args: [usuarioId, passwordHash]
        });
    } catch (err) {
        console.warn('[password] No se pudo guardar historial_passwords:', err.message);
    }
}

async function revocarCredencialesPassword(db, usuarioId, { tokenActual = null, cerrarTodasSesiones = false, razonRevocacion = 'password_changed' } = {}) {
    if (cerrarTodasSesiones) {
        await db.execute({
            sql: `UPDATE sesiones
                  SET activo = 0, fecha_fin = datetime('now')
                  WHERE usuario_id = ? AND activo = 1`,
            args: [usuarioId]
        });
    } else if (tokenActual) {
        await db.execute({
            sql: `UPDATE sesiones
                  SET activo = 0, fecha_fin = datetime('now')
                  WHERE usuario_id = ? AND activo = 1 AND token != ?`,
            args: [usuarioId, tokenActual]
        });
    }

    await db.execute({
        sql: `UPDATE refresh_tokens
              SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = ?
              WHERE usuario_id = ? AND revocado = 0`,
        args: [razonRevocacion, usuarioId]
    });
}

async function aplicarCambioPassword(db, usuarioId, nuevaContrasena, options = {}) {
    const {
        tokenActual = null,
        cerrarTodasSesiones = false,
        razonRevocacion = 'password_changed'
    } = options;

    const nuevoHash = await bcrypt.hash(nuevaContrasena, 12);

    await db.execute({
        sql: `UPDATE usuarios
              SET contraseña = ?, ultimo_cambio_password = datetime('now'), requiere_cambio_password = 0
              WHERE id = ?`,
        args: [nuevoHash, usuarioId]
    });

    await registrarHistorialPassword(db, usuarioId, nuevoHash);
    await revocarCredencialesPassword(db, usuarioId, { tokenActual, cerrarTodasSesiones, razonRevocacion });

    return nuevoHash;
}

const authController = {
    login: async (req, res) => {
        try {
            const { correo, contraseña, dispositivo, dispositivo_info } = req.body;

            if (!correo || !contraseña) {
                return res.status(400).json({ error: "Correo y contraseña requeridos" });
            }

            const ip = req.ip || req.connection?.remoteAddress || "";
            const userAgent = req.headers['user-agent'] || '';

            // ── 1. Buscar usuario ──────────────────────────────────────────────────────
            const result = await dbTurso.execute({
                sql: `SELECT * FROM usuarios WHERE correo = ?`,
                args: [correo]
            });

            // No revelar si el usuario existe o no (previene enumeración de correos)
            if (result.rows.length === 0) {
                return res.status(401).json({ error: "Credenciales incorrectas" });
            }

            const user = result.rows[0];

            // ── 2. Verificar bloqueo temporal por intentos fallidos ────────────────────
            if (user.bloqueado_hasta) {
                const bloqueadoHasta = new Date(user.bloqueado_hasta);
                if (bloqueadoHasta > new Date()) {
                    const minutos = Math.ceil((bloqueadoHasta - new Date()) / 60000);
                    await registrarAuditoria(dbTurso, {
                        evento: 'login_bloqueado', usuario_id: user.id, ip,
                        dispositivo: dispositivo || 'unknown', user_agent: userAgent,
                        exitoso: 0, severidad: 'warning',
                        detalles: { razon: 'cuenta_bloqueada', bloqueado_hasta: user.bloqueado_hasta }
                    });
                    return res.status(423).json({
                        error: "Cuenta bloqueada temporalmente",
                        mensaje: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto(s).`,
                        bloqueado_hasta: user.bloqueado_hasta
                    });
                }
            }

            // ── 3. Verificar estado de la cuenta ──────────────────────────────────────
            if (user.estado_usuario && user.estado_usuario !== 'Activo') {
                return res.status(403).json({
                    error: "Cuenta desactivada",
                    mensaje: `Tu cuenta está en estado: ${user.estado_usuario}. Contacta al administrador.`
                });
            }

            // ── 4. Verificar contraseña ────────────────────────────────────────────────
            const validPassword = await bcrypt.compare(contraseña, user.contraseña);
            if (!validPassword) {
                const MAX_INTENTOS = 5;
                const nuevosIntentos = (user.intentos_fallidos || 0) + 1;

                if (nuevosIntentos >= MAX_INTENTOS) {
                    // Bloquear cuenta por 30 minutos
                    await dbTurso.execute({
                        sql: `UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = datetime('now', '+30 minutes') WHERE id = ?`,
                        args: [nuevosIntentos, user.id]
                    });
                    await registrarAuditoria(dbTurso, {
                        evento: 'cuenta_bloqueada', usuario_id: user.id, ip,
                        dispositivo: dispositivo || 'unknown', user_agent: userAgent,
                        exitoso: 0, severidad: 'warning',
                        detalles: { intentos: nuevosIntentos, razon: 'max_intentos_alcanzado' }
                    });
                    return res.status(423).json({
                        error: "Cuenta bloqueada",
                        mensaje: "Demasiados intentos fallidos. Cuenta bloqueada por 30 minutos."
                    });
                } else {
                    await dbTurso.execute({
                        sql: `UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?`,
                        args: [nuevosIntentos, user.id]
                    });
                    await registrarAuditoria(dbTurso, {
                        evento: 'login_fallido', usuario_id: user.id, ip,
                        dispositivo: dispositivo || 'unknown', user_agent: userAgent,
                        exitoso: 0, severidad: 'info',
                        detalles: { intentos_fallidos: nuevosIntentos, intentos_restantes: MAX_INTENTOS - nuevosIntentos }
                    });
                    return res.status(401).json({
                        error: "Credenciales incorrectas",
                        intentos_restantes: MAX_INTENTOS - nuevosIntentos
                    });
                }
            }

            // ── 5. Login exitoso: resetear contadores y actualizar último acceso ───────
            await dbTurso.execute({
                sql: `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = datetime('now') WHERE id = ?`,
                args: [user.id]
            });

            // ── 6. Resolver información completa del dispositivo ──────────────────────
            const infoDispositivo = resolverInfoDispositivo(dispositivo, dispositivo_info, userAgent);

            // ── 7. Generar par de tokens ───────────────────────────────────────────────
            const { accessToken, refreshToken, refreshExpiresAt } = generateTokenPair(user, 'user');

            // ── 8. Guardar sesión con datos enriquecidos ──────────────────────────────
            const sesionExpiraEn = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            await dbTurso.execute({
                sql: `INSERT INTO sesiones
                        (usuario_id, token, direccion_ip, dispositivo, user_agent, expira_en, tipo_sesion, ultimo_uso)
                      VALUES (?, ?, ?, ?, ?, ?, 'electron', datetime('now'))`,
                args: [user.id, accessToken, ip, infoDispositivo.nombre, userAgent, sesionExpiraEn]
            });

            // ── 9. Guardar refresh token ───────────────────────────────────────────────
            await dbTurso.execute({
                sql: `INSERT INTO refresh_tokens (token, usuario_id, expira_en, user_agent, ip)
                      VALUES (?, ?, ?, ?, ?)`,
                args: [refreshToken, user.id, refreshExpiresAt, userAgent, ip]
            });

            // ── 10. Registrar auditoría con info completa de dispositivo ───────────────
            await registrarAuditoria(dbTurso, {
                evento: 'login_exitoso', usuario_id: user.id, ip,
                dispositivo: infoDispositivo.nombre, user_agent: userAgent,
                exitoso: 1, severidad: 'info',
                detalles: {
                    os: infoDispositivo.os,
                    os_version: infoDispositivo.os_version,
                    arch: infoDispositivo.arch,
                    plataforma: infoDispositivo.plataforma,
                    electron_version: infoDispositivo.electron_version,
                    app_version: infoDispositivo.app_version,
                    pantalla: infoDispositivo.pantalla
                }
            });

            // ── 11. Notificación SSE ───────────────────────────────────────────────────
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Usuario ${user.nombre} inició sesión`,
                        'info',
                        { usuario_id: user.id, accion: 'login', ip, dispositivo: infoDispositivo.nombre }
                    );
                } catch (sseError) {
                    console.warn('SSE login error:', sseError);
                }
            }

            res.json({
                success: true,
                mensaje: "Inicio de sesión exitoso",
                accessToken,
                refreshToken,
                expiresIn: '15m',
                refreshExpiresIn: '7d',
                requiere_cambio_password: !!user.requiere_cambio_password,
                user: {
                    id: user.id,
                    email: user.correo,
                    nombre: user.nombre,
                    username: user.username,
                    rol: user.rol,
                    requiere_cambio_password: !!user.requiere_cambio_password
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
            // La sesión a cerrar es SIEMPRE la del token autenticado en el header (validado por authMiddleware).
            // Para cerrar la sesión de otro usuario, usar DELETE /sesiones/:sesionId.
            const token      = req.usuario.token;
            const usuarioId  = req.usuario.id;
            const ip         = req.ip || req.connection?.remoteAddress || '';
            const userAgent  = req.headers['user-agent'] || '';

            // ── 1. Cerrar sesión ───────────────────────────────────────────────────
            const result = await dbTurso.execute({
                sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE token = ? AND activo = 1`,
                args: [token]
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({ error: "Sesión no encontrada o ya cerrada" });
            }

            // ── 2. Bloquear el access token inmediatamente (no esperar a que expire) ─
            try {
                await dbTurso.execute({
                    sql: `INSERT OR IGNORE INTO tokens_revocados (token, tipo, usuario_id, razon) VALUES (?, 'access', ?, 'logout')`,
                    args: [token, usuarioId]
                });
            } catch (e) {
                console.warn('[logout] tokens_revocados insert failed:', e.message);
            }

            // ── 3. Revocar todos los refresh tokens activos del usuario ────────────
            await dbTurso.execute({
                sql: `UPDATE refresh_tokens
                      SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'logout'
                      WHERE usuario_id = ? AND revocado = 0`,
                args: [usuarioId]
            });

            // ── 4. Auditoría ───────────────────────────────────────────────────────
            await registrarAuditoria(dbTurso, {
                evento: 'logout', usuario_id: usuarioId, ip,
                user_agent: userAgent, exitoso: 1, severidad: 'info',
                detalles: { accion: 'logout_manual' }
            });

            // ── 5. Notificación SSE ────────────────────────────────────────────────
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Usuario ${usuarioId} cerró sesión`, 'info',
                        { usuario_id: usuarioId, accion: 'logout' }
                    );
                } catch (sseError) {
                    console.warn('Error SSE en logout:', sseError);
                }
            }

            res.status(200).json({ success: true, mensaje: "Sesión cerrada con éxito" });

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

            // ── Validar permisos: solo el propio usuario o admin/superadmin ───────────
            const rolResult = await dbTurso.execute({
                sql: `SELECT rol FROM usuarios WHERE id = ?`,
                args: [req.usuario.id]
            });
            const rolUsuario = rolResult.rows[0]?.rol;

            if (Number(usuarioId) !== Number(req.usuario.id) && !['superadmin', 'administrador'].includes(rolUsuario)) {
                return res.status(403).json({
                    error: "No autorizado",
                    mensaje: "Solo puedes consultar tus propias sesiones, o ser administrador."
                });
            }

            // ── Obtener sesiones activas con datos enriquecidos ──────────────────────
            const result = await dbTurso.execute({
                sql: `SELECT id, usuario_id, direccion_ip, dispositivo, user_agent,
                             fecha_inicio, ultimo_uso, expira_en, ubicacion, token
                      FROM sesiones
                      WHERE usuario_id = ? AND activo = 1
                      ORDER BY fecha_inicio DESC`,
                args: [usuarioId]
            });

            if (result.rows.length === 0) {
                return res.json({
                    success: true,
                    usuario_id: usuarioId,
                    sesiones_activas: [],
                    total: 0
                });
            }

            // Obtener token actual del header para marcar la sesión actual
            const authHeader = req.headers['authorization'];
            const currentToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

            const sesiones = result.rows.map(row => ({
                id: row.id,
                usuario_id: row.usuario_id,
                direccion_ip: row.direccion_ip,
                dispositivo: row.dispositivo,
                user_agent: row.user_agent,
                fecha_inicio: row.fecha_inicio,
                ultimo_uso: row.ultimo_uso,
                expira_en: row.expira_en,
                ubicacion: row.ubicacion,
                actual: row.token === currentToken
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
     * Refresh Token - Renueva el par de tokens con rotación completa.
     * El refresh token es de un solo uso: se revoca y se emite uno nuevo.
     * POST /api/v2/auth/refresh
     * Body: { refreshToken }
     */
    refresh: async (req, res) => {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({ error: "Refresh token requerido" });
            }

            const ip = req.ip || req.connection?.remoteAddress || "";
            const userAgent = req.headers['user-agent'] || '';

            // ── 1. Verificar que el refresh token existe y no está revocado ──────────
            const result = await dbTurso.execute({
                sql: `SELECT
                          rt.id   AS rt_id,
                          rt.ip   AS rt_ip,
                          u.id    AS usuario_id,
                          u.correo, u.nombre, u.username, u.rol, u.fecha_creacion, u.estado_usuario
                      FROM refresh_tokens rt
                      JOIN usuarios u ON rt.usuario_id = u.id
                      WHERE rt.token = ?
                        AND rt.revocado = 0
                        AND datetime(rt.expira_en) > datetime('now')`,
                args: [refreshToken]
            });

            if (result.rows.length === 0) {
                return res.status(401).json({
                    error: "Refresh token inválido o expirado",
                    code: "INVALID_REFRESH_TOKEN"
                });
            }

            const tokenData = result.rows[0];

            // Verificar que la cuenta siga activa
            if (tokenData.estado_usuario && tokenData.estado_usuario !== 'Activo') {
                return res.status(403).json({ error: "Cuenta desactivada", code: "ACCOUNT_DISABLED" });
            }

            const user = {
                id: tokenData.usuario_id,
                correo: tokenData.correo,
                nombre: tokenData.nombre,
                username: tokenData.username,
                rol: tokenData.rol,
                fecha_creacion: tokenData.fecha_creacion
            };

            // ── 2. Rotación: revocar el refresh token usado ───────────────────────────
            await dbTurso.execute({
                sql: `UPDATE refresh_tokens
                      SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'rotation'
                      WHERE id = ?`,
                args: [tokenData.rt_id]
            });

            // ── 3. Generar NUEVOS tokens (access + refresh) ───────────────────────────
            const {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                refreshExpiresAt: newRefreshExpiresAt
            } = generateTokenPair(user, 'user');

            // ── 4. Actualizar la sesión activa con el nuevo access token ──────────────
            const sesionExpiraEn = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            await dbTurso.execute({
                sql: `UPDATE sesiones
                      SET token = ?, ultimo_uso = datetime('now'), expira_en = ?
                      WHERE usuario_id = ? AND activo = 1
                        AND id = (
                            SELECT id FROM sesiones
                            WHERE usuario_id = ? AND activo = 1
                            ORDER BY fecha_inicio DESC LIMIT 1
                        )`,
                args: [newAccessToken, sesionExpiraEn, user.id, user.id]
            });

            // ── 5. Insertar el nuevo refresh token ────────────────────────────────────
            await dbTurso.execute({
                sql: `INSERT INTO refresh_tokens (token, usuario_id, expira_en, user_agent, ip)
                      VALUES (?, ?, ?, ?, ?)`,
                args: [newRefreshToken, user.id, newRefreshExpiresAt, userAgent, ip]
            });

            // ── 6. Auditoría ──────────────────────────────────────────────────────────
            await registrarAuditoria(dbTurso, {
                evento: 'token_renovado', usuario_id: user.id, ip,
                dispositivo: tokenData.rt_ip || ip, user_agent: userAgent,
                exitoso: 1, severidad: 'info',
                detalles: { accion: 'refresh_rotation' }
            });

            // ── 7. SSE ────────────────────────────────────────────────────────────────
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Token renovado para ${user.nombre}`, 'info',
                        { usuario_id: user.id, accion: 'refresh_rotation' }
                    );
                } catch (sseError) {
                    console.warn('SSE refresh error:', sseError);
                }
            }

            res.json({
                success: true,
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
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
            const result = await dbTurso.execute({
                sql: `SELECT usuario_id FROM refresh_tokens WHERE token = ? AND revocado = 0`,
                args: [refreshToken]
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Refresh token no encontrado" });
            }

            const tokenUserId = result.rows[0].usuario_id;

            // FIX: req.usuario.id (no req.user.id) — el middleware setea req.usuario
            if (Number(tokenUserId) !== Number(req.usuario.id)) {
                return res.status(403).json({
                    error: "No autorizado para revocar este token"
                });
            }

            // Revocar el token
            await dbTurso.execute({
                sql: `UPDATE refresh_tokens
                      SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'Revocación manual por usuario'
                      WHERE token = ?`,
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
            if (sesionUsuarioId !== usuarioAutenticadoId && !['superadmin', 'administrador'].includes(rolUsuario)) {
                return res.status(403).json({
                    error: "No autorizado para cerrar esta sesión",
                    mensaje: "Solo puedes cerrar tus propias sesiones, o ser administrador/superadmin"
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

            // NOTA: No revocamos todos los refresh tokens del usuario porque no hay FK
            // entre refresh_tokens y sesiones. Revocar todos causaría SESSION_REVOKED en
            // otras sesiones activas del usuario. La sesión ya está marcada activo=0,
            // por lo que el access token asociado fallará en authMiddleware. Los refresh
            // tokens huérfanos expirarán naturalmente en 7 días.

            await registrarAuditoria(dbTurso, {
                evento: 'sesion_cerrada_por_id', usuario_id: sesionUsuarioId,
                ip: req.ip || '', user_agent: req.headers['user-agent'] || '',
                exitoso: 1, severidad: 'info',
                detalles: { sesion_id: sesionId, cerrado_por: req.usuario.id }
            });

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
            if (Number(usuarioId) !== usuarioAutenticadoId && !['superadmin', 'administrador'].includes(rolUsuario)) {
                return res.status(403).json({
                    error: "No autorizado para cerrar sesiones de este usuario",
                    mensaje: "Solo puedes cerrar tus propias sesiones, o ser administrador/superadmin"
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

            // Revocar refresh tokens según si se mantiene la sesión actual:
            // - excepto_actual=true: NO revocar refresh tokens. No podemos identificar cuál
            //   pertenece a la sesión actual (no hay FK refresh_tokens→sesiones). Revocar todos
            //   causaría que el usuario se desloguee solo cuando su access token expire.
            //   Las sesiones cerradas ya tienen activo=0, sus access tokens fallarán en authMiddleware.
            // - excepto_actual=false (nuclear): revocar todos — se cierra TODO.
            if (excepto_actual !== 'true') {
                await dbTurso.execute({
                    sql: `UPDATE refresh_tokens
                          SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'sesiones_masivas'
                          WHERE usuario_id = ? AND revocado = 0`,
                    args: [usuarioId]
                });
            }

            await registrarAuditoria(dbTurso, {
                evento: 'sesiones_masivas_cerradas', usuario_id: Number(usuarioId),
                ip: req.ip || '', user_agent: req.headers['user-agent'] || '',
                exitoso: 1, severidad: 'warning',
                detalles: { sesiones_cerradas, excepto_actual: excepto_actual === 'true', cerrado_por: req.usuario.id }
            });

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
    },

    /**
     * Cambiar contraseña — POST /api/v2/auth/cambiar-contrasena
     * Requiere: authMiddleware
     * Body: { contraseña_actual, contraseña_nueva, confirmar_contraseña_nueva }
     * Efectos de seguridad:
     *   - Cierra todas las demás sesiones activas
     *   - Revoca todos los refresh tokens del usuario
     *   - Guarda la nueva clave en historial_passwords
     */
    cambiarContraseña: async (req, res) => {
        try {
            const { contraseña_actual, contraseña_nueva } = req.body;
            const usuarioId = req.usuario.id;
            const ip        = req.ip || req.connection?.remoteAddress || '';
            const userAgent = req.headers['user-agent'] || '';

            // ── 1. Obtener usuario ─────────────────────────────────────────────────
            const userResult = await dbTurso.execute({
                sql: `SELECT id, contraseña, nombre FROM usuarios WHERE id = ?`,
                args: [usuarioId]
            });

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: "Usuario no encontrado" });
            }

            const user = userResult.rows[0];

            // ── 2. Verificar contraseña actual ─────────────────────────────────────
            const passwordValida = await bcrypt.compare(contraseña_actual, user.contraseña);
            if (!passwordValida) {
                await registrarAuditoria(dbTurso, {
                    evento: 'cambio_password_fallido', usuario_id: usuarioId,
                    ip, user_agent: userAgent, exitoso: 0, severidad: 'warning',
                    detalles: { razon: 'contraseña_actual_incorrecta' }
                });
                return res.status(401).json({ error: "Contraseña actual incorrecta" });
            }

            // ── 3. Cambiar contraseña y revocar credenciales derivadas ─────────────
            const tokenActual = req.usuario.token;
            await aplicarCambioPassword(dbTurso, usuarioId, contraseña_nueva, {
                tokenActual,
                cerrarTodasSesiones: false,
                razonRevocacion: 'password_changed'
            });

            // ── 4. Auditoría ───────────────────────────────────────────────────────
            await registrarAuditoria(dbTurso, {
                evento: 'password_cambiado', usuario_id: usuarioId, ip,
                user_agent: userAgent, exitoso: 1, severidad: 'warning',
                detalles: { sesiones_invalidadas: 'todas_excepto_actual' }
            });

            try {
                await sendPasswordChangedEmail({
                    to: user.correo,
                    name: user.nombre || user.username || 'usuario',
                    context: 'cambio de contraseña autenticado'
                });
            } catch (mailError) {
                console.warn('[cambiarContraseña] No se pudo enviar correo de confirmación:', mailError.message);
            }

            res.json({
                success: true,
                mensaje: "Contraseña cambiada exitosamente. Las demás sesiones han sido cerradas.",
                requiere_relogin: true // el refresh token fue revocado; al expirar el access, deberá re-iniciar sesión
            });

        } catch (error) {
            console.error('Error al cambiar contraseña:', error);
            res.status(500).json({ error: "Error al cambiar contraseña" });
        }
    },

    solicitarRecuperacion: async (req, res) => {
        try {
            const { correo } = req.body;
            const ip = req.ip || req.connection?.remoteAddress || '';
            const userAgent = req.headers['user-agent'] || '';

            const normalizedCorreo = String(correo || '').trim().toLowerCase();
            const userResult = await dbTurso.execute({
                sql: `SELECT id, correo, nombre, username, estado_usuario FROM usuarios WHERE correo = ? LIMIT 1`,
                args: [normalizedCorreo]
            });

            const user = userResult.rows[0] || null;

            if (user && (!user.estado_usuario || user.estado_usuario === 'Activo')) {
                const rawToken = generarTokenRecuperacion();
                const tokenHash = hashTokenRecuperacion(rawToken);

                await dbTurso.execute({
                    sql: `UPDATE password_recovery_tokens
                          SET usado_en = datetime('now')
                          WHERE usuario_id = ? AND usado_en IS NULL`,
                    args: [user.id]
                });

                await dbTurso.execute({
                    sql: `INSERT INTO password_recovery_tokens
                          (usuario_id, token_hash, expira_en, requested_ip, user_agent)
                          VALUES (?, ?, datetime('now', '+15 minutes'), ?, ?)`,
                    args: [user.id, tokenHash, ip, userAgent]
                });

                try {
                    await sendPasswordRecoveryEmail({
                        to: user.correo,
                        name: user.nombre || user.username || 'usuario',
                        resetToken: rawToken
                    });
                } catch (mailError) {
                    console.warn('[solicitarRecuperacion] No se pudo enviar correo:', mailError.message);
                }

                await registrarAuditoria(dbTurso, {
                    evento: 'solicitud_recuperacion_password',
                    usuario_id: user.id,
                    ip,
                    user_agent: userAgent,
                    exitoso: 1,
                    severidad: 'info',
                    detalles: { metodo: 'email' }
                });
            } else {
                await registrarAuditoria(dbTurso, {
                    evento: 'solicitud_recuperacion_password',
                    usuario_id: null,
                    ip,
                    user_agent: userAgent,
                    exitoso: 0,
                    severidad: 'info',
                    detalles: { metodo: 'email', razon: 'correo_no_encontrado_o_inactivo' }
                });
            }

            return res.json({
                success: true,
                mensaje: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.'
            });
        } catch (error) {
            console.error('Error en solicitud de recuperación de contraseña:', error);
            return res.json({
                success: true,
                mensaje: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.'
            });
        }
    },

    recuperarContraseña: async (req, res) => {
        try {
            const { token, contraseña_nueva } = req.body;
            const ip = req.ip || req.connection?.remoteAddress || '';
            const userAgent = req.headers['user-agent'] || '';
            const tokenHash = hashTokenRecuperacion(token);

            const tokenResult = await dbTurso.execute({
                sql: `SELECT prt.id AS token_id, prt.usuario_id, u.correo, u.nombre, u.username
                      FROM password_recovery_tokens prt
                      INNER JOIN usuarios u ON u.id = prt.usuario_id
                      WHERE prt.token_hash = ?
                        AND prt.usado_en IS NULL
                        AND datetime(prt.expira_en) > datetime('now')
                      LIMIT 1`,
                args: [tokenHash]
            });

            const tokenRow = tokenResult.rows[0];
            if (!tokenRow) {
                await registrarAuditoria(dbTurso, {
                    evento: 'recuperacion_password_fallida',
                    usuario_id: null,
                    ip,
                    user_agent: userAgent,
                    exitoso: 0,
                    severidad: 'warning',
                    detalles: { razon: 'token_invalido_o_expirado' }
                });

                return res.status(400).json({
                    error: 'Token de recuperación inválido o expirado',
                    message: 'Token de recuperación inválido o expirado'
                });
            }

            const updateTokenResult = await dbTurso.execute({
                sql: `UPDATE password_recovery_tokens
                      SET usado_en = datetime('now')
                      WHERE id = ? AND usado_en IS NULL`,
                args: [tokenRow.token_id]
            });

            if (!updateTokenResult.rowsAffected) {
                return res.status(400).json({
                    error: 'Token de recuperación inválido o expirado',
                    message: 'Token de recuperación inválido o expirado'
                });
            }

            await aplicarCambioPassword(dbTurso, tokenRow.usuario_id, contraseña_nueva, {
                cerrarTodasSesiones: true,
                razonRevocacion: 'password_reset'
            });

            await registrarAuditoria(dbTurso, {
                evento: 'recuperacion_password_exitosa',
                usuario_id: tokenRow.usuario_id,
                ip,
                user_agent: userAgent,
                exitoso: 1,
                severidad: 'warning',
                detalles: { metodo: 'token_email' }
            });

            try {
                await sendPasswordChangedEmail({
                    to: tokenRow.correo,
                    name: tokenRow.nombre || tokenRow.username || 'usuario',
                    context: 'recuperación por correo'
                });
            } catch (mailError) {
                console.warn('[recuperarContraseña] No se pudo enviar correo de confirmación:', mailError.message);
            }

            return res.json({
                success: true,
                mensaje: 'Contraseña restablecida correctamente. Se cerraron las demás sesiones.',
                requiere_relogin: true
            });
        } catch (error) {
            console.error('Error al recuperar contraseña:', error);
            return res.status(500).json({ error: 'Error al recuperar contraseña' });
        }
    },

    /**
     * GET /api/v2/auth/me — Datos del usuario autenticado actualmente
     * Requiere: authMiddleware
     */
    me: async (req, res) => {
        try {
            const result = await dbTurso.execute({
                sql: `SELECT id, correo, nombre, username, rol,
                             fecha_creacion, ultimo_acceso,
                             requiere_cambio_password, ultimo_cambio_password
                      FROM usuarios WHERE id = ?`,
                args: [req.usuario.id]
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Usuario no encontrado" });
            }

            const u = result.rows[0];
            res.json({
                success: true,
                user: {
                    id:                       u.id,
                    email:                    u.correo,
                    nombre:                   u.nombre,
                    username:                 u.username,
                    rol:                      u.rol,
                    fecha_creacion:           u.fecha_creacion,
                    ultimo_acceso:            u.ultimo_acceso,
                    requiere_cambio_password: !!u.requiere_cambio_password,
                    ultimo_cambio_password:   u.ultimo_cambio_password
                }
            });
        } catch (error) {
            console.error('Error en /me:', error);
            res.status(500).json({ error: "Error al obtener datos del usuario" });
        }
    }
};

export default authController;
