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
                dias_gracia
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
                    modificado_por,
                    fecha_modificacion,
                    activo
                ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1)
            `;

            const args = [
                facturas_para_primer_aviso || 1,
                facturas_para_segundo_aviso || 2,
                facturas_para_tercer_aviso || 3,
                facturas_para_corte || 4,
                dias_gracia || 0,
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
    }
};

export default configuracionController;
