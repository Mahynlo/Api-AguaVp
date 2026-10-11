import { login, registrar, logout, getSesionesActivas, refreshTokens, revocarRefreshToken, cerrarSesion, cerrarTodasSesiones, cambiarContraseña, solicitarRecuperacion, recuperarContraseña, getMe } from '../services/authService.js';

let sseManager = null;
let notificationManager = null;

export function setSSEManagers(sse, notification) {
    sseManager = sse;
    notificationManager = notification;
}

const notify = (msg, tipo, data) => {
    if (!notificationManager) return;
    try { notificationManager.alertaSistema(msg, tipo, data); } catch (e) { console.warn('SSE error:', e); }
};

const ROLES_PERMITIDOS = ['superadmin', 'administrador', 'operador'];
const ROLES_QUE_PUEDE_CREAR = {
    superadmin: ['superadmin', 'administrador', 'operador'],
    administrador: ['administrador', 'operador'],
    operador: []
};

const authController = {

    login: async (req, res) => {
        const { correo, contraseña, dispositivo, dispositivo_info } = req.body;
        if (!correo || !contraseña) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
        try {
            const { user, infoDispositivo, accessToken, refreshToken } = await login(correo, contraseña, { dispositivo, dispositivo_info, ip: req.ip || req.connection?.remoteAddress || '', userAgent: req.headers['user-agent'] || '' });
            notify(`Usuario ${user.nombre} inició sesión`, 'info', { usuario_id: user.id, accion: 'login', ip: req.ip, dispositivo: infoDispositivo.nombre });
            res.json({ success: true, mensaje: 'Inicio de sesión exitoso', accessToken, refreshToken, expiresIn: '15m', refreshExpiresIn: '7d', requiere_cambio_password: !!user.requiere_cambio_password, user: { id: user.id, email: user.correo, nombre: user.nombre, username: user.username, rol: user.rol, requiere_cambio_password: !!user.requiere_cambio_password } });
        } catch (err) {
            console.error('Error en login v2:', err);
            const body = { error: err.message || 'Error en el servidor' };
            if (err.mensaje) body.mensaje = err.mensaje;
            if (err.bloqueado_hasta) body.bloqueado_hasta = err.bloqueado_hasta;
            if (err.intentos_restantes !== undefined) body.intentos_restantes = err.intentos_restantes;
            res.status(err.status || 500).json(body);
        }
    },

    registrar: async (req, res) => {
        const { correo, nombre, contrasena, username, rol } = req.body;
        if (!correo || !contrasena || !username || !rol) return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        if (!req.usuario) return res.status(401).json({ error: 'No autenticado. Debes iniciar sesión para registrar usuarios.' });

        const rolNormalizado = rol.toLowerCase().trim();
        if (!ROLES_PERMITIDOS.includes(rolNormalizado)) return res.status(400).json({ error: 'Rol no válido', rolesPermitidos: ROLES_PERMITIDOS, rolRecibido: rol });

        const rolesPermitidosAlUsuario = ROLES_QUE_PUEDE_CREAR[req.usuario.rol] || [];
        if (!rolesPermitidosAlUsuario.includes(rolNormalizado)) {
            return res.status(403).json({ error: 'Permisos insuficientes', mensaje: `Tu rol (${req.usuario.rol}) no tiene permisos para registrar un usuario con rol ${rolNormalizado}.`, rolesQueCanCrear: rolesPermitidosAlUsuario });
        }

        try {
            const usuarioCreado = await registrar(correo, nombre, contrasena, username, rolNormalizado, { ip: req.ip || req.connection?.remoteAddress || '', userAgent: req.headers['user-agent'] || '', creadorId: req.usuario.id, creadorRol: req.usuario.rol });
            notify(`Nuevo usuario registrado: ${nombre} (${username}) - Rol: ${rolNormalizado}`, 'success', { usuario: usuarioCreado, accion: 'registro', creado_por: req.usuario.id });
            res.status(201).json({ mensaje: 'Usuario registrado con éxito', usuario: usuarioCreado });
        } catch (err) {
            if (err.message?.includes('UNIQUE') || err.status === 409) return res.status(409).json({ error: 'Correo o username ya existe' });
            if (err.detalles) return res.status(400).json({ error: err.message, detalles: err.detalles, mensaje: err.mensaje });
            console.error('Error al registrar usuario v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al registrar usuario' });
        }
    },

    logout: async (req, res) => {
        try {
            await logout(req.usuario.token, req.usuario.id, { ip: req.ip || req.connection?.remoteAddress || '', userAgent: req.headers['user-agent'] || '' });
            notify(`Usuario ${req.usuario.id} cerró sesión`, 'info', { usuario_id: req.usuario.id, accion: 'logout' });
            res.status(200).json({ success: true, mensaje: 'Sesión cerrada con éxito' });
        } catch (err) {
            console.error('Error al cerrar sesión v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al cerrar sesión' });
        }
    },

    sesionesActivas: async (req, res) => {
        const { usuarioId } = req.params;
        if (!usuarioId) return res.status(400).json({ error: 'ID de usuario requerido' });
        try {
            const authHeader = req.headers['authorization'];
            const currentToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
            const { sesiones, total } = await getSesionesActivas(usuarioId, { requesterId: req.usuario.id, currentToken });
            if (!sesiones.length) return res.json({ success: true, usuario_id: usuarioId, sesiones_activas: [], total: 0 });
            notify(`Consulta de sesiones activas para usuario ${usuarioId}`, 'info', { usuario_id: usuarioId, sesiones_encontradas: total, accion: 'consulta_sesiones' });
            res.json({ usuario_id: usuarioId, sesiones_activas: sesiones, total });
        } catch (err) {
            console.error('Error al obtener sesiones activas v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al obtener sesiones activas' });
        }
    },

    refresh: async (req, res) => {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' });
        try {
            const { user, newAccessToken, newRefreshToken } = await refreshTokens(refreshToken, { ip: req.ip || req.connection?.remoteAddress || '', userAgent: req.headers['user-agent'] || '' });
            notify(`Token renovado para ${user.nombre}`, 'info', { usuario_id: user.id, accion: 'refresh_rotation' });
            res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: '15m', refreshExpiresIn: '7d', user: { id: user.id, email: user.correo, nombre: user.nombre, username: user.username, rol: user.rol } });
        } catch (err) {
            console.error('Error en refresh token v2:', err);
            const body = { error: err.message || 'Error al renovar token' };
            if (err.code) body.code = err.code;
            res.status(err.status || 500).json(body);
        }
    },

    revokeRefreshToken: async (req, res) => {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' });
        try {
            await revocarRefreshToken(refreshToken, req.usuario.id);
            res.json({ success: true, mensaje: 'Refresh token revocado exitosamente' });
        } catch (err) {
            console.error('Error revocando refresh token v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al revocar token' });
        }
    },

    cerrarSesion: async (req, res) => {
        const { sesionId } = req.params;
        if (!sesionId) return res.status(400).json({ error: 'ID de sesión requerido' });
        try {
            await cerrarSesion(sesionId, { requesterId: req.usuario.id });
            res.json({ success: true, mensaje: 'Sesión cerrada exitosamente', sesion_id: sesionId });
        } catch (err) {
            console.error('Error cerrando sesión v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al cerrar sesión' });
        }
    },

    cerrarTodasSesiones: async (req, res) => {
        const { usuarioId } = req.params;
        if (!usuarioId) return res.status(400).json({ error: 'ID de usuario requerido' });
        const exceptoActual = req.query.excepto_actual === 'true';
        try {
            const { sesiones_cerradas } = await cerrarTodasSesiones(usuarioId, { requesterId: req.usuario.id, tokenActual: req.usuario.token, exceptoActual });
            res.json({ success: true, mensaje: `${sesiones_cerradas} sesión(es) cerrada(s) exitosamente`, sesiones_cerradas, usuario_id: usuarioId });
        } catch (err) {
            console.error('Error cerrando todas las sesiones v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al cerrar sesiones' });
        }
    },

    cambiarContraseña: async (req, res) => {
        const { contraseña_actual, contraseña_nueva } = req.body;
        try {
            await cambiarContraseña(req.usuario.id, contraseña_actual, contraseña_nueva, { tokenActual: req.usuario.token, ip: req.ip || req.connection?.remoteAddress || '', userAgent: req.headers['user-agent'] || '' });
            res.json({ success: true, mensaje: 'Contraseña cambiada exitosamente. Las demás sesiones han sido cerradas.', requiere_relogin: true });
        } catch (err) {
            console.error('Error al cambiar contraseña:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al cambiar contraseña' });
        }
    },

    solicitarRecuperacion: async (req, res) => {
        try {
            await solicitarRecuperacion(req.body.correo, { ip: req.ip || req.connection?.remoteAddress || '', userAgent: req.headers['user-agent'] || '' });
            return res.json({ success: true, mensaje: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.' });
        } catch {
            return res.json({ success: true, mensaje: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.' });
        }
    },

    recuperarContraseña: async (req, res) => {
        const { token, contraseña_nueva } = req.body;
        try {
            await recuperarContraseña(token, contraseña_nueva, { ip: req.ip || req.connection?.remoteAddress || '', userAgent: req.headers['user-agent'] || '' });
            return res.json({ success: true, mensaje: 'Contraseña restablecida correctamente. Se cerraron las demás sesiones.', requiere_relogin: true });
        } catch (err) {
            console.error('Error al recuperar contraseña:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al recuperar contraseña', message: err.message || 'Error al recuperar contraseña' });
        }
    },

    me: async (req, res) => {
        try {
            const user = await getMe(req.usuario.id);
            res.json({ success: true, user });
        } catch (err) {
            console.error('Error en /me:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al obtener datos del usuario' });
        }
    }
};

export default authController;
