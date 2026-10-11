/**
 * Controlador OAuth 2.0 - V2
 *
 * File: src/v2/controllers/oauthController.js
 *
 * La lógica y el acceso a datos están en services/oauthService.js.
 */

import { obtenerAppActiva, emitirTokensPorPassword, emitirTokensPorRefresh } from "../services/oauthService.js";
import { esErrorDeNegocio, responderErrorDeNegocio } from "../../utils/errores.js";

const OAuthController = {
    /**
     * Endpoint unico para obtener tokens (OAuth 2.0 implementation)
     * POST /api/v2/oauth/token
     */
    token: async (req, res) => {
        try {
            const { grant_type, client_id } = req.body;

            // 1. Client Authentication
            // Si pasó por appKeyMiddleware, req.appInstancia ya tiene la app validada;
            // si no, se valida el client_id del body.
            let appId = client_id;

            if (req.appInstancia) {
                appId = req.appInstancia.id; // app_id text
            } else if (!appId) {
                return res.status(400).json({ error: "client_id requerido" });
            }

            let appData;
            if (req.appInstancia) {
                appData = req.appInstancia;
            } else {
                appData = await obtenerAppActiva(appId);
                if (!appData) {
                    return res.status(401).json({ error: "Cliente inválido" });
                }
            }

            // 2. Handle Grant Types
            if (grant_type === 'password') {
                const { username, password, scope } = req.body; // username = correo
                const { accessToken, refreshToken, expiresIn } = await emitirTokensPorPassword({ username, password, scope, appData });
                return res.json({
                    access_token: accessToken,
                    token_type: "Bearer",
                    expires_in: expiresIn, // seconds
                    refresh_token: refreshToken,
                    scope: scope || "default"
                });
            } else if (grant_type === 'refresh_token') {
                const { accessToken, refreshToken, expiresIn } = await emitirTokensPorRefresh({ refresh_token: req.body.refresh_token, appData });
                return res.json({
                    access_token: accessToken,
                    token_type: "Bearer",
                    expires_in: expiresIn,
                    refresh_token: refreshToken,
                    scope: "default"
                });
            } else {
                return res.status(400).json({ error: "grant_type no soportado" });
            }

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("OAuth Error:", error);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    }
};

export default OAuthController;
