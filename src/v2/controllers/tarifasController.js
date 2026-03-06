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

import dbTurso from '../../database/db-sqlite.js';
import { nowDate } from '../../utils/timezone.js';

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
            const { nombre, descripcion, fecha_inicio, fecha_fin } = req.body;
            const modificado_por = req.usuario.id; // Siempre desde el token JWT

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
    /**
     * Obtener todas las tarifas (Listar con Paginación) - V2
     */
    async obtenerTodasLasTarifas(req, res) {
        try {
            // Parámetros de paginación y búsqueda
            const { page, limit, search } = req.query;
            const pageNum = parseInt(page) || 1;
            const limitNum = parseInt(limit) || 10;
            const offset = (pageNum - 1) * limitNum;
            const searchTerm = search ? `%${search}%` : null;

            // Construir query base
            let baseQuery = `FROM tarifas t`;
            let whereConditions = [];
            let whereArgs = [];

            if (searchTerm) {
                whereConditions.push(`(t.nombre LIKE ? OR t.descripcion LIKE ?)`);
                whereArgs.push(searchTerm, searchTerm);
            }

            const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

            // 1. Contar total de tarifas
            const countQuery = `SELECT COUNT(*) as total ${baseQuery} ${whereClause}`;
            const countResult = await dbTurso.execute({
                sql: countQuery,
                args: whereArgs
            });
            const totalItems = Number(countResult.rows[0].total);

            // 2. Obtener tarifas paginadas
            const tarifasQuery = `
                SELECT * 
                ${baseQuery} 
                ${whereClause} 
                ORDER BY t.fecha_creacion DESC 
                LIMIT ? OFFSET ?
            `;

            const result = await dbTurso.execute({
                sql: tarifasQuery,
                args: [...whereArgs, limitNum, offset]
            });

            if (!result.rows || result.rows.length === 0) {
                return res.json({
                    tarifas: [],
                    pagination: {
                        total: totalItems,
                        page: pageNum,
                        limit: limitNum,
                        totalPages: Math.ceil(totalItems / limitNum)
                    }
                });
            }

            // Para cada tarifa, obtener sus rangos
            // Optimización: Obtener rangos solo para las tarifas de esta página
            const idsTarifas = result.rows.map(r => r.id);
            const placeholders = idsTarifas.map(() => '?').join(',');

            const rangosQuery = `
                SELECT * FROM rangos_tarifas 
                WHERE tarifa_id IN (${placeholders}) 
                ORDER BY tarifa_id, consumo_min ASC
            `;

            const rangosResult = await dbTurso.execute({
                sql: rangosQuery,
                args: idsTarifas
            });

            // Agrupar rangos por tarifa
            const rangosPorTarifa = {};
            rangosResult.rows.forEach(rango => {
                const tId = Number(rango.tarifa_id);
                if (!rangosPorTarifa[tId]) rangosPorTarifa[tId] = [];
                rangosPorTarifa[tId].push({
                    id: Number(rango.id),
                    tarifa_id: tId,
                    consumo_min: Number(rango.consumo_min),
                    consumo_max: rango.consumo_max ? Number(rango.consumo_max) : null,
                    precio_por_m3: Number(rango.precio_por_m3)
                });
            });

            const tarifasConRangos = result.rows.map(tarifa => {
                const tId = Number(tarifa.id);
                // Determinar si está activa/vigente en el backend también es útil
                const hoy = nowDate();
                const fInicio = tarifa.fecha_inicio;
                const fFin = tarifa.fecha_fin || null;
                const activa = hoy >= fInicio && (!fFin || hoy <= fFin);

                return {
                    id: tId,
                    nombre: tarifa.nombre,
                    descripcion: tarifa.descripcion,
                    fecha_inicio: tarifa.fecha_inicio,
                    fecha_fin: tarifa.fecha_fin,
                    modificado_por: Number(tarifa.modificado_por),
                    fecha_creacion: tarifa.fecha_creacion,
                    activa, // Flag de utilidad
                    rangos: rangosPorTarifa[tId] || []
                };
            });

            res.status(200).json({
                tarifas: tarifasConRangos,
                pagination: {
                    total: totalItems,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(totalItems / limitNum)
                }
            });

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
            const modificado_por = req.usuario.id; // Siempre desde el token JWT

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
    },

    // Obtener tarifa por ID con rangos y clientes asociados
    obtenerTarifaPorId: async (req, res) => {
        const tarifa_id = req.params.id;

        try {
            // Obtener datos de la tarifa
            const tarifaQuery = `
                SELECT 
                    id, nombre, descripcion, fecha_inicio, fecha_fin,
                    modificado_por, fecha_creacion
                FROM tarifas
                WHERE id = ?
            `;
            const tarifaResult = await dbTurso.execute({
                sql: tarifaQuery,
                args: [tarifa_id]
            });

            if (tarifaResult.rows.length === 0) {
                return res.status(404).json({ error: 'Tarifa no encontrada' });
            }

            const tarifa = tarifaResult.rows[0];

            // Obtener rangos asociados
            const rangosQuery = `
                SELECT id, consumo_min, consumo_max, precio_por_m3
                FROM rangos_tarifas
                WHERE tarifa_id = ?
                ORDER BY consumo_min ASC
            `;
            const rangosResult = await dbTurso.execute({
                sql: rangosQuery,
                args: [tarifa_id]
            });

            const rangos = rangosResult.rows.map(row => ({
                id: Number(row.id),
                consumo_min: Number(row.consumo_min),
                consumo_max: row.consumo_max ? Number(row.consumo_max) : null,
                precio_por_m3: Number(row.precio_por_m3)
            }));

            // Obtener clientes usando esta tarifa
            const clientesQuery = `
                SELECT 
                    id, nombre, ciudad, estado_cliente
                FROM clientes
                WHERE tarifa_id = ?
            `;
            const clientesResult = await dbTurso.execute({
                sql: clientesQuery,
                args: [tarifa_id]
            });

            const clientes = clientesResult.rows.map(row => ({
                id: Number(row.id),
                nombre: row.nombre,
                ciudad: row.ciudad,
                estado_cliente: row.estado_cliente
            }));

            // Determinar si la tarifa está activa
            const hoy = nowDate();
            const fechaInicio = tarifa.fecha_inicio;
            const fechaFin = tarifa.fecha_fin || null;
            const estaActiva = fechaInicio <= hoy && (!fechaFin || fechaFin >= hoy);

            res.json({
                tarifa: {
                    id: Number(tarifa.id),
                    nombre: tarifa.nombre,
                    descripcion: tarifa.descripcion,
                    fecha_inicio: tarifa.fecha_inicio,
                    fecha_fin: tarifa.fecha_fin,
                    modificado_por: tarifa.modificado_por ? Number(tarifa.modificado_por) : null,
                    fecha_creacion: tarifa.fecha_creacion,
                    esta_activa: estaActiva
                },
                rangos: rangos,
                clientes: {
                    total: clientes.length,
                    lista: clientes
                }
            });

        } catch (err) {
            console.error('Error obteniendo tarifa por ID:', err);
            res.status(500).json({ error: 'Error al obtener tarifa' });
        }
    },

    // Obtener solo tarifas activas (vigentes)
    obtenerTarifasActivas: async (req, res) => {
        try {
            const query = `
                SELECT 
                    t.id, t.nombre, t.descripcion, t.fecha_inicio, t.fecha_fin,
                    COUNT(c.id) as total_clientes
                FROM tarifas t
                LEFT JOIN clientes c ON t.id = c.tarifa_id
                WHERE t.fecha_inicio <= date('now')
                  AND (t.fecha_fin IS NULL OR t.fecha_fin >= date('now'))
                GROUP BY t.id, t.nombre, t.descripcion, t.fecha_inicio, t.fecha_fin
                ORDER BY t.fecha_inicio DESC
            `;

            const result = await dbTurso.execute({ sql: query });

            const tarifasActivas = result.rows.map(row => ({
                id: Number(row.id),
                nombre: row.nombre,
                descripcion: row.descripcion,
                fecha_inicio: row.fecha_inicio,
                fecha_fin: row.fecha_fin,
                total_clientes: Number(row.total_clientes)
            }));

            // Para cada tarifa, obtener sus rangos
            const tarifasConRangos = await Promise.all(
                tarifasActivas.map(async (tarifa) => {
                    const rangosQuery = `
                        SELECT consumo_min, consumo_max, precio_por_m3
                        FROM rangos_tarifas
                        WHERE tarifa_id = ?
                        ORDER BY consumo_min ASC
                    `;
                    const rangosResult = await dbTurso.execute({
                        sql: rangosQuery,
                        args: [tarifa.id]
                    });

                    const rangos = rangosResult.rows.map(r => ({
                        consumo_min: Number(r.consumo_min),
                        consumo_max: r.consumo_max ? Number(r.consumo_max) : null,
                        precio_por_m3: Number(r.precio_por_m3)
                    }));

                    return {
                        ...tarifa,
                        rangos
                    };
                })
            );

            res.json({
                total: tarifasConRangos.length,
                tarifas: tarifasConRangos
            });

        } catch (err) {
            console.error('Error obteniendo tarifas activas:', err);
            res.status(500).json({ error: 'Error al obtener tarifas activas' });
        }
    },

    // Obtener historial de cambios de precios
    obtenerHistorialTarifa: async (req, res) => {
        const tarifa_id = req.params.id;

        try {
            // Verificar si la tarifa existe
            const verificarQuery = `SELECT id, nombre FROM tarifas WHERE id = ?`;
            const tarifaResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [tarifa_id]
            });

            if (tarifaResult.rows.length === 0) {
                return res.status(404).json({ error: 'Tarifa no encontrada' });
            }

            const tarifa = tarifaResult.rows[0];

            // Obtener historial de cambios
            const historialQuery = `
                SELECT 
                    h.id,
                    h.fecha_cambio,
                    h.consumo_min,
                    h.consumo_max,
                    h.precio_anterior,
                    h.precio_nuevo,
                    r.id as rango_id
                FROM historial_tarifas h
                LEFT JOIN rangos_tarifas r ON h.rango_id = r.id
                WHERE h.tarifa_id = ?
                ORDER BY h.fecha_cambio DESC
            `;

            const historialResult = await dbTurso.execute({
                sql: historialQuery,
                args: [tarifa_id]
            });

            const historial = historialResult.rows.map(row => ({
                id: Number(row.id),
                fecha_cambio: row.fecha_cambio,
                rango: {
                    id: row.rango_id ? Number(row.rango_id) : null,
                    consumo_min: row.consumo_min ? Number(row.consumo_min) : null,
                    consumo_max: row.consumo_max ? Number(row.consumo_max) : null
                },
                precio_anterior: row.precio_anterior ? Number(row.precio_anterior) : null,
                precio_nuevo: Number(row.precio_nuevo),
                cambio_porcentual: row.precio_anterior
                    ? (((Number(row.precio_nuevo) - Number(row.precio_anterior)) / Number(row.precio_anterior)) * 100).toFixed(2) + '%'
                    : 'N/A'
            }));

            // Rangos actuales
            const rangosActualesQuery = `
                SELECT 
                    id, consumo_min, consumo_max, precio_por_m3
                FROM rangos_tarifas
                WHERE tarifa_id = ?
                ORDER BY consumo_min ASC
            `;

            const rangosActualesResult = await dbTurso.execute({
                sql: rangosActualesQuery,
                args: [tarifa_id]
            });

            const rangosActuales = rangosActualesResult.rows.map(row => ({
                id: Number(row.id),
                consumo_min: Number(row.consumo_min),
                consumo_max: row.consumo_max ? Number(row.consumo_max) : null,
                precio_por_m3: Number(row.precio_por_m3)
            }));

            res.json({
                tarifa: {
                    id: Number(tarifa.id),
                    nombre: tarifa.nombre
                },
                rangos_actuales: rangosActuales,
                historial: {
                    total_cambios: historial.length,
                    cambios: historial
                }
            });

        } catch (err) {
            console.error('Error obteniendo historial de tarifa:', err);
            res.status(500).json({ error: 'Error al obtener historial' });
        }
    },

    // Estadísticas generales de tarifas
    estadisticas: async (req, res) => {
        try {
            // 1. Total de tarifas
            const totalQuery = `SELECT COUNT(*) as total FROM tarifas`;
            const totalResult = await dbTurso.execute({ sql: totalQuery });
            const totalTarifas = Number(totalResult.rows[0].total);

            // 2. Tarifas activas vs inactivas
            const estadoQuery = `
                SELECT 
                    COUNT(CASE 
                        WHEN fecha_inicio <= date('now') 
                        AND (fecha_fin IS NULL OR fecha_fin >= date('now'))
                        THEN 1 END) as activas,
                    COUNT(CASE 
                        WHEN fecha_inicio > date('now') 
                        OR (fecha_fin IS NOT NULL AND fecha_fin < date('now'))
                        THEN 1 END) as inactivas
                FROM tarifas
            `;
            const estadoResult = await dbTurso.execute({ sql: estadoQuery });
            const estados = estadoResult.rows[0];

            // 3. Distribución de clientes por tarifa
            const distribucionQuery = `
                SELECT 
                    t.id,
                    t.nombre,
                    COUNT(c.id) as total_clientes
                FROM tarifas t
                LEFT JOIN clientes c ON t.id = c.tarifa_id
                GROUP BY t.id, t.nombre
                ORDER BY total_clientes DESC
            `;
            const distribucionResult = await dbTurso.execute({ sql: distribucionQuery });
            const distribucion = distribucionResult.rows.map(row => ({
                tarifa_id: Number(row.id),
                tarifa_nombre: row.nombre,
                total_clientes: Number(row.total_clientes)
            }));

            // 4. Clientes sin tarifa asignada
            const sinTarifaQuery = `
                SELECT COUNT(*) as total
                FROM clientes
                WHERE tarifa_id IS NULL
            `;
            const sinTarifaResult = await dbTurso.execute({ sql: sinTarifaQuery });
            const clientesSinTarifa = Number(sinTarifaResult.rows[0].total);

            // 5. Total de rangos en todas las tarifas
            const rangosQuery = `SELECT COUNT(*) as total FROM rangos_tarifas`;
            const rangosResult = await dbTurso.execute({ sql: rangosQuery });
            const totalRangos = Number(rangosResult.rows[0].total);

            // 6. Promedio de rangos por tarifa
            const promedioRangosQuery = `
                SELECT AVG(cantidad_rangos) as promedio
                FROM (
                    SELECT tarifa_id, COUNT(*) as cantidad_rangos
                    FROM rangos_tarifas
                    GROUP BY tarifa_id
                )
            `;
            const promedioRangosResult = await dbTurso.execute({ sql: promedioRangosQuery });
            const promedioRangos = Number(promedioRangosResult.rows[0].promedio || 0).toFixed(2);

            // 7. Rango de precios (mínimo y máximo)
            const preciosQuery = `
                SELECT 
                    MIN(precio_por_m3) as precio_minimo,
                    MAX(precio_por_m3) as precio_maximo,
                    AVG(precio_por_m3) as precio_promedio
                FROM rangos_tarifas
            `;
            const preciosResult = await dbTurso.execute({ sql: preciosQuery });
            const precios = preciosResult.rows[0];

            // 8. Historial de cambios recientes (últimos 30 días)
            const cambiosRecientesQuery = `
                SELECT COUNT(*) as total
                FROM historial_tarifas
                WHERE fecha_cambio >= date('now', '-30 days')
            `;
            const cambiosRecientesResult = await dbTurso.execute({ sql: cambiosRecientesQuery });
            const cambiosRecientes = Number(cambiosRecientesResult.rows[0].total);

            // 9. Tarifa más usada
            const masUsadaQuery = `
                SELECT 
                    t.id, t.nombre, COUNT(c.id) as clientes
                FROM tarifas t
                INNER JOIN clientes c ON t.id = c.tarifa_id
                GROUP BY t.id, t.nombre
                ORDER BY clientes DESC
                LIMIT 1
            `;
            const masUsadaResult = await dbTurso.execute({ sql: masUsadaQuery });
            const tarifaMasUsada = masUsadaResult.rows.length > 0 ? {
                id: Number(masUsadaResult.rows[0].id),
                nombre: masUsadaResult.rows[0].nombre,
                clientes: Number(masUsadaResult.rows[0].clientes)
            } : null;

            res.json({
                resumen: {
                    total_tarifas: totalTarifas,
                    tarifas_activas: Number(estados.activas),
                    tarifas_inactivas: Number(estados.inactivas),
                    clientes_sin_tarifa: clientesSinTarifa,
                    total_rangos: totalRangos,
                    promedio_rangos_por_tarifa: parseFloat(promedioRangos),
                    cambios_ultimos_30_dias: cambiosRecientes
                },
                precios: {
                    minimo: precios.precio_minimo ? Number(precios.precio_minimo) : 0,
                    maximo: precios.precio_maximo ? Number(precios.precio_maximo) : 0,
                    promedio: precios.precio_promedio ? Number(precios.precio_promedio).toFixed(2) : '0.00'
                },
                distribucion_clientes: distribucion,
                tarifa_mas_usada: tarifaMasUsada,
                fecha_generacion: new Date().toISOString()
            });

        } catch (err) {
            console.error('Error obteniendo estadísticas de tarifas:', err);
            res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    }
};

export default tarifasController;
