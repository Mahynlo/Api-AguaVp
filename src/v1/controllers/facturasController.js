const db = require('../../database/db');
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

const facturasController = {
    generarFactura: async (req, res) => {
        console.log('Generar factura:', req.body);
        try {
            const { lectura_id, cliente_id, tarifa_id, consumo_m3, fecha_emision, modificado_por } = req.body;

            if (!lectura_id || !cliente_id || !tarifa_id || consumo_m3 == null || !fecha_emision || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            // Verificar si ya existe una factura para el cliente en el mismo periodo
            const facturaExistente = await new Promise((resolve, reject) => {
                db.get(`SELECT id FROM facturas WHERE lectura_id = ?`, [lectura_id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });
            if (facturaExistente) {
                return res.status(409).json({ error: 'Ya existe una factura para este cliente en ese periodo.' });
            }


            // Verificar existencia de tarifa
            const tarifaExiste = await new Promise((resolve, reject) => {
                db.get(`SELECT id FROM tarifas WHERE id = ?`, [tarifa_id], (err, row) => {
                    if (err) return reject(err);
                    resolve(!!row);
                });
            });
            if (!tarifaExiste) {
                return res.status(404).json({ error: 'La tarifa no existe' });
            }

            // Verificar existencia de cliente
            const clienteExiste = await new Promise((resolve, reject) => {
                db.get(`SELECT id FROM clientes WHERE id = ?`, [cliente_id], (err, row) => {
                    if (err) return reject(err);
                    resolve(!!row);
                });
            });
            if (!clienteExiste) {
                return res.status(404).json({ error: 'El cliente no existe' });
            }

            // Verificar existencia de lectura
            const lecturaExiste = await new Promise((resolve, reject) => {
                db.get(`SELECT id FROM lecturas WHERE id = ?`, [lectura_id], (err, row) => {
                    if (err) return reject(err);
                    resolve(!!row);
                });
            });
            if (!lecturaExiste) {
                return res.status(404).json({ error: 'La lectura no existe' });
            }


            // Obtener rangos de la tarifa ordenados ascendentemente
            const rangos = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT consumo_min, consumo_max, precio_por_m3 
                 FROM rangos_tarifas 
                 WHERE tarifa_id = ? 
                 ORDER BY consumo_min ASC`,
                    [tarifa_id],
                    (err, rows) => {
                        if (err) return reject(err);
                        resolve(rows);
                    }
                );
            });

            if (!rangos || rangos.length === 0) {
                return res.status(400).json({ error: 'La tarifa no tiene rangos definidos' });
            }

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

            total = parseFloat(total.toFixed(2)); // redondear a dos decimales para evitar problemas de precisión


            const estado = 'Pendiente';

            // Calcular fecha de vencimiento (30 días después)
            const fechaVencimiento = new Date(fecha_emision);
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
            const fecha_vencimiento_str = fechaVencimiento.toISOString().split('T')[0];

            const query = `
            INSERT INTO facturas 
            (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, estado, total, saldo_pendiente, modificado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

            db.run(
                query,
                [lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento_str, estado, total, total, modificado_por],
                function (err) {
                    if (err) {
                        console.error('Error al generar factura:', err);
                        return res.status(500).json({ error: 'Error interno del servidor' });
                    }

                    const factura_id = this.lastID;

                    // Obtener datos completos de la factura para WebSocket
                    db.get(`
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
                    `, [factura_id], (err, facturaCompleta) => {

                        // Emitir eventos WebSocket
                        if (res.websocket && facturaCompleta) {
                            // Notificar generación de factura
                            res.websocket.notifyBusiness('factura_generada', {
                                factura_id,
                                cliente_nombre: facturaCompleta.cliente_nombre,
                                total,
                                fecha_vencimiento: fecha_vencimiento_str,
                                periodo: facturaCompleta.periodo,
                                consumo_m3: facturaCompleta.consumo_m3
                            });

                            // Notificar a administradores
                            res.websocket.emitToRoom('administradores', 'factura_generada_admin', {
                                message: `Factura generada por $${total}`,
                                factura_id,
                                cliente_nombre: facturaCompleta.cliente_nombre,
                                total,
                                operador_id: modificado_por
                            });

                            // Broadcast para dashboard
                            res.websocket.broadcast('dashboard_update', {
                                type: 'factura_generada',
                                data: {
                                    factura_id,
                                    total,
                                    fecha_emision,
                                    cliente_id
                                }
                            });
                        }

                        return res.status(201).json({
                            mensaje: 'Factura generada exitosamente',
                            factura_id,
                            total_calculado: total,
                            detalles: facturaCompleta
                        });
                    });
                }
            );
        } catch (error) {
            console.error('Error al generar factura:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },





    obtenerFacturas: (req, res) => {
        try {
            const { id } = req.params;
            const { periodo } = req.query;

            // 🚀 Consulta optimizada con CTEs y JOINs eficientes
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

            // 🔧 Construir WHERE y ORDER clauses de forma eficiente
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
            
            // 🎯 Agregar LIMIT para consultas grandes (opcional)
            const limitClause = (!id && !periodo) ? 'LIMIT 1000' : '';
            
            const query = `${baseQuery} ${whereClause} ${orderClause} ${limitClause}`;

            console.log('� Consulta optimizada:', {
                id,
                periodo,
                hasLimit: !id && !periodo,
                queryLength: query.length
            });

            const callback = (err, result) => {
                if (err) {
                    console.error('Error en consulta optimizada:', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                if (id && !result) {
                    return res.status(404).json({ error: 'Factura no encontrada' });
                }

                if (periodo && !id && (!result || result.length === 0)) {
                    return res.status(404).json({ 
                        error: 'No se encontraron facturas para el periodo especificado',
                        periodo 
                    });
                }

                // 🚀 Formateo optimizado con destructuring
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
                        id, cliente_id, cliente_nombre, direccion_cliente, telefono_cliente,
                        lectura_id, consumo_m3, 
                        costo_por_m3: costo_por_m3 || 0,
                        total, saldo_pendiente, estado, fecha_emision, fecha_vencimiento,
                        modificado_por, modificado_por_nombre, fecha_creacion,
                        tarifa_id, tarifa_nombre, periodo, mes_facturado, fecha_lectura,
                        medidor: {
                            id: medidor_id,
                            numero_serie: medidor_numero_serie,
                            ubicacion: medidor_ubicacion
                        },
                        ruta: ruta_id ? { id: ruta_id, nombre: ruta_nombre } : null,
                        adeudo_anterior: adeudo_anterior || 0,
                        consumo_mes_anterior: {
                            consumo_m3: consumo_mes_anterior || null,
                            periodo: periodo_mes_anterior || null,
                            fecha_lectura: fecha_lectura_mes_anterior || null,
                            diferencia_consumo: consumo_mes_anterior ? 
                                (consumo_m3 - consumo_mes_anterior) : null
                        }
                    };
                };

                if (id) {
                    // Respuesta para una sola factura
                    return res.status(200).json(formatearFactura(result));
                } else {
                    // 🚀 Procesamiento optimizado para múltiples facturas
                    const facturasFormateadas = result.map(formatearFactura);
                    
                    const response = {
                        facturas: facturasFormateadas,
                        total: facturasFormateadas.length,
                        // Metadata útil para el frontend
                        metadata: {
                            timestamp: new Date().toISOString(),
                            version: 'v1.1-optimized'
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
                            promedio_consumo: (facturasFormateadas.reduce((sum, f) => sum + f.consumo_m3, 0) / facturasFormateadas.length).toFixed(2)
                        };
                    }
                    
                    return res.status(200).json(response);
                }
            };

            // � Ejecución optimizada de la consulta
            const startTime = Date.now();
            
            if (id) {
                db.get(query, queryParams, (err, result) => {
                    const executionTime = Date.now() - startTime;
                    console.log(`⚡ Consulta individual ejecutada en ${executionTime}ms`);
                    callback(err, result);
                });
            } else {
                db.all(query, queryParams, (err, result) => {
                    const executionTime = Date.now() - startTime;
                    console.log(`⚡ Consulta múltiple ejecutada en ${executionTime}ms - ${result?.length || 0} registros`);
                    callback(err, result);
                });
            }

        } catch (error) {
            console.error('Error al obtener factura(s):', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    modificarFactura: (req, res) => {
        try {
            const { id } = req.params;
            const { estado, total, modificado_por } = req.body;

            if (!estado || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            const query = `
        UPDATE facturas
        SET estado = ?, total = ?, modificado_por = ?
        WHERE id = ?
      `;

            db.run(query, [estado, total || 0, modificado_por, id], function (err) {
                if (err) {
                    console.error('Error al modificar factura:', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Factura no encontrada' });
                }

                return res.status(200).json({ mensaje: 'Factura modificada exitosamente' });
            });

        } catch (error) {
            console.error('Error al modificar factura:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    // Middleware de WebSocket para todas las operaciones de facturas
    withWebSocket: ControllerIntegration.withWebSocket
};

module.exports = facturasController;
