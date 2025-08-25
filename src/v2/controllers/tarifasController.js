/**
 * Controlador de Tarifas - V2
 * 
 * File: src/v2/controllers/tarifasController.js
 * 
 * Descripción: Controlador para manejar operaciones CRUD de tarifas.
 * 
 * Cambios en V2:
 * - Migración de SQLite3 a dbTurso para base de datos
 * - Reemplazo de WebSockets con Server-Sent Events (SSE)
 * - Mantiene solo las funcionalidades de V1
 * - Respeta el esquema de la base de datos actual
 */

import dbTurso from '../../database/db-turso.js';

// Managers SSE - Configurados dinámicamente
let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

const tarifasController = {
    /**
     * Registrar tarifa - Adaptado de v1
     * Crear una nueva tarifa con fecha_inicio y fecha_fin
     */
    async registrarTarifa(req, res) {
        try {
            const { nombre, descripcion, fecha_inicio, fecha_fin, modificado_por } = req.body;

            // Validar que la fecha inicio sea menor a fecha fin
            if (fecha_fin && new Date(fecha_inicio) > new Date(fecha_fin)) {
                return res.status(400).json({ error: 'La fecha de inicio no puede ser mayor a la fecha de fin' });
            }

            console.log("Body Tarifa", req.body);

            if (!nombre || !descripcion || !fecha_inicio || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            const query = `
                INSERT INTO tarifas (nombre, descripcion, fecha_inicio, fecha_fin, modificado_por, fecha_creacion)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `;

            const result = await dbTurso.execute({
                sql: query,
                args: [nombre, descripcion, fecha_inicio, fecha_fin || null, modificado_por]
            });

            const tarifa_id = Number(result.lastInsertRowid); // Convertir BigInt a Number
            
            // Datos completos de la tarifa para SSE
            const tarifaCompleta = {
                id: tarifa_id,
                nombre,
                descripcion,
                fecha_inicio,
                fecha_fin: fecha_fin || null,
                modificado_por,
                fecha_creacion: new Date().toISOString()
            };

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Nueva tarifa "${nombre}" creada`,
                        'success',
                        {
                            tarifa: tarifaCompleta,
                            accion: 'tarifa_creada'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.status(201).json({
                mensaje: 'Tarifa creada exitosamente',
                tarifa_id,
                detalles: tarifaCompleta
            });

        } catch (error) {
            console.error('❌ Error al crear tarifa v2:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Registrar rangos de tarifa - Adaptado de v1
     * Crear rangos de consumo con precios diferenciados
     */
    async registrarRangosTarifa(req, res) {
        try {
            const { tarifa_id, rangos } = req.body;

            if (!tarifa_id || !Array.isArray(rangos) || rangos.length === 0) {
                return res.status(400).json({ error: 'Faltan datos de tarifa o rangos (error-BK)' });
            }

            // Validación interna y de formato
            for (const rango of rangos) {
                const { consumo_min, consumo_max, precio_por_m3 } = rango;
                
                if (
                    consumo_min == null || precio_por_m3 == null ||
                    consumo_min < 0 || precio_por_m3 < 0 ||
                    (consumo_max != null && consumo_max < 0)
                ) {
                    return res.status(400).json({
                        error: 'Los valores de consumo y precio no pueden ser negativos o nulos (error-BK)',
                    });
                }
                
                if (consumo_max != null && consumo_min >= consumo_max) {
                    return res.status(400).json({
                        error: `El consumo mínimo (${consumo_min}) debe ser menor que el consumo máximo (${consumo_max}) (error-BK)`,
                    });
                }
            }

            // Validación cruzada entre rangos del mismo lote
            const ordenados = [...rangos].sort((a, b) => a.consumo_min - b.consumo_min);
            const clavesSet = new Set();

            for (let i = 0; i < ordenados.length; i++) {
                const actual = ordenados[i];
                const clave = `${actual.consumo_min}-${actual.consumo_max}`;

                // Duplicado exacto en el lote
                if (clavesSet.has(clave)) {
                    return res.status(400).json({
                        error: `Ya existe un rango duplicado en la solicitud: [${clave}] (error-BK)`,
                    });
                }
                clavesSet.add(clave);

                // consumo_min igual a consumo_max de otro rango
                for (let j = 0; j < ordenados.length; j++) {
                    if (i !== j && actual.consumo_min === ordenados[j].consumo_max) {
                        return res.status(400).json({
                            error: `El consumo mínimo (${actual.consumo_min}) no puede ser igual al consumo máximo (${ordenados[j].consumo_max}) de otro rango (error-BK)`,
                        });
                    }
                }

                // Verificar huecos involuntarios
                const siguiente = ordenados[i + 1];
                if (siguiente && actual.consumo_max != null && actual.consumo_max + 1 < siguiente.consumo_min) {
                    return res.status(400).json({
                        error: `Hay un hueco entre los rangos [${actual.consumo_min}-${actual.consumo_max}] y [${siguiente.consumo_min}-${siguiente.consumo_max}] (error-BK)`,
                    });
                }
            }

            // Verificar que la tarifa existe
            const tarifaQuery = `SELECT id FROM tarifas WHERE id = ?`;
            const tarifaResult = await dbTurso.execute({
                sql: tarifaQuery,
                args: [tarifa_id]
            });

            if (tarifaResult.rows.length === 0) {
                return res.status(404).json({ error: 'Tarifa no encontrada' });
            }

            // Insertar todos después de validar
            const insertQuery = `
                INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3)
                VALUES (?, ?, ?, ?)
            `;

            for (const rango of rangos) {
                const { consumo_min, consumo_max, precio_por_m3 } = rango;
                
                await dbTurso.execute({
                    sql: insertQuery,
                    args: [tarifa_id, consumo_min, consumo_max || null, precio_por_m3]
                });
            }

            console.log(`✅ [tarifasController] Rangos registrados exitosamente para tarifa ID ${tarifa_id}`);

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Tarifa ID ${tarifa_id} configurada con ${rangos.length} rangos`,
                        'info',
                        {
                            tarifa_id,
                            total_rangos: rangos.length,
                            rangos_resumen: rangos.map(r => ({
                                min: r.consumo_min,
                                max: r.consumo_max,
                                precio: r.precio_por_m3
                            })),
                            accion: 'tarifa_configurada'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.status(200).json({
                mensaje: 'Rangos registrados correctamente (error-BK)',
                tarifa_id,
                rangos_procesados: rangos.length
            });

        } catch (error) {
            console.error('❌ Error al registrar rangos v2:', error);
            if (error.message && error.message.includes('UNIQUE')) {
                return res.status(409).json({ 
                    error: 'Ya existe un rango similar para esta tarifa (error-BK)' 
                });
            }
            res.status(500).json({ 
                error: 'Error interno del servidor (error-BK)',
                detalle: error.message 
            });
        }
    },

    /**
     * Obtener todas las tarifas - Adaptado de v1
     */
    async obtenerTodasLasTarifas(req, res) {
        try {
            const tarifasQuery = `SELECT * FROM tarifas`;
            const result = await dbTurso.execute(tarifasQuery);

            if (!result.rows || result.rows.length === 0) {
                return res.status(404).json({ error: 'No hay tarifas registradas(error-BK)' });
            }

            // Para cada tarifa, obtener sus rangos
            const tarifasConRangos = [];
            
            for (const tarifa of result.rows) {
                const rangosQuery = `SELECT * FROM rangos_tarifas WHERE tarifa_id = ? ORDER BY consumo_min ASC`;
                const rangosResult = await dbTurso.execute({
                    sql: rangosQuery,
                    args: [tarifa.id]
                });

                tarifasConRangos.push({
                    id: Number(tarifa.id),
                    nombre: tarifa.nombre,
                    descripcion: tarifa.descripcion,
                    fecha_inicio: tarifa.fecha_inicio,
                    fecha_fin: tarifa.fecha_fin,
                    modificado_por: Number(tarifa.modificado_por),
                    fecha_creacion: tarifa.fecha_creacion,
                    rangos: rangosResult.rows.map(rango => ({
                        id: Number(rango.id),
                        tarifa_id: Number(rango.tarifa_id),
                        consumo_min: Number(rango.consumo_min),
                        consumo_max: rango.consumo_max ? Number(rango.consumo_max) : null,
                        precio_por_m3: Number(rango.precio_por_m3)
                    }))
                });
            }

            res.status(200).json(tarifasConRangos);

        } catch (error) {
            console.error('❌ Error al obtener tarifas v2:', error);
            res.status(500).json({ error: 'Error interno del servidor(error-BK)' });
        }
    },

    /**
     * Obtener historial de tarifas - Adaptado de v1
     */
    async obtenerHistorialTarifas(req, res) {
        try {
            const query = `SELECT * FROM historial_tarifas ORDER BY fecha_cambio DESC`;
            const result = await dbTurso.execute(query);
            
            const historial = result.rows.map(row => ({
                id: Number(row.id),
                tarifa_id: row.tarifa_id ? Number(row.tarifa_id) : null,
                rango_id: row.rango_id ? Number(row.rango_id) : null,
                fecha_cambio: row.fecha_cambio,
                consumo_min: row.consumo_min ? Number(row.consumo_min) : null,
                consumo_max: row.consumo_max ? Number(row.consumo_max) : null,
                precio_anterior: row.precio_anterior ? Number(row.precio_anterior) : null,
                precio_nuevo: Number(row.precio_nuevo)
            }));

            res.status(200).json(historial);

        } catch (error) {
            console.error('❌ Error al obtener historial v2:', error);
            res.status(500).json({ error: 'Error interno del servidor(error-BK)' });
        }
    },

    /**
     * Modificar tarifa - Adaptado de v1
     */
    async modificarTarifa(req, res) {
        try {
            const { id } = req.params;
            const { nombre, descripcion, fecha_inicio, fecha_fin } = req.body;
            const modificado_por = req.usuario?.id || req.body.modificado_por;

            if (!descripcion || !fecha_inicio || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            // Verificar que la tarifa existe
            const verificarQuery = `SELECT * FROM tarifas WHERE id = ?`;
            const verificarResult = await dbTurso.execute({ sql: verificarQuery, args: [id] });

            if (verificarResult.rows.length === 0) {
                return res.status(404).json({ error: 'Tarifa no encontrada' });
            }

            const query = `
                UPDATE tarifas
                SET nombre = ?, descripcion = ?, fecha_inicio = ?, fecha_fin = ?, modificado_por = ?
                WHERE id = ?
            `;

            await dbTurso.execute({
                sql: query,
                args: [nombre, descripcion, fecha_inicio, fecha_fin || null, modificado_por, id]
            });

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Tarifa "${nombre}" modificada`,
                        'info',
                        {
                            tarifa_id: Number(id),
                            nombre,
                            accion: 'tarifa_modificada'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.status(200).json({ mensaje: 'Tarifa modificada exitosamente' });

        } catch (error) {
            console.error('❌ Error al modificar tarifa v2:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Modificar rangos de tarifa - Adaptado de v1
     */
    async modificarRangosTarifa(req, res) {
        try {
            const { tarifa_id, rangos } = req.body;

            if (!tarifa_id || !Array.isArray(rangos) || rangos.length === 0) {
                return res.status(400).json({ error: 'Faltan datos de tarifa o rangos (error-BK)' });
            }

            // Validar individualmente
            for (const r of rangos) {
                const { consumo_min, consumo_max, precio_por_m3 } = r;
                if (consumo_min < 0 || (consumo_max != null && consumo_max < 0) || precio_por_m3 < 0) {
                    return res.status(400).json({ error: 'Los valores no pueden ser negativos (error-BK)' });
                }
                if (consumo_max != null && consumo_min >= consumo_max) {
                    return res.status(400).json({ error: 'El consumo mínimo debe ser menor que el máximo (error-BK)' });
                }
            }

            // Validar contra duplicados en el mismo lote
            for (let i = 0; i < rangos.length; i++) {
                for (let j = i + 1; j < rangos.length; j++) {
                    const a = rangos[i];
                    const b = rangos[j];

                    if (a.consumo_min === b.consumo_min && a.consumo_max === b.consumo_max) {
                        return res.status(400).json({ error: `Rango duplicado [${a.consumo_min}-${a.consumo_max}] en el lote (error-BK)` });
                    }

                    if (a.consumo_min === b.consumo_max || a.consumo_max === b.consumo_min) {
                        return res.status(400).json({ error: `No se permite que un mínimo sea igual al máximo de otro rango (error-BK)` });
                    }
                }
            }

            // Ordenar por consumo_min para verificar continuidad
            const ordenados = [...rangos].sort((a, b) => a.consumo_min - b.consumo_min);
            for (let i = 0; i < ordenados.length - 1; i++) {
                const actual = ordenados[i];
                const siguiente = ordenados[i + 1];

                if (actual.consumo_max != null && siguiente.consumo_min !== actual.consumo_max + 1) {
                    console.warn(`⚠️ Advertencia: Posible hueco entre rangos [${actual.consumo_min}-${actual.consumo_max}] y [${siguiente.consumo_min}-${siguiente.consumo_max}]`);
                    // Puedes convertir esto en un return si no deseas permitir huecos.
                }
            }

            // Verificar que la tarifa existe
            const tarifaQuery = `SELECT id FROM tarifas WHERE id = ?`;
            const tarifaResult = await dbTurso.execute({
                sql: tarifaQuery,
                args: [tarifa_id]
            });

            if (tarifaResult.rows.length === 0) {
                return res.status(404).json({ error: 'Tarifa no encontrada' });
            }

            // Procesar cada rango (actualizar si existe, insertar si es nuevo)
            const updateQuery = `
                UPDATE rangos_tarifas 
                SET consumo_min = ?, consumo_max = ?, precio_por_m3 = ?
                WHERE id = ? AND tarifa_id = ?
            `;

            const insertQuery = `
                INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3)
                VALUES (?, ?, ?, ?)
            `;

            for (const rango of rangos) {
                const { id, consumo_min, consumo_max, precio_por_m3 } = rango;

                if (id != null) {
                    // Actualizar rango existente
                    await dbTurso.execute({
                        sql: updateQuery,
                        args: [consumo_min, consumo_max ?? null, precio_por_m3, id, tarifa_id]
                    });
                } else {
                    // Insertar nuevo rango
                    await dbTurso.execute({
                        sql: insertQuery,
                        args: [tarifa_id, consumo_min, consumo_max ?? null, precio_por_m3]
                    });
                }
            }

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Rangos de tarifa modificados para tarifa ID: ${tarifa_id}`,
                        'info',
                        {
                            tarifa_id: Number(tarifa_id),
                            rangos_modificados: rangos.length,
                            accion: 'rangos_tarifa_modificados'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.status(200).json({ mensaje: 'Rangos modificados/agregados exitosamente (error-BK)' });

        } catch (error) {
            console.error('❌ Error al modificar rangos v2:', error);
            res.status(500).json({ 
                error: 'Error interno del servidor', 
                detalle: error.message 
            });
        }
    }
};

export default tarifasController;
