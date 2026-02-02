/**
 * Controlador de Reportes - V2
 * 
 * File: src/v2/controllers/reportsController.js
 * 
 * Descripción: 
 * Controlador centralizado para generar datos estructurados para reportes y recibos.
 * Optimizado para consultas de alto volumen (lotes de impresión).
 */

import dbTurso from "../../database/db-sqlite.js";
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// Helpers internos
const formatearMoneda = (valor) => Number(valor).toFixed(2);
const obtenerNombreMes = (fechaStr) => {
    try {
        return format(parseISO(fechaStr), 'MMMM yyyy', { locale: es });
    } catch (e) {
        return fechaStr;
    }
};

const ReportsController = {

    /**
     * Obtener datos para impresión de Recibos
     * Endpoint: GET /api/v2/reports/recibos
     * Params: mes (YYYY-MM), ruta_id (opcional), estado_pago (opcional)
     */
    getRecibosData: async (req, res) => {
        try {
            const { mes, ruta_id, estado_pago } = req.query;

            if (!mes) {
                return res.status(400).json({ error: "El parámetro 'mes' (YYYY-MM) es obligatorio" });
            }

            // 1. Obtener facturas del periodo principal
            let query = `
                SELECT 
                    f.id as folio_factura,
                    f.fecha_emision,
                    f.total as total_mes,
                    f.estado as estado_factura,
                    f.saldo_pendiente,
                    c.id as cliente_id,
                    c.nombre as cliente_nombre,
                    c.direccion,
                    c.ciudad as pueblo,
                    m.id as medidor_id,
                    m.numero_serie as medidor_serial,
                    l.consumo_m3 as consumo_mes,
                    l.fecha_lectura,
                    l.periodo as mes_facturado,
                    t.nombre as tarifa_nombre,
                    r.nombre as ruta_nombre
                FROM facturas f
                JOIN clientes c ON f.cliente_id = c.id
                JOIN lecturas l ON f.lectura_id = l.id
                JOIN tarifas t ON f.tarifa_id = t.id
                JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN rutas r ON l.ruta_id = r.id
                WHERE l.periodo = ?
            `;

            const params = [mes];

            if (ruta_id) {
                query += ` AND r.id = ?`;
                params.push(ruta_id);
            }

            if (estado_pago) {
                query += ` AND f.estado = ?`;
                params.push(estado_pago);
            }

            // JOIN adicional para obtener lectura anterior (optimización: hacerlo en subquery o lógica JS)
            // Dado que SQLite/Turso puede ser limitado, haremos un post-proceso eficiente.

            const result = await dbTurso.execute({ sql: query, args: params });
            const facturas = result.rows;

            // 2. Obtener deuda acumulada para estos clientes
            // Buscar todas las facturas pendientes ANTERIORES a este periodo
            const clientesIds = facturas.map(f => f.cliente_id).filter((v, i, a) => a.indexOf(v) === i);

            let deudaMap = {}; // cliente_id -> deuda_total

            if (clientesIds.length > 0) {
                // Hacerlo en lotes si son muchos clientes, por ahora simple
                // Nota: Inefficient for thousands, but ok for hundreds. 
                // Mejor: Query agregada.
                const placeHolders = clientesIds.map(() => '?').join(',');
                const deudaQuery = `
                    SELECT cliente_id, SUM(saldo_pendiente) as deuda_total
                    FROM facturas 
                    WHERE cliente_id IN (${placeHolders}) 
                    AND estado != 'Pagado'
                    AND id NOT IN (SELECT id FROM facturas WHERE lecturas.periodo = ? JOIN lecturas ON facturas.lectura_id = lecturas.id) -- Excluir factura actual
                    -- Corrección: La condición anterior es compleja en SQL puro sin Joins claros. 
                    -- Simplificación: Sumar todo lo pendiente y restar la factura actual en JS si está en 'Pendiente'
                `;

                // Mejor Query para Deuda Anterior (Excluyendo la factura actual por lógica de periodo)
                const deudaAnteriorQuery = `
                    SELECT 
                        f.cliente_id, 
                        SUM(f.saldo_pendiente) as deuda_anterior
                    FROM facturas f
                    JOIN lecturas l ON f.lectura_id = l.id
                    WHERE f.cliente_id IN (${placeHolders})
                    AND f.estado != 'Pagado'
                    AND l.periodo < ?
                    GROUP BY f.cliente_id
                `;

                const deudaResult = await dbTurso.execute({
                    sql: deudaAnteriorQuery,
                    args: [...clientesIds, mes]
                });

                deudaResult.rows.forEach(row => {
                    deudaMap[row.cliente_id] = Number(row.deuda_anterior);
                });
            }

            // 3. Generar Historial (Últimos 12 meses para gráficos)
            // Consultaremos el consumo del mes anterior para calcular variación y el historial completo
            const startHistoryDate = format(subMonths(parseISO(mes + '-01'), 12), 'yyyy-MM');

            // Obtener IDs de medidores únicos
            const medidoresIds = facturas.map(f => f.medidor_id).filter((v, i, a) => a.indexOf(v) === i);
            let historialMap = {}; // medidor_id -> [{ periodo, consumo }]

            if (medidoresIds.length > 0) {
                // Fetch historial en lote
                // NOTA: Si son muchos medidores (>500), se debería chunkear. Asumimos <500 por lote de impresión típico.
                const medidoresPlaceholders = medidoresIds.map(() => '?').join(',');

                const historyQuery = `
                    SELECT 
                        medidor_id, periodo, consumo_m3
                    FROM lecturas
                    WHERE medidor_id IN (${medidoresPlaceholders})
                    AND periodo >= ?
                    ORDER BY periodo ASC
                 `;

                try {
                    const historyResult = await dbTurso.execute({
                        sql: historyQuery,
                        args: [...medidoresIds, startHistoryDate]
                    });

                    historyResult.rows.forEach(row => {
                        if (!historialMap[row.medidor_id]) historialMap[row.medidor_id] = [];
                        historialMap[row.medidor_id].push({
                            mes: row.periodo, // YYYY-MM
                            consumo: Number(row.consumo_m3)
                        });
                    });
                } catch (err) {
                    console.error("Error fetching history:", err);
                }
            }

            // Consumo anterior específico (para variación) - Extraer del historial si es posible
            // O mantener la lógica existente si periodo anterior no está en rango (raro si traemos 12 meses)
            // Mantendremos la lógica de "consumo anterior inmediato" calculada en el mapping para consistencia.


            // 4. Mapear Respuesta Final
            const recibos = facturas.map(f => {
                // Calcular consumo anterior desde el historial o map
                const hist = historialMap[f.medidor_id] || [];
                const consumoActual = Number(f.consumo_mes);

                // Buscar mes anterior exacto
                const mesAntPeriodo = format(subMonths(parseISO(mes + '-01'), 1), 'yyyy-MM');
                const lectAnt = hist.find(h => h.mes === mesAntPeriodo);
                const consumoAnt = lectAnt ? lectAnt.consumo : 0;

                const variacion = consumoAnt === 0 ? 0 : ((consumoActual - consumoAnt) / consumoAnt) * 100;
                const deudaAnterior = deudaMap[f.cliente_id] || 0;

                return {
                    folio_factura: f.folio_factura,
                    datos_cliente: {
                        nombre: f.cliente_nombre,
                        direccion: f.direccion,
                        pueblo: f.pueblo
                    },
                    informacion_servicio: {
                        numero_medidor: f.medidor_serial,
                        consumo_mes_m3: consumoActual,
                        lectura_anterior: 0, // No disponible en esquema simplificado
                        lectura_actual: 0,   // No disponible en esquema simplificado
                        tarifa_nombre: f.tarifa_nombre,
                        ruta_nombre: f.ruta_nombre || 'Sin Ruta'
                    },
                    detalle_facturacion: {
                        mes_facturado: obtenerNombreMes(f.mes_facturado + '-01'),
                        fecha_lectura: f.fecha_lectura,
                        total_mes: Number(f.total_mes),
                        saldo_pendiente_mes: Number(f.saldo_pendiente),
                        deuda_acumulada_anterior: deudaAnterior,
                        total_a_pagar: Number(f.saldo_pendiente) + deudaAnterior
                    },
                    informacion_consumo: {
                        consumo_actual: consumoActual,
                        consumo_anterior: consumoAnt,
                        variacion_porcentaje: Number(variacion.toFixed(1)),
                        // Historial simplificado para el demo
                        historial_ano_actual: historialMap[f.medidor_id] || []
                    }
                };
            });

            res.json({
                periodo: mes,
                total_recibos: recibos.length,
                recibos
            });

        } catch (error) {
            console.error("Error generando reportes de recibos:", error);
            res.status(500).json({ error: "Error interno generando recibos" });
        }
    },

    /**
     * Reporte Financiero (Ingresos/Egresos/Cartera)
     */
    getReporteFinanciero: async (req, res) => {
        try {
            const { fecha_inicio, fecha_fin } = req.query; // YYYY-MM-DD

            // Ingresos (Pagos)
            const pagosQuery = `
                SELECT 
                    SUM(monto) as total_cobrado,
                    metodo_pago,
                    count(*) as cantidad_transacciones
                FROM pagos
                WHERE fecha_pago BETWEEN ? AND ?
                GROUP BY metodo_pago
            `;

            // Facturación
            const facturacionQuery = `
                SELECT 
                    SUM(total) as total_facturado,
                    count(*) as cantidad_facturas
                FROM facturas
                WHERE fecha_emision BETWEEN ? AND ?
            `;

            const [pagosRes, facturasRes] = await Promise.all([
                dbTurso.execute({ sql: pagosQuery, args: [fecha_inicio, fecha_fin] }),
                dbTurso.execute({ sql: facturacionQuery, args: [fecha_inicio, fecha_fin] })
            ]);

            const ingresosPorMetodo = pagosRes.rows.map(r => ({
                metodo: r.metodo_pago,
                total: Number(r.total_cobrado),
                transacciones: Number(r.cantidad_transacciones)
            }));

            const totalIngresos = ingresosPorMetodo.reduce((sum, i) => sum + i.total, 0);
            const totalFacturado = Number(facturasRes.rows[0]?.total_facturado || 0);

            res.json({
                rango: { inicio: fecha_inicio, fin: fecha_fin },
                resumen: {
                    total_facturado: totalFacturado,
                    total_ingresos: totalIngresos,
                    eficiencia_recaudo: totalFacturado > 0 ? ((totalIngresos / totalFacturado) * 100).toFixed(1) + '%' : '0%'
                },
                ingresos_detalle: ingresosPorMetodo,
                graficos: {
                    metodos_pago: {
                        labels: ingresosPorMetodo.map(i => i.metodo),
                        data: ingresosPorMetodo.map(i => i.total)
                    }
                }
            });

        } catch (error) {
            console.error("Error reporte financiero:", error);
            res.status(500).json({ error: "Error generando reporte financiero" });
        }
    },

    /**
     * Reporte de Deudores y Cobranza
     * Endpoint: GET /api/v2/reports/deudores
     */
    getReporteDeudores: async (req, res) => {
        try {
            // 1. Resumen General
            const resumenQuery = `
                SELECT 
                    SUM(CASE WHEN estado = 'Vencida' THEN saldo_pendiente ELSE 0 END) as total_deuda_vencida,
                    COUNT(DISTINCT CASE WHEN estado = 'Vencida' THEN cliente_id END) as clientes_morosos,
                    (SELECT COUNT(*) FROM medidores WHERE estado_servicio = 'Cortado') as cortes_activos,
                    (SELECT COUNT(*) FROM convenios_pago WHERE estado = 'Activo') as convenios_activos
                FROM facturas
                WHERE saldo_pendiente > 0
            `;

            const resumenRes = await dbTurso.execute({ sql: resumenQuery, args: [] });
            const resumen = resumenRes.rows[0];

            // 2. Top Deudores (Top 10)
            const topDeudoresQuery = `
                SELECT 
                    c.id, c.nombre, m.numero_serie,
                    SUM(f.saldo_pendiente) as deuda_total,
                    COUNT(f.id) as facturas_vencidas,
                    MIN(f.fecha_vencimiento) as fecha_mas_antigua
                FROM facturas f
                JOIN clientes c ON f.cliente_id = c.id
                JOIN lecturas l ON f.lectura_id = l.id
                JOIN medidores m ON l.medidor_id = m.id
                WHERE f.saldo_pendiente > 0 AND f.estado = 'Vencida'
                GROUP BY c.id
                ORDER BY deuda_total DESC
                LIMIT 10
            `;
            const topDeudoresRes = await dbTurso.execute({ sql: topDeudoresQuery, args: [] });

            // 3. Antigüedad de la Deuda (Buckets)
            // Calculamos en JS o SQL. SQL en SQLite es verboso pero posible.
            // Opción: Traer todas las facturas vencidas y agrupar en JS.
            const antiguedadQuery = `
                SELECT 
                    CASE 
                        WHEN julianday('now') - julianday(fecha_vencimiento) <= 30 THEN '0-30 días'
                        WHEN julianday('now') - julianday(fecha_vencimiento) <= 60 THEN '31-60 días'
                        WHEN julianday('now') - julianday(fecha_vencimiento) <= 90 THEN '61-90 días'
                        ELSE '+90 días'
                    END as rango,
                    SUM(saldo_pendiente) as total
                FROM facturas
                WHERE saldo_pendiente > 0 AND estado = 'Vencida'
                GROUP BY 1
            `;
            const antiguedadRes = await dbTurso.execute({ sql: antiguedadQuery, args: [] });

            // 4. Operatividad (Cortes/Reconexiones del mes actual)
            const inicioMes = new Date().toISOString().slice(0, 7) + '-01';
            const operatividadQuery = `
                SELECT 
                    SUM(CASE WHEN fecha_corte >= ? THEN 1 ELSE 0 END) as cortes_mes,
                    SUM(CASE WHEN fecha_reconexion >= ? THEN 1 ELSE 0 END) as reconexiones_mes
                FROM cortes_servicio
            `;
            const operatividadRes = await dbTurso.execute({ sql: operatividadQuery, args: [inicioMes, inicioMes] });

            res.json({
                resumen: {
                    deuda_vencida: Number(resumen.total_deuda_vencida || 0),
                    clientes_morosos: Number(resumen.clientes_morosos || 0),
                    cortes_activos: Number(resumen.cortes_activos || 0),
                    convenios_activos: Number(resumen.convenios_activos || 0)
                },
                top_deudores: topDeudoresRes.rows,
                antiguedad_deuda: antiguedadRes.rows,
                operatividad_mes: {
                    cortes: Number(operatividadRes.rows[0]?.cortes_mes || 0),
                    reconexiones: Number(operatividadRes.rows[0]?.reconexiones_mes || 0)
                },
                generated_at: new Date().toISOString()
            });

        } catch (error) {
            console.error("Error generando reporte de deudores:", error);
            res.status(500).json({ error: "Error interno generando reporte de deudores" });
        }
    },

    /**
     * Reporte de Lecturas (Lista para toma de lecturas)
     * Endpoint: GET /api/v2/reports/lecturas
     */
    getReporteLecturas: async (req, res) => {
        try {
            const { mes, localidad } = req.query; // mes: YYYY-MM

            if (!mes) {
                return res.status(400).json({ error: "El parámetro 'mes' (YYYY-MM) es obligatorio" });
            }

            // Calcular mes anterior para obtener "Lectura Anterior"
            const fechaMes = parseISO(mes + '-01');
            const mesAnterior = format(subMonths(fechaMes, 1), 'yyyy-MM');

            // Query Principal
            let query = `
                SELECT 
                    c.id as cliente_id,
                    c.nombre as cliente_nombre,
                    c.ciudad as localidad,
                    c.direccion,
                    m.id as medidor_id,
                    m.numero_serie,
                    m.ubicacion as medidor_ubicacion,
                    m.latitud,
                    m.longitud,
                    l_ant.consumo_m3 as consumo_anterior,
                    0 as lectura_anterior_calculada
                FROM clientes c
                JOIN medidores m ON c.id = m.cliente_id
                LEFT JOIN lecturas l_ant ON m.id = l_ant.medidor_id AND l_ant.periodo = ?
                WHERE c.estado_cliente = 'Activo'
                AND m.estado_medidor != 'Retirado'
            `;

            const params = [mesAnterior];

            if (localidad) {
                query += ` AND c.ciudad = ?`;
                params.push(localidad);
            }

            query += ` ORDER BY c.ciudad, c.nombre`;

            const result = await dbTurso.execute({ sql: query, args: params });

            // Agrupación por Localidad
            const porLocalidad = {};
            let totalClientes = 0;

            result.rows.forEach(row => {
                const loc = row.localidad || 'Sin Localidad';
                if (!porLocalidad[loc]) {
                    porLocalidad[loc] = [];
                }

                porLocalidad[loc].push({
                    cliente: row.cliente_nombre,
                    medidor: {
                        serie: row.numero_serie,
                        ubicacion: row.medidor_ubicacion,
                        coordenadas: {
                            lat: row.latitud ? Number(row.latitud) : null,
                            lng: row.longitud ? Number(row.longitud) : null
                        }
                    },
                    lectura_anterior: {
                        periodo: mesAnterior,
                        valor: 0,
                        consumo_registrado: Number(row.consumo_anterior || 0)
                    }
                });
                totalClientes++;
            });

            // Formato array para respuesta
            const reporte = Object.keys(porLocalidad).map(key => ({
                localidad: key,
                total_clientes: porLocalidad[key].length,
                clientes: porLocalidad[key]
            }));

            res.json({
                periodo_solicitado: mes,
                periodo_lectura_anterior: mesAnterior,
                total_general: totalClientes,
                total_localidades: reporte.length,
                datos: reporte
            });

        } catch (error) {
            console.error("Error generando reporte de lecturas:", error);
            res.status(500).json({ error: "Error interno generando reporte de lecturas" });
        }
    }
};

export default ReportsController;
