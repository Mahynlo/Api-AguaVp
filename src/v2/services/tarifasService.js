import dbTurso from '../../database/db-sqlite.js';
import { nowDate } from '../../utils/timezone.js';

function serviceError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function mapRango(r) {
    return { id: Number(r.id), tarifa_id: Number(r.tarifa_id ?? 0), consumo_min: Number(r.consumo_min), consumo_max: r.consumo_max ? Number(r.consumo_max) : null, precio_por_m3: Number(r.precio_por_m3) };
}

function validarRangos(rangos) {
    for (const r of rangos) {
        if (r.consumo_min == null || r.precio_por_m3 == null || r.consumo_min < 0 || r.precio_por_m3 < 0 || (r.consumo_max != null && r.consumo_max < 0)) {
            return 'Los valores de consumo y precio no pueden ser negativos o nulos (error-BK)';
        }
        if (r.consumo_max != null && r.consumo_min >= r.consumo_max) {
            return `El consumo mínimo (${r.consumo_min}) debe ser menor que el consumo máximo (${r.consumo_max}) (error-BK)`;
        }
    }
    const ordenados = [...rangos].sort((a, b) => a.consumo_min - b.consumo_min);
    const claves = new Set();
    for (let i = 0; i < ordenados.length; i++) {
        const clave = `${ordenados[i].consumo_min}-${ordenados[i].consumo_max}`;
        if (claves.has(clave)) return `Ya existe un rango duplicado en la solicitud: [${clave}] (error-BK)`;
        claves.add(clave);
        for (let j = 0; j < ordenados.length; j++) {
            if (i !== j && ordenados[i].consumo_min === ordenados[j].consumo_max) {
                return `El consumo mínimo (${ordenados[i].consumo_min}) no puede ser igual al consumo máximo (${ordenados[j].consumo_max}) de otro rango (error-BK)`;
            }
        }
        const sig = ordenados[i + 1];
        if (sig && ordenados[i].consumo_max != null && ordenados[i].consumo_max + 1 < sig.consumo_min) {
            return `Hay un hueco entre los rangos [${ordenados[i].consumo_min}-${ordenados[i].consumo_max}] y [${sig.consumo_min}-${sig.consumo_max}] (error-BK)`;
        }
    }
    return null;
}

export async function registrarTarifa({ nombre, descripcion, fecha_inicio, fecha_fin }, usuarioId) {
    const result = await dbTurso.execute({
        sql: `INSERT INTO tarifas (nombre, descripcion, fecha_inicio, fecha_fin, modificado_por, fecha_creacion) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        args: [nombre, descripcion, fecha_inicio, fecha_fin || null, usuarioId]
    });
    const id = Number(result.lastInsertRowid);
    return { id, nombre, descripcion, fecha_inicio, fecha_fin: fecha_fin || null, modificado_por: usuarioId, fecha_creacion: new Date().toISOString() };
}

export async function registrarRangosTarifa(tarifa_id, rangos) {
    const error = validarRangos(rangos);
    if (error) throw serviceError(error, 400);

    const exists = await dbTurso.execute({ sql: `SELECT id FROM tarifas WHERE id = ?`, args: [tarifa_id] });
    if (!exists.rows.length) throw serviceError('Tarifa no encontrada', 404);

    for (const { consumo_min, consumo_max, precio_por_m3 } of rangos) {
        await dbTurso.execute({ sql: `INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, ?, ?, ?)`, args: [tarifa_id, consumo_min, consumo_max ?? null, precio_por_m3] });
    }
}

export async function obtenerTodasLasTarifas({ page, limit, search } = {}) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const args = [];
    if (search) { conditions.push(`(t.nombre LIKE ? OR t.descripcion LIKE ?)`); const t = `%${search}%`; args.push(t, t); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const [countResult, dataResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM tarifas t${where}`, args }),
        dbTurso.execute({ sql: `SELECT * FROM tarifas t${where} ORDER BY t.fecha_creacion DESC LIMIT ? OFFSET ?`, args: [...args, limitNum, offset] })
    ]);

    const totalItems = Number(countResult.rows[0].total);
    if (!dataResult.rows.length) return { tarifas: [], pagination: { total: totalItems, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalItems / limitNum) } };

    const ids = dataResult.rows.map(r => r.id);
    const rangosResult = await dbTurso.execute({ sql: `SELECT * FROM rangos_tarifas WHERE tarifa_id IN (${ids.map(() => '?').join(',')}) ORDER BY tarifa_id, consumo_min ASC`, args: ids });

    const rangosPor = {};
    rangosResult.rows.forEach(r => { const id = Number(r.tarifa_id); (rangosPor[id] = rangosPor[id] || []).push(mapRango(r)); });

    const hoy = nowDate();
    const tarifas = dataResult.rows.map(t => {
        const id = Number(t.id);
        return { id, nombre: t.nombre, descripcion: t.descripcion, fecha_inicio: t.fecha_inicio, fecha_fin: t.fecha_fin, modificado_por: Number(t.modificado_por), fecha_creacion: t.fecha_creacion, activa: hoy >= t.fecha_inicio && (!t.fecha_fin || hoy <= t.fecha_fin), rangos: rangosPor[id] || [] };
    });

    return { tarifas, pagination: { total: totalItems, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalItems / limitNum) } };
}

export async function obtenerHistorialTarifas() {
    const result = await dbTurso.execute({ sql: `SELECT * FROM historial_tarifas ORDER BY fecha_cambio DESC` });
    return result.rows.map(r => ({ id: Number(r.id), tarifa_id: r.tarifa_id ? Number(r.tarifa_id) : null, rango_id: r.rango_id ? Number(r.rango_id) : null, fecha_cambio: r.fecha_cambio, consumo_min: r.consumo_min ? Number(r.consumo_min) : null, consumo_max: r.consumo_max ? Number(r.consumo_max) : null, precio_anterior: r.precio_anterior ? Number(r.precio_anterior) : null, precio_nuevo: Number(r.precio_nuevo) }));
}

export async function modificarTarifa(id, { nombre, descripcion, fecha_inicio, fecha_fin }, usuarioId) {
    const check = await dbTurso.execute({ sql: `SELECT * FROM tarifas WHERE id = ?`, args: [id] });
    if (!check.rows.length) throw serviceError('Tarifa no encontrada', 404);
    await dbTurso.execute({ sql: `UPDATE tarifas SET nombre = ?, descripcion = ?, fecha_inicio = ?, fecha_fin = ?, modificado_por = ? WHERE id = ?`, args: [nombre, descripcion, fecha_inicio, fecha_fin || null, usuarioId, id] });
    return { nombre };
}

export async function modificarRangosTarifa(tarifa_id, rangos) {
    for (const r of rangos) {
        if (r.consumo_min < 0 || (r.consumo_max != null && r.consumo_max < 0) || r.precio_por_m3 < 0) throw serviceError('Los valores no pueden ser negativos (error-BK)', 400);
        if (r.consumo_max != null && r.consumo_min >= r.consumo_max) throw serviceError('El consumo mínimo debe ser menor que el máximo (error-BK)', 400);
    }
    for (let i = 0; i < rangos.length; i++) {
        for (let j = i + 1; j < rangos.length; j++) {
            const a = rangos[i], b = rangos[j];
            if (a.consumo_min === b.consumo_min && a.consumo_max === b.consumo_max) throw serviceError(`Rango duplicado [${a.consumo_min}-${a.consumo_max}] en el lote (error-BK)`, 400);
            if (a.consumo_min === b.consumo_max || a.consumo_max === b.consumo_min) throw serviceError(`No se permite que un mínimo sea igual al máximo de otro rango (error-BK)`, 400);
        }
    }

    const exists = await dbTurso.execute({ sql: `SELECT id FROM tarifas WHERE id = ?`, args: [tarifa_id] });
    if (!exists.rows.length) throw serviceError('Tarifa no encontrada', 404);

    for (const { id, consumo_min, consumo_max, precio_por_m3 } of rangos) {
        if (id != null) {
            await dbTurso.execute({ sql: `UPDATE rangos_tarifas SET consumo_min = ?, consumo_max = ?, precio_por_m3 = ? WHERE id = ? AND tarifa_id = ?`, args: [consumo_min, consumo_max ?? null, precio_por_m3, id, tarifa_id] });
        } else {
            await dbTurso.execute({ sql: `INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, ?, ?, ?)`, args: [tarifa_id, consumo_min, consumo_max ?? null, precio_por_m3] });
        }
    }
}

export async function obtenerTarifaPorId(id) {
    const [tarifaResult, rangosResult, clientesResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT id, nombre, descripcion, fecha_inicio, fecha_fin, modificado_por, fecha_creacion FROM tarifas WHERE id = ?`, args: [id] }),
        dbTurso.execute({ sql: `SELECT id, consumo_min, consumo_max, precio_por_m3 FROM rangos_tarifas WHERE tarifa_id = ? ORDER BY consumo_min ASC`, args: [id] }),
        dbTurso.execute({ sql: `SELECT id, nombre, ciudad, estado_cliente FROM clientes WHERE tarifa_id = ?`, args: [id] })
    ]);

    if (!tarifaResult.rows.length) throw serviceError('Tarifa no encontrada', 404);
    const t = tarifaResult.rows[0];
    const hoy = nowDate();

    return {
        tarifa: { id: Number(t.id), nombre: t.nombre, descripcion: t.descripcion, fecha_inicio: t.fecha_inicio, fecha_fin: t.fecha_fin, modificado_por: t.modificado_por ? Number(t.modificado_por) : null, fecha_creacion: t.fecha_creacion, esta_activa: t.fecha_inicio <= hoy && (!t.fecha_fin || t.fecha_fin >= hoy) },
        rangos: rangosResult.rows.map(r => ({ id: Number(r.id), consumo_min: Number(r.consumo_min), consumo_max: r.consumo_max ? Number(r.consumo_max) : null, precio_por_m3: Number(r.precio_por_m3) })),
        clientes: { total: clientesResult.rows.length, lista: clientesResult.rows.map(c => ({ id: Number(c.id), nombre: c.nombre, ciudad: c.ciudad, estado_cliente: c.estado_cliente })) }
    };
}

export async function obtenerTarifasActivas() {
    const result = await dbTurso.execute({ sql: `SELECT t.id, t.nombre, t.descripcion, t.fecha_inicio, t.fecha_fin, COUNT(c.id) as total_clientes FROM tarifas t LEFT JOIN clientes c ON t.id = c.tarifa_id WHERE t.fecha_inicio <= date('now') AND (t.fecha_fin IS NULL OR t.fecha_fin >= date('now')) GROUP BY t.id, t.nombre, t.descripcion, t.fecha_inicio, t.fecha_fin ORDER BY t.fecha_inicio DESC` });

    const tarifas = result.rows.map(r => ({ id: Number(r.id), nombre: r.nombre, descripcion: r.descripcion, fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin, total_clientes: Number(r.total_clientes) }));

    return await Promise.all(tarifas.map(async (tarifa) => {
        const rangosResult = await dbTurso.execute({ sql: `SELECT consumo_min, consumo_max, precio_por_m3 FROM rangos_tarifas WHERE tarifa_id = ? ORDER BY consumo_min ASC`, args: [tarifa.id] });
        return { ...tarifa, rangos: rangosResult.rows.map(r => ({ consumo_min: Number(r.consumo_min), consumo_max: r.consumo_max ? Number(r.consumo_max) : null, precio_por_m3: Number(r.precio_por_m3) })) };
    }));
}

export async function obtenerHistorialTarifa(id) {
    const tarifaResult = await dbTurso.execute({ sql: `SELECT id, nombre FROM tarifas WHERE id = ?`, args: [id] });
    if (!tarifaResult.rows.length) throw serviceError('Tarifa no encontrada', 404);

    const [historialResult, rangosResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT h.id, h.fecha_cambio, h.consumo_min, h.consumo_max, h.precio_anterior, h.precio_nuevo, r.id as rango_id FROM historial_tarifas h LEFT JOIN rangos_tarifas r ON h.rango_id = r.id WHERE h.tarifa_id = ? ORDER BY h.fecha_cambio DESC`, args: [id] }),
        dbTurso.execute({ sql: `SELECT id, consumo_min, consumo_max, precio_por_m3 FROM rangos_tarifas WHERE tarifa_id = ? ORDER BY consumo_min ASC`, args: [id] })
    ]);

    return {
        tarifa: { id: Number(tarifaResult.rows[0].id), nombre: tarifaResult.rows[0].nombre },
        rangos_actuales: rangosResult.rows.map(r => ({ id: Number(r.id), consumo_min: Number(r.consumo_min), consumo_max: r.consumo_max ? Number(r.consumo_max) : null, precio_por_m3: Number(r.precio_por_m3) })),
        historial: { total_cambios: historialResult.rows.length, cambios: historialResult.rows.map(r => ({ id: Number(r.id), fecha_cambio: r.fecha_cambio, rango: { id: r.rango_id ? Number(r.rango_id) : null, consumo_min: r.consumo_min ? Number(r.consumo_min) : null, consumo_max: r.consumo_max ? Number(r.consumo_max) : null }, precio_anterior: r.precio_anterior ? Number(r.precio_anterior) : null, precio_nuevo: Number(r.precio_nuevo), cambio_porcentual: r.precio_anterior ? (((Number(r.precio_nuevo) - Number(r.precio_anterior)) / Number(r.precio_anterior)) * 100).toFixed(2) + '%' : 'N/A' })) }
    };
}

export async function estadisticasTarifas() {
    const [totalR, estadoR, distribucionR, sinTarifaR, rangosR, promedioR, preciosR, cambiosR, masUsadaR] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM tarifas` }),
        dbTurso.execute({ sql: `SELECT COUNT(CASE WHEN fecha_inicio <= date('now') AND (fecha_fin IS NULL OR fecha_fin >= date('now')) THEN 1 END) as activas, COUNT(CASE WHEN fecha_inicio > date('now') OR (fecha_fin IS NOT NULL AND fecha_fin < date('now')) THEN 1 END) as inactivas FROM tarifas` }),
        dbTurso.execute({ sql: `SELECT t.id, t.nombre, COUNT(c.id) as total_clientes FROM tarifas t LEFT JOIN clientes c ON t.id = c.tarifa_id GROUP BY t.id, t.nombre ORDER BY total_clientes DESC` }),
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM clientes WHERE tarifa_id IS NULL` }),
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM rangos_tarifas` }),
        dbTurso.execute({ sql: `SELECT AVG(cantidad_rangos) as promedio FROM (SELECT tarifa_id, COUNT(*) as cantidad_rangos FROM rangos_tarifas GROUP BY tarifa_id)` }),
        dbTurso.execute({ sql: `SELECT MIN(precio_por_m3) as precio_minimo, MAX(precio_por_m3) as precio_maximo, AVG(precio_por_m3) as precio_promedio FROM rangos_tarifas` }),
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM historial_tarifas WHERE fecha_cambio >= date('now', '-30 days')` }),
        dbTurso.execute({ sql: `SELECT t.id, t.nombre, COUNT(c.id) as clientes FROM tarifas t INNER JOIN clientes c ON t.id = c.tarifa_id GROUP BY t.id, t.nombre ORDER BY clientes DESC LIMIT 1` })
    ]);

    const estados = estadoR.rows[0];
    const precios = preciosR.rows[0];
    return {
        resumen: { total_tarifas: Number(totalR.rows[0].total), tarifas_activas: Number(estados.activas), tarifas_inactivas: Number(estados.inactivas), clientes_sin_tarifa: Number(sinTarifaR.rows[0].total), total_rangos: Number(rangosR.rows[0].total), promedio_rangos_por_tarifa: parseFloat(Number(promedioR.rows[0].promedio || 0).toFixed(2)), cambios_ultimos_30_dias: Number(cambiosR.rows[0].total) },
        precios: { minimo: precios.precio_minimo ? Number(precios.precio_minimo) : 0, maximo: precios.precio_maximo ? Number(precios.precio_maximo) : 0, promedio: precios.precio_promedio ? Number(precios.precio_promedio).toFixed(2) : '0.00' },
        distribucion_clientes: distribucionR.rows.map(r => ({ tarifa_id: Number(r.id), tarifa_nombre: r.nombre, total_clientes: Number(r.total_clientes) })),
        tarifa_mas_usada: masUsadaR.rows.length > 0 ? { id: Number(masUsadaR.rows[0].id), nombre: masUsadaR.rows[0].nombre, clientes: Number(masUsadaR.rows[0].clientes) } : null,
        fecha_generacion: new Date().toISOString()
    };
}
