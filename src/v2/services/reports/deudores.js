/**
 * Reportes: generarReporteDeudores (ver services/reportsService.js)
 */

import db from "../../../database/db-sqlite.js";
import { nowDate } from '../../../utils/timezone.js';

/**
 * Reporte de Deudores y Cobranza
 * Endpoint: GET /api/v2/reports/deudores
 */
export async function generarReporteDeudores() {
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

    const resumenRes = await db.execute({ sql: resumenQuery, args: [] });
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
    const topDeudoresRes = await db.execute({ sql: topDeudoresQuery, args: [] });

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
    const antiguedadRes = await db.execute({ sql: antiguedadQuery, args: [hoyLocal, hoyLocal, hoyLocal] });

    // 4. Operatividad (Cortes/Reconexiones del mes actual)
    const inicioMes = new Date().toISOString().slice(0, 7) + '-01';
    const operatividadQuery = `
        SELECT 
            SUM(CASE WHEN fecha_corte >= ? THEN 1 ELSE 0 END) as cortes_mes,
            SUM(CASE WHEN fecha_reconexion >= ? THEN 1 ELSE 0 END) as reconexiones_mes
        FROM cortes_servicio
    `;
    const operatividadRes = await db.execute({ sql: operatividadQuery, args: [inicioMes, inicioMes] });

    return {
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
    };

}
