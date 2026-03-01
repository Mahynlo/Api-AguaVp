/**
 * Rutas de autenticación - V2
 * 
 * File: src/v2/routes/authroutes.js
 * 
 * Descripción:
 * - /login: Iniciar sesión
 * - /register: Registrar un nuevo usuario
 * - /logout: Cerrar sesión
 * - /sesionesActivas/:usuarioId: Obtener sesiones activas del usuario
 * 
 * Cambios en V2:
 * - Integración con controladores que usan Turso
 * - Mantiene compatibilidad completa con endpoints de V1
 * - Notificaciones SSE en lugar de WebSockets
 * 
 * Funciones:
 * - login: Maneja el inicio de sesión de un usuario. Verifica las credenciales y genera un token.
 * - registrar: Maneja el registro de un nuevo usuario. Cifra la contraseña y almacena el usuario en la base de datos.
 * - logout: Maneja el cierre de sesión de un usuario. Marca la sesión como inactiva y registra la fecha de cierre.
 * - sesionesActivas: Obtiene las sesiones activas de un usuario específico.
 * 
 * Notas:
 * - Se utiliza bcryptjs para cifrar las contraseñas.
 * - Se utiliza Turso para interactuar con la base de datos.
 * - Se utiliza SSE para notificaciones en tiempo real.
 */

import express from 'express';
import authController from '../controllers/authController.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { loginLimiter, registroUsuarioLimiter } from '../middlewares/rateLimiter.js';
import {
  validate,
  loginSchema,
  registrarUsuarioSchema,
  cambiarContraseñaSchema,
  refreshTokenSchema,
  actualizarPerfilSchema,
  usuarioIdParamSchema
} from '../validators/index.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth V2
 *   description: Rutas de autenticación v2 con Turso
 */

/**
 * @swagger
 * /api/v2/auth/login:
 *   post:
 *     summary: Iniciar sesión (V2 con Turso)
 *     tags: [Auth V2]
 *     security:
 *       - AppKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - correo
 *               - contraseña
 *             properties:
 *               correo:
 *                 type: string
 *                 format: email
 *                 description: Email del usuario
 *               contraseña:
 *                 type: string
 *                 description: Contraseña del usuario
 *               dispositivo:
 *                 type: string
 *                 description: Información del dispositivo (opcional)
 *             example:
 *               correo: "admin@aguavp.com"
 *               contraseña: "password123"
 *               dispositivo: "Chrome/Windows"
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                 token:
 *                   type: string
 *                 usuario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     correo:
 *                       type: string
 *                     nombre:
 *                       type: string
 *                     username:
 *                       type: string
 *                     rol:
 *                       type: string
 *       400:
 *         description: Correo y contraseña requeridos
 *       401:
 *         description: Usuario no encontrado o contraseña incorrecta
 *       500:
 *         description: Error interno del servidor
 */
router.post('/login', loginLimiter, appKeyMiddleware, validate(loginSchema), authController.login);

/**
 * @swagger
 * /api/v2/auth/register:
 *   post:
 *     summary: Registrar nuevo usuario (V2 con Turso)
 *     tags: [Auth V2]
 *     security:
 *       - AppKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - correo
 *               - contrasena
 *               - username
 *               - rol
 *             properties:
 *               correo:
 *                 type: string
 *                 format: email
 *                 description: Email del usuario
 *               nombre:
 *                 type: string
 *                 description: Nombre completo del usuario
 *               contrasena:
 *                 type: string
 *                 description: |
 *                   Contraseña del usuario. Debe cumplir con:
 *                   - Mínimo 8 caracteres
 *                   - Al menos 1 mayúscula
 *                   - Al menos 1 minúscula
 *                   - Al menos 1 número
 *                   - Al menos 1 carácter especial (!@#$%^&*()_+-=[]{}|;:,.<>?)
 *                   - No ser una contraseña común
 *                 minLength: 8
 *                 maxLength: 128
 *               username:
 *                 type: string
 *                 description: Nombre de usuario único
 *               rol:
 *                 type: string
 *                 enum: [Administrador, Operador, Usuario]
 *                 description: Rol del usuario
 *             example:
 *               correo: "nuevo@aguavp.com"
 *               nombre: "Nuevo Usuario"
 *               contrasena: "SecureP@ss123"
 *               username: "nuevousuario"
 *               rol: "Operador"
 *     responses:
 *       201:
 *         description: Usuario registrado con éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                 usuario_id:
 *                   type: integer
 *       400:
 *         description: Todos los campos son obligatorios o contraseña no válida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 detalles:
 *                   type: array
 *                   items:
 *                     type: string
 *                 mensaje:
 *                   type: string
 *       409:
 *         description: Correo o username ya existe
 *       500:
 *         description: Error al registrar usuario
 */
router.post('/register', registroUsuarioLimiter, appKeyMiddleware, validate(registrarUsuarioSchema), authController.registrar);

/**
 * @swagger
 * /api/v2/auth/logout:
 *   post:
 *     summary: Cerrar sesión (V2 con Turso)
 *     tags: [Auth V2]
 *     security:
 *       - AppKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token de sesión a cerrar
 *             example:
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Sesión cerrada con éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *       400:
 *         description: Token requerido
 *       404:
 *         description: Sesión no encontrada o ya cerrada
 *       500:
 *         description: Error al cerrar sesión
 */
router.post('/logout', appKeyMiddleware, authMiddleware, authController.logout);

/**
 * @swagger
 * /api/v2/auth/sesionesActivas/{usuarioId}:
 *   get:
 *     summary: Obtener sesiones activas del usuario (V2 con Turso)
 *     tags: [Auth V2]
 *     security:
 *       - AppKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: usuarioId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *         example: 1
 *     responses:
 *       200:
 *         description: Sesiones activas obtenidas con éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   usuario_id:
 *                     type: integer
 *                   token:
 *                     type: string
 *                   direccion_ip:
 *                     type: string
 *                   dispositivo:
 *                     type: string
 *                   fecha_inicio:
 *                     type: string
 *                     format: date-time
 *                   activo:
 *                     type: integer
 *       400:
 *         description: ID de usuario requerido
 *       404:
 *         description: Usuario no encontrado o sin sesiones activas
 *       500:
 *         description: Error al obtener sesiones activas
 */
router.get('/sesionesActivas/:usuarioId', appKeyMiddleware, authMiddleware, authController.sesionesActivas);

/**
 * @swagger
 * /api/v2/auth/refresh:
 *   post:
 *     summary: Renovar access token usando refresh token
 *     tags: [Auth V2]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token obtenido en el login
 *             example:
 *               refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token renovado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accessToken:
 *                   type: string
 *                   description: Nuevo access token (válido por 15 minutos)
 *                 expiresIn:
 *                   type: string
 *                   description: Tiempo de expiración
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     nombre:
 *                       type: string
 *                     username:
 *                       type: string
 *                     rol:
 *                       type: string
 *       400:
 *         description: Refresh token requerido
 *       401:
 *         description: Refresh token inválido o expirado
 *       500:
 *         description: Error al renovar token
 */
router.post('/refresh', appKeyMiddleware, authController.refresh);

/**
 * @swagger
 * /api/v2/auth/revoke:
 *   post:
 *     summary: Revocar un refresh token
 *     tags: [Auth V2]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token a revocar
 *             example:
 *               refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token revocado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mensaje:
 *                   type: string
 *       400:
 *         description: Refresh token requerido
 *       403:
 *         description: No autorizado para revocar este token
 *       404:
 *         description: Refresh token no encontrado
 *       500:
 *         description: Error al revocar token
 */
router.post('/revoke', appKeyMiddleware, authMiddleware, authController.revokeRefreshToken);

/**
 * @swagger
 * /api/v2/auth/sesiones/{sesionId}:
 *   delete:
 *     summary: Cerrar una sesión específica por ID
 *     tags: [Auth V2]
 *     security:
 *       - AppKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sesionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sesión a cerrar
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mensaje:
 *                   type: string
 *                 sesion_id:
 *                   type: string
 *       400:
 *         description: ID de sesión requerido
 *       403:
 *         description: No autorizado para cerrar esta sesión
 *       404:
 *         description: Sesión no encontrada o ya cerrada
 *       500:
 *         description: Error al cerrar sesión
 */
router.delete('/sesiones/:sesionId', appKeyMiddleware, authMiddleware, authController.cerrarSesion);

/**
 * @swagger
 * /api/v2/auth/sesiones/usuario/{usuarioId}/todas:
 *   delete:
 *     summary: Cerrar todas las sesiones de un usuario
 *     tags: [Auth V2]
 *     security:
 *       - AppKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: usuarioId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *       - in: query
 *         name: excepto_actual
 *         schema:
 *           type: boolean
 *         description: Si es true, mantiene la sesión actual activa
 *     responses:
 *       200:
 *         description: Sesiones cerradas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mensaje:
 *                   type: string
 *                 sesiones_cerradas:
 *                   type: integer
 *                 usuario_id:
 *                   type: string
 *       400:
 *         description: ID de usuario requerido
 *       403:
 *         description: No autorizado para cerrar sesiones de este usuario
 *       500:
 *         description: Error al cerrar sesiones
 */
router.delete('/sesiones/usuario/:usuarioId/todas', appKeyMiddleware, authMiddleware, authController.cerrarTodasSesiones);

/**
 * @swagger
 * /api/v2/auth/cambiar-contrasena:
 *   put:
 *     summary: Cambiar contraseña del usuario autenticado
 *     tags: [Auth V2]
 *     security:
 *       - AppKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contraseña_actual, contraseña_nueva, confirmar_contraseña_nueva]
 *             properties:
 *               contraseña_actual:
 *                 type: string
 *               contraseña_nueva:
 *                 type: string
 *               confirmar_contraseña_nueva:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contraseña cambiada. Otras sesiones cerradas.
 *       401:
 *         description: Contraseña actual incorrecta
 *       500:
 *         description: Error interno
 */
router.put('/cambiar-contrasena', appKeyMiddleware, authMiddleware, validate(cambiarContraseñaSchema), authController.cambiarContraseña);

/**
 * @swagger
 * /api/v2/auth/me:
 *   get:
 *     summary: Datos del usuario autenticado actualmente
 *     tags: [Auth V2]
 *     security:
 *       - AppKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario
 *       500:
 *         description: Error interno
 */
router.get('/me', appKeyMiddleware, authMiddleware, authController.me);

export default router;
