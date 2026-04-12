/**
 * Controlador de Configuración del Servicio - V2
 * 
 * File: src/v2/controllers/configuracionController.js
 * 
 * Descripción: 
 * Gestiona las reglas del sistema de cortes y avisos.
 * Permite ajustar los parámetros dinamicamente sin redestribuir el código.
 */

import dbTurso from "../../database/db-sqlite.js";
import { nowDate } from "../../utils/timezone.js";

const esPeriodoValido = (periodo) => typeof periodo === 'string' && /^\d{4}-\d{2}$/.test(periodo);

const configuracionController = {

    /**
     * Obtener configuración actual
     * GET /api/v2/configuracion
     */
    getConfiguracion: async (req, res) => {
        try {
            // Obtener el registro activo más reciente o el último creado
            const query = `
                SELECT * FROM configuracion_servicio 
                ORDER BY id DESC LIMIT 1
            `;

            const result = await dbTurso.execute({ sql: query, args: [] });

            if (result.rows.length === 0) {
                // Si no existe, devolver valores por defecto (semilla)
                return res.json({
                    facturas_para_primer_aviso: 1,
                    facturas_para_segundo_aviso: 2,
                    facturas_para_tercer_aviso: 3,
                    facturas_para_corte: 4,
                    dias_gracia: 0,
                    dias_vencimiento_factura: 15,
                    activo: 1,
                    mensaje: "Configuración por defecto (sin registros en BD)"
                });
            }

            res.json(result.rows[0]);

        } catch (error) {
            console.error("Error obteniendo configuración:", error);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    },

    /**
     * Actualizar configuración (Crea un nuevo registro para historial)
     * POST /api/v2/configuracion
     */
    updateConfiguracion: async (req, res) => {
        try {
            const {
                facturas_para_primer_aviso,
                facturas_para_segundo_aviso,
                facturas_para_tercer_aviso,
                facturas_para_corte,
                dias_gracia,
                dias_vencimiento_factura
            } = req.body;

            // tiny validation
            if (facturas_para_corte < 1) {
                return res.status(400).json({ error: "El límite para corte debe ser al menos 1 factura" });
            }

            const modificado_por = req.usuario?.id || null;

            // 1. Inactivar configuraciones anteriores
            await dbTurso.execute({
                sql: `UPDATE configuracion_servicio SET activo = 0 WHERE activo = 1`,
                args: []
            });

            // 2. Insertar nueva
            const query = `
                INSERT INTO configuracion_servicio (
                    facturas_para_primer_aviso,
                    facturas_para_segundo_aviso,
                    facturas_para_tercer_aviso,
                    facturas_para_corte,
                    dias_gracia,
                    dias_vencimiento_factura,
                    modificado_por,
                    fecha_modificacion,
                    activo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 1)
            `;

            const args = [
                facturas_para_primer_aviso || 1,
                facturas_para_segundo_aviso || 2,
                facturas_para_tercer_aviso || 3,
                facturas_para_corte || 4,
                dias_gracia || 0,
                dias_vencimiento_factura != null ? Number(dias_vencimiento_factura) : 15,
                modificado_por
            ];

            const result = await dbTurso.execute({ sql: query, args });

            res.status(201).json({
                message: "Configuración actualizada exitosamente",
                id: Number(result.lastInsertRowid)
            });

        } catch (error) {
            console.error("Error actualizando configuración:", error);
            res.status(500).json({ error: "Error interno actualizando configuración" });
        }
    },

    /**
     * Recalcular fecha de vencimiento de facturas por período
     * POST /api/v2/deudores/configuracion/recalcular-vencimientos
     */
    recalcularVencimientosPorPeriodo: async (req, res) => {
        try {
            const {
                periodo,
                incluir_pagadas = false,
                actualizar_fecha_emision = false,
                fecha_emision_objetivo = null
            } = req.body || {};

            if (!esPeriodoValido(periodo)) {
                return res.status(400).json({ error: 'El período debe tener formato YYYY-MM' });
            }

            const includePagadas = Boolean(incluir_pagadas);
            const actualizarFechaEmision = Boolean(actualizar_fecha_emision);
            const modificado_por = req.usuario?.id || null;

            let fechaEmisionObjetivo = null;
            if (actualizarFechaEmision) {
                fechaEmisionObjetivo = fecha_emision_objetivo || nowDate();
                if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEmisionObjetivo)) {
                    return res.status(400).json({
                        error: 'fecha_emision_objetivo debe tener formato YYYY-MM-DD cuando actualizar_fecha_emision=true'
                    });
                }
            }

            const configResult = await dbTurso.execute({
                sql: `SELECT dias_vencimiento_factura FROM configuracion_servicio WHERE activo = 1 ORDER BY id DESC LIMIT 1`,
                args: []
            });

            const diasVencimiento = configResult.rows.length > 0
                ? (Number(configResult.rows[0].dias_vencimiento_factura) || 15)
                : 15;

            const countResult = await dbTurso.execute({
                sql: `
                    SELECT COUNT(*) AS total
                    FROM facturas f
                    JOIN lecturas l ON f.lectura_id = l.id
                    WHERE l.periodo = ?
                      AND (? = 1 OR f.fecha_emision IS NOT NULL)
                      AND (? = 1 OR (f.estado IS NULL OR f.estado != 'Pagado'))
                `,
                args: [periodo, actualizarFechaEmision ? 1 : 0, includePagadas ? 1 : 0]
            });

            const totalObjetivo = Number(countResult.rows?.[0]?.total || 0);
            if (totalObjetivo === 0) {
                return res.status(200).json({
                    message: 'No se encontraron facturas para recalcular con los criterios seleccionados',
                    periodo,
                    dias_vencimiento_aplicados: diasVencimiento,
                    incluyo_pagadas: includePagadas,
                    facturas_actualizadas: 0
                });
            }

            if (actualizarFechaEmision) {
                await dbTurso.execute({
                    sql: `
                        UPDATE facturas
                        SET
                            fecha_emision = ?,
                            fecha_vencimiento = date(?, '+' || ? || ' day'),
                            modificado_por = COALESCE(?, modificado_por)
                        WHERE lectura_id IN (
                            SELECT id FROM lecturas WHERE periodo = ?
                        )
                          AND (? = 1 OR (estado IS NULL OR estado != 'Pagado'))
                    `,
                    args: [
                        fechaEmisionObjetivo,
                        fechaEmisionObjetivo,
                        diasVencimiento,
                        modificado_por,
                        periodo,
                        includePagadas ? 1 : 0
                    ]
                });
            } else {
                await dbTurso.execute({
                    sql: `
                        UPDATE facturas
                        SET
                            fecha_vencimiento = date(fecha_emision, '+' || ? || ' day'),
                            modificado_por = COALESCE(?, modificado_por)
                        WHERE lectura_id IN (
                            SELECT id FROM lecturas WHERE periodo = ?
                        )
                          AND fecha_emision IS NOT NULL
                          AND (? = 1 OR (estado IS NULL OR estado != 'Pagado'))
                    `,
                    args: [diasVencimiento, modificado_por, periodo, includePagadas ? 1 : 0]
                });
            }

            return res.status(200).json({
                message: 'Fechas de vencimiento recalculadas exitosamente',
                periodo,
                dias_vencimiento_aplicados: diasVencimiento,
                incluyo_pagadas: includePagadas,
                actualizo_fecha_emision: actualizarFechaEmision,
                fecha_emision_aplicada: actualizarFechaEmision ? fechaEmisionObjetivo : null,
                facturas_actualizadas: totalObjetivo
            });
        } catch (error) {
            console.error('Error recalculando vencimientos por periodo:', error);
            return res.status(500).json({ error: 'Error interno recalculando vencimientos' });
        }
    }
};

export default configuracionController;
