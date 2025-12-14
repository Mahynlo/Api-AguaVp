/**
 * Controlador de Lecturas - V2
 * 
 * File: src/v2/controllers/lecturasController.js
 * 
 * Descripción: Controlador para manejar operaciones CRUD de lecturas de medidores.
 * 
 * Cambios en V2:
 * - Migración de SQLite3 a dbTurso para base de datos
 * - Reemplazo de WebSockets con Server-Sent Events (SSE)
 * - Mantiene solo las funcionalidades de V1
 * - Respeta completamente el esquema de base de datos
 * - BigInt conversion implementada
 * 
 * Funciones de V1 implementadas:
 * - registrarLectura: Registro de lecturas CON generación automática de facturas
 * - obtenerLecturas: Consulta básica con posibilidad de filtrar por ID
 * - modificarLectura: Actualización de lecturas existentes
 * - obtenerLecturasPorRutaYPeriodo: Filtrado específico de V1
 * - generarFacturasParaLecturasSinFactura: Generación masiva de facturas
 * 
 * Funcionalidad de facturación automática:
 * - generarFacturaAutomatica: Función auxiliar para crear facturas al registrar lecturas
 * - Cálculo automático basado en rangos de tarifas
 * - Validaciones de cliente con tarifa asignada
 * - Notificaciones SSE para lecturas y facturas generadas
 */

import dbTurso from '../../database/db-turso.js';

// Managers SSE - Configurados dinámicamente
let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

/**
 * Función auxiliar para generar factura automáticamente (V1 logic)
 * @param {Object} params - Parámetros para generar la factura
 * @param {number} params.lectura_id - ID de la lectura
 * @param {number} params.cliente_id - ID del cliente
 * @param {number} params.tarifa_id - ID de la tarifa
 * @param {number} params.consumo_m3 - Consumo en metros cúbicos
 * @param {string} params.fecha_emision - Fecha de emisión
 * @param {number} params.modificado_por - ID del usuario que modifica
 * @returns {Promise<Object>} - Resultado de la generación de factura
 */
const generarFacturaAutomatica = async (params) => {
    const { lectura_id, cliente_id, tarifa_id, consumo_m3, fecha_emision, modificado_por } = params;

    try {
        // Verificar si ya existe una factura para esta lectura
        const facturaExistenteQuery = `SELECT id FROM facturas WHERE lectura_id = ?`;
        const facturaExistente = await dbTurso.execute({ 
            sql: facturaExistenteQuery, 
            args: [lectura_id] 
        });

        if (facturaExistente.rows.length > 0) {
            return { success: false, error: 'Ya existe una factura para esta lectura' };
        }

        // Obtener rangos de la tarifa
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
            return { success: false, error: 'La tarifa no tiene rangos definidos' };
        }

        const rangos = rangosResult.rows;

        // Calcular total basado en tarifa progresiva/escalonada
        // Estructura: consumo_min y consumo_max definen el rango, precio_por_m3 es lo que se cobra
        let total = 0;
        const consumoEntero = Math.floor(consumo_m3);
        let rangoEncontrado = false;
        
        for (const rango of rangos) {
            const consumo_min = Number(rango.consumo_min);
            const consumo_max = Number(rango.consumo_max);
            const precio_por_m3 = Number(rango.precio_por_m3);
            
            if (consumoEntero > consumo_max) {
                // El consumo supera este rango completamente
                if (consumo_min === 0) {
                    // Primer rango (base): se cobra el precio completo del rango
                    total += precio_por_m3;
                } else {
                    // Rangos superiores: se cobra precio × metros del rango
                    const metros_en_rango = consumo_max - consumo_min + 1;
                    total += metros_en_rango * precio_por_m3;
                }
            } else if (consumoEntero >= consumo_min) {
                // El consumo está dentro de este rango (rango final)
                if (consumo_min === 0) {
                    // Primer rango (base): se cobra el precio completo del rango base
                    total += precio_por_m3;
                } else {
                    // Rangos superiores: se cobra precio × metros consumidos en este rango
                    const metros_consumidos_en_rango = consumoEntero - consumo_min + 1;
                    total += metros_consumidos_en_rango * precio_por_m3;
                }
                rangoEncontrado = true;
                break; // Ya encontramos el rango final, salir del bucle
            }
        }
        
        // Si el consumo excede todos los rangos, usar el último rango para el excedente
        if (!rangoEncontrado && rangos.length > 0) {
            const ultimoRango = rangos[rangos.length - 1];
            const ultimo_consumo_max = Number(ultimoRango.consumo_max);
            const ultimo_precio_por_m3 = Number(ultimoRango.precio_por_m3);
            
            // Calcular excedente usando el último rango
            const excedente = consumoEntero - ultimo_consumo_max;
            total += excedente * ultimo_precio_por_m3;
        }

        total = parseFloat(total.toFixed(2));

        // Calcular fecha de vencimiento (30 días después)
        const fechaVencimiento = new Date(fecha_emision);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
        const fecha_vencimiento_str = fechaVencimiento.toISOString().split('T')[0];

        // Insertar factura
        const insertFacturaQuery = `
            INSERT INTO facturas 
            (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, estado, total, saldo_pendiente, modificado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const insertFacturaResult = await dbTurso.execute({
            sql: insertFacturaQuery,
            args: [lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento_str, 'Pendiente', total, total, modificado_por]
        });

        const factura_id = Number(insertFacturaResult.lastInsertRowid);

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

        // Enviar notificaciones SSE para factura
        if (notificationManager && facturaCompleta) {
            try {
                notificationManager.facturaGenerada({
                    factura_id,
                    cliente_nombre: facturaCompleta.cliente_nombre,
                    total,
                    fecha_vencimiento: fecha_vencimiento_str,
                    periodo: facturaCompleta.periodo,
                    consumo_m3: Number(facturaCompleta.consumo_m3),
                    medidor_numero: facturaCompleta.medidor_numero,
                    tipo: 'factura_generada_automatica'
                }, modificado_por);
            } catch (sseError) {
                console.warn('Error enviando notificación SSE de factura:', sseError);
            }
        }

        return { 
            success: true, 
            factura_id, 
            total,
            detalles: facturaCompleta
        };

    } catch (error) {
        console.error('Error en generarFacturaAutomatica:', error);
        return { success: false, error: error.message };
    }
};

const lecturasController = {
    /**
     * Registrar nueva lectura - V1 logic con generación automática de facturas
     */
    async registrarLectura(req, res) {
        console.log('Registrar lectura v2:', req.body);
        try {
            const { medidor_id, ruta_id, consumo_m3, fecha_lectura, periodo, modificado_por } = req.body;

            // Validación básica
            if (!medidor_id || !ruta_id || consumo_m3 == null || !fecha_lectura || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            // Validar existencia del medidor
            const medidorQuery = `SELECT id FROM medidores WHERE id = ?`;
            const medidorResult = await dbTurso.execute({ sql: medidorQuery, args: [medidor_id] });
            
            if (medidorResult.rows.length === 0) {
                return res.status(404).json({ error: 'Medidor no encontrado' });
            }

            // Validar existencia de la ruta
            const rutaQuery = `SELECT id FROM rutas WHERE id = ?`;
            const rutaResult = await dbTurso.execute({ sql: rutaQuery, args: [ruta_id] });
            
            if (rutaResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ruta no encontrada' });
            }

            // Verificar si ya existe una lectura para el mismo medidor y periodo
            const verificacionQuery = `SELECT id FROM lecturas WHERE medidor_id = ? AND periodo = ?`;
            const verificacionResult = await dbTurso.execute({ 
                sql: verificacionQuery, 
                args: [medidor_id, periodo] 
            });

            if (verificacionResult.rows.length > 0) {
                return res.status(409).json({ error: 'Ya existe una lectura registrada para este medidor y periodo' });
            }

            // Insertar lectura
            const insertQuery = `
                INSERT INTO lecturas (medidor_id, ruta_id, consumo_m3, fecha_lectura, periodo, modificado_por)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            const insertResult = await dbTurso.execute({
                sql: insertQuery,
                args: [medidor_id, ruta_id, consumo_m3, fecha_lectura, periodo || null, modificado_por]
            });

            const lectura_id = Number(insertResult.lastInsertRowid);

            // Obtener datos completos para SSE y facturación
            const lecturaCompletaQuery = `
                SELECT 
                    l.*, 
                    m.numero_serie as medidor_numero,
                    m.ubicacion as medidor_ubicacion,
                    c.nombre as cliente_nombre,
                    c.tarifa_id as cliente_tarifa_id,
                    m.cliente_id as cliente_id,
                    r.nombre as ruta_nombre
                FROM lecturas l
                LEFT JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN clientes c ON m.cliente_id = c.id
                LEFT JOIN rutas r ON l.ruta_id = r.id
                WHERE l.id = ?
            `;

            const lecturaCompletaResult = await dbTurso.execute({
                sql: lecturaCompletaQuery,
                args: [lectura_id]
            });

            const lecturaCompleta = lecturaCompletaResult.rows[0];

            // Enviar notificaciones SSE para la lectura
            if (sseManager && notificationManager && lecturaCompleta) {
                try {
                    // Notificar a operadores sobre nueva lectura
                    notificationManager.lecturaRegistrada({
                        id: lectura_id,
                        medidor_id,
                        medidor_numero: lecturaCompleta.medidor_numero,
                        cliente_nombre: lecturaCompleta.cliente_nombre,
                        consumo_m3,
                        fecha_lectura,
                        periodo: periodo || null,
                        ruta_nombre: lecturaCompleta.ruta_nombre,
                        message: `Lectura registrada para medidor ${lecturaCompleta.medidor_numero}`
                    }, modificado_por);

                    // Notificar progreso de ruta con alertaSistema
                    notificationManager.alertaSistema(
                        `Progreso de ruta: medidor ${lecturaCompleta.medidor_numero} completado`,
                        'info',
                        {
                            ruta_id,
                            medidor_id,
                            lectura_id,
                            consumo_m3,
                            tipo: 'progreso_ruta'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificaciones SSE de lectura:', sseError);
                }
            }

            // 🔥 GENERAR FACTURA AUTOMÁTICAMENTE (lógica de V1)
            let facturaResult = null;
            
            // Verificar que el cliente tenga una tarifa asignada
            if (lecturaCompleta && lecturaCompleta.cliente_tarifa_id && lecturaCompleta.cliente_id) {
                console.log('🧾 Iniciando generación automática de factura...');
                
                const facturaParams = {
                    lectura_id,
                    cliente_id: lecturaCompleta.cliente_id,
                    tarifa_id: lecturaCompleta.cliente_tarifa_id,
                    consumo_m3,
                    fecha_emision: fecha_lectura,
                    modificado_por
                };

                facturaResult = await generarFacturaAutomatica(facturaParams);
                
                if (facturaResult.success) {
                    console.log('✅ Factura generada automáticamente:', facturaResult.factura_id);
                } else {
                    console.warn('⚠️ No se pudo generar factura automática:', facturaResult.error);
                }
            } else {
                console.warn('⚠️ Cliente no tiene tarifa asignada o cliente_id faltante, no se puede generar factura automática');
            }

            // Respuesta final incluyendo información de factura si se generó
            const response = { 
                mensaje: 'Lectura registrada exitosamente', 
                lectura_id,
                detalles: {
                    id: lectura_id,
                    medidor_id: Number(lecturaCompleta.medidor_id),
                    ruta_id: Number(lecturaCompleta.ruta_id || 0),
                    consumo_m3: Number(lecturaCompleta.consumo_m3),
                    fecha_lectura: lecturaCompleta.fecha_lectura,
                    periodo: lecturaCompleta.periodo,
                    modificado_por: Number(lecturaCompleta.modificado_por || 0),
                    medidor_numero: lecturaCompleta.medidor_numero,
                    medidor_ubicacion: lecturaCompleta.medidor_ubicacion,
                    cliente_nombre: lecturaCompleta.cliente_nombre,
                    ruta_nombre: lecturaCompleta.ruta_nombre
                }
            };

            if (facturaResult && facturaResult.success) {
                response.factura_generada = {
                    factura_id: facturaResult.factura_id,
                    total: facturaResult.total,
                    mensaje: 'Factura generada automáticamente'
                };
            }

            return res.status(201).json(response);

        } catch (error) {
            console.error('Error al registrar lectura v2:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Obtener lecturas - V1 logic (consulta básica con filtro opcional por ID)
     */
    async obtenerLecturas(req, res) {
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

            const result = id 
                ? await dbTurso.execute({ sql: query, args: [id] })
                : await dbTurso.execute(query);

            if (id && result.rows.length === 0) {
                return res.status(404).json({ error: 'Lectura no encontrada' });
            }

            // Formatear resultados con BigInt conversion
            const formatearLectura = (row) => ({
                id: Number(row.id),
                medidor_id: Number(row.medidor_id),
                consumo_m3: Number(row.consumo_m3),
                fecha_lectura: row.fecha_lectura,
                periodo: row.periodo,
                modificado_por: Number(row.modificado_por),
                modificado_por_nombre: row.modificado_por_nombre
            });

            if (id) {
                return res.status(200).json(formatearLectura(result.rows[0]));
            } else {
                const lecturas = result.rows.map(formatearLectura);
                return res.status(200).json(lecturas);
            }

        } catch (error) {
            console.error('Error al obtener lectura(s) v2:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Modificar lectura - V1 logic
     */
    async modificarLectura(req, res) {
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

            const result = await dbTurso.execute({
                sql: query,
                args: [medidor_id, consumo_m3, fecha_lectura, periodo || null, modificado_por, id]
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({ error: 'Lectura no encontrada' });
            }

            // Obtener datos para notificación SSE
            const lecturaActualizadaQuery = `
                SELECT 
                    l.*,
                    m.numero_serie as medidor_numero,
                    c.nombre as cliente_nombre
                FROM lecturas l
                LEFT JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN clientes c ON m.cliente_id = c.id
                WHERE l.id = ?
            `;

            const lecturaResult = await dbTurso.execute({
                sql: lecturaActualizadaQuery,
                args: [id]
            });

            const lectura = lecturaResult.rows[0];

            // Enviar notificación SSE
            if (sseManager && notificationManager && lectura) {
                try {
                    notificationManager.alertaSistema(
                        `Lectura modificada para medidor ${lectura.medidor_numero}`,
                        'info',
                        {
                            lectura_id: Number(id),
                            medidor_id: Number(lectura.medidor_id),
                            medidor_numero: lectura.medidor_numero,
                            cliente_nombre: lectura.cliente_nombre,
                            tipo: 'lectura_modificada'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            return res.status(200).json({ mensaje: 'Lectura modificada exitosamente' });

        } catch (error) {
            console.error('Error al modificar lectura v2:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Obtener lecturas por ruta y periodo - V1 function
     */
    async obtenerLecturasPorRutaYPeriodo(req, res) {
        try {
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

            const result = await dbTurso.execute({ 
                sql: query, 
                args: [ruta_id, periodo] 
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ 
                    mensaje: 'No se encontraron lecturas para esa ruta y periodo' 
                });
            }

            const lecturas = result.rows.map(row => ({
                id: Number(row.id),
                fecha_lectura: row.fecha_lectura,
                consumo_m3: Number(row.consumo_m3),
                periodo: row.periodo,
                numero_serie: row.numero_serie,
                cliente: row.cliente
            }));

            return res.status(200).json({ lecturas });

        } catch (error) {
            console.error('Error al obtener lecturas por ruta y periodo v2:', error);
            return res.status(500).json({ error: 'Error interno del servidor al consultar lecturas' });
        }
    },

    /**
     * Generar facturas para lecturas sin factura - V1 function (generación masiva)
     */
    async generarFacturasParaLecturasSinFactura(req, res) {
        console.log('Generando facturas para lecturas sin factura v2...');
        
        try {
            const { periodo, fecha_emision } = req.body;
            const modificado_por = req.usuario?.id || 1;

            if (!periodo || !fecha_emision) {
                return res.status(400).json({ error: 'Faltan campos requeridos: periodo y fecha_emision' });
            }

            // Obtener lecturas sin factura
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

            const result = await dbTurso.execute({ sql: query, args: [periodo] });
            const lecturasSinFactura = result.rows || [];

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
                        consumo_m3: Number(lectura.consumo_m3),
                        fecha_emision,
                        modificado_por
                    };

                    const facturaResult = await generarFacturaAutomatica(facturaParams);
                    
                    if (facturaResult.success) {
                        resultados.facturas_generadas++;
                        resultados.detalles.push({
                            lectura_id: Number(lectura.lectura_id),
                            cliente_nombre: lectura.cliente_nombre,
                            medidor_numero: lectura.medidor_numero,
                            consumo_m3: Number(lectura.consumo_m3),
                            factura_id: facturaResult.factura_id,
                            total: facturaResult.total,
                            estado: 'generada'
                        });
                    } else {
                        resultados.facturas_fallidas++;
                        resultados.detalles.push({
                            lectura_id: Number(lectura.lectura_id),
                            cliente_nombre: lectura.cliente_nombre,
                            medidor_numero: lectura.medidor_numero,
                            consumo_m3: Number(lectura.consumo_m3),
                            error: facturaResult.error,
                            estado: 'fallida'
                        });
                    }
                } catch (error) {
                    console.error(`Error procesando lectura ${lectura.lectura_id}:`, error);
                    resultados.facturas_fallidas++;
                    resultados.detalles.push({
                        lectura_id: Number(lectura.lectura_id),
                        cliente_nombre: lectura.cliente_nombre,
                        error: 'Error interno al procesar',
                        estado: 'fallida'
                    });
                }
            }

            // Notificar resultado por SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `${resultados.facturas_generadas} facturas generadas masivamente`,
                        'success',
                        {
                            periodo,
                            total_generadas: resultados.facturas_generadas,
                            total_fallidas: resultados.facturas_fallidas,
                            operador_id: modificado_por,
                            accion: 'facturas_masivas_generadas'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE de facturas masivas:', sseError);
                }
            }

            return res.status(200).json({
                mensaje: 'Proceso de generación masiva de facturas completado',
                ...resultados
            });

        } catch (error) {
            console.error('Error en generación masiva de facturas v2:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    // Obtener lecturas por medidor (historial completo)
    obtenerLecturasPorMedidor: async (req, res) => {
        const medidor_id = req.params.id;
        const { limit = 100 } = req.query; // Limitar resultados por defecto

        try {
            // Verificar si el medidor existe
            const verificarMedidorQuery = `
                SELECT m.id, m.numero_serie, m.cliente_id, c.nombre as cliente_nombre
                FROM medidores m
                LEFT JOIN clientes c ON m.cliente_id = c.id
                WHERE m.id = ?
            `;
            const medidorResult = await dbTurso.execute({
                sql: verificarMedidorQuery,
                args: [medidor_id]
            });

            if (medidorResult.rows.length === 0) {
                return res.status(404).json({ error: 'Medidor no encontrado' });
            }

            const medidor = medidorResult.rows[0];

            // Obtener lecturas con información completa
            const lecturasQuery = `
                SELECT 
                    l.id,
                    l.consumo_m3,
                    l.periodo,
                    l.fecha_lectura,
                    f.id as factura_id,
                    f.total as monto_total,
                    f.estado as factura_estado
                FROM lecturas l
                LEFT JOIN facturas f ON l.id = f.lectura_id
                WHERE l.medidor_id = ?
                ORDER BY l.fecha_lectura DESC
                LIMIT ?
            `;

            const lecturasResult = await dbTurso.execute({
                sql: lecturasQuery,
                args: [medidor_id, parseInt(limit)]
            });

            const lecturas = lecturasResult.rows.map(row => ({
                id: Number(row.id),
                consumo_m3: Number(row.consumo_m3),
                periodo: row.periodo,
                fecha_lectura: row.fecha_lectura,
                factura: row.factura_id ? {
                    id: Number(row.factura_id),
                    monto_total: Number(row.monto_total),
                    estado: row.factura_estado
                } : null
            }));

            // Calcular estadísticas
            const consumos = lecturas.map(l => l.consumo_m3);
            const promedio_consumo = consumos.length > 0 
                ? (consumos.reduce((a, b) => a + b, 0) / consumos.length).toFixed(2)
                : 0;

            const consumo_minimo = consumos.length > 0 ? Math.min(...consumos) : 0;
            const consumo_maximo = consumos.length > 0 ? Math.max(...consumos) : 0;

            // Detección de anomalías (consumo > 2x promedio o < 50% promedio)
            const anomalias = lecturas.filter(l => {
                const promedio = parseFloat(promedio_consumo);
                return l.consumo_m3 > (promedio * 2) || l.consumo_m3 < (promedio * 0.5);
            });

            // Grafica de consumo por periodo (últimos 12 periodos)
            const grafica = lecturas.slice(0, 12).reverse().map(l => ({
                periodo: l.periodo,
                consumo: l.consumo_m3
            }));

            res.json({
                medidor: {
                    id: Number(medidor.id),
                    numero_serie: medidor.numero_serie,
                    cliente_id: medidor.cliente_id ? Number(medidor.cliente_id) : null,
                    cliente_nombre: medidor.cliente_nombre
                },
                estadisticas: {
                    total_lecturas: lecturas.length,
                    promedio_consumo: parseFloat(promedio_consumo),
                    consumo_minimo,
                    consumo_maximo,
                    anomalias_detectadas: anomalias.length
                },
                lecturas_con_anomalia: anomalias.map(l => ({
                    id: l.id,
                    periodo: l.periodo,
                    consumo: l.consumo_m3,
                    promedio: parseFloat(promedio_consumo),
                    desviacion: ((l.consumo_m3 / parseFloat(promedio_consumo) - 1) * 100).toFixed(2) + '%'
                })),
                grafica_consumo: grafica,
                historial: lecturas
            });

        } catch (err) {
            console.error('Error obteniendo lecturas por medidor v2:', err);
            res.status(500).json({ error: 'Error al obtener lecturas del medidor' });
        }
    },

    // Obtener lecturas por cliente (todos los medidores)
    obtenerLecturasPorCliente: async (req, res) => {
        const cliente_id = req.params.id;
        const { periodo } = req.query; // Filtro opcional por periodo

        try {
            // Verificar si el cliente existe
            const verificarClienteQuery = `SELECT id, nombre FROM clientes WHERE id = ?`;
            const clienteResult = await dbTurso.execute({
                sql: verificarClienteQuery,
                args: [cliente_id]
            });

            if (clienteResult.rows.length === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            const cliente = clienteResult.rows[0];

            // Obtener medidores del cliente
            const medidoresQuery = `
                SELECT id, numero_serie, ubicacion 
                FROM medidores 
                WHERE cliente_id = ?
            `;
            const medidoresResult = await dbTurso.execute({
                sql: medidoresQuery,
                args: [cliente_id]
            });

            if (medidoresResult.rows.length === 0) {
                return res.status(404).json({ 
                    error: 'Cliente no tiene medidores asignados',
                    cliente: {
                        id: Number(cliente.id),
                        nombre: cliente.nombre
                    }
                });
            }

            const medidores = medidoresResult.rows.map(m => Number(m.id));

            // Construir query con filtro de periodo opcional
            let lecturasQuery = `
                SELECT 
                    l.id,
                    l.medidor_id,
                    m.numero_serie,
                    m.ubicacion,
                    l.consumo_m3,
                    l.periodo,
                    l.fecha_lectura,
                    f.id as factura_id,
                    f.total as monto_total,
                    f.estado as factura_estado
                FROM lecturas l
                INNER JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN facturas f ON l.id = f.lectura_id
                WHERE l.medidor_id IN (${medidores.map(() => '?').join(',')})
            `;

            const args = [...medidores];

            if (periodo) {
                lecturasQuery += ` AND l.periodo = ?`;
                args.push(periodo);
            }

            lecturasQuery += ` ORDER BY l.fecha_lectura DESC`;

            const lecturasResult = await dbTurso.execute({
                sql: lecturasQuery,
                args
            });

            const lecturas = lecturasResult.rows.map(row => ({
                id: Number(row.id),
                medidor: {
                    id: Number(row.medidor_id),
                    numero_serie: row.numero_serie,
                    ubicacion: row.ubicacion
                },
                consumo_m3: Number(row.consumo_m3),
                periodo: row.periodo,
                fecha_lectura: row.fecha_lectura,
                factura: row.factura_id ? {
                    id: Number(row.factura_id),
                    monto_total: Number(row.monto_total),
                    estado: row.factura_estado
                } : null
            }));

            // Calcular consumo total por periodo
            const consumoPorPeriodo = lecturas.reduce((acc, l) => {
                if (!acc[l.periodo]) {
                    acc[l.periodo] = {
                        periodo: l.periodo,
                        consumo_total: 0,
                        cantidad_lecturas: 0,
                        monto_total: 0
                    };
                }
                acc[l.periodo].consumo_total += l.consumo_m3;
                acc[l.periodo].cantidad_lecturas += 1;
                if (l.factura) {
                    acc[l.periodo].monto_total += l.factura.monto_total;
                }
                return acc;
            }, {});

            const consumoTotal = lecturas.reduce((sum, l) => sum + l.consumo_m3, 0);
            const montoTotalFacturado = lecturas
                .filter(l => l.factura)
                .reduce((sum, l) => sum + l.factura.monto_total, 0);

            res.json({
                cliente: {
                    id: Number(cliente.id),
                    nombre: cliente.nombre,
                    total_medidores: medidoresResult.rows.length
                },
                resumen: {
                    total_lecturas: lecturas.length,
                    consumo_total: consumoTotal.toFixed(2),
                    promedio_por_lectura: lecturas.length > 0 
                        ? (consumoTotal / lecturas.length).toFixed(2) 
                        : 0,
                    monto_total_facturado: montoTotalFacturado.toFixed(2)
                },
                consumo_por_periodo: Object.values(consumoPorPeriodo).sort((a, b) => 
                    b.periodo.localeCompare(a.periodo)
                ),
                lecturas
            });

        } catch (err) {
            console.error('Error obteniendo lecturas por cliente v2:', err);
            res.status(500).json({ error: 'Error al obtener lecturas del cliente' });
        }
    },

    // Estadísticas generales de lecturas
    estadisticas: async (req, res) => {
        try {
            // 1. Total de lecturas
            const totalQuery = `SELECT COUNT(*) as total FROM lecturas`;
            const totalResult = await dbTurso.execute({ sql: totalQuery });
            const totalLecturas = Number(totalResult.rows[0].total);

            // 2. Lecturas por periodo (últimos 12 periodos)
            const porPeriodoQuery = `
                SELECT 
                    periodo,
                    COUNT(*) as cantidad_lecturas,
                    SUM(consumo_m3) as consumo_total,
                    AVG(consumo_m3) as consumo_promedio
                FROM lecturas
                GROUP BY periodo
                ORDER BY periodo DESC
                LIMIT 12
            `;
            const porPeriodoResult = await dbTurso.execute({ sql: porPeriodoQuery });
            const lecturasPorPeriodo = porPeriodoResult.rows.map(row => ({
                periodo: row.periodo,
                cantidad_lecturas: Number(row.cantidad_lecturas),
                consumo_total: Number(row.consumo_total).toFixed(2),
                consumo_promedio: Number(row.consumo_promedio).toFixed(2)
            }));

            // 3. Lecturas con y sin factura
            const facturacionQuery = `
                SELECT 
                    COUNT(*) as total_lecturas,
                    SUM(CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END) as con_factura,
                    SUM(CASE WHEN f.id IS NULL THEN 1 ELSE 0 END) as sin_factura
                FROM lecturas l
                LEFT JOIN facturas f ON l.id = f.lectura_id
            `;
            const facturacionResult = await dbTurso.execute({ sql: facturacionQuery });
            const facturacion = facturacionResult.rows[0];

            // 4. Consumo total y promedios
            const consumoQuery = `
                SELECT 
                    SUM(consumo_m3) as consumo_total,
                    AVG(consumo_m3) as consumo_promedio,
                    MIN(consumo_m3) as consumo_minimo,
                    MAX(consumo_m3) as consumo_maximo
                FROM lecturas
            `;
            const consumoResult = await dbTurso.execute({ sql: consumoQuery });
            const consumo = consumoResult.rows[0];

            // 5. Top 10 mayores consumos
            const topConsumosQuery = `
                SELECT 
                    l.id,
                    l.consumo_m3,
                    l.periodo,
                    m.numero_serie,
                    c.nombre as cliente_nombre
                FROM lecturas l
                INNER JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN clientes c ON m.cliente_id = c.id
                ORDER BY l.consumo_m3 DESC
                LIMIT 10
            `;
            const topConsumosResult = await dbTurso.execute({ sql: topConsumosQuery });
            const topConsumos = topConsumosResult.rows.map(row => ({
                lectura_id: Number(row.id),
                consumo_m3: Number(row.consumo_m3),
                periodo: row.periodo,
                numero_serie: row.numero_serie,
                cliente_nombre: row.cliente_nombre || 'Sin asignar'
            }));

            // 6. Lecturas del mes actual
            const mesActualQuery = `
                SELECT COUNT(*) as total
                FROM lecturas
                WHERE periodo = strftime('%Y-%m', 'now')
            `;
            const mesActualResult = await dbTurso.execute({ sql: mesActualQuery });
            const lecturasMesActual = Number(mesActualResult.rows[0].total);

            // 7. Medidores sin lecturas recientes (sin lectura en el periodo actual)
            const sinLecturaQuery = `
                SELECT COUNT(*) as total
                FROM medidores m
                WHERE m.estado_medidor = 'Activo'
                AND NOT EXISTS (
                    SELECT 1 FROM lecturas l 
                    WHERE l.medidor_id = m.id 
                    AND l.periodo = strftime('%Y-%m', 'now')
                )
            `;
            const sinLecturaResult = await dbTurso.execute({ sql: sinLecturaQuery });
            const medidoresSinLectura = Number(sinLecturaResult.rows[0].total);

            // 8. Distribución de rangos de consumo
            const rangosConsumoQuery = `
                SELECT 
                    CASE 
                        WHEN consumo_m3 < 10 THEN '0-10 m³'
                        WHEN consumo_m3 < 20 THEN '10-20 m³'
                        WHEN consumo_m3 < 30 THEN '20-30 m³'
                        WHEN consumo_m3 < 50 THEN '30-50 m³'
                        ELSE '50+ m³'
                    END as rango,
                    COUNT(*) as cantidad
                FROM lecturas
                GROUP BY rango
                ORDER BY rango
            `;
            const rangosConsumoResult = await dbTurso.execute({ sql: rangosConsumoQuery });
            const distribucionConsumo = rangosConsumoResult.rows.map(row => ({
                rango: row.rango,
                cantidad: Number(row.cantidad)
            }));

            res.json({
                resumen: {
                    total_lecturas: totalLecturas,
                    lecturas_mes_actual: lecturasMesActual,
                    medidores_sin_lectura_mes: medidoresSinLectura,
                    lecturas_con_factura: Number(facturacion.con_factura),
                    lecturas_sin_factura: Number(facturacion.sin_factura),
                    porcentaje_facturacion: totalLecturas > 0 
                        ? ((Number(facturacion.con_factura) / totalLecturas) * 100).toFixed(2) 
                        : 0
                },
                consumo: {
                    total: Number(consumo.consumo_total).toFixed(2),
                    promedio: Number(consumo.consumo_promedio).toFixed(2),
                    minimo: Number(consumo.consumo_minimo).toFixed(2),
                    maximo: Number(consumo.consumo_maximo).toFixed(2)
                },
                distribucion_consumo: distribucionConsumo,
                tendencias: {
                    por_periodo: lecturasPorPeriodo
                },
                top_consumos: topConsumos,
                fecha_generacion: new Date().toISOString()
            });

        } catch (err) {
            console.error('Error obteniendo estadísticas de lecturas:', err);
            res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    }
};

export default lecturasController;
