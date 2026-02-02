/**
 * Health Check Routes
 * 
 * File: src/routes/health.js
 * 
 * Descripción:
 * - Rutas para verificar la salud de la API
 * - Endpoints públicos para monitoreo y verificación de estado
 * 
 * Rutas:
 * - GET /health - Health check completo
 * - GET /health/simple - Health check simple
 * - GET /health/database - Verificación específica de BD
 * - GET /health/system - Información del sistema
 */

import express from 'express';
import healthController from '../controllers/healthController.js';
// Usar middlewares V2 para evitar dependencias de SQLite
import appKeyMiddleware from '../../v2/middlewares/appKeyMiddleware.js';
import authMiddleware from '../../v2/middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check completo de la API (Protegido)
 *     description: Verifica el estado de todos los servicios (API, Base de Datos, WebSocket). Requiere autenticación.
 *     tags: [Health Check]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: API funcionando correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 responseTime:
 *                   type: string
 *                   example: "5ms"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 services:
 *                   type: object
 *                   properties:
 *                     api:
 *                       type: string
 *                       example: "UP"
 *                     database:
 *                       type: string
 *                       example: "UP"
 *                     websocket:
 *                       type: string
 *                       example: "UP"
 *       401:
 *         description: No autorizado - Token o API Key inválidos
 *       503:
 *         description: Uno o más servicios no están disponibles
 */
router.get('/', appKeyMiddleware, authMiddleware, healthController.checkHealth);

/**
 * @swagger
 * /health/simple:
 *   get:
 *     summary: Health check simple (Público)
 *     description: Verificación básica de que la API responde. No requiere autenticación.
 *     tags: [Health Check]
 *     responses:
 *       200:
 *         description: API respondiendo correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 message:
 *                   type: string
 *                   example: "API funcionando correctamente 🚰"
 */
router.get('/simple', healthController.checkSimpleHealth);

/**
 * @swagger
 * /health/status:
 *   get:
 *     summary: Estado básico para monitoreo externo (Público)
 *     description: Endpoint público para herramientas de monitoreo externo. Solo devuelve información básica.
 *     tags: [Health Check]
 *     responses:
 *       200:
 *         description: API funcionando
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "UP"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/status', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /health/database:
 *   get:
 *     summary: Verificación específica de la base de datos (Protegido)
 *     description: Verifica la conectividad y estado de la base de datos SQLite. Requiere autenticación.
 *     tags: [Health Check]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Base de datos funcionando correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 service:
 *                   type: string
 *                   example: "database"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 responseTime:
 *                   type: string
 *                   example: "3ms"
 *                 tables:
 *                   type: array
 *                   items:
 *                     type: string
 *                 tablesCount:
 *                   type: number
 *       401:
 *         description: No autorizado - Token o API Key inválidos
 *       503:
 *         description: Error en la base de datos
 */
router.get('/database', appKeyMiddleware, authMiddleware, healthController.checkDatabase);

/**
 * @swagger
 * /health/system:
 *   get:
 *     summary: Información detallada del sistema (Protegido)
 *     description: Obtiene información detallada sobre el sistema, memoria, CPU, etc. Requiere autenticación.
 *     tags: [Health Check]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Información del sistema obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 system:
 *                   type: object
 *                   properties:
 *                     platform:
 *                       type: string
 *                     arch:
 *                       type: string
 *                     nodeVersion:
 *                       type: string
 *                     uptime:
 *                       type: string
 *                     memory:
 *                       type: object
 *                     cpu:
 *                       type: object
 *       401:
 *         description: No autorizado - Token o API Key inválidos
 */
router.get('/system', appKeyMiddleware, authMiddleware, healthController.getSystemDetails);

export default router;
