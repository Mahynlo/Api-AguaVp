/**
 * Rutas para Dashboard - V2
 * 
 * File: src/v2/routes/dashboard.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para obtener métricas y estadísticas del dashboard principal.
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

// ===================================================================
// SWAGGER DOCUMENTATION TAGS
// ===================================================================

/**
 * @swagger
 * tags:
 *   name: Dashboard V2
 *   description: |
 *     **Dashboard Principal - API V2**
 *     
 *     Rutas para alimentar el dashboard principal con métricas clave.
 *     Proporciona resúmenes de consumo, clientes, medidores y pagos.
 */

// ===================================================================
// ENDPOINT IMPLEMENTATIONS
// ===================================================================

/**
 * @swagger
 * /api/v2/dashboard:
 *   get:
 *     summary: Obtener estadísticas del dashboard principal
 *     description: |
 *       Retorna un conjunto completo de métricas para el dashboard.
 *       Incluye comparativas con el mes anterior y datos para gráficos.
 *       
 *       **Datos incluidos:**
 *       - Tarjetas de resumen (Consumo, Clientes, Medidores, Pagos)
 *       - Crecimiento porcentual vs mes anterior
 *       - Histórico de consumo (últimos 6 meses)
 *       - Distribución de consumo por ruta
 *     tags: [Dashboard V2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos de dashboard obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tarjetas:
 *                   type: object
 *                   properties:
 *                     consumo:
 *                       type: object
 *                       properties:
 *                         actual:
 *                           type: number
 *                         anterior:
 *                           type: number
 *                         crecimiento:
 *                           type: number
 *                     clientes:
 *                       type: object
 *                     medidores:
 *                       type: object
 *                     pagos:
 *                       type: object
 *                 graficos:
 *                   type: object
 *                   properties:
 *                     linea_historico:
 *                       type: array
 *                     pie_distribucion:
 *                       type: array
 *       500:
 *         description: Error interno del servidor
 */
router.get("/", appKeyMiddleware, authMiddleware, dashboardController.getDashboardStats);

export default router;
