import dbTurso from "../../database/db-sqlite.js";
import { limitesMensuales } from '../../utils/timezone.js';

function calcularCrecimiento(actual, anterior) {
    if (anterior === 0) return actual > 0 ? 100 : 0;
    return parseFloat((((actual - anterior) / anterior) * 100).toFixed(2));
}

async function getConsumoStats(startActual, endActual, startAnterior, endAnterior) {
    const mesActual = startActual.substring(0, 7);
    const mesAnterior = startAnterior.substring(0, 7);

    const [actualResult, anteriorResult] = await Promise.all([
        dbTurso.execute({
            sql: `SELECT COALESCE(SUM(consumo_m3), 0) as total FROM lecturas WHERE COALESCE(periodo, strftime('%Y-%m', fecha_lectura)) = ?`,
            args: [mesActual]
        }),
        dbTurso.execute({
            sql: `SELECT COALESCE(SUM(consumo_m3), 0) as total FROM lecturas WHERE COALESCE(periodo, strftime('%Y-%m', fecha_lectura)) = ?`,
            args: [mesAnterior]
        })
    ]);

    let actual = Number(actualResult.rows[0].total);
    let anterior = Number(anteriorResult.rows[0].total);

    // Si el mes actual aún no tiene lecturas pero el anterior sí,
    // comparar el último periodo registrado contra su mes previo para mostrar datos útiles
    if (actual === 0 && anterior > 0) {
        const [anioAnt, mesAnt] = mesAnterior.split('-').map(Number);
        const fechaPrev = new Date(anioAnt, mesAnt - 2, 1);
        const mesPrevio = `${fechaPrev.getFullYear()}-${String(fechaPrev.getMonth() + 1).padStart(2, '0')}`;
        
        const previoResult = await dbTurso.execute({
            sql: `SELECT COALESCE(SUM(consumo_m3), 0) as total FROM lecturas WHERE COALESCE(periodo, strftime('%Y-%m', fecha_lectura)) = ?`,
            args: [mesPrevio]
        });
        actual = anterior;
        anterior = Number(previoResult.rows[0].total);
    }

    return { actual, anterior, crecimiento: calcularCrecimiento(actual, anterior), unidad: 'm3' };
}

async function getClientesStats(startActual, endActual, startAnterior, endAnterior) {
    const [totalResult, nuevosActualResult, nuevosAnteriorResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM clientes WHERE estado_cliente != 'Eliminado'` }),
        dbTurso.execute({
            sql: `SELECT COUNT(*) as total FROM clientes WHERE date(fecha_creacion) >= ? AND date(fecha_creacion) < ?`,
            args: [startActual, endActual]
        }),
        dbTurso.execute({
            sql: `SELECT COUNT(*) as total FROM clientes WHERE date(fecha_creacion) >= ? AND date(fecha_creacion) < ?`,
            args: [startAnterior, endAnterior]
        })
    ]);
    const nuevosActual = Number(nuevosActualResult.rows[0].total);
    const nuevosAnterior = Number(nuevosAnteriorResult.rows[0].total);
    return {
        total: Number(totalResult.rows[0].total),
        nuevos_este_mes: nuevosActual,
        crecimiento_nuevos: calcularCrecimiento(nuevosActual, nuevosAnterior)
    };
}

async function getMedidoresStats(startActual, endActual, startAnterior, endAnterior) {
    const [totalResult, nuevosActualResult, nuevosAnteriorResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM medidores WHERE estado_medidor != 'Retirado'` }),
        dbTurso.execute({
            sql: `SELECT COUNT(*) as total FROM medidores WHERE date(fecha_creacion) >= ? AND date(fecha_creacion) < ?`,
            args: [startActual, endActual]
        }),
        dbTurso.execute({
            sql: `SELECT COUNT(*) as total FROM medidores WHERE date(fecha_creacion) >= ? AND date(fecha_creacion) < ?`,
            args: [startAnterior, endAnterior]
        })
    ]);
    const nuevosActual = Number(nuevosActualResult.rows[0].total);
    const nuevosAnterior = Number(nuevosAnteriorResult.rows[0].total);
    return {
        total: Number(totalResult.rows[0].total),
        nuevos_este_mes: nuevosActual,
        crecimiento_nuevos: calcularCrecimiento(nuevosActual, nuevosAnterior)
    };
}

async function getPagosStats(startActual, endActual, startAnterior, endAnterior) {
    const [actualResult, anteriorResult] = await Promise.all([
        dbTurso.execute({
            sql: `SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE date(fecha_pago) >= ? AND date(fecha_pago) < ?`,
            args: [startActual, endActual]
        }),
        dbTurso.execute({
            sql: `SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE date(fecha_pago) >= ? AND date(fecha_pago) < ?`,
            args: [startAnterior, endAnterior]
        })
    ]);
    const actual = Number(actualResult.rows[0].total);
    const anterior = Number(anteriorResult.rows[0].total);
    return { actual, anterior, crecimiento: calcularCrecimiento(actual, anterior), unidad: 'GTQ' };
}

async function getHistoricoConsumo() {
    const result = await dbTurso.execute({
        sql: `SELECT COALESCE(periodo, strftime('%Y-%m', fecha_lectura)) as mes, SUM(consumo_m3) as total
              FROM lecturas
              WHERE COALESCE(periodo, strftime('%Y-%m', fecha_lectura)) IS NOT NULL
              GROUP BY mes
              ORDER BY mes DESC
              LIMIT 12`
    });
    return result.rows.slice().reverse().map(row => ({ mes: row.mes, consumo: Number(row.total) }));
}

async function getConsumoPorRuta(startActual, endActual) {
    const mesActual = startActual.substring(0, 7);
    let result = await dbTurso.execute({
        sql: `SELECT r.nombre as ruta, COALESCE(SUM(l.consumo_m3), 0) as consumo_total
              FROM lecturas l
              LEFT JOIN rutas r ON l.ruta_id = r.id
              WHERE COALESCE(l.periodo, strftime('%Y-%m', l.fecha_lectura)) = ?
              GROUP BY r.id, r.nombre
              ORDER BY consumo_total DESC`,
        args: [mesActual]
    });
    
    // Si el mes actual aún no tiene lecturas, buscar el último periodo con datos
    if (!result.rows.length || result.rows.every(r => Number(r.consumo_total) === 0)) {
        result = await dbTurso.execute({
            sql: `SELECT r.nombre as ruta, COALESCE(SUM(l.consumo_m3), 0) as consumo_total
                  FROM lecturas l
                  LEFT JOIN rutas r ON l.ruta_id = r.id
                  WHERE COALESCE(l.periodo, strftime('%Y-%m', l.fecha_lectura)) = (
                      SELECT MAX(COALESCE(periodo, strftime('%Y-%m', fecha_lectura))) FROM lecturas
                  )
                  GROUP BY r.id, r.nombre
                  ORDER BY consumo_total DESC`
        });
    }

    const total = result.rows.reduce((acc, row) => acc + Number(row.consumo_total), 0);
    return result.rows.map(row => ({
        nombre: row.ruta || 'Sin Ruta',
        valor: Number(row.consumo_total),
        porcentaje: total > 0 ? parseFloat(((Number(row.consumo_total) / total) * 100).toFixed(2)) : 0
    }));
}

export async function getDashboardStats() {
    const {
        inicioMesActual: startActual,
        inicioMesSiguiente: endActual,
        inicioMesAnterior: startAnterior,
        finMesAnterior: endAnterior
    } = limitesMensuales();

    const [consumo, clientes, medidores, pagos, historicoConsumo, consumoPorRuta] = await Promise.all([
        getConsumoStats(startActual, endActual, startAnterior, endAnterior),
        getClientesStats(startActual, endActual, startAnterior, endAnterior),
        getMedidoresStats(startActual, endActual, startAnterior, endAnterior),
        getPagosStats(startActual, endActual, startAnterior, endAnterior),
        getHistoricoConsumo(),
        getConsumoPorRuta(startActual, endActual)
    ]);

    return {
        tarjetas: { consumo, clientes, medidores, pagos },
        graficos: {
            linea_historico: historicoConsumo,
            pie_distribucion: consumoPorRuta
        },
        meta: {
            mes_actual: startActual.substring(0, 7),
            mes_anterior: startAnterior.substring(0, 7)
        }
    };
}
