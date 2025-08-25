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
router.post('/login', appKeyMiddleware, authController.login);

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
 *                 description: Contraseña del usuario
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
 *               contrasena: "password123"
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
 *         description: Todos los campos son obligatorios
 *       409:
 *         description: Correo o username ya existe
 *       500:
 *         description: Error al registrar usuario
 */
router.post('/register', appKeyMiddleware, authController.registrar);

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
router.post('/logout', appKeyMiddleware, authController.logout);

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
router.get('/sesionesActivas/:usuarioId', appKeyMiddleware, authController.sesionesActivas);

export default router;
