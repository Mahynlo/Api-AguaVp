
import express from 'express';
import oauthController from '../controllers/oauthController.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: OAuth 2.0
 *   description: Endpoints estándar de OAuth 2.0
 */

/**
 * @swagger
 * /api/v2/oauth/token:
 *   post:
 *     summary: Obtener Access Token
 *     tags: [OAuth 2.0]
 *     security:
 *       - AppKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - grant_type
 *               - client_id
 *             properties:
 *               grant_type:
 *                 type: string
 *                 enum: [password, refresh_token]
 *               client_id:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               refresh_token:
 *                 type: string
 *               scope:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token generado exitosamente
 */
// Usamos appKeyMiddleware para validar el cliente (App) ANTES de procesar OAuth
// Esto hace que x-app-key sea el mecanismo de "Client Authentication"
router.post('/token', appKeyMiddleware, oauthController.token);

export default router;
