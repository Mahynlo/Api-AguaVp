/**
 * Rutas específicas de la aplicación - V2
 * 
 * File: src/v2/routes/appRoutes.js
 * 
 * Descripción: Rutas para funcionalidades específicas de la aplicación
 * 
 * Cambios en V2:
 * - Integración con sistema SSE
 * - Migración a controladores que usan Turso
 * - Mantiene las mismas rutas de V1 + funciones adicionales
 */

import express from 'express';
import appController from '../controllers/appController.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: App V2
 *   description: Rutas específicas de la aplicación v2
 */

// =====================================================
// RUTAS V1 - COMPATIBILIDAD COMPLETA
// =====================================================

/**
 * @swagger
 * /api/v2/app/registrarApp:
 *   post:
 *     summary: Registrar una nueva aplicación (V2 con Turso)
 *     tags: [App V2]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 description: Nombre de la aplicación
 *             example:
 *               nombre: "Sistema de Agua Potable"
 *     security:
 *       - AppKeyAuth: []
 *     responses:
 *       201:
 *         description: Aplicación registrada con éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                 app_id:
 *                   type: string
 *                 token:
 *                   type: string
 *                 database:
 *                   type: string
 *       401:
 *         description: AppKey no proporcionado o formato incorrecto
 *       403:
 *         description: AppKey inicial inválido
 *       500:
 *         description: Error al registrar la aplicación
 */
// Ruta de instalación inicial - adaptada de v1
router.post("/registrarApp", appController.registrarApp);

/**
 * @swagger
 * /api/v2/app/recuperarToken:
 *   post:
 *     summary: Recuperar token por expiración o pérdida (V2 con Turso)
 *     tags: [App V2]
 *     security:
 *       - AppKeyAuth: []
 *     responses:
 *       200:
 *         description: Token actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                 nuevo_token:
 *                   type: string
 *                 database:
 *                   type: string
 *       401:
 *         description: AppKey no proporcionado o formato incorrecto
 *       403:
 *         description: Token inválido o expirado
 *       500:
 *         description: Error al actualizar el token
 */
// Ruta de recuperación de token - adaptada de v1 
router.post("/recuperarToken", appController.recuperarToken);

// =====================================================
// RUTAS ADICIONALES V2 - NO ESTÁN EN V1
// =====================================================

/**
 * @swagger
 * /api/v2/app/version:
 *   get:
 *     summary: Obtener información de versión de la API V2
 *     tags: [App V2]
 *     security:
 *       - AppKeyAuth: []
 *     responses:
 *       200:
 *         description: Información de versión obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                 api_version:
 *                   type: string
 *                 environment:
 *                   type: string
 *                 database:
 *                   type: string
 *                 realtime:
 *                   type: string
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                 changes_from_v1:
 *                   type: array
 *                   items:
 *                     type: string
 *                 timestamp:
 *                   type: string
 *       500:
 *         description: Error al obtener información de versión
 */
router.get('/version', appKeyMiddleware, appController.obtenerVersion);

/**
 * @swagger
 * /api/v2/app/status:
 *   get:
 *     summary: Verificar estado de la aplicación y servicios V2
 *     tags: [App V2]
 *     security:
 *       - AppKeyAuth: []
 *     responses:
 *       200:
 *         description: Estado de la aplicación obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [OK, DEGRADED, ERROR]
 *                 version:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 services:
 *                   type: object
 *                   properties:
 *                     api:
 *                       type: string
 *                     database:
 *                       type: string
 *                     sse:
 *                       type: string
 *                 database:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     status:
 *                       type: string
 *                     error:
 *                       type: string
 *                 realtime:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     status:
 *                       type: string
 *                 uptime:
 *                   type: number
 *                 memory_usage:
 *                   type: object
 *       500:
 *         description: Error al verificar estado de la aplicación
 */
router.get('/status', appKeyMiddleware, appController.verificarEstado);

export default router;
