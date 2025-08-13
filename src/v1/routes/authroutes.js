/**
 * Rutas de autenticación 
 * 
 * File: src/routes/authroutes.js
 * 
 * Dscripción:
 *  - /login: Iniciar sesión
 * - /register: Registrar un nuevo usuario
 * - /logout: Cerrar sesión
 * 
 * * Funciones:
 * - login: Maneja el inicio de sesión de un usuario. Verifica las credenciales y genera un token.
 * - registrar: Maneja el registro de un nuevo usuario. Cifra la contraseña y almacena el usuario en la base de datos.
 * * - logout: Maneja el cierre de sesión de un usuario. Marca la sesión como inactiva y registra la fecha de cierre.
 * 
 * Notas:
 * - Se utiliza bcryptjs para cifrar las contraseñas.
 * - Se utiliza sqlite3 para interactuar con la base de datos SQLite.
 */

import express from 'express';
import authController from '../controllers/authController.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';

const router = express.Router();
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Rutas de autenticación
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               correo:
 *                 type: string
 *               contraseña:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario registrado
 *       401:
 *         description: Usuario no encontrado
 *       400:
 *         description: Correo y contraseña requeridos
 *       500:
 *         description: Error al registrar la sesión
 */
router.post('/login', appKeyMiddleware, authController.login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registrar nuevo usuario
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombreUsuario:
 *                 type: string
 *               correo:
 *                 type: string
 *               contraseña:
 *                 type: string
 *               rol:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario registrado con éxito:ID de usuario
 *       400:
 *         description: Todos los campos son obligatorios
 *       409:
 *         description: Correo o username ya existe
 *       500:
 *         description: Error al registrar usuario
 */

router.post('/register',appKeyMiddleware, authController.registrar);


/**
 * @swagger
 * /api/auth/logout:
 *   get:
 *     summary: Cerrar sesión
 *     tags: [Auth]
 *     requestBody:
 *      required: true
 *     content:
 *       application/json:
 *        schema:
 *         type: object
 *        properties:
 *         token:
 *          type: string
 *        description: Token de sesión
*     responses:
 *       200:
 *         description: Sesión cerrada con éxito
 *       400:
 *        description: Token requerido
 *       404:
 *        description: Sesión no encontrada o ya cerrada
 *       500:
 *        description: Error al cerrar sesión
 */
router.post('/logout',appKeyMiddleware,authController.logout);

/**
 * @swagger
 * /api/auth/sesionesActivas/{usuarioId}:
 *   get:
 *     summary: Obtener sesiones activas del usuario
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: usuarioId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Sesiones activas obtenidas con éxito
 *       400:
 *         description: ID de usuario requerido
 *       404:
 *         description: Usuario no encontrado o sin sesiones activas
 */
router.get('/sesionesActivas/:usuarioId', appKeyMiddleware, authController.sesionesActivas);

export default router;
