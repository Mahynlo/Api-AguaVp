import { getConfiguracion, updateConfiguracion, recalcularVencimientosPorPeriodo } from '../services/configuracionService.js';

const esPeriodoValido = (p) => typeof p === 'string' && /^\d{4}-\d{2}$/.test(p);

const configuracionController = {

    getConfiguracion: async (req, res) => {
        try {
            res.json(await getConfiguracion());
        } catch (error) {
            console.error("Error obteniendo configuración:", error);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    },

    updateConfiguracion: async (req, res) => {
        if (req.body.facturas_para_corte < 1) {
            return res.status(400).json({ error: "El límite para corte debe ser al menos 1 factura" });
        }
        try {
            const id = await updateConfiguracion(req.body, req.usuario?.id);
            res.status(201).json({ message: "Configuración actualizada exitosamente", id });
        } catch (error) {
            console.error("Error actualizando configuración:", error);
            res.status(500).json({ error: "Error interno actualizando configuración" });
        }
    },

    recalcularVencimientosPorPeriodo: async (req, res) => {
        const { periodo, actualizar_fecha_emision, fecha_emision_objetivo } = req.body || {};

        if (!esPeriodoValido(periodo)) {
            return res.status(400).json({ error: 'El período debe tener formato YYYY-MM' });
        }
        if (actualizar_fecha_emision && fecha_emision_objetivo && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_emision_objetivo)) {
            return res.status(400).json({ error: 'fecha_emision_objetivo debe tener formato YYYY-MM-DD cuando actualizar_fecha_emision=true' });
        }

        try {
            const result = await recalcularVencimientosPorPeriodo(req.body || {}, req.usuario?.id);

            if (result.totalObjetivo === 0) {
                return res.json({
                    message: 'No se encontraron facturas para recalcular con los criterios seleccionados',
                    periodo, dias_vencimiento_aplicados: result.diasVencimiento,
                    incluyo_pagadas: result.includePagadas, facturas_actualizadas: 0
                });
            }

            res.json({
                message: 'Fechas de vencimiento recalculadas exitosamente',
                periodo, dias_vencimiento_aplicados: result.diasVencimiento,
                incluyo_pagadas: result.includePagadas,
                actualizo_fecha_emision: result.actualizarFechaEmision,
                fecha_emision_aplicada: result.actualizarFechaEmision ? result.fechaEmisionObjetivo : null,
                facturas_actualizadas: result.totalObjetivo
            });
        } catch (error) {
            console.error('Error recalculando vencimientos por periodo:', error);
            res.status(500).json({ error: 'Error interno recalculando vencimientos' });
        }
    }
};

export default configuracionController;
