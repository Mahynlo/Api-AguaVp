/**
 * Controlador de Facturas - V2
 * 
 * File: src/v2/controllers/facturasController.js
 * 
 * Descripción: Controlador para manejar operaciones CRUD de facturas.
 * 
 * Cambios en V2:
 * - Migración de SQLite3 a dbTurso para base de datos
 * - Reemplazo de WebSockets con Server-Sent Events (SSE)
 * - Mantiene solo las funcionalidades de V1
 * - Respeta completamente el esquema de base de datos
 * - BigInt conversion implementada
 * 
 * Funciones de V1 implementadas:
 * - generarFactura: Lógica completa de cálculo por rangos de tarifas
 * - obtenerFacturas: Con consultas optimizadas y JOINs
 * - modificarFactura: Actualización de facturas existentes
 */

import dbTurso from '../../database/db-turso.js';

// Managers SSE - Configurados dinámicamente
let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

const facturasController = {
    /**
     * Generar factura (lógica principal de V1)
     */
    async generarFactura(req, res) {
        console.log('Generar factura v2:', req.body);
        try {
            const { lectura_id, cliente_id, tarifa_id, consumo_m3, fecha_emision, modificado_por } = req.body;

            if (!lectura_id || !cliente_id || !tarifa_id || consumo_m3 == null || !fecha_emision || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            // Verificar si ya existe una factura para esta lectura
            const facturaExistenteQuery = `SELECT id FROM facturas WHERE lectura_id = ?`;
            const facturaExistente = await dbTurso.execute({ 
                sql: facturaExistenteQuery, 
                args: [lectura_id] 
            });
            
            if (facturaExistente.rows.length > 0) {
                return res.status(409).json({ error: 'Ya existe una factura para este cliente en ese periodo.' });
            }

            // Verificar existencia de tarifa
            const tarifaExisteQuery = `SELECT id FROM tarifas WHERE id = ?`;
            const tarifaResult = await dbTurso.execute({ 
                sql: tarifaExisteQuery, 
                args: [tarifa_id] 
            });
            if (tarifaResult.rows.length === 0) {
                return res.status(404).json({ error: 'La tarifa no existe' });
            }

            // Verificar existencia de cliente
            const clienteExisteQuery = `SELECT id FROM clientes WHERE id = ?`;
            const clienteResult = await dbTurso.execute({ 
                sql: clienteExisteQuery, 
                args: [cliente_id] 
            });
            if (clienteResult.rows.length === 0) {
                return res.status(404).json({ error: 'El cliente no existe' });
            }

            // Verificar existencia de lectura
            const lecturaExisteQuery = `SELECT id FROM lecturas WHERE id = ?`;
            const lecturaResult = await dbTurso.execute({ 
                sql: lecturaExisteQuery, 
                args: [lectura_id] 
            });
            if (lecturaResult.rows.length === 0) {
                return res.status(404).json({ error: 'La lectura no existe' });
            }

            // Obtener rangos de la tarifa ordenados ascendentemente
            const rangosQuery = `
                SELECT consumo_min, consumo_max, precio_por_m3 
                FROM rangos_tarifas 
                WHERE tarifa_id = ? 
                ORDER BY consumo_min ASC
            `;
            const rangosResult = await dbTurso.execute({ 
                sql: rangosQuery, 
                args: [tarifa_id] 
            });

            if (rangosResult.rows.length === 0) {
                return res.status(400).json({ error: 'La tarifa no tiene rangos definidos' });
            }

            const rangos = rangosResult.rows;
            console.log('Rangos obtenidos:', rangos);
            console.log('Consumo total:', consumo_m3);

            const primerRango = rangos[0];
            const ultimoRango = rangos[rangos.length - 1];
            let total = 0;

            // Redondear hacia abajo solo para buscar el rango
            const consumoEntero = Math.floor(consumo_m3);

            if (consumoEntero >= primerRango.consumo_min && consumoEntero <= primerRango.consumo_max) {
                console.log('Consumo dentro del primer rango:', consumo_m3);
                total = primerRango.precio_por_m3;
            } else if (consumoEntero >= ultimoRango.consumo_min) {
                console.log('Consumo mayor o igual que el último rango:', consumo_m3);
                total = consumo_m3 * ultimoRango.precio_por_m3;
            } else {
                console.log('Consumo en rango intermedio:', consumo_m3);

                const rangoIntermedio = rangos.find(rango =>
                    consumoEntero >= rango.consumo_min && consumoEntero <= rango.consumo_max
                );

                if (rangoIntermedio) {
                    console.log('Rango intermedio encontrado:', rangoIntermedio);
                    total = consumo_m3 * rangoIntermedio.precio_por_m3;
                } else {
                    console.error('No se encontró un rango válido para el consumo:', consumo_m3);
                    return res.status(400).json({ error: 'Consumo fuera de los rangos definidos' });
                }
            }

            console.log('Total calculado:', total);

            total = parseFloat(total.toFixed(2)); // redondear a dos decimales

            const estado = 'Pendiente';

            // Calcular fecha de vencimiento (30 días después)
            const fechaVencimiento = new Date(fecha_emision);
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
            const fecha_vencimiento_str = fechaVencimiento.toISOString().split('T')[0];

            // Insertar factura
            const insertQuery = `
                INSERT INTO facturas 
                (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, estado, total, saldo_pendiente, modificado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const insertResult = await dbTurso.execute({
                sql: insertQuery,
                args: [lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento_str, estado, total, total, modificado_por]
            });

            const factura_id = Number(insertResult.lastInsertRowid);

            // Obtener datos completos de la factura para notificaciones
            const facturaCompletaQuery = `
                SELECT 
                    f.*,
                    c.nombre as cliente_nombre,
                    c.correo as cliente_correo,
                    t.nombre as tarifa_nombre,
                    l.consumo_m3,
                    l.periodo,
                    m.numero_serie as medidor_numero
                FROM facturas f
                JOIN clientes c ON f.cliente_id = c.id
                JOIN tarifas t ON f.tarifa_id = t.id
                JOIN lecturas l ON f.lectura_id = l.id
                JOIN medidores m ON l.medidor_id = m.id
                WHERE f.id = ?
            `;

            const facturaCompletaResult = await dbTurso.execute({
                sql: facturaCompletaQuery,
                args: [factura_id]
            });

            const facturaCompleta = facturaCompletaResult.rows[0];

            // Enviar notificaciones SSE
            if (notificationManager && facturaCompleta) {
                try {
                    // Notificar generación de factura
                    notificationManager.alertaSistema(
                        `Factura generada por $${total}`,
                        'success',
                        {
                            factura_id,
                            cliente_nombre: facturaCompleta.cliente_nombre,
                            total,
                            fecha_vencimiento: fecha_vencimiento_str,
                            periodo: facturaCompleta.periodo,
                            consumo_m3: Number(facturaCompleta.consumo_m3),
                            accion: 'factura_generada'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificaciones SSE:', sseError);
                }
            }

            res.status(201).json({
                mensaje: 'Factura generada exitosamente',
                factura_id,
                total_calculado: total,
                detalles: {
                    id: Number(facturaCompleta.id),
                    cliente_nombre: facturaCompleta.cliente_nombre,
                    tarifa_nombre: facturaCompleta.tarifa_nombre,
                    consumo_m3: Number(facturaCompleta.consumo_m3),
                    periodo: facturaCompleta.periodo,
                    medidor_numero: facturaCompleta.medidor_numero,
                    total: Number(facturaCompleta.total),
                    fecha_emision: facturaCompleta.fecha_emision,
                    fecha_vencimiento: facturaCompleta.fecha_vencimiento
                }
            });

        } catch (error) {
            console.error('Error al generar factura v2:', error);
            res.status(500).json({ 
                error: 'Error interno del servidor',
                details: error.message 
            });
        }
    },

    /**
     * Obtener facturas - Adaptado de V1 (consulta optimizada)
     */
    async obtenerFacturas(req, res) {
        try {
            const { id } = req.params;
            const { periodo } = req.query;

            // Consulta optimizada con CTEs y JOINs eficientes adaptada para Turso
            const baseQuery = `
                WITH 
                -- CTE para calcular periodo anterior de forma eficiente
                periodos_calculados AS (
                    SELECT 
                        l.id as lectura_id,
                        l.periodo,
                        CASE 
                            WHEN l.periodo LIKE '____-__' THEN
                                CASE 
                                    WHEN SUBSTR(l.periodo, 6, 2) = '01' THEN 
                                        (CAST(SUBSTR(l.periodo, 1, 4) AS INTEGER) - 1) || '-12'
                                    ELSE 
                                        SUBSTR(l.periodo, 1, 4) || '-' || 
                                        PRINTF('%02d', CAST(SUBSTR(l.periodo, 6, 2) AS INTEGER) - 1)
                                END
                            ELSE NULL
                        END AS periodo_anterior
                    FROM lecturas l
                ),
                -- CTE para datos del mes anterior
                consumos_anteriores AS (
                    SELECT 
                        l.medidor_id,
                        l.periodo,
                        l.consumo_m3,
                        l.fecha_lectura,
                        pc.periodo_anterior
                    FROM lecturas l
                    JOIN periodos_calculados pc ON l.id = pc.lectura_id
                ),
                -- CTE para adeudos anteriores
                adeudos_anteriores AS (
                    SELECT 
                        f.cliente_id,
                        f.fecha_emision,
                        f.id as factura_id,
                        COALESCE(SUM(f2.saldo_pendiente), 0) AS total_adeudo
                    FROM facturas f
                    LEFT JOIN facturas f2 ON f2.cliente_id = f.cliente_id 
                                          AND f2.id != f.id 
                                          AND f2.fecha_emision < f.fecha_emision 
                                          AND f2.saldo_pendiente > 0
                    GROUP BY f.cliente_id, f.fecha_emision, f.id
                )
                SELECT 
                    f.id,
                    f.cliente_id,
                    f.lectura_id,
                    f.tarifa_id,
                    f.fecha_emision,
                    f.fecha_vencimiento,
                    f.total,
                    f.saldo_pendiente,
                    f.estado,
                    f.modificado_por,
                    f.fecha_creacion,
                    
                    -- Información del cliente
                    c.nombre AS cliente_nombre,
                    c.direccion AS direccion_cliente,
                    c.telefono AS telefono_cliente,
                    
                    -- Información de la tarifa
                    t.nombre AS tarifa_nombre,
                    
                    -- Información del usuario
                    u.username AS modificado_por_nombre,
                    
                    -- Información de la lectura actual
                    l.consumo_m3,
                    l.periodo,
                    l.fecha_lectura,
                    
                    -- Mes facturado optimizado
                    CASE 
                        WHEN l.periodo LIKE '____-__' THEN 
                            CASE SUBSTR(l.periodo, 6, 2)
                                WHEN '01' THEN 'Enero'   WHEN '02' THEN 'Febrero'
                                WHEN '03' THEN 'Marzo'   WHEN '04' THEN 'Abril'
                                WHEN '05' THEN 'Mayo'    WHEN '06' THEN 'Junio'
                                WHEN '07' THEN 'Julio'   WHEN '08' THEN 'Agosto'
                                WHEN '09' THEN 'Septiembre' WHEN '10' THEN 'Octubre'
                                WHEN '11' THEN 'Noviembre'  WHEN '12' THEN 'Diciembre'
                                ELSE l.periodo
                            END || ' ' || SUBSTR(l.periodo, 1, 4)
                        ELSE l.periodo
                    END AS mes_facturado,
                    
                    -- Información del medidor
                    m.id AS medidor_id,
                    m.numero_serie AS medidor_numero_serie,
                    m.ubicacion AS medidor_ubicacion,
                    
                    -- Información de la ruta
                    r.id AS ruta_id,
                    r.nombre AS ruta_nombre,
                    
                    -- Costo por m3 desde la tarifa activa
                    rt.precio_por_m3 AS costo_por_m3,
                    
                    -- Adeudo anterior desde CTE
                    aa.total_adeudo AS adeudo_anterior,
                    
                    -- Información del consumo anterior desde CTE
                    ca_anterior.consumo_m3 AS consumo_mes_anterior,
                    pc.periodo_anterior AS periodo_mes_anterior,
                    ca_anterior.fecha_lectura AS fecha_lectura_mes_anterior
                    
                FROM facturas f
                JOIN clientes c ON f.cliente_id = c.id
                JOIN tarifas t ON f.tarifa_id = t.id
                JOIN usuarios u ON f.modificado_por = u.id
                JOIN lecturas l ON f.lectura_id = l.id
                JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN rutas r ON l.ruta_id = r.id
                LEFT JOIN periodos_calculados pc ON l.id = pc.lectura_id
                LEFT JOIN consumos_anteriores ca_anterior ON ca_anterior.medidor_id = m.id 
                                                          AND ca_anterior.periodo = pc.periodo_anterior
                LEFT JOIN adeudos_anteriores aa ON aa.factura_id = f.id
                LEFT JOIN rangos_tarifas rt ON rt.tarifa_id = f.tarifa_id 
                                            AND CAST(l.consumo_m3 AS INTEGER) >= rt.consumo_min 
                                            AND (rt.consumo_max IS NULL OR CAST(l.consumo_m3 AS INTEGER) <= rt.consumo_max)
            `;

            // Construir WHERE y ORDER clauses de forma eficiente
            let whereClause = '';
            let queryParams = [];

            if (id) {
                whereClause = 'WHERE f.id = ?';
                queryParams.push(id);
            } else if (periodo) {
                whereClause = 'WHERE l.periodo = ?';
                queryParams.push(periodo);
            }

            // Usar ORDER BY solo cuando sea necesario
            const orderClause = id ? '' : 'ORDER BY f.fecha_emision DESC';
            
            // Agregar LIMIT para consultas grandes (opcional)
            const limitClause = (!id && !periodo) ? 'LIMIT 1000' : '';
            
            const query = `${baseQuery} ${whereClause} ${orderClause} ${limitClause}`;

            console.log('🚀 Consulta optimizada:', {
                id,
                periodo,
                hasLimit: !id && !periodo,
                queryLength: query.length
            });

            const startTime = Date.now();
            const result = await dbTurso.execute({ sql: query, args: queryParams });
            const executionTime = Date.now() - startTime;

            console.log(`⚡ Consulta ejecutada en ${executionTime}ms - ${result.rows.length} registros`);

            if (id && result.rows.length === 0) {
                return res.status(404).json({ error: 'Factura no encontrada' });
            }

            if (periodo && !id && result.rows.length === 0) {
                return res.status(404).json({ 
                    error: 'No se encontraron facturas para el periodo especificado',
                    periodo 
                });
            }

            // Formateo optimizado con destructuring
            const formatearFactura = (factura) => {
                const {
                    id, cliente_id, cliente_nombre, direccion_cliente, telefono_cliente,
                    lectura_id, consumo_m3, costo_por_m3, total, saldo_pendiente, estado,
                    fecha_emision, fecha_vencimiento, modificado_por, modificado_por_nombre,
                    fecha_creacion, tarifa_id, tarifa_nombre, periodo, mes_facturado,
                    fecha_lectura, medidor_id, medidor_numero_serie, medidor_ubicacion,
                    ruta_id, ruta_nombre, adeudo_anterior, consumo_mes_anterior,
                    periodo_mes_anterior, fecha_lectura_mes_anterior
                } = factura;

                return {
                    id: Number(id), 
                    cliente_id: Number(cliente_id), 
                    cliente_nombre, 
                    direccion_cliente, 
                    telefono_cliente,
                    lectura_id: Number(lectura_id), 
                    consumo_m3: Number(consumo_m3), 
                    costo_por_m3: costo_por_m3 ? Number(costo_por_m3) : 0,
                    total: Number(total), 
                    saldo_pendiente: Number(saldo_pendiente), 
                    estado, 
                    fecha_emision, 
                    fecha_vencimiento,
                    modificado_por: Number(modificado_por), 
                    modificado_por_nombre, 
                    fecha_creacion,
                    tarifa_id: Number(tarifa_id), 
                    tarifa_nombre, 
                    periodo, 
                    mes_facturado, 
                    fecha_lectura,
                    medidor: {
                        id: medidor_id ? Number(medidor_id) : null,
                        numero_serie: medidor_numero_serie,
                        ubicacion: medidor_ubicacion
                    },
                    ruta: ruta_id ? { id: Number(ruta_id), nombre: ruta_nombre } : null,
                    adeudo_anterior: adeudo_anterior ? Number(adeudo_anterior) : 0,
                    consumo_mes_anterior: {
                        consumo_m3: consumo_mes_anterior ? Number(consumo_mes_anterior) : null,
                        periodo: periodo_mes_anterior || null,
                        fecha_lectura: fecha_lectura_mes_anterior || null,
                        diferencia_consumo: consumo_mes_anterior ? 
                            (Number(consumo_m3) - Number(consumo_mes_anterior)) : null
                    }
                };
            };

            if (id) {
                // Respuesta para una sola factura
                return res.status(200).json(formatearFactura(result.rows[0]));
            } else {
                // Procesamiento optimizado para múltiples facturas
                const facturasFormateadas = result.rows.map(formatearFactura);
                
                const response = {
                    facturas: facturasFormateadas,
                    total: facturasFormateadas.length,
                    // Metadata útil para el frontend
                    metadata: {
                        timestamp: new Date().toISOString(),
                        version: 'v2.0-turso-optimized'
                    }
                };
                
                if (periodo) {
                    response.filtros = {
                        periodo,
                        mes_facturado: facturasFormateadas.length > 0 ? 
                            facturasFormateadas[0].mes_facturado : null
                    };
                }
                
                // Estadísticas rápidas si hay datos
                if (facturasFormateadas.length > 0) {
                    response.estadisticas = {
                        total_facturado: facturasFormateadas.reduce((sum, f) => sum + f.total, 0),
                        total_pendiente: facturasFormateadas.reduce((sum, f) => sum + f.saldo_pendiente, 0),
                        facturas_pendientes: facturasFormateadas.filter(f => f.estado === 'Pendiente').length,
                        promedio_consumo: parseFloat((facturasFormateadas.reduce((sum, f) => sum + f.consumo_m3, 0) / facturasFormateadas.length).toFixed(2))
                    };
                }
                
                return res.status(200).json(response);
            }

        } catch (error) {
            console.error('Error al obtener factura(s) v2:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Modificar factura - Adaptado de V1
     */
    async modificarFactura(req, res) {
        try {
            const { id } = req.params;
            const { estado, total, modificado_por } = req.body;

            if (!estado || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            // Verificar que la factura existe
            const verificarQuery = `SELECT * FROM facturas WHERE id = ?`;
            const verificarResult = await dbTurso.execute({ sql: verificarQuery, args: [id] });

            if (verificarResult.rows.length === 0) {
                return res.status(404).json({ error: 'Factura no encontrada' });
            }

            const query = `
                UPDATE facturas
                SET estado = ?, total = ?, modificado_por = ?
                WHERE id = ?
            `;

            await dbTurso.execute({
                sql: query,
                args: [estado, total || 0, modificado_por, id]
            });

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Factura ID ${id} modificada`,
                        'info',
                        {
                            factura_id: Number(id),
                            nuevo_estado: estado,
                            nuevo_total: total ? Number(total) : 0,
                            accion: 'factura_modificada'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.status(200).json({ mensaje: 'Factura modificada exitosamente' });

        } catch (error) {
            console.error('Error al modificar factura v2:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
};

export default facturasController;
