/**
 * Controlador de Pagos - V2
 * 
 * File: src/v2/controllers/pagosController.js
 * 
 * Descripción: Controlador para manejar operaciones de pagos con compatibilidad V1.
 * 
 * Cambios en V2:
 * - Migración de SQLite3 a Turso (@libsql/client)
 * - Reemplazo de WebSockets con Server-Sent Events (SSE)
 * - Mantiene SOLO las funcionalidades de V1
 * - Respeta el esquema de la base de datos
 * - Conversión BigInt a Number para compatibilidad JSON
 * 
 * Funciones V1 implementadas (compatibilidad completa):
 * - registrarPago: Registra un nuevo pago
 * - obtenerPagos: Obtiene pagos (con parámetros opcionales)
 * - modificarPago: Modifica un pago existente
 */


import dbTurso, { sqlite } from '../../database/db-sqlite.js';

// === FUNCIONES UTILITARIAS PARA MANEJO PRECISO DE DECIMALES ===
/**
 * Redondea un número a exactamente 2 decimales
 */
const redondearDecimal = (num) => {
    return Math.round(num * 100) / 100;
};

/**
 * Convierte a número decimal limpio (máximo 2 decimales)
 */
const toDecimal = (value) => {
    return redondearDecimal(parseFloat(value) || 0);
};

/**
 * Resta dos números con precisión decimal
 */
const restaDecimal = (a, b) => {
    return redondearDecimal(a - b);
};

/**
 * Suma dos números con precisión decimal
 */
const sumaDecimal = (a, b) => {
    return redondearDecimal(a + b);
};

// Managers SSE - Configurados dinámicamente
let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

const pagosController = {

    // =====================================================
    // FUNCIONES V1 - COMPATIBILIDAD COMPLETA
    // =====================================================

    /**
     * Registrar nuevo pago (V1 compatible)
     * Usa transacción atómica para prevenir pagos duplicados y race conditions
     */
    registrarPago: async (req, res) => {
        try {
            const {
                factura_id,
                fecha_pago,
                cantidad_entregada,
                metodo_pago,
                comentario
            } = req.body;
            const modificado_por = req.usuario.id; // Siempre desde el token JWT

            if (
                !factura_id || !fecha_pago || cantidad_entregada == null ||
                !metodo_pago || !modificado_por
            ) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            if (cantidad_entregada <= 0) {
                return res.status(400).json({ error: 'La cantidad entregada debe ser mayor a cero' });
            }

            // ── Transacción atómica: lectura de saldo + inserción de pago ──
            // Previene race conditions donde dos pagos simultáneos leen el mismo saldo
            const ejecutarPago = sqlite.transaction(() => {
                // 1. Verificar existencia de la factura y obtener el saldo (dentro de la txn)
                const factura = sqlite.prepare(
                    `SELECT id, saldo_pendiente, estado, convenio_id FROM facturas WHERE id = ?`
                ).get(factura_id);

                if (!factura) {
                    throw { statusCode: 404, error: 'Factura no encontrada' };
                }

                // VALIDACIÓN: Bloquear pagos a facturas en convenio
                if (factura.convenio_id !== null) {
                    throw {
                        statusCode: 403,
                        error: 'Esta factura está incluida en un convenio de pago activo.',
                        mensaje: 'Debe pagar las parcialidades del convenio en lugar de la factura directamente.',
                        convenio_id: factura.convenio_id,
                        tipo_error: 'FACTURA_EN_CONVENIO'
                    };
                }

                const saldo = toDecimal(factura.saldo_pendiente);

                if (saldo <= 0) {
                    throw { statusCode: 400, error: 'La factura ya está completamente pagada' };
                }

                const monto = toDecimal(Math.min(saldo, cantidad_entregada)); // Nunca más del saldo
                const cambio = restaDecimal(cantidad_entregada, monto);

                // Validación adicional para evitar errores de trigger
                if (monto > saldo + 0.01) { // Tolerancia de 1 centavo
                    throw {
                        statusCode: 400,
                        error: 'El monto del pago excede el saldo pendiente',
                        detalles: {
                            saldo_pendiente: saldo,
                            monto_solicitado: monto,
                            cantidad_entregada: cantidad_entregada
                        }
                    };
                }

                // 2. Insertar pago (triggers actualizar_saldo_factura y actualizar_estado_factura se ejecutan aquí)
                const insertResult = sqlite.prepare(`
                    INSERT INTO pagos (
                        factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, comentario, modificado_por
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    factura_id,
                    fecha_pago,
                    monto,
                    cantidad_entregada,
                    cambio,
                    metodo_pago,
                    comentario || null,
                    modificado_por
                );

                return {
                    pagoId: Number(insertResult.lastInsertRowid),
                    monto,
                    cambio
                };
            });

            // Ejecutar la transacción
            const { pagoId, monto, cambio } = ejecutarPago();

            // Obtener datos completos del pago para notificaciones SSE (fuera de la txn, solo lectura)
            const pagoCompletoQuery = `
                SELECT p.*, f.id as factura_numero, c.nombre as cliente_nombre
                FROM pagos p
                JOIN facturas f ON p.factura_id = f.id
                JOIN clientes c ON f.cliente_id = c.id
                WHERE p.id = ?
            `;

            const pagoCompletoResult = await dbTurso.execute({
                sql: pagoCompletoQuery,
                args: [pagoId]
            });

            // Respuesta exitosa (compatible con V1)
            const response = {
                mensaje: 'Pago registrado exitosamente',
                pago_id: pagoId,
                monto_aplicado: monto,
                cambio: cambio
            };

            // Enviar notificaciones SSE si está disponible
            if (notificationManager && pagoCompletoResult.rows.length > 0) {
                const pagoCompleto = pagoCompletoResult.rows[0];

                try {
                    const pagoData = {
                        id: pagoId,
                        factura_id: factura_id,
                        factura_numero: pagoCompleto.factura_numero,
                        cliente_nombre: pagoCompleto.cliente_nombre,
                        monto: monto,
                        cantidad_entregada: cantidad_entregada,
                        cambio: cambio,
                        metodo_pago: metodo_pago,
                        fecha_pago: fecha_pago,
                        timestamp: new Date().toISOString()
                    };

                    // Notificar pago recibido
                    notificationManager.notificacionPersonalizada('pago_recibido', pagoData);

                    // Emitir evento específico de pago completado
                    notificationManager.alertaSistema(
                        `Pago de $${monto} procesado exitosamente`,
                        'success',
                        { pago_id: pagoId, factura_id: factura_id, monto: monto }
                    );

                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            // saldo_pendiente y estado se actualizan automáticamente con los triggers
            return res.status(201).json(response);

        } catch (error) {
            // Errores controlados lanzados desde la transacción
            if (error.statusCode) {
                return res.status(error.statusCode).json(error);
            }
            console.error('Error al registrar pago:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Obtener pagos (V1 compatible + paginación)
     */
    obtenerPagos: async (req, res) => {
        try {
            const { id } = req.params;
            const { periodo, page, limit, search, metodo_pago } = req.query;

            // Defaults para paginación
            const pageNum = parseInt(page) || 1;
            const limitNum = parseInt(limit) || 60;
            const offset = (pageNum - 1) * limitNum;
            const searchTerm = search ? `%${search.toLowerCase()}%` : null;

            const baseQuery = `
                SELECT 
                    p.*,
                    f.estado AS estado_factura, 
                    f.total AS total_factura,
                    f.fecha_emision AS fecha_emision_factura,
                    f.saldo_pendiente AS saldo_pendiente_factura,
                    u.username AS modificado_por_nombre,
                    c.nombre AS cliente_nombre,
                    c.direccion AS direccion_cliente,
                    l.periodo AS periodo_facturado,
                    l.consumo_m3,
                    l.fecha_lectura,
                    m.numero_serie AS medidor_numero_serie
                FROM pagos p
                JOIN facturas f ON p.factura_id = f.id
                JOIN usuarios u ON p.modificado_por = u.id
                JOIN clientes c ON f.cliente_id = c.id
                LEFT JOIN lecturas l ON f.lectura_id = l.id
                LEFT JOIN medidores m ON l.medidor_id = m.id
            `;

            // Construir WHERE clauses dinámicamente
            let whereConditions = [];
            let queryParams = [];
            let countParams = [];

            if (id) {
                whereConditions.push('p.id = ?');
                queryParams.push(id);
            } else {
                // Filtros generales
                if (periodo) {
                    whereConditions.push('l.periodo = ?');
                    queryParams.push(periodo);
                    countParams.push(periodo);
                }

                if (metodo_pago && metodo_pago.trim() !== '') {
                    whereConditions.push('p.metodo_pago = ?');
                    queryParams.push(metodo_pago);
                    countParams.push(metodo_pago);
                }

                if (searchTerm) {
                    whereConditions.push('(LOWER(c.nombre) LIKE ? OR CAST(p.id AS TEXT) LIKE ? OR CAST(f.id AS TEXT) LIKE ? OR LOWER(p.metodo_pago) LIKE ?)');
                    queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
                    countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
                }
            }

            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

            // 1. Si NO es petición por ID, obtener el TOTAL de registros para paginación
            let totalItems = 0;
            if (!id) {
                const countQuery = `
                    SELECT COUNT(*) as total 
                    FROM pagos p
                    JOIN facturas f ON p.factura_id = f.id
                    JOIN clientes c ON f.cliente_id = c.id
                    LEFT JOIN lecturas l ON f.lectura_id = l.id
                    ${whereClause}
                `;

                const countResult = await dbTurso.execute({
                    sql: countQuery,
                    args: countParams
                });
                totalItems = Number(countResult.rows[0].total);
            }

            // Usar ORDER BY solo cuando no sea consulta específica por ID
            const orderClause = id ? '' : 'ORDER BY p.fecha_pago DESC';

            // Agregar LIMIT y OFFSET para paginación
            const limitClause = id ? '' : 'LIMIT ? OFFSET ?';
            if (!id) {
                queryParams.push(limitNum, offset);
            }

            const query = `${baseQuery} ${whereClause} ${orderClause} ${limitClause}`;

            let result;
            if (id) {
                const queryResult = await dbTurso.execute({ sql: query, args: queryParams });
                result = queryResult.rows.length > 0 ? queryResult.rows[0] : null;
            } else {
                const queryResult = await dbTurso.execute({ sql: query, args: queryParams });
                result = queryResult.rows;
            }

            // Convertir BigInt a Number en los resultados
            if (result) {
                if (Array.isArray(result)) {
                    result = result.map(row => ({
                        ...row,
                        id: Number(row.id),
                        factura_id: Number(row.factura_id),
                        modificado_por: Number(row.modificado_por)
                    }));
                } else {
                    result = {
                        ...result,
                        id: Number(result.id),
                        factura_id: Number(result.factura_id),
                        modificado_por: Number(result.modificado_por)
                    };
                }
            }

            if (id && !result) {
                return res.status(404).json({ error: 'Pago no encontrado' });
            }

            // Función auxiliar para formatear período a mes legible
            function formatearMesPeriodo(periodo) {
                if (!periodo || !periodo.match(/^\d{4}-\d{2}$/)) {
                    return periodo;
                }

                const meses = {
                    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
                    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
                    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
                };

                const [año, mes] = periodo.split('-');
                return `${meses[mes]} ${año}`;
            }

            // Para consulta específica por ID, retornar directamente con período
            if (id && result) {
                return res.status(200).json({
                    ...result,
                    periodo_info: {
                        periodo_facturado: result.periodo_facturado,
                        mes_facturado: result.periodo_facturado ?
                            formatearMesPeriodo(result.periodo_facturado) : null
                    }
                });
            }

            // Para consultas múltiples, agregar información de resumen y períodos
            if (Array.isArray(result) && result.length > 0) {
                const totalPagado = toDecimal(result.reduce((sum, pago) => sumaDecimal(sum, toDecimal(pago.monto || 0)), 0));
                const cantidadPagos = result.length;

                // Obtener períodos únicos de los pagos
                const periodosUnicos = [...new Set(
                    result
                        .map(pago => pago.periodo_facturado)
                        .filter(periodo => periodo != null)
                )].sort();

                // Agrupar pagos por período
                const pagosPorPeriodo = periodosUnicos.reduce((acc, periodo) => {
                    const pagosDelPeriodo = result.filter(pago => pago.periodo_facturado === periodo);
                    const totalDelPeriodo = toDecimal(pagosDelPeriodo.reduce((sum, pago) => sumaDecimal(sum, toDecimal(pago.monto || 0)), 0));

                    acc[periodo] = {
                        cantidad_pagos: pagosDelPeriodo.length,
                        total_pagado: totalDelPeriodo,
                        promedio_pago: toDecimal(totalDelPeriodo / pagosDelPeriodo.length)
                    };
                    return acc;
                }, {});

                // Formatear los pagos con información del período
                const pagosFormateados = result.map(pago => ({
                    ...pago,
                    mes_facturado: pago.periodo_facturado ?
                        formatearMesPeriodo(pago.periodo_facturado) : null
                }));

                const respuesta = {
                    pagos: pagosFormateados,
                    pagination: {
                        total: totalItems,
                        page: pageNum,
                        limit: limitNum,
                        totalPages: Math.ceil(totalItems / limitNum)
                    },
                    resumen: {
                        total_pagado: totalPagado,
                        cantidad_pagos: cantidadPagos,
                        promedio_pago: toDecimal(totalPagado / cantidadPagos)
                    },
                    periodos_encontrados: periodosUnicos,
                    resumen_por_periodo: pagosPorPeriodo
                };

                // Si se filtró por período específico, agregar info adicional
                if (periodo) {
                    respuesta.filtro_aplicado = {
                        tipo: 'periodo',
                        valor: periodo,
                        mes_facturado: formatearMesPeriodo(periodo)
                    };
                }

                return res.status(200).json(respuesta);
            }

            // Si no hay resultados pero es consulta múltiple
            if (Array.isArray(result) && result.length === 0) {
                return res.status(200).json({
                    pagos: [],
                    resumen_general: {
                        total_pagado: 0,
                        cantidad_pagos: 0,
                        promedio_pago: 0
                    },
                    periodos_encontrados: [],
                    resumen_por_periodo: {},
                    filtro_aplicado: periodo ? {
                        tipo: 'periodo',
                        valor: periodo,
                        mes_facturado: formatearMesPeriodo(periodo)
                    } : null
                });
            }

            return res.status(200).json(result);

        } catch (error) {
            console.error('Error al obtener pago(s):', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Modificar pago (V1 compatible)
     * Si se modifica el monto, recalcula el saldo_pendiente de la factura asociada
     */
    modificarPago: async (req, res) => {
        try {
            const { id } = req.params;
            const { fecha_pago, monto, metodo_pago, comentario } = req.body;
            const modificado_por = req.usuario.id; // Siempre desde el token JWT

            // Si se está cambiando el monto, usar transacción para recalcular saldo
            if (monto !== undefined) {
                const ejecutarModificacion = sqlite.transaction(() => {
                    // 1. Obtener pago actual
                    const pagoActual = sqlite.prepare(
                        'SELECT id, factura_id, monto FROM pagos WHERE id = ?'
                    ).get(id);

                    if (!pagoActual) {
                        throw { statusCode: 404, error: 'Pago no encontrado' };
                    }

                    const montoAnterior = toDecimal(pagoActual.monto);
                    const montoNuevo = toDecimal(monto);
                    const diferencia = restaDecimal(montoNuevo, montoAnterior);

                    // 2. Verificar que el nuevo monto no exceda el saldo disponible
                    if (diferencia > 0 && pagoActual.factura_id) {
                        const factura = sqlite.prepare(
                            'SELECT saldo_pendiente FROM facturas WHERE id = ?'
                        ).get(pagoActual.factura_id);

                        if (factura) {
                            const saldoActual = toDecimal(factura.saldo_pendiente);
                            if (diferencia > saldoActual + 0.01) {
                                throw {
                                    statusCode: 400,
                                    error: 'El nuevo monto excede el saldo pendiente disponible',
                                    detalles: {
                                        saldo_disponible: saldoActual,
                                        incremento_solicitado: diferencia
                                    }
                                };
                            }
                        }
                    }

                    // 3. Actualizar el pago
                    const setClauses = ['modificado_por = ?', 'monto = ?'];
                    const args = [modificado_por, montoNuevo];

                    if (fecha_pago !== undefined) { setClauses.push('fecha_pago = ?'); args.push(fecha_pago); }
                    if (metodo_pago !== undefined) { setClauses.push('metodo_pago = ?'); args.push(metodo_pago); }
                    if (comentario !== undefined) { setClauses.push('comentario = ?'); args.push(comentario); }

                    args.push(id);
                    sqlite.prepare(
                        `UPDATE pagos SET ${setClauses.join(', ')} WHERE id = ?`
                    ).run(...args);

                    // 4. Recalcular saldo_pendiente de la factura
                    if (pagoActual.factura_id && diferencia !== 0) {
                        sqlite.prepare(
                            `UPDATE facturas SET saldo_pendiente = ROUND(saldo_pendiente - ?, 2) WHERE id = ?`
                        ).run(diferencia, pagoActual.factura_id);
                        // El trigger actualizar_estado_factura se encargará del estado
                    }
                });

                try {
                    ejecutarModificacion();
                } catch (error) {
                    if (error.statusCode) {
                        return res.status(error.statusCode).json(error);
                    }
                    throw error;
                }

                return res.status(200).json({ success: true, message: 'Pago modificado exitosamente' });
            }

            // Sin cambio de monto — actualización simple
            const setClauses = ['modificado_por = ?'];
            const args = [modificado_por];

            if (fecha_pago !== undefined)  { setClauses.push('fecha_pago = ?');  args.push(fecha_pago); }
            if (metodo_pago !== undefined) { setClauses.push('metodo_pago = ?'); args.push(metodo_pago); }
            if (comentario !== undefined)  { setClauses.push('comentario = ?');  args.push(comentario); }

            if (setClauses.length <= 1) {
                return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
            }

            args.push(id);

            const result = await dbTurso.execute({
                sql: `UPDATE pagos SET ${setClauses.join(', ')} WHERE id = ?`,
                args
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({ error: 'Pago no encontrado' });
            }

            return res.status(200).json({ success: true, message: 'Pago modificado exitosamente' });

        } catch (error) {
            console.error('Error al modificar pago:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
};

export default pagosController;
