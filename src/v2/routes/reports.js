/**
 * Rutas de /api/v2/reports
 *
 * Datos estructurados para recibos y reportes (solo lectura).
 * Lógica: controllers/reportsController.js → services/reportsService.js
 * Documentación Swagger: openapi/reports.js
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import reportsController from '../controllers/reportsController.js';

const router = express.Router();

router.get("/recibos", appKeyMiddleware, authMiddleware, reportsController.getRecibosData);
router.get("/financiero", appKeyMiddleware, authMiddleware, reportsController.getReporteFinanciero);
router.get("/deudores", appKeyMiddleware, authMiddleware, reportsController.getReporteDeudores);
router.get("/lecturas", appKeyMiddleware, authMiddleware, reportsController.getReporteLecturas);
router.get("/consumo-agua", appKeyMiddleware, authMiddleware, reportsController.getReporteConsumoAgua);

export default router;
