/**
 * Reportes: generarRecibos (ver services/reportsService.js)
 */

import db from "../../../database/db-sqlite.js";
import { subMonths, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { crearError } from '../../../utils/errores.js';

// Helpers internos
const obtenerNombreMes = (fechaStr) => {
    try {
        return format(parseISO(fechaStr), 'MMMM yyyy', { locale: es });
    } catch {
        return fechaStr;
    }
};

/**
 * Obtener datos para impresión de Recibos
 * Endpoint: GET /api/v2/reports/recibos
 * Params: mes (YYYY-MM), ruta_id (opcional), estado_pago (opcional)
 */
export async function generarRecibos(filtros) {
    const { mes, ruta_id, estado_pago } = filtros;

    if (!mes) {
        throw crearError("El parámetro 'mes' (YYYY-MM) es obligatorio", 400);
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
            c.numero_predio,
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

    const result = await db.execute({ sql: query, args: params });
    const facturas = result.rows;

    // 2. Obtener deuda acumulada para estos clientes
    // Buscar todas las facturas pendientes ANTERIORES a este periodo
    const clientesIds = facturas.map(f => f.cliente_id).filter((v, i, a) => a.indexOf(v) === i);

    let deudaMap = {}; // cliente_id -> deuda_total

    if (clientesIds.length > 0) {
        // Una sola consulta agregada (suficiente para cientos de clientes)
        const placeHolders = clientesIds.map(() => '?').join(',');

        // Deuda anterior: pendiente de periodos previos (excluye la factura del periodo actual)
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

        const deudaResult = await db.execute({
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
            const historyResult = await db.execute({
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
                pueblo: f.pueblo,
                numero_predio: f.numero_predio || null
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

    return {
        periodo: mes,
        total_recibos: recibos.length,
        recibos
    };

}
