import { obtenerUsuarios, obtenerUsuarioPorId, crearUsuario, actualizarUsuario, eliminarUsuario, activarUsuario } from '../services/userService.js';
import { buildUserPermissionsSnapshot, getPermissionCatalog, setUserPermissionOverrides } from '../services/permissionsService.js';
import dbTurso from "../../database/db-sqlite.js";

const userController = {

    obtenerCatalogoPermisos: async (_req, res) => {
        try {
            res.json({ success: true, data: await getPermissionCatalog() });
        } catch (error) {
            console.error('Error al obtener catálogo de permisos:', error);
            res.status(500).json({ error: 'Error al obtener catálogo de permisos' });
        }
    },

    obtenerMisPermisos: async (req, res) => {
        const actorId = Number(req.usuario?.id);
        const actorRole = req.usuario?.rol;
        if (!actorId || !actorRole) return res.status(401).json({ error: 'Usuario no autenticado' });
        try {
            const permisos = await buildUserPermissionsSnapshot(actorId, actorRole);
            res.json({ success: true, user_id: actorId, role: actorRole, permissions: permisos });
        } catch (error) {
            console.error('Error al obtener permisos del usuario actual:', error);
            res.status(500).json({ error: 'Error al obtener permisos' });
        }
    },

    obtenerPermisosUsuario: async (req, res) => {
        try {
            const targetUserId = Number(req.params.id);
            const userResult = await dbTurso.execute({ sql: 'SELECT id, rol FROM usuarios WHERE id = ?', args: [targetUserId] });
            if (userResult.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
            const targetUser = userResult.rows[0];
            const permissions = await buildUserPermissionsSnapshot(targetUserId, targetUser.rol);
            res.json({ success: true, user_id: targetUserId, role: targetUser.rol, permissions });
        } catch (error) {
            console.error('Error al obtener permisos del usuario:', error);
            res.status(500).json({ error: 'Error al obtener permisos del usuario' });
        }
    },

    actualizarPermisosUsuario: async (req, res) => {
        try {
            const targetUserId = Number(req.params.id);
            const actorId = Number(req.usuario?.id);
            const { overrides = [] } = req.body;
            const userResult = await dbTurso.execute({ sql: 'SELECT id, rol FROM usuarios WHERE id = ?', args: [targetUserId] });
            if (userResult.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
            await setUserPermissionOverrides({ userId: targetUserId, updatedBy: actorId, overrides });
            const updatedPermissions = await buildUserPermissionsSnapshot(targetUserId, userResult.rows[0].rol);
            res.json({ success: true, message: 'Permisos actualizados correctamente', user_id: targetUserId, permissions: updatedPermissions });
        } catch (error) {
            console.error('Error al actualizar permisos del usuario:', error);
            res.status(500).json({ error: 'Error al actualizar permisos del usuario' });
        }
    },

    obtenerUsuarios: async (req, res) => {
        try {
            res.json(await obtenerUsuarios(req.query));
        } catch (error) {
            console.error("Error al obtener usuarios:", error);
            res.status(error.status || 500).json({ error: error.message || "Error interno al obtener usuarios" });
        }
    },

    obtenerUsuarioPorId: async (req, res) => {
        try {
            res.json(await obtenerUsuarioPorId(req.params.id));
        } catch (error) {
            console.error("Error al obtener usuario:", error);
            res.status(error.status || 500).json({ error: error.message || "Error interno" });
        }
    },

    crearUsuario: async (req, res) => {
        const { correo, contrasena, username, rol } = req.body;
        if (!correo || !contrasena || !username || !rol) {
            return res.status(400).json({ error: "Todos los campos obligatorios" });
        }
        try {
            await crearUsuario(req.body);
            res.status(201).json({ success: true, mensaje: "Usuario creado correctamente", requiere_cambio_password: true });
        } catch (error) {
            console.error("Error creando usuario:", error);
            res.status(error.status || 500).json({ error: error.message || "Error al crear usuario" });
        }
    },

    actualizarUsuario: async (req, res) => {
        try {
            await actualizarUsuario(req.params.id, req.body);
            res.json({ mensaje: "Usuario actualizado correctamente" });
        } catch (error) {
            console.error("Error actualizando usuario:", error);
            res.status(error.status || 500).json({ error: error.message || "Error al actualizar usuario" });
        }
    },

    eliminarUsuario: async (req, res) => {
        try {
            await eliminarUsuario(req.params.id, req.usuario.id, req.body.razon);
            res.json({ success: true, mensaje: "Usuario eliminado correctamente" });
        } catch (error) {
            console.error("Error eliminando usuario:", error);
            res.status(error.status || 500).json({ error: error.message || "Error al eliminar usuario" });
        }
    },

    activarUsuario: async (req, res) => {
        try {
            await activarUsuario(req.params.id);
            res.json({ mensaje: "Usuario reactivado correctamente" });
        } catch (error) {
            console.error("Error reactivando usuario:", error);
            res.status(error.status || 500).json({ error: error.message || "Error al reactivar usuario" });
        }
    }
};

export default userController;
