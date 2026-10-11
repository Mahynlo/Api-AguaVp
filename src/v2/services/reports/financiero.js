/**
 * Reportes: generarReporteFinanciero (ver services/reportsService.js)
 */

import db from "../../../database/db-sqlite.js";
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from 'date-fns';
import { crearError } from '../../../utils/errores.js';

/**
 * Reporte Financiero (Ingresos/Egresos/Cartera)
 */
export async function generarReporteFinanciero(filtros) {
    const { tipo = 'periodo', periodo, meses, anio, fecha_inicio, fecha_fin } = filtros;

    const formatoDia = 'yyyy-MM-dd';
    const hoy = new Date();

    let inicioDate = null;
    let finDate = null;
    let etiqueta = '';
    let mesesAplicados = null;

    if (tipo === 'periodo') {
        if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
            throw crearError("Para tipo=periodo, el parámetro 'periodo' (YYYY-MM) es obligatorio", 400);
        }
        const base = parseISO(`${periodo}-01`);
        inicioDate = startOfMonth(base);
        finDate = endOfMonth(base);
        etiqueta = `Periodo ${periodo}`;
    } else if (tipo === 'ultimos_meses') {
        const mesesNum = Number(meses || 3);
        if (![3, 6, 12].includes(mesesNum)) {
            throw crearError("Para tipo=ultimos_meses, 'meses' debe ser 3, 6 o 12", 400);
        }
        inicioDate = startOfMonth(subMonths(hoy, mesesNum - 1));
        finDate = hoy;
        mesesAplicados = mesesNum;
        etiqueta = `Últimos ${mesesNum} meses`;
    } else if (tipo === 'anio') {
        if (!anio || !/^\d{4}$/.test(String(anio))) {
            throw crearError("Para tipo=anio, el parámetro 'anio' (YYYY) es obligatorio", 400);
        }
        inicioDate = parseISO(`${anio}-01-01`);
        finDate = parseISO(`${anio}-12-31`);
        etiqueta = `Año ${anio}`;
    } else if (tipo === 'rango') {
        if (!fecha_inicio || !fecha_fin || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_fin)) {
            throw crearError("Para tipo=rango, 'fecha_inicio' y 'fecha_fin' (YYYY-MM-DD) son obligatorios", 400);
        }
        inicioDate = parseISO(fecha_inicio);
        finDate = parseISO(fecha_fin);
        etiqueta = `Rango ${fecha_inicio} a ${fecha_fin}`;
    } else {
        throw crearError("Tipo de filtro inválido. Use: periodo, ultimos_meses, anio o rango", 400);
    }

    if (!inicioDate || !finDate || Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) {
        throw crearError('No se pudo interpretar el rango de fechas solicitado', 400);
    }

    if (inicioDate > finDate) {
        throw crearError("La fecha de inicio no puede ser mayor a la fecha fin", 400);
    }

    const inicio = format(inicioDate, formatoDia);
    const fin = format(finDate, formatoDia);
    const inicioPeriodo = format(inicioDate, 'yyyy-MM');
    const finPeriodo = format(finDate, 'yyyy-MM');

    // La recaudación por mes de pago (caja) siempre cubre el/los AÑO(S) completos
    // del rango, no solo el mes filtrado: por el desfase entre el periodo de la
    // deuda y la fecha real de pago, conviene ver el flujo de caja de todo el año.
    const cajaInicioDate = new Date(inicioDate.getFullYear(), 0, 1);
    const cajaFinDate = new Date(finDate.getFullYear(), 11, 31);
    const cajaInicioStr = format(cajaInicioDate, formatoDia);
    const cajaFinStr = format(cajaFinDate, formatoDia);

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
        pagadoresRes,
        recaudacionCajaRes
    ] = await Promise.all([
        db.execute({
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
        db.execute({
            sql: `
                SELECT
                    COALESCE(SUM(COALESCE(f.total, 0) - COALESCE(f.saldo_pendiente, 0)), 0) AS total_recaudado_facturas
                FROM facturas f
                JOIN lecturas l ON l.id = f.lectura_id
                WHERE ${whereFacturas}
            `,
            args: argsFacturas
        }),
        db.execute({
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
        db.execute({
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
        db.execute({
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
        db.execute({
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
        db.execute({
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
        db.execute({
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
        db.execute({
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
        }),
        // Recaudación REAL por mes de pago (flujo de caja): agrupa por la fecha
        // en que entró el dinero (p.fecha_pago), independiente del periodo de la
        // deuda. Incluye TODOS los pagos (también parcialidades de convenio).
        db.execute({
            sql: `
                SELECT
                    strftime('%Y-%m', p.fecha_pago) AS mes_pago,
                    COALESCE(SUM(p.monto), 0) AS recaudado,
                    COUNT(p.id) AS transacciones
                FROM pagos p
                WHERE p.fecha_pago BETWEEN ? AND ?
                GROUP BY 1
                ORDER BY 1
            `,
            args: [cajaInicioStr, cajaFinStr]
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

    // Serie de recaudación por mes de pago (caja real), completa en el rango.
    const cajaMap = new Map(
        recaudacionCajaRes.rows.map(row => [row.mes_pago, {
            recaudado: Number(row.recaudado || 0),
            transacciones: Number(row.transacciones || 0)
        }])
    );
    const serieCaja = [];
    let cursorCaja = startOfMonth(cajaInicioDate);
    const finMesCaja = startOfMonth(cajaFinDate);
    while (cursorCaja <= finMesCaja) {
        const mesCaja = format(cursorCaja, 'yyyy-MM');
        const datosCaja = cajaMap.get(mesCaja) || { recaudado: 0, transacciones: 0 };
        serieCaja.push({
            periodo: mesCaja,
            recaudado: datosCaja.recaudado,
            transacciones: datosCaja.transacciones
        });
        cursorCaja = startOfMonth(new Date(cursorCaja.getFullYear(), cursorCaja.getMonth() + 1, 1));
    }
    const totalRecaudadoCaja = serieCaja.reduce((s, m) => s + m.recaudado, 0);

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

    return {
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
            ticket_promedio_pago: Number(pagosResumen.ticket_promedio_pago || 0),
            // Dinero que realmente entró en el rango, por fecha de pago (caja).
            total_recaudado_caja: totalRecaudadoCaja
        },
        series: {
            recaudacion_mensual: serieMensual,
            // Recaudación por mes de pago (flujo de caja real, independiente del periodo).
            recaudacion_por_mes_pago: serieCaja,
            metodos_pago: metodosPago,
            estado_facturas: estadoFacturas
        },
        listados: {
            deudores,
            pagadores
        },
        generated_at: new Date().toISOString()
    };

}
