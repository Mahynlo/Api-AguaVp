import dbTurso from '../../database/db-sqlite.js';
import { calcularTarifaDesdeDB } from '../../utils/tarifaUtils.js';
import { nowDate, calcularVencimiento } from '../../utils/timezone.js';

function serviceError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

async function getDiasVencimiento() {
    const result = await dbTurso.execute({ sql: `SELECT dias_vencimiento_factura FROM configuracion_servicio WHERE activo = 1 ORDER BY id DESC LIMIT 1` });
    return result.rows.length > 0 ? (Number(result.rows[0].dias_vencimiento_factura) || 15) : 15;
}

function formatearFactura(factura) {
    const {
        id, cliente_id, cliente_nombre, cliente_numero_predio, direccion_cliente, telefono_cliente,
        correo_cliente, lectura_id, consumo_m3, costo_por_m3, total, saldo_pendiente, estado,
        fecha_emision, fecha_vencimiento, modificado_por, modificado_por_nombre, fecha_creacion,
        tarifa_id, tarifa_nombre, periodo, mes_facturado, fecha_lectura, medidor_id,
        medidor_numero_serie, medidor_ubicacion, ruta_id, ruta_nombre, adeudo_anterior,
        consumo_mes_anterior, periodo_mes_anterior, fecha_lectura_mes_anterior
    } = factura;

    return {
        id: Number(id), cliente_id: Number(cliente_id), cliente_nombre, cliente_numero_predio,
        direccion_cliente, telefono_cliente, correo_cliente, lectura_id: Number(lectura_id),
        consumo_m3: Number(consumo_m3), costo_por_m3: costo_por_m3 ? Number(costo_por_m3) : 0,
        total: Number(total), saldo_pendiente: Number(saldo_pendiente), estado,
        fecha_emision, fecha_vencimiento, modificado_por: Number(modificado_por),
        modificado_por_nombre, fecha_creacion, tarifa_id: Number(tarifa_id), tarifa_nombre,
        periodo, mes_facturado, fecha_lectura,
        medidor: { id: medidor_id ? Number(medidor_id) : null, numero_serie: medidor_numero_serie, ubicacion: medidor_ubicacion },
        ruta: ruta_id ? { id: Number(ruta_id), nombre: ruta_nombre } : null,
        adeudo_anterior: adeudo_anterior ? Number(adeudo_anterior) : 0,
        consumo_mes_anterior: {
            consumo_m3: consumo_mes_anterior ? Number(consumo_mes_anterior) : null,
            periodo: periodo_mes_anterior || null,
            fecha_lectura: fecha_lectura_mes_anterior || null,
            diferencia_consumo: consumo_mes_anterior ? (Number(consumo_m3) - Number(consumo_mes_anterior)) : null
        }
    };
}

export async function generarFactura({ lectura_id, cliente_id, tarifa_id, consumo_m3, fecha_emision }, usuarioId) {
    const fechaEmision = fecha_emision || nowDate();

    if (await dbTurso.execute({ sql: `SELECT id FROM facturas WHERE lectura_id = ?`, args: [lectura_id] }).then(r => r.rows.length > 0))
        throw serviceError('Ya existe una factura para este cliente en ese periodo.', 409);

    if (!(await dbTurso.execute({ sql: `SELECT id FROM tarifas WHERE id = ?`, args: [tarifa_id] })).rows.length)
        throw serviceError('La tarifa no existe', 404);
    if (!(await dbTurso.execute({ sql: `SELECT id FROM clientes WHERE id = ?`, args: [cliente_id] })).rows.length)
        throw serviceError('El cliente no existe', 404);
    if (!(await dbTurso.execute({ sql: `SELECT id FROM lecturas WHERE id = ?`, args: [lectura_id] })).rows.length)
        throw serviceError('La lectura no existe', 404);

    const { total } = await calcularTarifaDesdeDB(consumo_m3, tarifa_id, dbTurso);
    const diasVencimiento = await getDiasVencimiento();
    const fecha_vencimiento = calcularVencimiento(diasVencimiento, fechaEmision);

    const insertResult = await dbTurso.execute({
        sql: `INSERT INTO facturas (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, estado, total, saldo_pendiente, modificado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [lectura_id, cliente_id, tarifa_id, fechaEmision, fecha_vencimiento, 'Pendiente', total, total, usuarioId]
    });
    const factura_id = Number(insertResult.lastInsertRowid);

    const facturaResult = await dbTurso.execute({
        sql: `SELECT f.*, c.nombre as cliente_nombre, c.correo as cliente_correo, t.nombre as tarifa_nombre, l.consumo_m3, l.periodo, m.numero_serie as medidor_numero
              FROM facturas f JOIN clientes c ON f.cliente_id = c.id JOIN tarifas t ON f.tarifa_id = t.id JOIN lecturas l ON f.lectura_id = l.id JOIN medidores m ON l.medidor_id = m.id WHERE f.id = ?`,
        args: [factura_id]
    });

    return { factura_id, total, facturaCompleta: facturaResult.rows[0] };
}

const BASE_QUERY = `
    WITH periodos_calculados AS (
        SELECT l.id as lectura_id, l.periodo,
            CASE WHEN l.periodo LIKE '____-__' THEN
                CASE WHEN SUBSTR(l.periodo,6,2)='01' THEN (CAST(SUBSTR(l.periodo,1,4) AS INTEGER)-1)||'-12'
                     ELSE SUBSTR(l.periodo,1,4)||'-'||PRINTF('%02d',CAST(SUBSTR(l.periodo,6,2) AS INTEGER)-1) END
            ELSE NULL END AS periodo_anterior
        FROM lecturas l
    ),
    consumos_anteriores AS (
        SELECT l.medidor_id, l.periodo, l.consumo_m3, l.fecha_lectura, pc.periodo_anterior
        FROM lecturas l JOIN periodos_calculados pc ON l.id = pc.lectura_id
    ),
    adeudos_anteriores AS (
        SELECT f.cliente_id, f.fecha_emision, f.id as factura_id, COALESCE(SUM(f2.saldo_pendiente),0) AS total_adeudo
        FROM facturas f LEFT JOIN facturas f2 ON f2.cliente_id=f.cliente_id AND f2.id!=f.id AND f2.fecha_emision<f.fecha_emision AND f2.saldo_pendiente>0
        GROUP BY f.cliente_id, f.fecha_emision, f.id
    )
    SELECT f.id, f.cliente_id, f.lectura_id, f.tarifa_id, f.fecha_emision, f.fecha_vencimiento, f.total, f.saldo_pendiente,
           f.estado, f.modificado_por, f.fecha_creacion,
           c.nombre AS cliente_nombre, c.numero_predio AS cliente_numero_predio, c.direccion AS direccion_cliente,
           c.telefono AS telefono_cliente, c.correo AS correo_cliente,
           t.nombre AS tarifa_nombre, u.username AS modificado_por_nombre,
           l.consumo_m3, l.periodo, l.fecha_lectura,
           CASE WHEN l.periodo LIKE '____-__' THEN
               CASE SUBSTR(l.periodo,6,2) WHEN '01' THEN 'Enero' WHEN '02' THEN 'Febrero' WHEN '03' THEN 'Marzo'
               WHEN '04' THEN 'Abril' WHEN '05' THEN 'Mayo' WHEN '06' THEN 'Junio' WHEN '07' THEN 'Julio'
               WHEN '08' THEN 'Agosto' WHEN '09' THEN 'Septiembre' WHEN '10' THEN 'Octubre'
               WHEN '11' THEN 'Noviembre' WHEN '12' THEN 'Diciembre' ELSE l.periodo END||' '||SUBSTR(l.periodo,1,4)
           ELSE l.periodo END AS mes_facturado,
           m.id AS medidor_id, m.numero_serie AS medidor_numero_serie, m.ubicacion AS medidor_ubicacion,
           r.id AS ruta_id, r.nombre AS ruta_nombre,
           rt.precio_por_m3 AS costo_por_m3, aa.total_adeudo AS adeudo_anterior,
           ca_anterior.consumo_m3 AS consumo_mes_anterior, pc.periodo_anterior AS periodo_mes_anterior,
           ca_anterior.fecha_lectura AS fecha_lectura_mes_anterior
    FROM facturas f
    JOIN clientes c ON f.cliente_id = c.id JOIN tarifas t ON f.tarifa_id = t.id
    JOIN usuarios u ON f.modificado_por = u.id JOIN lecturas l ON f.lectura_id = l.id
    JOIN medidores m ON l.medidor_id = m.id LEFT JOIN rutas r ON l.ruta_id = r.id
    LEFT JOIN periodos_calculados pc ON l.id = pc.lectura_id
    LEFT JOIN consumos_anteriores ca_anterior ON ca_anterior.medidor_id = m.id AND ca_anterior.periodo = pc.periodo_anterior
    LEFT JOIN adeudos_anteriores aa ON aa.factura_id = f.id
    LEFT JOIN rangos_tarifas rt ON rt.tarifa_id = f.tarifa_id AND CAST(l.consumo_m3 AS INTEGER) >= rt.consumo_min AND (rt.consumo_max IS NULL OR CAST(l.consumo_m3 AS INTEGER) <= rt.consumo_max)
`;

export async function obtenerFacturas({ id, periodo, page, limit, search, estado }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 60;
    const offset = (pageNum - 1) * limitNum;
    const searchTerm = search ? `%${search.toLowerCase()}%` : null;
    const normalizedSearch = search ? `%${search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}%` : null;

    const conditions = [];
    const queryParams = [];
    const countParams = [];

    if (id) {
        conditions.push('f.id = ?');
        queryParams.push(id);
    } else {
        if (periodo) { conditions.push('l.periodo = ?'); queryParams.push(periodo); countParams.push(periodo); }
        if (estado?.trim()) { conditions.push('f.estado = ?'); queryParams.push(estado); countParams.push(estado); }
        if (searchTerm) {
            conditions.push(`(unaccent(c.nombre) LIKE ? OR unaccent(c.direccion) LIKE ? OR unaccent(COALESCE(c.telefono,'')) LIKE ? OR unaccent(COALESCE(c.correo,'')) LIKE ? OR CAST(f.id AS TEXT) LIKE ? OR unaccent(m.numero_serie) LIKE ? OR unaccent(COALESCE(m.ubicacion,'')) LIKE ? OR CAST(COALESCE(c.numero_predio,'') AS TEXT) LIKE ?)`);
            queryParams.push(normalizedSearch, normalizedSearch, normalizedSearch, normalizedSearch, searchTerm, normalizedSearch, normalizedSearch, searchTerm);
            countParams.push(normalizedSearch, normalizedSearch, normalizedSearch, normalizedSearch, searchTerm, normalizedSearch, normalizedSearch, searchTerm);
        }
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    if (id) {
        const result = await dbTurso.execute({ sql: `${BASE_QUERY} ${where}`, args: queryParams });
        if (result.rows.length === 0) throw serviceError('Factura no encontrada', 404);
        return { tipo: 'unica', factura: formatearFactura(result.rows[0]) };
    }

    const countJoin = `FROM facturas f JOIN clientes c ON f.cliente_id=c.id JOIN lecturas l ON f.lectura_id=l.id LEFT JOIN medidores m ON l.medidor_id=m.id`;
    const [countResult, dataResult, statsResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total ${countJoin} ${where}`, args: countParams }),
        dbTurso.execute({ sql: `${BASE_QUERY} ${where} ORDER BY f.fecha_emision DESC LIMIT ? OFFSET ?`, args: [...queryParams, limitNum, offset] }),
        dbTurso.execute({
            sql: `SELECT SUM(f.total) as monto_total, SUM(f.saldo_pendiente) as total_pendiente,
                  COUNT(CASE WHEN f.estado='Pendiente' THEN 1 END) as cantidad_pendientes,
                  COUNT(CASE WHEN f.estado IN ('Pagada','Pagado') THEN 1 END) as cantidad_pagadas,
                  COUNT(CASE WHEN f.estado IN ('Vencida','Vencido') THEN 1 END) as cantidad_vencidas
                  ${countJoin} ${where}`,
            args: countParams
        })
    ]);

    const totalItems = Number(countResult.rows[0].total);
    const stats = statsResult.rows[0];

    return {
        tipo: 'lista',
        facturas: dataResult.rows.map(formatearFactura),
        pagination: { total: totalItems, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalItems / limitNum) },
        estadisticas: {
            monto_total: stats.monto_total || 0, total_pendiente: stats.total_pendiente || 0,
            cantidad_pendientes: stats.cantidad_pendientes || 0, cantidad_pagadas: stats.cantidad_pagadas || 0,
            cantidad_vencidas: stats.cantidad_vencidas || 0
        },
        filtros: periodo ? { periodo } : undefined
    };
}

export async function modificarFactura(id, { estado, total }, usuarioId) {
    const check = await dbTurso.execute({ sql: `SELECT * FROM facturas WHERE id = ?`, args: [id] });
    if (check.rows.length === 0) throw serviceError('Factura no encontrada', 404);
    await dbTurso.execute({ sql: `UPDATE facturas SET estado = ?, total = ?, modificado_por = ? WHERE id = ?`, args: [estado, total || 0, usuarioId, id] });
}
