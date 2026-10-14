/**
 * Controlador de Cortes y Reconexiones - V2
 *
 * File: src/v2/controllers/cortesController.js
 *
 * Descripción:
 * Gestiona la detección de candidatos a corte y la ejecución de órdenes.
 * La lógica y el acceso a datos están en services/cortesService.js.
 */

import { detectarCandidatosCorte, ejecutarCorte, procesarReconexion } from "../services/cortesService.js";
import { esErrorDeNegocio, responderErrorDeNegocio } from "../../utils/errores.js";

const cortesController = {

    /**
     * Detectar Candidatos a Corte
     * GET /api/v2/deudores/candidatos
     */
    detectarCandidatosCorte: async (req, res) => {
        try {
            res.json(await detectarCandidatosCorte());
        } catch (error) {
            console.error("Error detectando candidatos:", error);
            res.status(500).json({ error: "Error interno al detectar candidatos" });
        }
    },

    /**
     * Ejecutar Corte de Servicio
     * POST /api/v2/deudores/cortar
     * Body: { medidor_id, motivo, observaciones }
     */
    ejecutarCorte: async (req, res) => {
        try {
            console.log("=== EJECUTAR CORTE ===");
            console.log("Body recibido:", req.body);
            console.log("Usuario:", req.usuario);

            const { medidor_id, motivo, observaciones } = req.body;
            const autorizado_por = req.usuario?.id; // Del token

            console.log("Datos extraídos:", { medidor_id, motivo, observaciones, autorizado_por });

            if (!medidor_id || !motivo) {
                console.error("ERROR: Faltan datos requeridos", { medidor_id, motivo });
                return res.status(400).json({ error: "Faltan datos requeridos (medidor_id, motivo)" });
            }

            await ejecutarCorte({ medidor_id, motivo, observaciones, autorizado_por });

            res.json({
                success: true,
                message: "Corte ejecutado correctamente",
                medidor_id
            });

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("Error ejecutando corte:", error);
            res.status(500).json({ error: "Error ejecutando el corte" });
        }
    },

    /**
     * Procesar Reconexión (Validación)
     * POST /api/v2/deudores/reconectar
     * Body: { medidor_id, observaciones }
     */
    procesarReconexion: async (req, res) => {
        try {
            const { medidor_id, observaciones } = req.body;
            const reconectado_por = req.usuario?.id;

            if (!medidor_id) {
                return res.status(400).json({ error: "Falta medidor_id" });
            }

            const { nuevoEstado } = await procesarReconexion({ medidor_id, observaciones, reconectado_por });

            res.json({
                success: true,
                message: `Servicio reconectado exitosamente. Estado: ${nuevoEstado}`,
                nuevo_estado: nuevoEstado
            });

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("Error reconectando servicio:", error);
            res.status(500).json({ error: "Error procesando reconexión" });
        }
    }
};

export default cortesController;
