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

import dbTurso from '../../database/db-sqlite.js';
import { calcularTarifaDesdeDB } from '../../utils/tarifaUtils.js';
import { calcularVencimientoHabil } from '../../utils/timezone.js';

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

        // Calcular total usando la lógica de tarifas escalonadas (fuente de verdad única)
        let total;
        try {
            const resultado = await calcularTarifaDesdeDB(consumo_m3, tarifa_id, dbTurso);
            total = resultado.total;
        } catch (tarifaError) {
            return { success: false, error: tarifaError.message };
}

        // Calcular fecha de vencimiento desde configuración (default 30 días)
        const configResult = await dbTurso.execute({
            sql: `SELECT dias_vencimiento_factura FROM configuracion_servicio WHERE activo = 1 ORDER BY id DESC LIMIT 1`,
            args: []
        });
        const diasVencimiento = configResult.rows.length > 0
            ? (Number(configResult.rows[0].dias_vencimiento_factura) || 30)
            : 30;

        // Calcular fecha de vencimiento (en día hábil, respetando feriados MX)
        const fecha_vencimiento_str = calcularVencimientoHabil(diasVencimiento, fecha_emision);

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
     * Registrar nueva lectura - V2 con lógica de lectura real de medidor
     *
     * FLUJO NUEVO (recomendado):
     *   Body: { medidor_id, ruta_id, lectura_actual, vuelta_cero?, fecha_lectura, periodo }
     *   - El backend busca lectura_anterior (última lectura_actual del medidor o lectura_base)
     *   - Calcula consumo_m3 automáticamente
     *   - Valida lectura_actual >= lectura_anterior (salvo vuelta_cero)
     *   - Edge case rollover: consumo = (capacidad_maxima ?? 99999) - ant + act
     *
     * FLUJO LEGACY (compatibilidad):
     *   Body: { medidor_id, ruta_id, consumo_m3, fecha_lectura, periodo }
     *   - Se acepta consumo directo; lectura_anterior y lectura_actual quedan NULL
     */
    async registrarLectura(req, res) {
        try {
            const {
                medidor_id,
                ruta_id,
                lectura_actual,
                vuelta_cero = false,
                consumo_m3: consumo_m3_legacy,
                fecha_lectura,
                periodo
            } = req.body;
            const modificado_por = req.usuario.id;

            // Validaciones básicas de campo
            if (!medidor_id || !ruta_id || !fecha_lectura) {
                return res.status(400).json({ error: 'Faltan campos requeridos (medidor_id, ruta_id, fecha_lectura)' });
            }
            if (lectura_actual === undefined && consumo_m3_legacy === undefined) {
                return res.status(400).json({ error: 'Debe proporcionar lectura_actual o consumo_m3' });
            }

            // Validar existencia del medidor (y obtener lectura_base + capacidad_maxima)
            const medidorQuery = `SELECT id, lectura_base, capacidad_maxima FROM medidores WHERE id = ?`;
            const medidorResult = await dbTurso.execute({ sql: medidorQuery, args: [medidor_id] });
            if (medidorResult.rows.length === 0) {
                return res.status(404).json({ error: 'Medidor no encontrado' });
            }
            const medidor = medidorResult.rows[0];

            // Validar existencia de la ruta
            const rutaResult = await dbTurso.execute({ sql: `SELECT id FROM rutas WHERE id = ?`, args: [ruta_id] });
            if (rutaResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ruta no encontrada' });
            }

            // Verificar que el medidor está asignado a esta ruta
            const perteneceResult = await dbTurso.execute({
                sql: `SELECT 1 FROM rutas_puntos WHERE ruta_id = ? AND medidor_id = ?`,
                args: [ruta_id, medidor_id]
            });
            if (perteneceResult.rows.length === 0) {
                return res.status(400).json({ error: 'El medidor no está asignado a esta ruta' });
            }

            // Verificar si ya existe lectura para el mismo medidor y periodo
            const dupeResult = await dbTurso.execute({
                sql: `SELECT id FROM lecturas WHERE medidor_id = ? AND periodo = ?`,
                args: [medidor_id, periodo]
            });
            if (dupeResult.rows.length > 0) {
                return res.status(409).json({ error: 'Ya existe una lectura registrada para este medidor y periodo' });
            }

            // ============================================================
            // CÁLCULO DE CONSUMO
            // ============================================================
            let consumo_m3_final;
            let lectura_anterior_val = null;
            let lectura_actual_val = null;
            let vuelta_cero_val = 0;

            if (lectura_actual !== undefined) {
                // --- FLUJO NUEVO ---
                const lectActual = parseFloat(lectura_actual);
                if (isNaN(lectActual) || lectActual < 0) {
                    return res.status(400).json({ error: 'lectura_actual debe ser un número >= 0' });
                }

                // Buscar lectura_anterior: última lectura_actual registrada para este medidor
                const prevQuery = `
                    SELECT lectura_actual
                    FROM lecturas
                    WHERE medidor_id = ? AND lectura_actual IS NOT NULL
                    ORDER BY fecha_lectura DESC
                    LIMIT 1
                `;
                const prevResult = await dbTurso.execute({ sql: prevQuery, args: [medidor_id] });
                let lectAnterior = null;

                if (prevResult.rows.length > 0 && prevResult.rows[0].lectura_actual !== null) {
                    lectAnterior = parseFloat(prevResult.rows[0].lectura_actual);
                } else if (medidor.lectura_base !== null && medidor.lectura_base !== undefined) {
                    // Sin historial → usar lectura_base del medidor
                    lectAnterior = parseFloat(medidor.lectura_base);
                }
                // Si lectAnterior sigue null → primer registro del medidor sin base;
                // se acepta cualquier valor y consumo = 0 (lectura de inicio)

                lectura_actual_val = lectActual;
                lectura_anterior_val = lectAnterior;

                if (lectAnterior === null) {
                    // Primera lectura sin punto de referencia: consumo 0 (se registra como lectura de inicio)
                    consumo_m3_final = 0;
                } else if (vuelta_cero) {
                    // --- ROLLOVER ---
                    if (lectActual >= lectAnterior) {
                        return res.status(400).json({
                            error: 'vuelta_cero marcado pero lectura_actual es mayor o igual a lectura_anterior. Desmarca el flag o verifica los valores.'
                        });
                    }
                    const capMax = (medidor.capacidad_maxima !== null && medidor.capacidad_maxima !== undefined)
                        ? parseFloat(medidor.capacidad_maxima)
                        : 99999;
                    consumo_m3_final = parseFloat(((capMax - lectAnterior) + lectActual).toFixed(4));
                    vuelta_cero_val = 1;
                } else {
                    // --- FLUJO NORMAL ---
                    if (lectActual < lectAnterior) {
                        return res.status(422).json({
                            error: `La lectura actual (${lectActual}) no puede ser menor a la lectura anterior (${lectAnterior}). Si el medidor dio la vuelta a cero, marca el flag vuelta_cero.`,
                            lectura_anterior: lectAnterior,
                            lectura_actual: lectActual
                        });
                    }
                    consumo_m3_final = parseFloat((lectActual - lectAnterior).toFixed(4));
                }

            } else {
                // --- FLUJO LEGACY (consumo_m3 directo) ---
                consumo_m3_final = parseFloat(consumo_m3_legacy);
                if (isNaN(consumo_m3_final) || consumo_m3_final <= 0) {
                    return res.status(400).json({ error: 'consumo_m3 debe ser mayor a cero' });
                }
            }

            // Insertar lectura con todos los valores
            const insertQuery = `
                INSERT INTO lecturas
                  (medidor_id, ruta_id, consumo_m3, lectura_anterior, lectura_actual, vuelta_cero, fecha_lectura, periodo, modificado_por, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const insertResult = await dbTurso.execute({
                sql: insertQuery,
                args: [
                    medidor_id, ruta_id,
                    consumo_m3_final,
                    lectura_anterior_val,
                    lectura_actual_val,
                    vuelta_cero_val,
                    fecha_lectura,
                    periodo || null,
                    modificado_por,
                    'pendiente'
                ]
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
            const lecturaCompletaResult = await dbTurso.execute({ sql: lecturaCompletaQuery, args: [lectura_id] });
            const lecturaCompleta = lecturaCompletaResult.rows[0];

            // Notificaciones SSE
            if (sseManager && notificationManager && lecturaCompleta) {
                try {
                    notificationManager.lecturaRegistrada({
                        id: lectura_id,
                        medidor_id,
                        medidor_numero: lecturaCompleta.medidor_numero,
                        cliente_nombre: lecturaCompleta.cliente_nombre,
                        consumo_m3: consumo_m3_final,
                        lectura_anterior: lectura_anterior_val,
                        lectura_actual: lectura_actual_val,
                        fecha_lectura,
                        periodo: periodo || null,
                        ruta_nombre: lecturaCompleta.ruta_nombre,
                        message: `Lectura registrada para medidor ${lecturaCompleta.medidor_numero}`
                    }, modificado_por);

                    notificationManager.alertaSistema(
                        `Progreso de ruta: medidor ${lecturaCompleta.medidor_numero} completado`,
                        'info',
                        { ruta_id, medidor_id, lectura_id, consumo_m3: consumo_m3_final, tipo: 'progreso_ruta' }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificaciones SSE de lectura:', sseError);
                }
            }

            return res.status(201).json({
                success: true,
                message: 'Lectura registrada exitosamente',
                data: {
                    lectura_id,
                    detalles: {
                        id: lectura_id,
                        medidor_id: Number(lecturaCompleta.medidor_id),
                        ruta_id: Number(lecturaCompleta.ruta_id || 0),
                        consumo_m3: consumo_m3_final,
                        lectura_anterior: lectura_anterior_val,
                        lectura_actual: lectura_actual_val,
                        vuelta_cero: vuelta_cero_val === 1,
                        fecha_lectura: lecturaCompleta.fecha_lectura,
                        periodo: lecturaCompleta.periodo,
                        estado: 'pendiente',
                        modificado_por: Number(lecturaCompleta.modificado_por || 0),
                        medidor_numero: lecturaCompleta.medidor_numero,
                        medidor_ubicacion: lecturaCompleta.medidor_ubicacion,
                        cliente_nombre: lecturaCompleta.cliente_nombre,
                        ruta_nombre: lecturaCompleta.ruta_nombre
                    }
                }
            });

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
                    l.id, l.medidor_id, l.ruta_id, l.consumo_m3, l.fecha_lectura, l.periodo,
                    l.estado, l.modificado_por, l.fecha_creacion,
                    u.username AS modificado_por_nombre,
                    m.numero_serie AS medidor_numero,
                    c.id AS cliente_id, c.nombre AS cliente_nombre,
                    r.nombre AS ruta_nombre
                FROM lecturas l
                LEFT JOIN usuarios u ON l.modificado_por = u.id
                LEFT JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN clientes c ON m.cliente_id = c.id
                LEFT JOIN rutas r ON l.ruta_id = r.id
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
                ruta_id: row.ruta_id ? Number(row.ruta_id) : null,
                consumo_m3: Number(row.consumo_m3),
                fecha_lectura: row.fecha_lectura,
                periodo: row.periodo,
                estado: row.estado || 'pendiente',
                fecha_creacion: row.fecha_creacion,
                modificado_por: Number(row.modificado_por),
                modificado_por_nombre: row.modificado_por_nombre,
                medidor_numero: row.medidor_numero,
                cliente_id: row.cliente_id ? Number(row.cliente_id) : null,
                cliente_nombre: row.cliente_nombre,
                ruta_nombre: row.ruta_nombre
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
            const { medidor_id, lectura_actual, consumo_m3, fecha_lectura, periodo } = req.body;
            const modificado_por = req.usuario.id; // Siempre desde el token JWT

            // Al menos un campo modificable
            if (medidor_id === undefined && lectura_actual === undefined && consumo_m3 == null && fecha_lectura === undefined && periodo === undefined) {
                return res.status(400).json({ success: false, message: 'Debe proporcionar al menos un campo para modificar' });
            }

            // Construcción dinámica del SET para actualización parcial
            const setClauses = [];
            const args = [];
            if (medidor_id !== undefined)    { setClauses.push('medidor_id = ?');    args.push(medidor_id); }
            if (lectura_actual !== undefined) { setClauses.push('lectura_actual = ?'); args.push(lectura_actual); }
            if (consumo_m3 != null)           { setClauses.push('consumo_m3 = ?');    args.push(consumo_m3); }
            if (fecha_lectura !== undefined)  { setClauses.push('fecha_lectura = ?'); args.push(fecha_lectura); }
            if (periodo !== undefined)        { setClauses.push('periodo = ?');       args.push(periodo); }
            // Al modificar una lectura vuelve a estado pendiente (necesita re-facturar)
            setClauses.push('estado = ?');       args.push('pendiente');
            setClauses.push('modificado_por = ?'); args.push(modificado_por);
            args.push(id);

            const result = await dbTurso.execute({
                sql: `UPDATE lecturas SET ${setClauses.join(', ')} WHERE id = ?`,
                args
            });

            if (result.rowsAffected === 0) {
                return res.status(404).json({ success: false, message: 'Lectura no encontrada' });
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

            return res.status(200).json({ success: true, message: 'Lectura modificada exitosamente' });

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
                return res.status(200).json({ lecturas: [] });
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
        try {
            const { periodo, fecha_emision, ruta_id } = req.body;
            const modificado_por = req.usuario?.id;

            if (!modificado_por) {
                return res.status(401).json({ success: false, message: 'No se pudo identificar al usuario autenticado' });
            }

            if (!periodo || !fecha_emision) {
                return res.status(400).json({ success: false, message: 'Faltan campos requeridos: periodo y fecha_emision' });
            }

            // Obtener lecturas pendientes sin factura (con filtro opcional por ruta)
            const condiciones = [
                'f.id IS NULL',
                'l.periodo = ?',
                "l.estado = 'pendiente'",
                'c.tarifa_id IS NOT NULL',
                'm.cliente_id IS NOT NULL'
            ];
            const queryArgs = [periodo];

            if (ruta_id) {
                condiciones.push('l.ruta_id = ?');
                queryArgs.push(ruta_id);
            }

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
                WHERE ${condiciones.join(' AND ')}
            `;

            const result = await dbTurso.execute({ sql: query, args: queryArgs });
            const lecturasSinFactura = result.rows || [];

            if (lecturasSinFactura.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: 'No hay lecturas pendientes de facturar para los criterios indicados',
                    data: { periodo, ruta_id: ruta_id || null, facturas_generadas: 0, detalles: [] }
                });
            }

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
                        // Marcar la lectura como facturada
                        await dbTurso.execute({
                            sql: 'UPDATE lecturas SET estado = ? WHERE id = ?',
                            args: ['facturada', Number(lectura.lectura_id)]
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
                success: true,
                message: 'Proceso de generación de facturas completado',
                data: resultados
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
