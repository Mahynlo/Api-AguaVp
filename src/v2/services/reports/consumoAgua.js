/**
 * Reportes: generarReporteConsumoAgua (ver services/reportsService.js)
 */

import db from "../../../database/db-sqlite.js";
import { subMonths, format } from 'date-fns';
import { crearError } from '../../../utils/errores.js';

/**
 * Reporte de consumo de agua potable
 * Endpoint: GET /api/v2/reports/consumo-agua
 * Query:
 * - tipo: periodo | ultimos_meses | anio
 * - periodo: YYYY-MM (cuando tipo=periodo)
 * - meses: 3 | 6 | 12 (cuando tipo=ultimos_meses)
 * - anio: YYYY (cuando tipo=anio)
 */
export async function generarReporteConsumoAgua(filtros) {
    const { tipo = 'ultimos_meses', periodo, meses, anio } = filtros;

    let inicioPeriodo = '';
    let finPeriodo = '';
    let etiqueta = '';

    if (tipo === 'periodo') {
        if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
            throw crearError("Para tipo=periodo, el parámetro 'periodo' (YYYY-MM) es obligatorio", 400);
        }
        inicioPeriodo = periodo;
        finPeriodo = periodo;
        etiqueta = `Periodo ${periodo}`;
    } else if (tipo === 'ultimos_meses') {
        const mesesNum = Number(meses || 3);
        if (![3, 6, 12].includes(mesesNum)) {
            throw crearError("Para tipo=ultimos_meses, 'meses' debe ser 3, 6 o 12", 400);
        }

        const ahora = new Date();
        const periodoActual = format(ahora, 'yyyy-MM');
        const periodoInicio = format(subMonths(ahora, mesesNum - 1), 'yyyy-MM');

        inicioPeriodo = periodoInicio;
        finPeriodo = periodoActual;
        etiqueta = `Últimos ${mesesNum} meses`;
    } else if (tipo === 'anio') {
        if (!anio || !/^\d{4}$/.test(String(anio))) {
            throw crearError("Para tipo=anio, el parámetro 'anio' (YYYY) es obligatorio", 400);
        }
        inicioPeriodo = `${anio}-01`;
        finPeriodo = `${anio}-12`;
        etiqueta = `Año ${anio}`;
    } else {
        throw crearError("Tipo de filtro inválido. Use: periodo, ultimos_meses o anio", 400);
    }

    const [
        resumenRes,
        serieConsumoRes,
        topConsumidoresRes,
        menorConsumoRes,
        consumoPorRutaRes,
        clientesUnicosRes
    ] = await Promise.all([
        db.execute({
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
        db.execute({
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
        db.execute({
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
        db.execute({
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
        db.execute({
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
        db.execute({
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

    return {
        filtro_aplicado: {
            tipo,
            periodo: tipo === 'periodo' ? periodo : null,
            meses: tipo === 'ultimos_meses' ? Number(meses || 3) : null,
            anio: tipo === 'anio' ? String(anio) : null,
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
    };
}
