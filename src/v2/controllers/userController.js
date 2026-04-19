import dbTurso from "../../database/db-sqlite.js";
import bcrypt from "bcryptjs";
import { validatePassword, formatValidationErrors } from "../../utils/passwordValidator.js";
import {
    buildUserPermissionsSnapshot,
    getPermissionCatalog,
    setUserPermissionOverrides
} from '../services/permissionsService.js';

const userController = {
    obtenerCatalogoPermisos: async (_req, res) => {
        try {
            const catalog = await getPermissionCatalog();
            res.json({ success: true, data: catalog });
        } catch (error) {
            console.error('Error al obtener catálogo de permisos:', error);
            res.status(500).json({ error: 'Error al obtener catálogo de permisos' });
        }
    },

    obtenerMisPermisos: async (req, res) => {
        try {
            const actorId = Number(req.usuario?.id);
            const actorRole = req.usuario?.rol;

            if (!actorId || !actorRole) {
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }

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

            const userResult = await dbTurso.execute({
                sql: 'SELECT id, rol FROM usuarios WHERE id = ?',
                args: [targetUserId]
            });

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const targetUser = userResult.rows[0];
            const permissions = await buildUserPermissionsSnapshot(targetUserId, targetUser.rol);

            res.json({
                success: true,
                user_id: targetUserId,
                role: targetUser.rol,
                permissions
            });
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

            const userResult = await dbTurso.execute({
                sql: 'SELECT id, rol FROM usuarios WHERE id = ?',
                args: [targetUserId]
            });

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            await setUserPermissionOverrides({
                userId: targetUserId,
                updatedBy: actorId,
                overrides
            });

            const updatedPermissions = await buildUserPermissionsSnapshot(targetUserId, userResult.rows[0].rol);

            res.json({
                success: true,
                message: 'Permisos actualizados correctamente',
                user_id: targetUserId,
                permissions: updatedPermissions
            });
        } catch (error) {
            console.error('Error al actualizar permisos del usuario:', error);
            res.status(500).json({ error: 'Error al actualizar permisos del usuario' });
        }
    },

    // Obtener lista de usuarios con filtros
    obtenerUsuarios: async (req, res) => {
        try {
            const { estado, rol, busqueda } = req.query;
            let query = `
                SELECT id, nombre, correo, username, rol, estado_usuario, fecha_creacion, ultimo_acceso 
                FROM usuarios 
                WHERE 1=1
            `;
            const args = [];

            if (estado && estado !== 'todos') {
                query += ` AND estado_usuario = ?`;
                args.push(estado);
            }

            if (rol && rol !== 'todos') {
                query += ` AND rol = ?`;
                args.push(rol);
            }

            if (busqueda) {
                query += ` AND (nombre LIKE ? OR correo LIKE ? OR username LIKE ?)`;
                const searchParams = `%${busqueda}%`;
                args.push(searchParams, searchParams, searchParams);
            }

            query += ` ORDER BY fecha_creacion DESC`;

            const result = await dbTurso.execute({ sql: query, args });

            // Convertir BigInt
            const usuarios = result.rows.map(u => ({
                ...u,
                id: Number(u.id)
            }));

            res.json(usuarios);
        } catch (error) {
            console.error("Error al obtener usuarios:", error);
            res.status(500).json({ error: "Error interno al obtener usuarios" });
        }
    },

    // Obtener usuario por ID
    obtenerUsuarioPorId: async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                SELECT id, nombre, correo, username, rol, estado_usuario, fecha_creacion, ultimo_acceso 
                FROM usuarios WHERE id = ?
            `;
            const result = await dbTurso.execute({ sql: query, args: [id] });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Usuario no encontrado" });
            }

            const usuario = { ...result.rows[0], id: Number(result.rows[0].id) };
            res.json(usuario);
        } catch (error) {
            console.error("Error al obtener usuario:", error);
            res.status(500).json({ error: "Error interno" });
        }
    },

    // Crear usuario (wrapper administrativo)
    crearUsuario: async (req, res) => {
        // ... Logica similar a registro pero sin login automático ...
        // Por simplicidad, por ahora podemos sugerir usar el endpoint de registro existente o duplicar la lógica aquí
        // para mantener separado el registro público del administrativo.
        try {
            const { correo, nombre, contrasena, username, rol } = req.body;

            // Validaciones básicas
            if (!correo || !contrasena || !username || !rol) {
                return res.status(400).json({ error: "Todos los campos obligatorios" });
            }

            // Validar existencia
            const checkQuery = `SELECT id FROM usuarios WHERE correo = ? OR username = ?`;
            const check = await dbTurso.execute({ sql: checkQuery, args: [correo, username] });
            if (check.rows.length > 0) return res.status(409).json({ error: "Usuario ya existe" });

            // Hash password
            const hashedPassword = await bcrypt.hash(contrasena, 10);

            const insertQuery = `
                INSERT INTO usuarios
                    (correo, nombre, contraseña, username, rol, estado_usuario, requiere_cambio_password)
                VALUES (?, ?, ?, ?, ?, 'Activo', 1)
            `;

            await dbTurso.execute({
                sql: insertQuery,
                args: [correo, nombre, hashedPassword, username, rol]
            });

            res.status(201).json({
                success: true,
                mensaje: "Usuario creado correctamente",
                requiere_cambio_password: true
            });

        } catch (error) {
            console.error("Error creando usuario:", error);
            res.status(500).json({ error: "Error al crear usuario" });
        }
    },

    // Actualizar usuario
    actualizarUsuario: async (req, res) => {
        try {
            const { id } = req.params;
            const { nombre, correo, rol, contrasena } = req.body; // Campos editables

            // Validar existencia
            const userQuery = `SELECT id FROM usuarios WHERE id = ?`;
            const userCheck = await dbTurso.execute({ sql: userQuery, args: [id] });
            if (userCheck.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

            const updates = [];
            const args = [];

            if (nombre) { updates.push("nombre = ?"); args.push(nombre); }
            if (correo) { updates.push("correo = ?"); args.push(correo); }
            if (rol) { updates.push("rol = ?"); args.push(rol); }
            if (contrasena) {
                const hashed = await bcrypt.hash(contrasena, 10);
                updates.push("contraseña = ?");
                args.push(hashed);
                // Si el admin cambia la contraseña de otro usuario, marcarlo para que
                // la cambie en su próximo login.
                updates.push("requiere_cambio_password = 1");
            }

            if (updates.length === 0) return res.status(400).json({ error: "Nada que actualizar" });

            const query = `UPDATE usuarios SET ${updates.join(", ")} WHERE id = ?`;
            args.push(id);

            await dbTurso.execute({ sql: query, args });

            res.json({ mensaje: "Usuario actualizado correctamente" });

        } catch (error) {
            console.error("Error actualizando usuario:", error);
            res.status(500).json({ error: "Error al actualizar usuario" });
        }
    },

    // Eliminar Usuario (Soft Delete)
    eliminarUsuario: async (req, res) => {
        try {
            const { id } = req.params;
            const eliminado_por = req.usuario.id; // Del token
            const { razon } = req.body;

            if (Number(id) === Number(eliminado_por)) {
                return res.status(400).json({ error: "No puedes eliminarte a ti mismo" });
            }

            const query = `
                UPDATE usuarios 
                SET estado_usuario = 'Eliminado', 
                    fecha_eliminacion = datetime('now'),
                    eliminado_por = ?,
                    razon_eliminacion = ?
                WHERE id = ?
            `;

            await dbTurso.execute({ sql: query, args: [eliminado_por, razon || 'Eliminación administrativa', id] });

            // Cerrar sesiones activas del usuario eliminado
            await dbTurso.execute({
                sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE usuario_id = ?`,
                args: [id]
            });

            // Revocar refresh tokens del usuario eliminado.
            // Aunque authController.refresh verifica estado_usuario, revocar explícitamente
            // garantiza que los tokens queden inválidos incluso si se reactiva la cuenta sin relogin.
            await dbTurso.execute({
                sql: `UPDATE refresh_tokens
                      SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'usuario_eliminado'
                      WHERE usuario_id = ? AND revocado = 0`,
                args: [id]
            });

            res.json({ success: true, mensaje: "Usuario eliminado correctamente" });

        } catch (error) {
            console.error("Error eliminando usuario:", error);
            res.status(500).json({ error: "Error al eliminar usuario" });
        }
    },

    // Reactivar Usuario
    activarUsuario: async (req, res) => {
        try {
            const { id } = req.params;

            const query = `
                UPDATE usuarios 
                SET estado_usuario = 'Activo', 
                    fecha_eliminacion = NULL,
                    eliminado_por = NULL,
                    razon_eliminacion = NULL,
                    intentos_fallidos = 0,
                    bloqueado_hasta = NULL
                WHERE id = ?
            `;
            // intentos_fallidos y bloqueado_hasta se limpian para que el usuario
            // pueda iniciar sesión inmediatamente sin estar aún bloqueado por
            // intentos fallidos previos a su eliminación/desactivación.

            await dbTurso.execute({ sql: query, args: [id] });

            res.json({ mensaje: "Usuario reactivado correctamente" });
        } catch (error) {
            console.error("Error reactivando usuario:", error);
            res.status(500).json({ error: "Error al reactivar usuario" });
        }
    }
};

export default userController;
