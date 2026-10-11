import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dbTurso from '../../database/db-sqlite.js';
import { generateTokenPair } from '../../utils/generateToken.js';
import { validatePassword, formatValidationErrors } from '../../utils/passwordValidator.js';
import { sendPasswordRecoveryEmail, sendPasswordChangedEmail } from './emailService.js';

// ── Private helpers ────────────────────────────────────────────────────────────

async function registrarAuditoria({ evento, usuario_id = null, app_id = null, ip = '', dispositivo = '', user_agent = '', exitoso = 1, detalles = {}, severidad = 'info' }) {
    try {
        await dbTurso.execute({
            sql: `INSERT INTO auditoria_seguridad (evento, usuario_id, app_id, ip, dispositivo, user_agent, exitoso, detalles, severidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [evento, usuario_id, app_id, ip, dispositivo, user_agent, exitoso ? 1 : 0, JSON.stringify(detalles), severidad]
        });
    } catch (err) {
        console.warn('[Auditoría] No se pudo registrar evento:', evento, '-', err.message);
    }
}

function resolverInfoDispositivo(dispositivo, dispositivoInfo, userAgent) {
    if (dispositivoInfo && typeof dispositivoInfo === 'object') {
        return {
            nombre: dispositivoInfo.hostname || dispositivoInfo.nombre || dispositivo || 'unknown',
            os: dispositivoInfo.os || '',
            os_version: dispositivoInfo.os_version || '',
            arch: dispositivoInfo.arch || '',
            plataforma: dispositivoInfo.plataforma || 'electron',
            electron_version: dispositivoInfo.electron_version || '',
            app_version: dispositivoInfo.app_version || '',
            pantalla: dispositivoInfo.pantalla || ''
        };
    }
    return { nombre: dispositivo || userAgent?.slice(0, 80) || 'unknown', os: '', os_version: '', arch: '', plataforma: 'electron', electron_version: '', app_version: '', pantalla: '' };
}

function generarTokenRecuperacion() {
    return crypto.randomBytes(32).toString('hex');
}

function hashTokenRecuperacion(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function registrarHistorialPassword(usuarioId, passwordHash) {
    try {
        await dbTurso.execute({ sql: `INSERT INTO historial_passwords (usuario_id, password_hash) VALUES (?, ?)`, args: [usuarioId, passwordHash] });
    } catch (err) {
        console.warn('[password] No se pudo guardar historial_passwords:', err.message);
    }
}

async function revocarCredencialesPassword(usuarioId, { tokenActual = null, cerrarTodasSesiones = false, razonRevocacion = 'password_changed' } = {}) {
    if (cerrarTodasSesiones) {
        await dbTurso.execute({ sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE usuario_id = ? AND activo = 1`, args: [usuarioId] });
    } else if (tokenActual) {
        await dbTurso.execute({ sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE usuario_id = ? AND activo = 1 AND token != ?`, args: [usuarioId, tokenActual] });
    }
    await dbTurso.execute({ sql: `UPDATE refresh_tokens SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = ? WHERE usuario_id = ? AND revocado = 0`, args: [razonRevocacion, usuarioId] });
}

async function aplicarCambioPassword(usuarioId, nuevaContrasena, options = {}) {
    const { tokenActual = null, cerrarTodasSesiones = false, razonRevocacion = 'password_changed' } = options;
    const nuevoHash = await bcrypt.hash(nuevaContrasena, 12);
    await dbTurso.execute({ sql: `UPDATE usuarios SET contraseña = ?, ultimo_cambio_password = datetime('now'), requiere_cambio_password = 0 WHERE id = ?`, args: [nuevoHash, usuarioId] });
    await registrarHistorialPassword(usuarioId, nuevoHash);
    await revocarCredencialesPassword(usuarioId, { tokenActual, cerrarTodasSesiones, razonRevocacion });
    return nuevoHash;
}

// ── Public service functions ───────────────────────────────────────────────────

export async function login(correo, contraseña, { dispositivo, dispositivo_info, ip = '', userAgent = '' } = {}) {
    const result = await dbTurso.execute({ sql: `SELECT * FROM usuarios WHERE correo = ?`, args: [correo] });
    if (!result.rows.length) throw Object.assign(new Error('Credenciales incorrectas'), { status: 401 });

    const user = result.rows[0];

    if (user.bloqueado_hasta) {
        const bloqueadoHasta = new Date(user.bloqueado_hasta);
        if (bloqueadoHasta > new Date()) {
            const minutos = Math.ceil((bloqueadoHasta - new Date()) / 60000);
            await registrarAuditoria({ evento: 'login_bloqueado', usuario_id: user.id, ip, dispositivo: dispositivo || 'unknown', user_agent: userAgent, exitoso: 0, severidad: 'warning', detalles: { razon: 'cuenta_bloqueada', bloqueado_hasta: user.bloqueado_hasta } });
            throw Object.assign(new Error('Cuenta bloqueada temporalmente'), { status: 423, mensaje: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto(s).`, bloqueado_hasta: user.bloqueado_hasta });
        }
    }

    if (user.estado_usuario && user.estado_usuario !== 'Activo') {
        throw Object.assign(new Error('Cuenta desactivada'), { status: 403, mensaje: `Tu cuenta está en estado: ${user.estado_usuario}. Contacta al administrador.` });
    }

    const validPassword = await bcrypt.compare(contraseña, user.contraseña);
    if (!validPassword) {
        const MAX_INTENTOS = 5;
        const nuevosIntentos = (user.intentos_fallidos || 0) + 1;
        if (nuevosIntentos >= MAX_INTENTOS) {
            await dbTurso.execute({ sql: `UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = datetime('now', '+30 minutes') WHERE id = ?`, args: [nuevosIntentos, user.id] });
            await registrarAuditoria({ evento: 'cuenta_bloqueada', usuario_id: user.id, ip, dispositivo: dispositivo || 'unknown', user_agent: userAgent, exitoso: 0, severidad: 'warning', detalles: { intentos: nuevosIntentos, razon: 'max_intentos_alcanzado' } });
            throw Object.assign(new Error('Cuenta bloqueada'), { status: 423, mensaje: 'Demasiados intentos fallidos. Cuenta bloqueada por 30 minutos.' });
        }
        await dbTurso.execute({ sql: `UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?`, args: [nuevosIntentos, user.id] });
        await registrarAuditoria({ evento: 'login_fallido', usuario_id: user.id, ip, dispositivo: dispositivo || 'unknown', user_agent: userAgent, exitoso: 0, severidad: 'info', detalles: { intentos_fallidos: nuevosIntentos, intentos_restantes: MAX_INTENTOS - nuevosIntentos } });
        throw Object.assign(new Error('Credenciales incorrectas'), { status: 401, intentos_restantes: MAX_INTENTOS - nuevosIntentos });
    }

    await dbTurso.execute({ sql: `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = datetime('now') WHERE id = ?`, args: [user.id] });

    const infoDispositivo = resolverInfoDispositivo(dispositivo, dispositivo_info, userAgent);
    const { accessToken, refreshToken, refreshExpiresAt } = generateTokenPair(user, 'user');
    const sesionExpiraEn = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await dbTurso.execute({ sql: `INSERT INTO sesiones (usuario_id, token, direccion_ip, dispositivo, user_agent, expira_en, tipo_sesion, ultimo_uso) VALUES (?, ?, ?, ?, ?, ?, 'electron', datetime('now'))`, args: [user.id, accessToken, ip, infoDispositivo.nombre, userAgent, sesionExpiraEn] });
    await dbTurso.execute({ sql: `INSERT INTO refresh_tokens (token, usuario_id, expira_en, user_agent, ip) VALUES (?, ?, ?, ?, ?)`, args: [refreshToken, user.id, refreshExpiresAt, userAgent, ip] });
    await registrarAuditoria({ evento: 'login_exitoso', usuario_id: user.id, ip, dispositivo: infoDispositivo.nombre, user_agent: userAgent, exitoso: 1, severidad: 'info', detalles: { os: infoDispositivo.os, os_version: infoDispositivo.os_version, arch: infoDispositivo.arch, plataforma: infoDispositivo.plataforma, electron_version: infoDispositivo.electron_version, app_version: infoDispositivo.app_version, pantalla: infoDispositivo.pantalla } });

    return { user, infoDispositivo, accessToken, refreshToken };
}

export async function registrar(correo, nombre, contrasena, username, rol, { ip = '', userAgent = '', creadorId, creadorRol } = {}) {
    const validation = validatePassword(contrasena);
    if (!validation.valid) throw Object.assign(new Error('Contraseña no válida'), { status: 400, detalles: validation.errors, mensaje: formatValidationErrors(validation.errors) });

    const existingResult = await dbTurso.execute({ sql: `SELECT id FROM usuarios WHERE correo = ? OR username = ?`, args: [correo, username] });
    if (existingResult.rows.length) throw Object.assign(new Error('Correo o username ya existe'), { status: 409 });

    const hashedPassword = await bcrypt.hash(contrasena, 10);
    const insertResult = await dbTurso.execute({ sql: `INSERT INTO usuarios (correo, nombre, contraseña, username, rol) VALUES (?, ?, ?, ?, ?)`, args: [correo, nombre, hashedPassword, username, rol] });
    const nuevoUsuarioId = Number(insertResult.lastInsertRowid);

    await registrarAuditoria({ evento: 'usuario_creado', usuario_id: creadorId, ip, user_agent: userAgent, exitoso: 1, severidad: 'info', detalles: { nuevo_usuario_id: nuevoUsuarioId, nuevo_rol: rol, creador_rol: creadorRol } });

    return { id: nuevoUsuarioId, correo, nombre, username, rol, fecha_creacion: new Date().toISOString() };
}

export async function logout(token, usuarioId, { ip = '', userAgent = '' } = {}) {
    const result = await dbTurso.execute({ sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE token = ? AND activo = 1`, args: [token] });
    if (result.rowsAffected === 0) throw Object.assign(new Error('Sesión no encontrada o ya cerrada'), { status: 404 });

    try {
        await dbTurso.execute({ sql: `INSERT OR IGNORE INTO tokens_revocados (token, tipo, usuario_id, razon) VALUES (?, 'access', ?, 'logout')`, args: [token, usuarioId] });
    } catch (e) {
        console.warn('[logout] tokens_revocados insert failed:', e.message);
    }

    await dbTurso.execute({ sql: `UPDATE refresh_tokens SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'logout' WHERE usuario_id = ? AND revocado = 0`, args: [usuarioId] });
    await registrarAuditoria({ evento: 'logout', usuario_id: usuarioId, ip, user_agent: userAgent, exitoso: 1, severidad: 'info', detalles: { accion: 'logout_manual' } });
}

export async function getSesionesActivas(usuarioId, { requesterId, currentToken } = {}) {
    const rolResult = await dbTurso.execute({ sql: `SELECT rol FROM usuarios WHERE id = ?`, args: [requesterId] });
    const rolUsuario = rolResult.rows[0]?.rol;

    if (Number(usuarioId) !== Number(requesterId) && !['superadmin', 'administrador'].includes(rolUsuario)) {
        throw Object.assign(new Error('Solo puedes consultar tus propias sesiones, o ser administrador.'), { status: 403 });
    }

    const result = await dbTurso.execute({ sql: `SELECT id, usuario_id, direccion_ip, dispositivo, user_agent, fecha_inicio, ultimo_uso, expira_en, ubicacion, token FROM sesiones WHERE usuario_id = ? AND activo = 1 ORDER BY fecha_inicio DESC`, args: [usuarioId] });
    const sesiones = result.rows.map(row => ({ id: row.id, usuario_id: row.usuario_id, direccion_ip: row.direccion_ip, dispositivo: row.dispositivo, user_agent: row.user_agent, fecha_inicio: row.fecha_inicio, ultimo_uso: row.ultimo_uso, expira_en: row.expira_en, ubicacion: row.ubicacion, actual: row.token === currentToken }));

    return { sesiones, total: sesiones.length };
}

export async function refreshTokens(refreshToken, { ip = '', userAgent = '' } = {}) {
    const result = await dbTurso.execute({
        sql: `SELECT rt.id AS rt_id, rt.ip AS rt_ip, u.id AS usuario_id, u.correo, u.nombre, u.username, u.rol, u.fecha_creacion, u.estado_usuario FROM refresh_tokens rt JOIN usuarios u ON rt.usuario_id = u.id WHERE rt.token = ? AND rt.revocado = 0 AND datetime(rt.expira_en) > datetime('now')`,
        args: [refreshToken]
    });
    if (!result.rows.length) throw Object.assign(new Error('Refresh token inválido o expirado'), { status: 401, code: 'INVALID_REFRESH_TOKEN' });

    const tokenData = result.rows[0];
    if (tokenData.estado_usuario && tokenData.estado_usuario !== 'Activo') {
        throw Object.assign(new Error('Cuenta desactivada'), { status: 403, code: 'ACCOUNT_DISABLED' });
    }

    const user = { id: tokenData.usuario_id, correo: tokenData.correo, nombre: tokenData.nombre, username: tokenData.username, rol: tokenData.rol, fecha_creacion: tokenData.fecha_creacion };

    await dbTurso.execute({ sql: `UPDATE refresh_tokens SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'rotation' WHERE id = ?`, args: [tokenData.rt_id] });

    const { accessToken: newAccessToken, refreshToken: newRefreshToken, refreshExpiresAt: newRefreshExpiresAt } = generateTokenPair(user, 'user');
    const sesionExpiraEn = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await dbTurso.execute({ sql: `UPDATE sesiones SET token = ?, ultimo_uso = datetime('now'), expira_en = ? WHERE usuario_id = ? AND activo = 1 AND id = (SELECT id FROM sesiones WHERE usuario_id = ? AND activo = 1 ORDER BY fecha_inicio DESC LIMIT 1)`, args: [newAccessToken, sesionExpiraEn, user.id, user.id] });
    await dbTurso.execute({ sql: `INSERT INTO refresh_tokens (token, usuario_id, expira_en, user_agent, ip) VALUES (?, ?, ?, ?, ?)`, args: [newRefreshToken, user.id, newRefreshExpiresAt, userAgent, ip] });
    await registrarAuditoria({ evento: 'token_renovado', usuario_id: user.id, ip, dispositivo: tokenData.rt_ip || ip, user_agent: userAgent, exitoso: 1, severidad: 'info', detalles: { accion: 'refresh_rotation' } });

    return { user, newAccessToken, newRefreshToken };
}

export async function revocarRefreshToken(refreshToken, usuarioId) {
    const result = await dbTurso.execute({ sql: `SELECT usuario_id FROM refresh_tokens WHERE token = ? AND revocado = 0`, args: [refreshToken] });
    if (!result.rows.length) throw Object.assign(new Error('Refresh token no encontrado'), { status: 404 });
    if (Number(result.rows[0].usuario_id) !== Number(usuarioId)) throw Object.assign(new Error('No autorizado para revocar este token'), { status: 403 });
    await dbTurso.execute({ sql: `UPDATE refresh_tokens SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'Revocación manual por usuario' WHERE token = ?`, args: [refreshToken] });
}

export async function cerrarSesion(sesionId, { requesterId } = {}) {
    const sesionResult = await dbTurso.execute({ sql: `SELECT usuario_id FROM sesiones WHERE id = ? AND activo = 1`, args: [sesionId] });
    if (!sesionResult.rows.length) throw Object.assign(new Error('Sesión no encontrada o ya cerrada'), { status: 404 });

    const sesionUsuarioId = sesionResult.rows[0].usuario_id;
    const rolResult = await dbTurso.execute({ sql: `SELECT rol FROM usuarios WHERE id = ?`, args: [requesterId] });
    const rolUsuario = rolResult.rows[0]?.rol;

    if (sesionUsuarioId !== requesterId && !['superadmin', 'administrador'].includes(rolUsuario)) {
        throw Object.assign(new Error('Solo puedes cerrar tus propias sesiones, o ser administrador/superadmin'), { status: 403 });
    }

    const result = await dbTurso.execute({ sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE id = ? AND activo = 1`, args: [sesionId] });
    if (result.rowsAffected === 0) throw Object.assign(new Error('Sesión no encontrada o ya cerrada'), { status: 404 });

    await registrarAuditoria({ evento: 'sesion_cerrada_por_id', usuario_id: sesionUsuarioId, ip: '', user_agent: '', exitoso: 1, severidad: 'info', detalles: { sesion_id: sesionId, cerrado_por: requesterId } });
}

export async function cerrarTodasSesiones(usuarioId, { requesterId, tokenActual, exceptoActual = false } = {}) {
    const rolResult = await dbTurso.execute({ sql: `SELECT rol FROM usuarios WHERE id = ?`, args: [requesterId] });
    const rolUsuario = rolResult.rows[0]?.rol;

    if (Number(usuarioId) !== requesterId && !['superadmin', 'administrador'].includes(rolUsuario)) {
        throw Object.assign(new Error('Solo puedes cerrar tus propias sesiones, o ser administrador/superadmin'), { status: 403 });
    }

    let result;
    if (exceptoActual) {
        result = await dbTurso.execute({ sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE usuario_id = ? AND activo = 1 AND token != ?`, args: [usuarioId, tokenActual] });
    } else {
        result = await dbTurso.execute({ sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE usuario_id = ? AND activo = 1`, args: [usuarioId] });
        await dbTurso.execute({ sql: `UPDATE refresh_tokens SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'sesiones_masivas' WHERE usuario_id = ? AND revocado = 0`, args: [usuarioId] });
    }

    const sesiones_cerradas = Number(result.rowsAffected) || 0;
    await registrarAuditoria({ evento: 'sesiones_masivas_cerradas', usuario_id: Number(usuarioId), ip: '', user_agent: '', exitoso: 1, severidad: 'warning', detalles: { sesiones_cerradas, excepto_actual: exceptoActual, cerrado_por: requesterId } });

    return { sesiones_cerradas };
}

export async function cambiarContraseña(usuarioId, contraseña_actual, contraseña_nueva, { tokenActual, ip = '', userAgent = '' } = {}) {
    const userResult = await dbTurso.execute({ sql: `SELECT id, contraseña, nombre, correo FROM usuarios WHERE id = ?`, args: [usuarioId] });
    if (!userResult.rows.length) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
    const user = userResult.rows[0];

    const passwordValida = await bcrypt.compare(contraseña_actual, user.contraseña);
    if (!passwordValida) {
        await registrarAuditoria({ evento: 'cambio_password_fallido', usuario_id: usuarioId, ip, user_agent: userAgent, exitoso: 0, severidad: 'warning', detalles: { razon: 'contraseña_actual_incorrecta' } });
        throw Object.assign(new Error('Contraseña actual incorrecta'), { status: 401 });
    }

    await aplicarCambioPassword(usuarioId, contraseña_nueva, { tokenActual, cerrarTodasSesiones: false, razonRevocacion: 'password_changed' });
    await registrarAuditoria({ evento: 'password_cambiado', usuario_id: usuarioId, ip, user_agent: userAgent, exitoso: 1, severidad: 'warning', detalles: { sesiones_invalidadas: 'todas_excepto_actual' } });

    try {
        await sendPasswordChangedEmail({ to: user.correo, name: user.nombre || user.username || 'usuario', context: 'cambio de contraseña autenticado' });
    } catch (mailError) {
        console.warn('[cambiarContraseña] No se pudo enviar correo de confirmación:', mailError.message);
    }
}

export async function solicitarRecuperacion(correo, { ip = '', userAgent = '' } = {}) {
    const normalizedCorreo = String(correo || '').trim().toLowerCase();
    const userResult = await dbTurso.execute({ sql: `SELECT id, correo, nombre, username, estado_usuario FROM usuarios WHERE correo = ? LIMIT 1`, args: [normalizedCorreo] });
    const user = userResult.rows[0] || null;

    if (user && (!user.estado_usuario || user.estado_usuario === 'Activo')) {
        const rawToken = generarTokenRecuperacion();
        const tokenHash = hashTokenRecuperacion(rawToken);

        await dbTurso.execute({ sql: `UPDATE password_recovery_tokens SET usado_en = datetime('now') WHERE usuario_id = ? AND usado_en IS NULL`, args: [user.id] });
        await dbTurso.execute({ sql: `INSERT INTO password_recovery_tokens (usuario_id, token_hash, expira_en, requested_ip, user_agent) VALUES (?, ?, datetime('now', '+15 minutes'), ?, ?)`, args: [user.id, tokenHash, ip, userAgent] });

        try {
            await sendPasswordRecoveryEmail({ to: user.correo, name: user.nombre || user.username || 'usuario', resetToken: rawToken });
        } catch (mailError) {
            console.warn('[solicitarRecuperacion] No se pudo enviar correo:', mailError.message);
        }

        await registrarAuditoria({ evento: 'solicitud_recuperacion_password', usuario_id: user.id, ip, user_agent: userAgent, exitoso: 1, severidad: 'info', detalles: { metodo: 'email' } });
    } else {
        await registrarAuditoria({ evento: 'solicitud_recuperacion_password', usuario_id: null, ip, user_agent: userAgent, exitoso: 0, severidad: 'info', detalles: { metodo: 'email', razon: 'correo_no_encontrado_o_inactivo' } });
    }
}

export async function recuperarContraseña(token, contraseña_nueva, { ip = '', userAgent = '' } = {}) {
    const tokenHash = hashTokenRecuperacion(token);

    const tokenResult = await dbTurso.execute({
        sql: `SELECT prt.id AS token_id, prt.usuario_id, u.correo, u.nombre, u.username FROM password_recovery_tokens prt INNER JOIN usuarios u ON u.id = prt.usuario_id WHERE prt.token_hash = ? AND prt.usado_en IS NULL AND datetime(prt.expira_en) > datetime('now') LIMIT 1`,
        args: [tokenHash]
    });

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
        await registrarAuditoria({ evento: 'recuperacion_password_fallida', usuario_id: null, ip, user_agent: userAgent, exitoso: 0, severidad: 'warning', detalles: { razon: 'token_invalido_o_expirado' } });
        throw Object.assign(new Error('Token de recuperación inválido o expirado'), { status: 400 });
    }

    const updateTokenResult = await dbTurso.execute({ sql: `UPDATE password_recovery_tokens SET usado_en = datetime('now') WHERE id = ? AND usado_en IS NULL`, args: [tokenRow.token_id] });
    if (!updateTokenResult.rowsAffected) throw Object.assign(new Error('Token de recuperación inválido o expirado'), { status: 400 });

    await aplicarCambioPassword(tokenRow.usuario_id, contraseña_nueva, { cerrarTodasSesiones: true, razonRevocacion: 'password_reset' });
    await registrarAuditoria({ evento: 'recuperacion_password_exitosa', usuario_id: tokenRow.usuario_id, ip, user_agent: userAgent, exitoso: 1, severidad: 'warning', detalles: { metodo: 'token_email' } });

    try {
        await sendPasswordChangedEmail({ to: tokenRow.correo, name: tokenRow.nombre || tokenRow.username || 'usuario', context: 'recuperación por correo' });
    } catch (mailError) {
        console.warn('[recuperarContraseña] No se pudo enviar correo de confirmación:', mailError.message);
    }
}

export async function getMe(usuarioId) {
    const result = await dbTurso.execute({ sql: `SELECT id, correo, nombre, username, rol, fecha_creacion, ultimo_acceso, requiere_cambio_password, ultimo_cambio_password FROM usuarios WHERE id = ?`, args: [usuarioId] });
    if (!result.rows.length) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
    const u = result.rows[0];
    return { id: u.id, email: u.correo, nombre: u.nombre, username: u.username, rol: u.rol, fecha_creacion: u.fecha_creacion, ultimo_acceso: u.ultimo_acceso, requiere_cambio_password: !!u.requiere_cambio_password, ultimo_cambio_password: u.ultimo_cambio_password };
}
