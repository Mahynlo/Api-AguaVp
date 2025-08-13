//file: src/controllers/lecturasController.js
import db from '../../database/db.js';
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

/**
 * Función auxiliar para generar factura automáticamente
 * @param {Object} params - Parámetros para generar la factura
 * @param {number} params.lectura_id - ID de la lectura
 * @param {number} params.cliente_id - ID del cliente
 * @param {number} params.tarifa_id - ID de la tarifa
 * @param {number} params.consumo_m3 - Consumo en metros cúbicos
 * @param {string} params.fecha_emision - Fecha de emisión
 * @param {number} params.modificado_por - ID del usuario que modifica
 * @param {Object} websocket - Objeto websocket para notificaciones
 * @returns {Promise<Object>} - Resultado de la generación de factura
 */
const generarFacturaAutomatica = async (params, websocket = null) => {
    const { lectura_id, cliente_id, tarifa_id, consumo_m3, fecha_emision, modificado_por } = params;

    try {
        // Verificar si ya existe una factura para esta lectura
        const facturaExistente = await new Promise((resolve, reject) => {
            db.get(`SELECT id FROM facturas WHERE lectura_id = ?`, [lectura_id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (facturaExistente) {
            return { success: false, error: 'Ya existe una factura para esta lectura' };
        }

        // Obtener rangos de la tarifa
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
            return { success: false, error: 'La tarifa no tiene rangos definidos' };
        }

        // Calcular total basado en rangos
        const primerRango = rangos[0];
        const ultimoRango = rangos[rangos.length - 1];
        let total = 0;
        const consumoEntero = Math.floor(consumo_m3);

        if (consumoEntero >= primerRango.consumo_min && consumoEntero <= primerRango.consumo_max) {
            total = primerRango.precio_por_m3;
        } else if (consumoEntero >= ultimoRango.consumo_min) {
            total = consumo_m3 * ultimoRango.precio_por_m3;
        } else {
            const rangoIntermedio = rangos.find(rango =>
                consumoEntero >= rango.consumo_min && consumoEntero <= rango.consumo_max
            );

            if (rangoIntermedio) {
                total = consumo_m3 * rangoIntermedio.precio_por_m3;
            } else {
                return { success: false, error: 'Consumo fuera de los rangos definidos' };
            }
        }

        total = parseFloat(total.toFixed(2));

        // Calcular fecha de vencimiento (30 días después)
        const fechaVencimiento = new Date(fecha_emision);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
        const fecha_vencimiento_str = fechaVencimiento.toISOString().split('T')[0];

        // Insertar factura
        const factura_id = await new Promise((resolve, reject) => {
            const query = `
                INSERT INTO facturas 
                (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, estado, total, saldo_pendiente, modificado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(
                query,
                [lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento_str, 'Pendiente', total, total, modificado_por],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });

        // Obtener datos completos de la factura
        const facturaCompleta = await new Promise((resolve, reject) => {
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
            `, [factura_id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        // Emitir eventos WebSocket si están disponibles
        if (websocket && facturaCompleta) {
            websocket.notifyBusiness('factura_auto_generada', {
                factura_id,
                cliente_nombre: facturaCompleta.cliente_nombre,
                total,
                fecha_vencimiento: fecha_vencimiento_str,
                periodo: facturaCompleta.periodo,
                consumo_m3: facturaCompleta.consumo_m3,
                lectura_id
            });

            websocket.emitToRoom('administradores', 'factura_auto_generada_admin', {
                message: `Factura auto-generada por $${total}`,
                factura_id,
                cliente_nombre: facturaCompleta.cliente_nombre,
                total,
                operador_id: modificado_por,
                lectura_id
            });

            websocket.broadcast('dashboard_update', {
                type: 'factura_auto_generada',
                data: {
                    factura_id,
                    total,
                    fecha_emision,
                    cliente_id,
                    lectura_id
                }
            });
        }

        return {
            success: true,
            factura_id,
            total,
            detalles: facturaCompleta
        };

    } catch (error) {
        console.error('Error al generar factura automática:', error);
        return { success: false, error: 'Error interno al generar factura automática' };
    }
};

const lecturasController = {
    registrarLectura: (req, res) => {
        console.log('Registrar lectura:', req.body);
        try {
            const { medidor_id, ruta_id, consumo_m3, fecha_lectura, periodo, modificado_por } = req.body;

            // Validación básica
            if (!medidor_id || !ruta_id || consumo_m3 == null || !fecha_lectura || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            // Validar existencia del medidor
            db.get('SELECT id FROM medidores WHERE id = ?', [medidor_id], (err, medidor) => {
                if (err) {
                    console.error('Error al verificar medidor:', err);
                    return res.status(500).json({ error: 'Error interno al verificar medidor' });
                }

                if (!medidor) {
                    return res.status(404).json({ error: 'Medidor no encontrado' });
                }

                // Validar existencia de la ruta
                db.get('SELECT id FROM rutas WHERE id = ?', [ruta_id], (err, ruta) => {
                    if (err) {
                        console.error('Error al verificar ruta:', err);
                        return res.status(500).json({ error: 'Error interno al verificar ruta' });
                    }

                    if (!ruta) {
                        return res.status(404).json({ error: 'Ruta no encontrada' });
                    }

                    // Verificar si ya existe una lectura para el mismo medidor y periodo
                    const verificacionQuery = `
                    SELECT id FROM lecturas 
                    WHERE medidor_id = ? AND periodo = ?
                `;
                    db.get(verificacionQuery, [medidor_id, periodo], (err, row) => {
                        if (err) {
                            console.error('Error al verificar lectura previa:', err);
                            return res.status(500).json({ error: 'Error interno del servidor' });
                        }

                        if (row) {
                            return res.status(409).json({ error: 'Ya existe una lectura registrada para este medidor y periodo' });
                        }

                        // Insertar lectura
                        const insertQuery = `
                        INSERT INTO lecturas (medidor_id, ruta_id, consumo_m3, fecha_lectura, periodo, modificado_por)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;

                        db.run(insertQuery, [medidor_id, ruta_id, consumo_m3, fecha_lectura, periodo || null, modificado_por], function (err) {
                            if (err) {
                                console.error('Error al registrar lectura:', err);
                                return res.status(500).json({ error: 'Error interno del servidor' });
                            }

                            const lectura_id = this.lastID;

                            // Obtener datos completos para WebSocket
                            db.get(`
                                SELECT 
                                    l.*, 
                                    m.numero_serie as medidor_numero,
                                    m.ubicacion as medidor_ubicacion,
                                    c.nombre as cliente_nombre,
                                    c.tarifa_id as cliente_tarifa_id,
                                    r.nombre as ruta_nombre
                                FROM lecturas l
                                LEFT JOIN medidores m ON l.medidor_id = m.id
                                LEFT JOIN clientes c ON m.cliente_id = c.id
                                LEFT JOIN rutas r ON l.ruta_id = r.id
                                WHERE l.id = ?
                            `, [lectura_id], async (err, lecturaCompleta) => {
                                
                                // Emitir eventos WebSocket para la lectura
                                if (res.websocket && lecturaCompleta) {
                                    // Notificar a operadores sobre nueva lectura
                                    res.websocket.emitToRoom('operadores', 'lectura_completada', {
                                        message: `Lectura registrada para medidor ${lecturaCompleta.medidor_numero}`,
                                        lectura: {
                                            id: lectura_id,
                                            medidor_id,
                                            medidor_numero: lecturaCompleta.medidor_numero,
                                            cliente_nombre: lecturaCompleta.cliente_nombre,
                                            consumo_m3,
                                            fecha_lectura,
                                            periodo: periodo || null,
                                            ruta_nombre: lecturaCompleta.ruta_nombre
                                        },
                                        timestamp: new Date().toISOString()
                                    });

                                    // Notificar a administradores para seguimiento
                                    res.websocket.emitToRoom('administradores', 'nueva_lectura_admin', {
                                        message: `Lectura registrada: ${consumo_m3}m³`,
                                        lectura_id,
                                        medidor_numero: lecturaCompleta.medidor_numero,
                                        consumo_m3,
                                        operador_id: modificado_por
                                    });

                                    // Broadcast para dashboard
                                    res.websocket.broadcast('dashboard_update', {
                                        type: 'lectura_registrada',
                                        data: {
                                            lectura_id,
                                            consumo_m3,
                                            periodo: periodo || null,
                                            fecha_lectura
                                        }
                                    });

                                    // Notificar progreso de ruta si disponible
                                    if (ruta_id) {
                                        res.websocket.emitToRoom('operadores', 'progreso_ruta', {
                                            ruta_id,
                                            lectura_completada: {
                                                medidor_id,
                                                lectura_id,
                                                consumo_m3
                                            }
                                        });
                                    }
                                }

                                // 🔥 GENERAR FACTURA AUTOMÁTICAMENTE
                                let facturaResult = null;
                                
                                // Verificar que el cliente tenga una tarifa asignada
                                if (lecturaCompleta && lecturaCompleta.cliente_tarifa_id) {
                                    console.log('🧾 Iniciando generación automática de factura...');
                                    
                                    // Obtener cliente_id del medidor
                                    const clienteInfo = await new Promise((resolve, reject) => {
                                        db.get('SELECT cliente_id FROM medidores WHERE id = ?', [medidor_id], (err, row) => {
                                            if (err) return reject(err);
                                            resolve(row);
                                        });
                                    });

                                    if (clienteInfo && clienteInfo.cliente_id) {
                                        const facturaParams = {
                                            lectura_id,
                                            cliente_id: clienteInfo.cliente_id,
                                            tarifa_id: lecturaCompleta.cliente_tarifa_id,
                                            consumo_m3,
                                            fecha_emision: fecha_lectura,
                                            modificado_por
                                        };

                                        facturaResult = await generarFacturaAutomatica(facturaParams, res.websocket);
                                        
                                        if (facturaResult.success) {
                                            console.log('✅ Factura generada automáticamente:', facturaResult.factura_id);
                                        } else {
                                            console.warn('⚠️ No se pudo generar factura automática:', facturaResult.error);
                                        }
                                    } else {
                                        console.warn('⚠️ No se pudo obtener cliente_id del medidor para generar factura');
                                    }
                                } else {
                                    console.warn('⚠️ Cliente no tiene tarifa asignada, no se puede generar factura automática');
                                }

                                // Respuesta final incluyendo información de factura si se generó
                                const response = { 
                                    mensaje: 'Lectura registrada exitosamente', 
                                    lectura_id,
                                    detalles: lecturaCompleta
                                };

                                if (facturaResult && facturaResult.success) {
                                    response.factura_generada = {
                                        factura_id: facturaResult.factura_id,
                                        total: facturaResult.total,
                                        mensaje: 'Factura generada automáticamente'
                                    };
                                }

                                return res.status(201).json(response);
                            });
                        });
                    });
                });
            });

        } catch (error) {
            console.error('Error al registrar lectura:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },



    obtenerLecturas: (req, res) => {
        try {
            const id = req.params.id || req.query.id;

            const baseQuery = `
                SELECT 
                    l.id, l.medidor_id, l.consumo_m3, l.fecha_lectura, l.periodo, l.modificado_por,
                    u.username AS modificado_por_nombre
                FROM lecturas l
                JOIN usuarios u ON l.modificado_por = u.id
            `;

            const query = id
                ? `${baseQuery} WHERE l.id = ?`
                : `${baseQuery} ORDER BY l.fecha_lectura DESC`;

            const callback = (err, result) => {
                if (err) {
                    console.error('Error al obtener lectura(s):', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                if (id && !result) {
                    return res.status(404).json({ error: 'Lectura no encontrada' });
                }

                return res.status(200).json(result);
            };

            if (id) {
                db.get(query, [id], callback);  // Un solo resultado
            } else {
                db.all(query, [], callback);    // Lista de resultados
            }
        } catch (error) {
            console.error('Error al obtener lectura(s):', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    modificarLectura: (req, res) => {
        try {
            const { id } = req.params;
            const { medidor_id, consumo_m3, fecha_lectura, periodo, modificado_por } = req.body;

            // Validación básica
            if (!medidor_id || !consumo_m3 || !fecha_lectura || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            const query = `
                UPDATE lecturas
                SET medidor_id = ?, consumo_m3 = ?, fecha_lectura = ?, periodo = ?, modificado_por = ?
                WHERE id = ?
            `;

            db.run(query, [medidor_id, consumo_m3, fecha_lectura, periodo || null, modificado_por, id], function (err) {
                if (err) {
                    console.error('Error al modificar lectura:', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Lectura no encontrada' });
                }

                return res.status(200).json({ mensaje: 'Lectura modificada exitosamente' });
            });

        } catch (error) {
            console.error('Error al modificar lectura:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    // Obtener lecturas por ruta y periodo
    obtenerLecturasPorRutaYPeriodo: (req, res) => {
        const { ruta_id, periodo } = req.query;

        if (!ruta_id || !periodo) {
            return res.status(400).json({ error: 'Faltan parámetros: ruta_id y periodo son requeridos' });
        }

        const query = `
        SELECT 
            l.id, 
            l.fecha_lectura, 
            l.consumo_m3, 
            l.periodo, 
            m.numero_serie, 
            c.nombre AS cliente
        FROM lecturas l
        INNER JOIN medidores m ON l.medidor_id = m.id
        INNER JOIN clientes c ON m.cliente_id = c.id
        WHERE l.ruta_id = ? AND l.periodo = ?
        ORDER BY l.fecha_lectura ASC
    `;

        db.all(query, [ruta_id, periodo], (err, rows) => {
            if (err) {
                console.error('Error al obtener lecturas por ruta y periodo:', err.message);
                return res.status(500).json({ error: 'Error interno del servidor al consultar lecturas' });
            }

            if (rows.length === 0) {
                return res.status(404).json({ mensaje: 'No se encontraron lecturas para esa ruta y periodo' });
            }

            return res.status(200).json({ lecturas: rows });
        });
    },

    // 🧾 Nueva función: Generar facturas para lecturas sin factura
    generarFacturasParaLecturasSinFactura: async (req, res) => {
        console.log('Generando facturas para lecturas sin factura...');
        
        try {
            const { periodo, fecha_emision } = req.body;
            const modificado_por = req.usuario.id;

            if (!periodo || !fecha_emision) {
                return res.status(400).json({ error: 'Faltan campos requeridos: periodo y fecha_emision' });
            }

            // Obtener lecturas sin factura
            const lecturasSinFactura = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        l.id as lectura_id,
                        l.consumo_m3,
                        l.fecha_lectura,
                        l.periodo,
                        m.cliente_id,
                        c.tarifa_id,
                        c.nombre as cliente_nombre,
                        m.numero_serie as medidor_numero
                    FROM lecturas l
                    LEFT JOIN medidores m ON l.medidor_id = m.id
                    LEFT JOIN clientes c ON m.cliente_id = c.id
                    LEFT JOIN facturas f ON l.id = f.lectura_id
                    WHERE f.id IS NULL 
                    AND l.periodo = ?
                    AND c.tarifa_id IS NOT NULL
                    AND m.cliente_id IS NOT NULL
                `;
                
                db.all(query, [periodo], (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows || []);
                });
            });

            if (lecturasSinFactura.length === 0) {
                return res.status(404).json({ 
                    mensaje: 'No se encontraron lecturas sin factura para el periodo especificado',
                    periodo
                });
            }

            console.log(`Encontradas ${lecturasSinFactura.length} lecturas sin factura`);

            const resultados = {
                periodo,
                fecha_emision,
                total_lecturas: lecturasSinFactura.length,
                facturas_generadas: 0,
                facturas_fallidas: 0,
                detalles: []
            };

            // Procesar cada lectura
            for (const lectura of lecturasSinFactura) {
                try {
                    const facturaParams = {
                        lectura_id: lectura.lectura_id,
                        cliente_id: lectura.cliente_id,
                        tarifa_id: lectura.tarifa_id,
                        consumo_m3: lectura.consumo_m3,
                        fecha_emision,
                        modificado_por
                    };

                    const facturaResult = await generarFacturaAutomatica(facturaParams, res.websocket);
                    
                    if (facturaResult.success) {
                        resultados.facturas_generadas++;
                        resultados.detalles.push({
                            lectura_id: lectura.lectura_id,
                            cliente_nombre: lectura.cliente_nombre,
                            medidor_numero: lectura.medidor_numero,
                            consumo_m3: lectura.consumo_m3,
                            factura_id: facturaResult.factura_id,
                            total: facturaResult.total,
                            estado: 'generada'
                        });
                    } else {
                        resultados.facturas_fallidas++;
                        resultados.detalles.push({
                            lectura_id: lectura.lectura_id,
                            cliente_nombre: lectura.cliente_nombre,
                            medidor_numero: lectura.medidor_numero,
                            consumo_m3: lectura.consumo_m3,
                            error: facturaResult.error,
                            estado: 'fallida'
                        });
                    }
                } catch (error) {
                    console.error(`Error procesando lectura ${lectura.lectura_id}:`, error);
                    resultados.facturas_fallidas++;
                    resultados.detalles.push({
                        lectura_id: lectura.lectura_id,
                        cliente_nombre: lectura.cliente_nombre,
                        error: 'Error interno al procesar',
                        estado: 'fallida'
                    });
                }
            }

            // Notificar resultado por WebSocket
            if (res.websocket) {
                res.websocket.notifyBusiness('facturas_masivas_generadas', {
                    periodo,
                    total_generadas: resultados.facturas_generadas,
                    total_fallidas: resultados.facturas_fallidas
                });

                res.websocket.emitToRoom('administradores', 'facturas_masivas_admin', {
                    message: `${resultados.facturas_generadas} facturas generadas masivamente`,
                    periodo,
                    total_generadas: resultados.facturas_generadas,
                    total_fallidas: resultados.facturas_fallidas,
                    operador_id: modificado_por
                });
            }

            return res.status(200).json({
                mensaje: 'Proceso de generación masiva de facturas completado',
                ...resultados
            });

        } catch (error) {
            console.error('Error en generación masiva de facturas:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    // Middleware de WebSocket para todas las operaciones de lecturas
    withWebSocket: ControllerIntegration.withWebSocket
};

export default lecturasController;
