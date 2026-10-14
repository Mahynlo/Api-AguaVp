/**
 * Rutas de /api/v2/app
 *
 * Registro de la aplicación cliente, recuperación de su token, versión y estado.
 * Lógica: controllers/appController.js → services/appService.js
 * Documentación Swagger: openapi/app.js
 */

import express from 'express';
import appController from '../controllers/appController.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import { registroAppLimiter, recuperarTokenLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

// Sin app key: se usan antes de que la app tenga una (limitadas por rate limiter)
router.post("/registrarApp", registroAppLimiter, appController.registrarApp);
router.post("/recuperarToken", recuperarTokenLimiter, appController.recuperarToken);

router.get('/version', appKeyMiddleware, appController.obtenerVersion);
router.get('/status', appKeyMiddleware, appController.verificarEstado);

export default router;
