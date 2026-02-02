import { Router } from 'express';
import userController from '../controllers/userController.js';
import authMiddleware, { authorize } from '../middlewares/authMiddleware.js';

const router = Router();

// Todas las rutas requieren autenticación y rol de administrador o superadmin
router.use(authMiddleware);
router.use(authorize(['administrador', 'superadmin']));

// Listar usuarios
router.get('/', userController.obtenerUsuarios);

// Obtener un usuario específico
router.get('/:id', userController.obtenerUsuarioPorId);

// Crear usuario (puede usar el authController.registrar o uno específico si se requiere más data)
router.post('/', userController.crearUsuario);

// Modificar usuario
router.put('/:id', userController.actualizarUsuario);

// Eliminar usuario (Soft Delete)
router.delete('/:id', userController.eliminarUsuario);

// Reactivar usuario
router.patch('/:id/activar', userController.activarUsuario);

export default router;
