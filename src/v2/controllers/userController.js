import { obtenerUsuarios, obtenerUsuarioPorId, obtenerRolUsuario, crearUsuario, actualizarUsuario, eliminarUsuario, activarUsuario, purgarUsuario } from '../services/userService.js';
import { buildUserPermissionsSnapshot, getPermissionCatalog, setUserPermissionOverrides } from '../services/permissionsService.js';
import { manejarErrores } from '../../utils/errores.js';

// Respuesta de error con mensaje fijo y status 500 (no expone el error interno)
const errorFijo = (mensaje, log) => ({ mensaje, log, exponerMensaje: false, statusDelError: false });

const userController = {

    obtenerCatalogoPermisos: manejarErrores(async (_req, res) => {
        res.json({ success: true, data: await getPermissionCatalog() });
    }, errorFijo('Error al obtener catálogo de permisos', 'Error al obtener catálogo de permisos:')),

    obtenerMisPermisos: manejarErrores(async (req, res) => {
        const actorId = Number(req.usuario?.id);
        const actorRole = req.usuario?.rol;
        if (!actorId || !actorRole) return res.status(401).json({ error: 'Usuario no autenticado' });
        const permisos = await buildUserPermissionsSnapshot(actorId, actorRole);
        res.json({ success: true, user_id: actorId, role: actorRole, permissions: permisos });
    }, errorFijo('Error al obtener permisos', 'Error al obtener permisos del usuario actual:')),

    obtenerPermisosUsuario: manejarErrores(async (req, res) => {
        const targetUserId = Number(req.params.id);
        const targetUser = await obtenerRolUsuario(targetUserId);
        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
        const permissions = await buildUserPermissionsSnapshot(targetUserId, targetUser.rol);
        res.json({ success: true, user_id: targetUserId, role: targetUser.rol, permissions });
    }, errorFijo('Error al obtener permisos del usuario', 'Error al obtener permisos del usuario:')),

    actualizarPermisosUsuario: manejarErrores(async (req, res) => {
        const targetUserId = Number(req.params.id);
        const actorId = Number(req.usuario?.id);
        const actorRole = req.usuario?.rol;
        const { overrides = [] } = req.body;
        const targetUser = await obtenerRolUsuario(targetUserId);
        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (actorRole === 'administrador' && targetUser.rol === 'superadmin') {
            return res.status(403).json({ error: 'No tienes permiso para modificar los permisos de un superadmin' });
        }

        await setUserPermissionOverrides({ userId: targetUserId, updatedBy: actorId, overrides });
        const updatedPermissions = await buildUserPermissionsSnapshot(targetUserId, targetUser.rol);
        res.json({ success: true, message: 'Permisos actualizados correctamente', user_id: targetUserId, permissions: updatedPermissions });
    }, errorFijo('Error al actualizar permisos del usuario', 'Error al actualizar permisos del usuario:')),

    obtenerUsuarios: manejarErrores(async (req, res) => {
        const actorRole = req.usuario?.rol;
        res.json(await obtenerUsuarios({ ...req.query, actorRole }));
    }, { mensaje: 'Error interno al obtener usuarios', log: 'Error al obtener usuarios:' }),

    obtenerUsuarioPorId: manejarErrores(async (req, res) => {
        const actorRole = req.usuario?.rol;
        const targetUser = await obtenerUsuarioPorId(req.params.id);
        if (actorRole === 'administrador' && targetUser.rol === 'superadmin') {
            return res.status(403).json({ error: 'No tienes permiso para ver a un superadmin' });
        }
        res.json(targetUser);
    }, { mensaje: 'Error interno', log: 'Error al obtener usuario:' }),

    // Se mantiene con try/catch propio: la validación de req.body ocurre fuera del try
    // y envolverla cambiaría la respuesta ante peticiones sin cuerpo JSON.
    crearUsuario: async (req, res) => {
        const { correo, contrasena, username, rol } = req.body;
        const actorRole = req.usuario?.rol;
        if (!correo || !contrasena || !username || !rol) {
            return res.status(400).json({ error: "Todos los campos obligatorios" });
        }
        if (actorRole === 'administrador' && rol === 'superadmin') {
            return res.status(403).json({ error: 'No tienes permiso para crear un superadmin' });
        }
        try {
            await crearUsuario(req.body);
            res.status(201).json({ success: true, mensaje: "Usuario creado correctamente", requiere_cambio_password: true });
        } catch (error) {
            console.error("Error creando usuario:", error);
            res.status(error.status || 500).json({ error: error.message || "Error al crear usuario" });
        }
    },

    actualizarUsuario: manejarErrores(async (req, res) => {
        const actorRole = req.usuario?.rol;
        const targetUserId = req.params.id;

        const targetUser = await obtenerUsuarioPorId(targetUserId);
        if (actorRole === 'administrador' && targetUser.rol === 'superadmin') {
            return res.status(403).json({ error: 'No tienes permiso para modificar a un superadmin' });
        }

        if (actorRole === 'administrador' && req.body.rol === 'superadmin') {
            return res.status(403).json({ error: 'No tienes permiso para asignar el rol de superadmin' });
        }

        await actualizarUsuario(targetUserId, req.body);
        res.json({ success: true, mensaje: "Usuario actualizado correctamente" });
    }, { mensaje: 'Error al actualizar usuario', log: 'Error actualizando usuario:' }),

    eliminarUsuario: manejarErrores(async (req, res) => {
        const actorRole = req.usuario?.rol;
        const targetUserId = req.params.id;

        const targetUser = await obtenerUsuarioPorId(targetUserId);
        if (actorRole === 'administrador' && targetUser.rol === 'superadmin') {
            return res.status(403).json({ error: 'No tienes permiso para desactivar a un superadmin' });
        }

        await eliminarUsuario(targetUserId, req.usuario.id, req.body.razon);
        res.json({ success: true, mensaje: "Usuario eliminado correctamente" });
    }, { mensaje: 'Error al eliminar usuario', log: 'Error eliminando usuario:' }),

    activarUsuario: manejarErrores(async (req, res) => {
        const actorRole = req.usuario?.rol;
        const targetUserId = req.params.id;

        const targetUser = await obtenerUsuarioPorId(targetUserId);
        if (actorRole === 'administrador' && targetUser.rol === 'superadmin') {
            return res.status(403).json({ error: 'No tienes permiso para reactivar a un superadmin' });
        }

        await activarUsuario(targetUserId);
        res.json({ success: true, mensaje: "Usuario reactivado correctamente" });
    }, { mensaje: 'Error al reactivar usuario', log: 'Error reactivando usuario:' }),

    purgarUsuario: manejarErrores(async (req, res) => {
        const actorRole = req.usuario?.rol;
        const targetUserId = req.params.id;

        const targetUser = await obtenerUsuarioPorId(targetUserId);
        if (actorRole === 'administrador' && targetUser.rol === 'superadmin') {
            return res.status(403).json({ error: 'No tienes permiso para eliminar definitivamente a un superadmin' });
        }

        await purgarUsuario(targetUserId);
        res.json({ success: true, mensaje: "Usuario eliminado definitivamente de la base de datos" });
    }, { mensaje: 'Error al eliminar definitivamente al usuario', log: 'Error purgando usuario:' })
};

export default userController;
