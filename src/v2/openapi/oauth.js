/**
 * Documentación OpenAPI (Swagger) de /api/v2/oauth
 *
 * OAuth 2.0. Solo comentarios: swagger-jsdoc los lee y los junta con los
 * de src/v2/routes/oauth.js (ver la lista de archivos en src/server.js).
 */

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
