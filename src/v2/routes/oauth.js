/**
 * Rutas de /api/v2/oauth
 *
 * Emisión de tokens OAuth 2.0 (grants password y refresh_token).
 * Lógica: controllers/oauthController.js → services/oauthService.js
 * Documentación Swagger: openapi/oauth.js
 */

import express from 'express';
import oauthController from '../controllers/oauthController.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';

const router = express.Router();

// Usamos appKeyMiddleware para validar el cliente (App) ANTES de procesar OAuth
// Esto hace que x-app-key sea el mecanismo de "Client Authentication"
router.post('/token', appKeyMiddleware, oauthController.token);

export default router;
