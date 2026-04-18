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
import { nowDate } from '../../utils/timezone.js';

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
                    f.fecha_creacion as fecha_generacion,
                    f.fecha_vencimiento,
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

            let historialPorCliente = {}; // cliente_id -> [{ mes, consumo }]

            if (clientesIds.length > 0) {
                const clientesPlaceholders = clientesIds.map(() => '?').join(',');

                // Historial por cliente basado en facturacion real (facturas + lecturas),
                // para mantener continuidad aunque cambie el medidor.
                const historyByClienteQuery = `
                    SELECT
                        f.cliente_id,
                        l.periodo,
                        SUM(COALESCE(l.consumo_m3, 0)) AS consumo_total
                    FROM facturas f
                    JOIN lecturas l ON f.lectura_id = l.id
                    WHERE f.cliente_id IN (${clientesPlaceholders})
                      AND l.periodo >= ?
                      AND l.periodo <= ?
                    GROUP BY f.cliente_id, l.periodo
                    ORDER BY l.periodo ASC
                `;

                try {
                    const historyResult = await dbTurso.execute({
                        sql: historyByClienteQuery,
                        args: [...clientesIds, startHistoryDate, mes]
                    });

                    historyResult.rows.forEach(row => {
                        if (!historialPorCliente[row.cliente_id]) historialPorCliente[row.cliente_id] = [];
                        historialPorCliente[row.cliente_id].push({
                            mes: row.periodo,
                            consumo: Number(row.consumo_total || 0)
                        });
                    });
                } catch (err) {
                    console.error("Error fetching history by client:", err);
                }
            }

            // Consumo anterior específico (para variación) - Extraer del historial si es posible
            // O mantener la lógica existente si periodo anterior no está en rango (raro si traemos 12 meses)
            // Mantendremos la lógica de "consumo anterior inmediato" calculada en el mapping para consistencia.


            // 4. Mapear Respuesta Final
            const recibos = facturas.map(f => {
                // Consumo consistente: actual/anterior/variacion salen del mismo historial facturado por cliente.
                const hist = historialPorCliente[f.cliente_id] || [];
                const consumoActualHist = hist.find(h => h.mes === mes);
                const consumoActual = consumoActualHist
                    ? Number(consumoActualHist.consumo)
                    : Number(f.consumo_mes);

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
                        fecha_emision: f.fecha_emision,
                        fecha_generacion: f.fecha_generacion,
                        fecha_lectura: f.fecha_lectura,
                        fecha_vencimiento: f.fecha_vencimiento,
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
                        historial_ano_actual: hist
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
            const { tipo = 'periodo', periodo, meses, anio, fecha_inicio, fecha_fin } = req.query;

            const formatoDia = 'yyyy-MM-dd';
            const hoy = new Date();

            let inicioDate = null;
            let finDate = null;
            let etiqueta = '';
            let mesesAplicados = null;

            if (tipo === 'periodo') {
                if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
                    return res.status(400).json({ error: "Para tipo=periodo, el parámetro 'periodo' (YYYY-MM) es obligatorio" });
                }
                const base = parseISO(`${periodo}-01`);
                inicioDate = startOfMonth(base);
                finDate = endOfMonth(base);
                etiqueta = `Periodo ${periodo}`;
            } else if (tipo === 'ultimos_meses') {
                const mesesNum = Number(meses || 3);
                if (![3, 6, 12].includes(mesesNum)) {
                    return res.status(400).json({ error: "Para tipo=ultimos_meses, 'meses' debe ser 3, 6 o 12" });
                }
                inicioDate = startOfMonth(subMonths(hoy, mesesNum - 1));
                finDate = hoy;
                mesesAplicados = mesesNum;
                etiqueta = `Últimos ${mesesNum} meses`;
            } else if (tipo === 'anio') {
                if (!anio || !/^\d{4}$/.test(String(anio))) {
                    return res.status(400).json({ error: "Para tipo=anio, el parámetro 'anio' (YYYY) es obligatorio" });
                }
                inicioDate = parseISO(`${anio}-01-01`);
                finDate = parseISO(`${anio}-12-31`);
                etiqueta = `Año ${anio}`;
            } else if (tipo === 'rango') {
                if (!fecha_inicio || !fecha_fin || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_fin)) {
                    return res.status(400).json({ error: "Para tipo=rango, 'fecha_inicio' y 'fecha_fin' (YYYY-MM-DD) son obligatorios" });
                }
                inicioDate = parseISO(fecha_inicio);
                finDate = parseISO(fecha_fin);
                etiqueta = `Rango ${fecha_inicio} a ${fecha_fin}`;
            } else {
                return res.status(400).json({ error: "Tipo de filtro inválido. Use: periodo, ultimos_meses, anio o rango" });
            }

            if (!inicioDate || !finDate || Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) {
                return res.status(400).json({ error: 'No se pudo interpretar el rango de fechas solicitado' });
            }

            if (inicioDate > finDate) {
                return res.status(400).json({ error: "La fecha de inicio no puede ser mayor a la fecha fin" });
            }

            const inicio = format(inicioDate, formatoDia);
            const fin = format(finDate, formatoDia);
            const inicioPeriodo = format(inicioDate, 'yyyy-MM');
            const finPeriodo = format(finDate, 'yyyy-MM');

            // Para vistas por periodo/ultimos_meses/anio, el filtro debe respetar el periodo facturado
            // (lecturas.periodo), no la fecha de emisión/pago, para evitar desfase de mes.
            const usarPeriodoFacturado = tipo === 'periodo' || tipo === 'ultimos_meses' || tipo === 'anio';
            const whereFacturas = usarPeriodoFacturado
                ? 'l.periodo BETWEEN ? AND ?'
                : 'f.fecha_emision BETWEEN ? AND ?';
            const wherePagos = usarPeriodoFacturado
                ? 'l.periodo BETWEEN ? AND ?'
                : 'p.fecha_pago BETWEEN ? AND ?';
            const argsFacturas = usarPeriodoFacturado ? [inicioPeriodo, finPeriodo] : [inicio, fin];
            const argsPagos = usarPeriodoFacturado ? [inicioPeriodo, finPeriodo] : [inicio, fin];

            const [
                facturacionRes,
                recaudacionFacturasRes,
                pagosResumenRes,
                metodosRes,
                estadosRes,
                facturasMesRes,
                pagosMesRes,
                deudoresRes,
                pagadoresRes
            ] = await Promise.all([
                dbTurso.execute({
                    sql: `
                        SELECT
                            COUNT(*) AS total_facturas,
                            COALESCE(SUM(f.total), 0) AS total_esperado,
                            COALESCE(SUM(f.saldo_pendiente), 0) AS deuda_total_rango,
                            COALESCE(SUM(CASE WHEN f.estado = 'Pagado' THEN 1 ELSE 0 END), 0) AS facturas_pagadas,
                            COALESCE(SUM(CASE WHEN f.estado = 'Vencida' THEN 1 ELSE 0 END), 0) AS facturas_vencidas
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE ${whereFacturas}
                    `,
                    args: argsFacturas
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            COALESCE(SUM(COALESCE(f.total, 0) - COALESCE(f.saldo_pendiente, 0)), 0) AS total_recaudado_facturas
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE ${whereFacturas}
                    `,
                    args: argsFacturas
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            COALESCE(SUM(p.monto), 0) AS total_recaudado,
                            COUNT(*) AS total_pagos,
                            COALESCE(AVG(p.monto), 0) AS ticket_promedio_pago
                        FROM pagos p
                        JOIN facturas f ON f.id = p.factura_id
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE ${wherePagos}
                    `,
                    args: argsPagos
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            p.metodo_pago,
                            COALESCE(SUM(p.monto), 0) AS total,
                            COUNT(*) AS transacciones
                        FROM pagos p
                        JOIN facturas f ON f.id = p.factura_id
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE ${wherePagos}
                        GROUP BY p.metodo_pago
                        ORDER BY total DESC
                    `,
                    args: argsPagos
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            f.estado,
                            COUNT(*) AS cantidad,
                            COALESCE(SUM(f.total), 0) AS total,
                            COALESCE(SUM(f.saldo_pendiente), 0) AS saldo_pendiente
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE ${whereFacturas}
                        GROUP BY f.estado
                        ORDER BY cantidad DESC
                    `,
                    args: argsFacturas
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            ${usarPeriodoFacturado ? 'l.periodo' : "strftime('%Y-%m', f.fecha_emision)"} AS periodo,
                            COALESCE(SUM(f.total), 0) AS esperado,
                            COALESCE(SUM(f.saldo_pendiente), 0) AS pendiente
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE ${whereFacturas}
                        GROUP BY 1
                        ORDER BY 1
                    `,
                    args: argsFacturas
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            ${usarPeriodoFacturado ? 'l.periodo' : "strftime('%Y-%m', f.fecha_emision)"} AS periodo,
                            COALESCE(SUM(COALESCE(f.total, 0) - COALESCE(f.saldo_pendiente, 0)), 0) AS recaudado
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE ${whereFacturas}
                        GROUP BY 1
                        ORDER BY 1
                    `,
                    args: argsFacturas
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            c.id AS cliente_id,
                            c.nombre AS cliente_nombre,
                            c.ciudad AS localidad,
                            COUNT(f.id) AS facturas_con_deuda,
                            COALESCE(SUM(f.saldo_pendiente), 0) AS deuda_total,
                            MIN(f.fecha_vencimiento) AS vencimiento_mas_antiguo
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        JOIN clientes c ON c.id = f.cliente_id
                        WHERE ${whereFacturas}
                          AND f.saldo_pendiente > 0
                        GROUP BY c.id
                        ORDER BY deuda_total DESC
                    `,
                    args: argsFacturas
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            c.id AS cliente_id,
                            c.nombre AS cliente_nombre,
                            c.ciudad AS localidad,
                            COALESCE(SUM(p.monto), 0) AS total_pagado,
                            COUNT(p.id) AS pagos_realizados,
                            MAX(p.fecha_pago) AS ultimo_pago,
                            COALESCE((
                                SELECT SUM(f2.saldo_pendiente)
                                FROM facturas f2
                                WHERE f2.cliente_id = c.id
                            ), 0) AS deuda_total_actual
                        FROM pagos p
                        JOIN facturas f ON f.id = p.factura_id
                        JOIN lecturas l ON l.id = f.lectura_id
                        JOIN clientes c ON c.id = f.cliente_id
                        WHERE ${wherePagos}
                        GROUP BY c.id
                        ORDER BY total_pagado DESC
                    `,
                    args: argsPagos
                })
            ]);

            const facturacion = facturacionRes.rows[0] || {};
            const recaudacionFacturas = recaudacionFacturasRes.rows[0] || {};
            const pagosResumen = pagosResumenRes.rows[0] || {};

            const totalEsperado = Number(facturacion.total_esperado || 0);
            const totalRecaudado = Number(recaudacionFacturas.total_recaudado_facturas || 0);
            const deudaTotalRango = Number(facturacion.deuda_total_rango || 0);
            const porCobrarEstimado = Math.max(totalEsperado - totalRecaudado, 0);
            const eficiencia = totalEsperado > 0 ? Number(((totalRecaudado / totalEsperado) * 100).toFixed(2)) : 0;

            const factMesMap = new Map(
                facturasMesRes.rows.map(row => [row.periodo, {
                    esperado: Number(row.esperado || 0),
                    pendiente: Number(row.pendiente || 0)
                }])
            );

            const pagosMesMap = new Map(
                pagosMesRes.rows.map(row => [row.periodo, Number(row.recaudado || 0)])
            );

            // Construye la serie mensual completa en el rango solicitado
            const serieMensual = [];
            let cursor = startOfMonth(inicioDate);
            const finMes = startOfMonth(finDate);

            while (cursor <= finMes) {
                const periodoMes = format(cursor, 'yyyy-MM');
                const datosFact = factMesMap.get(periodoMes) || { esperado: 0, pendiente: 0 };
                const recaudado = pagosMesMap.get(periodoMes) || 0;
                const esperado = datosFact.esperado;
                const pendiente = Math.max(datosFact.pendiente, 0);

                serieMensual.push({
                    periodo: periodoMes,
                    esperado,
                    recaudado,
                    pendiente,
                    porcentaje_recaudo: esperado > 0 ? Number(((recaudado / esperado) * 100).toFixed(2)) : 0
                });

                cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
            }

            const metodosPago = metodosRes.rows.map(row => ({
                metodo: row.metodo_pago,
                total: Number(row.total || 0),
                transacciones: Number(row.transacciones || 0)
            }));

            const estadoFacturas = estadosRes.rows.map(row => ({
                estado: row.estado,
                cantidad: Number(row.cantidad || 0),
                total: Number(row.total || 0),
                saldo_pendiente: Number(row.saldo_pendiente || 0)
            }));

            const deudores = deudoresRes.rows.map(row => ({
                cliente_id: Number(row.cliente_id),
                cliente_nombre: row.cliente_nombre,
                localidad: row.localidad,
                facturas_con_deuda: Number(row.facturas_con_deuda || 0),
                deuda_total: Number(row.deuda_total || 0),
                vencimiento_mas_antiguo: row.vencimiento_mas_antiguo
            }));

            const pagadores = pagadoresRes.rows.map(row => ({
                cliente_id: Number(row.cliente_id),
                cliente_nombre: row.cliente_nombre,
                localidad: row.localidad,
                total_pagado: Number(row.total_pagado || 0),
                pagos_realizados: Number(row.pagos_realizados || 0),
                ultimo_pago: row.ultimo_pago,
                deuda_total_actual: Number(row.deuda_total_actual || 0)
            }));

            res.json({
                filtro_aplicado: {
                    tipo,
                    periodo: periodo || null,
                    meses: mesesAplicados,
                    anio: anio || null,
                    fecha_inicio: inicio,
                    fecha_fin: fin,
                    etiqueta
                },
                resumen: {
                    total_esperado: totalEsperado,
                    total_recaudado: totalRecaudado,
                    recaudado_hasta_fecha_actual: totalRecaudado,
                    por_cobrar_estimado: porCobrarEstimado,
                    deuda_total_rango: deudaTotalRango,
                    eficiencia_recaudo_porcentaje: eficiencia,
                    total_facturas: Number(facturacion.total_facturas || 0),
                    facturas_pagadas: Number(facturacion.facturas_pagadas || 0),
                    facturas_vencidas: Number(facturacion.facturas_vencidas || 0),
                    total_pagos: Number(pagosResumen.total_pagos || 0),
                    ticket_promedio_pago: Number(pagosResumen.ticket_promedio_pago || 0)
                },
                series: {
                    recaudacion_mensual: serieMensual,
                    metodos_pago: metodosPago,
                    estado_facturas: estadoFacturas
                },
                listados: {
                    deudores,
                    pagadores
                },
                generated_at: new Date().toISOString()
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
            const hoyLocal = nowDate();
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
                        WHEN julianday(?) - julianday(fecha_vencimiento) <= 30 THEN '0-30 días'
                        WHEN julianday(?) - julianday(fecha_vencimiento) <= 60 THEN '31-60 días'
                        WHEN julianday(?) - julianday(fecha_vencimiento) <= 90 THEN '61-90 días'
                        ELSE '+90 días'
                    END as rango,
                    SUM(saldo_pendiente) as total
                FROM facturas
                WHERE saldo_pendiente > 0 AND estado = 'Vencida'
                GROUP BY 1
            `;
            const antiguedadRes = await dbTurso.execute({ sql: antiguedadQuery, args: [hoyLocal, hoyLocal, hoyLocal] });

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
     * Reporte de consumo de agua potable
     * Endpoint: GET /api/v2/reports/consumo-agua
     * Query:
     * - tipo: periodo | ultimos_meses
     * - periodo: YYYY-MM (cuando tipo=periodo)
     * - meses: 3 | 6 | 12 (cuando tipo=ultimos_meses)
     */
    getReporteConsumoAgua: async (req, res) => {
        try {
            const { tipo = 'ultimos_meses', periodo, meses } = req.query;

            let inicioPeriodo = '';
            let finPeriodo = '';
            let etiqueta = '';

            if (tipo === 'periodo') {
                if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
                    return res.status(400).json({ error: "Para tipo=periodo, el parámetro 'periodo' (YYYY-MM) es obligatorio" });
                }
                inicioPeriodo = periodo;
                finPeriodo = periodo;
                etiqueta = `Periodo ${periodo}`;
            } else if (tipo === 'ultimos_meses') {
                const mesesNum = Number(meses || 3);
                if (![3, 6, 12].includes(mesesNum)) {
                    return res.status(400).json({ error: "Para tipo=ultimos_meses, 'meses' debe ser 3, 6 o 12" });
                }

                const ahora = new Date();
                const periodoActual = format(ahora, 'yyyy-MM');
                const periodoInicio = format(subMonths(ahora, mesesNum - 1), 'yyyy-MM');

                inicioPeriodo = periodoInicio;
                finPeriodo = periodoActual;
                etiqueta = `Últimos ${mesesNum} meses`;
            } else {
                return res.status(400).json({ error: "Tipo de filtro inválido. Use: periodo o ultimos_meses" });
            }

            const [
                resumenRes,
                serieConsumoRes,
                topConsumidoresRes,
                menorConsumoRes,
                consumoPorRutaRes,
                clientesUnicosRes
            ] = await Promise.all([
                dbTurso.execute({
                    sql: `
                        SELECT
                            COUNT(f.id) AS total_recibos,
                            COALESCE(SUM(l.consumo_m3), 0) AS consumo_total_m3,
                            COALESCE(AVG(l.consumo_m3), 0) AS consumo_promedio_m3
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE l.periodo BETWEEN ? AND ?
                    `,
                    args: [inicioPeriodo, finPeriodo]
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            l.periodo,
                            COUNT(f.id) AS recibos,
                            COALESCE(SUM(l.consumo_m3), 0) AS consumo_total_m3,
                            COALESCE(AVG(l.consumo_m3), 0) AS consumo_promedio_m3
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE l.periodo BETWEEN ? AND ?
                        GROUP BY l.periodo
                        ORDER BY l.periodo
                    `,
                    args: [inicioPeriodo, finPeriodo]
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            c.id AS cliente_id,
                            c.nombre AS cliente_nombre,
                            c.ciudad AS localidad,
                            COUNT(f.id) AS recibos,
                            COALESCE(SUM(l.consumo_m3), 0) AS consumo_total_m3,
                            COALESCE(AVG(l.consumo_m3), 0) AS consumo_promedio_m3
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        JOIN clientes c ON c.id = f.cliente_id
                        WHERE l.periodo BETWEEN ? AND ?
                        GROUP BY c.id
                        ORDER BY consumo_total_m3 DESC
                        LIMIT 10
                    `,
                    args: [inicioPeriodo, finPeriodo]
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            c.id AS cliente_id,
                            c.nombre AS cliente_nombre,
                            c.ciudad AS localidad,
                            COUNT(f.id) AS recibos,
                            COALESCE(SUM(l.consumo_m3), 0) AS consumo_total_m3,
                            COALESCE(AVG(l.consumo_m3), 0) AS consumo_promedio_m3
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        JOIN clientes c ON c.id = f.cliente_id
                        WHERE l.periodo BETWEEN ? AND ?
                        GROUP BY c.id
                        HAVING COALESCE(SUM(l.consumo_m3), 0) > 0
                        ORDER BY consumo_total_m3 ASC
                        LIMIT 10
                    `,
                    args: [inicioPeriodo, finPeriodo]
                }),
                dbTurso.execute({
                    sql: `
                        SELECT
                            COALESCE(r.id, 0) AS ruta_id,
                            COALESCE(r.nombre, 'Sin Ruta') AS ruta_nombre,
                            COUNT(f.id) AS recibos,
                            COALESCE(SUM(l.consumo_m3), 0) AS consumo_total_m3,
                            COALESCE(AVG(l.consumo_m3), 0) AS consumo_promedio_m3
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        LEFT JOIN rutas r ON r.id = l.ruta_id
                        WHERE l.periodo BETWEEN ? AND ?
                        GROUP BY COALESCE(r.id, 0), COALESCE(r.nombre, 'Sin Ruta')
                        ORDER BY consumo_total_m3 DESC
                    `,
                    args: [inicioPeriodo, finPeriodo]
                }),
                dbTurso.execute({
                    sql: `
                        SELECT COUNT(DISTINCT f.cliente_id) AS total_clientes
                        FROM facturas f
                        JOIN lecturas l ON l.id = f.lectura_id
                        WHERE l.periodo BETWEEN ? AND ?
                    `,
                    args: [inicioPeriodo, finPeriodo]
                })
            ]);

            const resumen = resumenRes.rows[0] || {};
            const totalRecibos = Number(resumen.total_recibos || 0);
            const consumoTotalM3 = Number(resumen.consumo_total_m3 || 0);
            const consumoPromedioM3 = Number(resumen.consumo_promedio_m3 || 0);
            const totalClientes = Number(clientesUnicosRes.rows[0]?.total_clientes || 0);
            const promedioPorCliente = totalClientes > 0 ? consumoTotalM3 / totalClientes : 0;

            res.json({
                filtro_aplicado: {
                    tipo,
                    periodo: tipo === 'periodo' ? periodo : null,
                    meses: tipo === 'ultimos_meses' ? Number(meses || 3) : null,
                    inicio_periodo: inicioPeriodo,
                    fin_periodo: finPeriodo,
                    etiqueta
                },
                resumen: {
                    total_recibos: totalRecibos,
                    consumo_total_m3: Number(consumoTotalM3.toFixed(2)),
                    consumo_promedio_m3: Number(consumoPromedioM3.toFixed(2)),
                    total_clientes: totalClientes,
                    promedio_consumo_por_cliente_m3: Number(promedioPorCliente.toFixed(2))
                },
                series: {
                    consumo_mensual: serieConsumoRes.rows.map(row => ({
                        periodo: row.periodo,
                        recibos: Number(row.recibos || 0),
                        consumo_total_m3: Number(row.consumo_total_m3 || 0),
                        consumo_promedio_m3: Number(row.consumo_promedio_m3 || 0)
                    }))
                },
                listados: {
                    top_consumidores: topConsumidoresRes.rows.map(row => ({
                        cliente_id: row.cliente_id,
                        cliente_nombre: row.cliente_nombre,
                        localidad: row.localidad,
                        recibos: Number(row.recibos || 0),
                        consumo_total_m3: Number(row.consumo_total_m3 || 0),
                        consumo_promedio_m3: Number(row.consumo_promedio_m3 || 0)
                    })),
                    menor_consumo: menorConsumoRes.rows.map(row => ({
                        cliente_id: row.cliente_id,
                        cliente_nombre: row.cliente_nombre,
                        localidad: row.localidad,
                        recibos: Number(row.recibos || 0),
                        consumo_total_m3: Number(row.consumo_total_m3 || 0),
                        consumo_promedio_m3: Number(row.consumo_promedio_m3 || 0)
                    }))
                },
                distribucion_rutas: consumoPorRutaRes.rows.map(row => ({
                    ruta_id: Number(row.ruta_id || 0),
                    ruta_nombre: row.ruta_nombre,
                    recibos: Number(row.recibos || 0),
                    consumo_total_m3: Number(row.consumo_total_m3 || 0),
                    consumo_promedio_m3: Number(row.consumo_promedio_m3 || 0)
                })),
                generated_at: new Date().toISOString()
            });
        } catch (error) {
            console.error("Error generando reporte de consumo de agua:", error);
            res.status(500).json({ error: "Error interno generando reporte de consumo" });
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
                    c.numero_predio,
                    c.ciudad as localidad,
                    c.direccion,
                    m.id as medidor_id,
                    m.numero_serie,
                    m.ubicacion as medidor_ubicacion,
                    m.latitud,
                    m.longitud,
                    l_ant.consumo_m3 as consumo_anterior,
                    l_ant.lectura_actual as lectura_fisica_anterior,
                    0 as lectura_anterior_calculada
                FROM clientes c
                LEFT JOIN medidores m ON c.id = m.cliente_id AND m.estado_medidor != 'Retirado'
                LEFT JOIN lecturas l_ant ON m.id = l_ant.medidor_id AND l_ant.periodo = ?
                WHERE c.estado_cliente = 'Activo'
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

                const tieneMedidor = !!row.medidor_id;
                porLocalidad[loc].push({
                    id: row.cliente_id,
                    numero_predio: row.numero_predio || null,
                    cliente: row.cliente_nombre,
                    direccion: row.direccion || '',
                    sin_medidor: !tieneMedidor,
                    medidor: tieneMedidor ? {
                        serie: row.numero_serie,
                        ubicacion: row.medidor_ubicacion,
                        coordenadas: {
                            lat: row.latitud ? Number(row.latitud) : null,
                            lng: row.longitud ? Number(row.longitud) : null
                        }
                    } : null,
                    lectura_anterior: tieneMedidor ? {
                        periodo: mesAnterior,
                        valor: 0,
                        consumo_registrado: Number(row.consumo_anterior || 0),
                        lectura_fisica: row.lectura_fisica_anterior !== null && row.lectura_fisica_anterior !== undefined
                            ? Number(row.lectura_fisica_anterior)
                            : null
                    } : null
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
