/**
 * Controlador de Reportes - V2
 * 
 * File: src/v2/controllers/reportsController.js
 * 
 * Descripción: 
 * Controlador centralizado para generar datos estructurados para reportes y recibos.
 * La lógica y el acceso a datos están en services/reportsService.js.
 */

import {
    generarRecibos,
    generarReporteFinanciero,
    generarReporteDeudores,
    generarReporteConsumoAgua,
    generarReporteLecturas
} from "../services/reportsService.js";
import { esErrorDeNegocio, responderErrorDeNegocio } from "../../utils/errores.js";

const ReportsController = {

    /**
     * Obtener datos para impresión de Recibos
     * Endpoint: GET /api/v2/reports/recibos
     * Params: mes (YYYY-MM), ruta_id (opcional), estado_pago (opcional)
     */
    getRecibosData: async (req, res) => {
        try {
            res.json(await generarRecibos(req.query));
        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("Error generando reportes de recibos:", error);
            res.status(500).json({ error: "Error interno generando recibos" });
        }
    },

    /**
     * Reporte Financiero (Ingresos/Egresos/Cartera)
     */
    getReporteFinanciero: async (req, res) => {
        try {
            res.json(await generarReporteFinanciero(req.query));
        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("Error reporte financiero:", error);
            res.status(500).json({ error: "Error generando reporte financiero" });
        }
    },

    /**
     * Reporte de Deudores y Cobranza
     * Endpoint: GET /api/v2/reports/deudores
     */
    getReporteDeudores: async (req, res) => {
        try {
            res.json(await generarReporteDeudores());
        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("Error generando reporte de deudores:", error);
            res.status(500).json({ error: "Error interno generando reporte de deudores" });
        }
    },

    /**
     * Reporte de consumo de agua potable
     * Endpoint: GET /api/v2/reports/consumo-agua
     * Query:
     * - tipo: periodo | ultimos_meses | anio
     * - periodo: YYYY-MM (cuando tipo=periodo)
     * - meses: 3 | 6 | 12 (cuando tipo=ultimos_meses)
     * - anio: YYYY (cuando tipo=anio)
     */
    getReporteConsumoAgua: async (req, res) => {
        try {
            res.json(await generarReporteConsumoAgua(req.query));
        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("Error generando reporte de consumo de agua:", error);
            res.status(500).json({ error: "Error interno generando reporte de consumo" });
        }
    },

    /**
     * Reporte de Lecturas (Lista para toma de lecturas)
     * Endpoint: GET /api/v2/reports/lecturas
     */
    getReporteLecturas: async (req, res) => {
        try {
            res.json(await generarReporteLecturas(req.query));
        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("Error generando reporte de lecturas:", error);
            res.status(500).json({ error: "Error interno generando reporte de lecturas" });
        }
    }
};

export default ReportsController;
