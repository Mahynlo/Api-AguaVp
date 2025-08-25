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


import dbTurso from '../../database/db-turso.js';

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
     */
    registrarPago: async (req, res) => {
        try {
            const {
                factura_id,
                fecha_pago,
                cantidad_entregada,
                metodo_pago,
                comentario,
                modificado_por
            } = req.body;

            if (
                !factura_id || !fecha_pago || cantidad_entregada == null ||
                !metodo_pago || !modificado_por
            ) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            if (cantidad_entregada <= 0) {
                return res.status(400).json({ error: 'La cantidad entregada debe ser mayor a cero' });
            }

            // Verificar existencia de la factura y obtener el saldo
            const facturaQuery = `SELECT id, saldo_pendiente FROM facturas WHERE id = ?`;
            const facturaResult = await dbTurso.execute({
                sql: facturaQuery,
                args: [factura_id]
            });

            if (facturaResult.rows.length === 0) {
                return res.status(404).json({ error: 'Factura no encontrada' });
            }

            const factura = facturaResult.rows[0];
            const saldo = toDecimal(factura.saldo_pendiente);

            if (saldo <= 0) {
                return res.status(400).json({ error: 'La factura ya está completamente pagada' });
            }

            const monto = toDecimal(Math.min(saldo, cantidad_entregada)); // Nunca más del saldo
            const cambio = restaDecimal(cantidad_entregada, monto);

            console.log(`Saldo pendiente: ${saldo}, Cantidad entregada: ${cantidad_entregada}`);
            console.log(`Monto a aplicar: ${monto}, Cambio a devolver: ${cambio}`);

            // Validación adicional para evitar errores de trigger
            if (monto > saldo + 0.01) { // Tolerancia de 1 centavo
                return res.status(400).json({ 
                    error: 'El monto del pago excede el saldo pendiente',
                    detalles: {
                        saldo_pendiente: saldo,
                        monto_solicitado: monto,
                        cantidad_entregada: cantidad_entregada
                    }
                });
            }

            // Insertar pago
            const insertQuery = `
                INSERT INTO pagos (
                    factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, comentario, modificado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const insertResult = await dbTurso.execute({
                sql: insertQuery,
                args: [
                    factura_id,
                    fecha_pago,
                    monto,
                    cantidad_entregada,
                    cambio,
                    metodo_pago,
                    comentario || null,
                    modificado_por
                ]
            });

            const pagoId = Number(insertResult.lastInsertRowid); // Convertir BigInt a Number

            // Obtener datos completos del pago para notificaciones SSE
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
            console.error('Error al registrar pago:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Obtener pagos (V1 compatible)
     */
    obtenerPagos: async (req, res) => {
        try {
            const { id } = req.params;
            const { periodo } = req.query;

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

            // Construir WHERE clause basado en parámetros
            let whereClause = '';
            let queryParams = [];

            if (id) {
                whereClause = 'WHERE p.id = ?';
                queryParams.push(id);
            } else if (periodo) {
                whereClause = 'WHERE l.periodo = ?';
                queryParams.push(periodo);
            }

            // Usar ORDER BY solo cuando no sea consulta específica por ID
            const orderClause = id ? '' : 'ORDER BY p.fecha_pago DESC';
            
            // Agregar LIMIT para consultas grandes (opcional)
            const limitClause = (!id && !periodo) ? 'LIMIT 500' : '';
            
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
                    resumen_general: {
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
     */
    modificarPago: async (req, res) => {
        try {
            const { id } = req.params;
            const { fecha_pago, monto, metodo_pago, modificado_por } = req.body;

            if (!fecha_pago || !monto || !metodo_pago || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            const query = `
                UPDATE pagos
                SET fecha_pago = ?, monto = ?, metodo_pago = ?, modificado_por = ?
                WHERE id = ?
            `;

            const result = await dbTurso.execute({
                sql: query,
                args: [fecha_pago, monto, metodo_pago, modificado_por, id]
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({ error: 'Pago no encontrado' });
            }

            return res.status(200).json({ mensaje: 'Pago modificado exitosamente' });

        } catch (error) {
            console.error('Error al modificar pago:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
};

export default pagosController;
