/**
 * Rutas para Reportes - V2
 * 
 * File: src/v2/routes/reports.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para obtener datos estructurados para reportes y recibos.
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import reportsController from '../controllers/reportsController.js';

const router = express.Router();

// ===================================================================
// SWAGGER DOCUMENTATION TAGS
// ===================================================================

/**
 * @swagger
 * tags:
 *   name: Reportes V2
 *   description: |
 *     **Reportes y Recibos - API V2**
 *     
 *     Endpoints especializados para generación de documentos y análisis.
 */

// ===================================================================
// ENDPOINT IMPLEMENTATIONS
// ===================================================================

/**
 * @swagger
 * /api/v2/reports/recibos:
 *   get:
 *     summary: Obtener datos para impresión de recibos
 *     description: |
 *       Retorna un set de datos optimizado para generar recibos de agua.
 *       Incluye información de cliente, servicio, desglose de deuda y consumos.
 *       
 *       **Filtros:**
 *       - `mes` (Requerido): Periodo a facturar (YYYY-MM)
 *       - `ruta_id`: Filtrar por ruta específica (para impresión por lotes)
 *       - `estado_pago`: Filtrar por estado (Pendiente, Pagado, etc.)
 *     tags: [Reportes V2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mes
 *         schema:
 *           type: string
 *         required: true
 *         description: Mes de facturación (YYYY-MM)
 *       - in: query
 *         name: ruta_id
 *         schema:
 *           type: integer
 *         description: ID de la ruta para filtrar
 *     responses:
 *       200:
 *         description: Datos de recibos generados
 */
router.get("/recibos", appKeyMiddleware, authMiddleware, reportsController.getRecibosData);

/**
 * @swagger
 * /api/v2/reports/financiero:
 *   get:
 *     summary: Reporte financiero de ingresos y facturación
 *     description: Retorna totales de facturación vs recaudación en un rango de fechas.
 *     tags: [Reportes V2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fecha_inicio
 *         schema:
 *           type: string
 *         required: true
 *       - in: query
 *         name: fecha_fin
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Datos financieros para reporte
 */
router.get("/financiero", appKeyMiddleware, authMiddleware, reportsController.getReporteFinanciero);

/**
 * @swagger
 * /api/v2/reports/deudores:
 *   get:
 *     summary: Reporte de cartera vencida y cortes
 *     description: Retorna métricas de cobranza, top deudores y operatividad de cortes.
 *     tags: [Reportes V2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reporte de deudores generado
 */
router.get("/deudores", appKeyMiddleware, authMiddleware, reportsController.getReporteDeudores);

/**
 * @swagger
 * /api/v2/reports/lecturas:
 *   get:
 *     summary: Lista de lecturas
 *     description: Reporte agrupado por localidad para toma de lecturas
 */
router.get("/lecturas", appKeyMiddleware, authMiddleware, reportsController.getReporteLecturas);

export default router;
