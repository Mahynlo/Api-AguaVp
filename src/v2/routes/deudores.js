/**
 * Rutas de Deudores y Cortes - V2
 * 
 * File: src/v2/routes/deudores.js
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import configuracionController from '../controllers/configuracionController.js';
import cortesController from '../controllers/cortesController.js';
import conveniosController from '../controllers/conveniosController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Deudores y Cortes
 *   description: Gestión de cartera vencida, cortes y convenios
 */

// ===================================
// CONFIGURACIÓN (Reglas)
// ===================================
router.get("/configuracion", appKeyMiddleware, authMiddleware, configuracionController.getConfiguracion);
router.post("/configuracion", appKeyMiddleware, authMiddleware, configuracionController.updateConfiguracion);

// ===================================
// CORTES DE SERVICIO
// ===================================

/**
 * @swagger
 * /api/v2/deudores/candidatos:
 *   get:
 *     summary: Detectar candidatos a corte
 *     description: Lista medidores que superan el umbral de facturas vencidas (Análisis).
 */
router.get("/candidatos", appKeyMiddleware, authMiddleware, cortesController.detectarCandidatosCorte);

/**
 * @swagger
 * /api/v2/deudores/cortar:
 *   post:
 *     summary: Ejecutar corte de servicio
 *     description: Registra el corte y cambia el estado del medidor.
 */
router.post("/cortar", appKeyMiddleware, authMiddleware, cortesController.ejecutarCorte);

/**
 * @swagger
 * /api/v2/deudores/reconectar:
 *   post:
 *     summary: Procesar reconexión
 *     description: Autoriza reconexión si no hay deuda o existe convenio.
 */
router.post("/reconectar", appKeyMiddleware, authMiddleware, cortesController.procesarReconexion);

// ===================================
// CONVENIOS DE PAGO
// ===================================

/**
 * @swagger
 * /api/v2/deudores/convenios:
 *   post:
 *     summary: Crear convenio de pago
 *     description: Formaliza un acuerdo de pagos parciales.
 */
router.post("/convenios", appKeyMiddleware, authMiddleware, conveniosController.crearConvenio);

export default router;
