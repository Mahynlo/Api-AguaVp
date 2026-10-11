import { Router } from 'express';
import userController from '../controllers/userController.js';
import authMiddleware, { authorize, requirePermission } from '../middlewares/authMiddleware.js';
import { validate, updateUserPermissionsSchema } from '../validators/index.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Snapshot de permisos del usuario autenticado (acceso para cualquier usuario logueado)
router.get('/me/permissions', userController.obtenerMisPermisos);

// Rutas administrativas
router.use(authorize(['administrador', 'superadmin']));

// Listar usuarios
router.get('/', userController.obtenerUsuarios);

// Catálogo base de permisos
router.get('/permissions/catalog', userController.obtenerCatalogoPermisos);

// Snapshot de permisos de un usuario objetivo
router.get('/:id/permissions', userController.obtenerPermisosUsuario);

// Actualizar overrides de permisos para un usuario
router.put(
	'/:id/permissions',
	requirePermission('usuarios.gestionar_permisos'),
	validate(updateUserPermissionsSchema),
	userController.actualizarPermisosUsuario
);

// Obtener un usuario específico
router.get('/:id', userController.obtenerUsuarioPorId);

// Crear usuario (puede usar el authController.registrar o uno específico si se requiere más data)
router.post('/', userController.crearUsuario);

// Modificar usuario
router.put('/:id', userController.actualizarUsuario);

// Eliminar usuario (Soft Delete)
router.delete('/:id', userController.eliminarUsuario);

// Eliminar usuario definitivamente (Hard Delete / Purge)
router.delete('/:id/purgar', userController.purgarUsuario);

// Reactivar usuario
router.patch('/:id/activar', userController.activarUsuario);

export default router;
