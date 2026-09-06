import dbTurso from '../../database/db-sqlite.js';
import { calcularTarifaDesdeDB } from '../../utils/tarifaUtils.js';
import { nowDate, calcularVencimiento } from '../../utils/timezone.js';

function serviceError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

const parseBooleanInput = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const n = value.trim().toLowerCase();
        return n === 'true' || n === '1' || n === 'si' || n === 'sí';
    }
    return false;
};

const mapLectura = (row) => ({
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

const BASE_LECTURAS = `SELECT l.id, l.medidor_id, l.ruta_id, l.consumo_m3, l.fecha_lectura, l.periodo, l.estado, l.modificado_por, l.fecha_creacion, u.username AS modificado_por_nombre, m.numero_serie AS medidor_numero, c.id AS cliente_id, c.nombre AS cliente_nombre, r.nombre AS ruta_nombre FROM lecturas l LEFT JOIN usuarios u ON l.modificado_por = u.id LEFT JOIN medidores m ON l.medidor_id = m.id LEFT JOIN clientes c ON m.cliente_id = c.id LEFT JOIN rutas r ON l.ruta_id = r.id`;

export async function registrarLectura({ medidor_id, ruta_id, lectura_actual, vuelta_cero = false, consumo_m3: consumo_m3_legacy, fecha_lectura, periodo }, usuarioId) {
    const medidorResult = await dbTurso.execute({ sql: `SELECT id, lectura_base, capacidad_maxima FROM medidores WHERE id = ?`, args: [medidor_id] });
    if (!medidorResult.rows.length) throw serviceError('Medidor no encontrado', 404);
    const medidor = medidorResult.rows[0];

    const rutaResult = await dbTurso.execute({ sql: `SELECT id FROM rutas WHERE id = ?`, args: [ruta_id] });
    if (!rutaResult.rows.length) throw serviceError('Ruta no encontrada', 404);

    const perteneceResult = await dbTurso.execute({ sql: `SELECT 1 FROM rutas_puntos WHERE ruta_id = ? AND medidor_id = ?`, args: [ruta_id, medidor_id] });
    if (!perteneceResult.rows.length) throw serviceError('El medidor no está asignado a esta ruta', 400);

    const dupeResult = await dbTurso.execute({ sql: `SELECT id FROM lecturas WHERE medidor_id = ? AND periodo = ?`, args: [medidor_id, periodo] });
    if (dupeResult.rows.length) throw serviceError('Ya existe una lectura registrada para este medidor y periodo', 409);

    const cierrePeriodoResult = await dbTurso.execute({
        sql: `SELECT COUNT(*) AS total_facturas FROM facturas f JOIN lecturas l ON l.id = f.lectura_id WHERE l.ruta_id = ? AND l.periodo = ?`,
        args: [ruta_id, periodo]
    });
    const totalFacturasPeriodo = Number(cierrePeriodoResult.rows?.[0]?.total_facturas || 0);
    if (totalFacturasPeriodo > 0) {
        const err = serviceError('El periodo ya está cerrado por facturación. No se pueden registrar nuevas lecturas en esta ruta/periodo.', 409);
        err.code = 'PERIODO_RUTA_CERRADO';
        err.ruta_id = Number(ruta_id);
        err.periodo = periodo;
        err.total_facturas_periodo = totalFacturasPeriodo;
        throw err;
    }

    let consumo_m3_final, lectura_anterior_val = null, lectura_actual_val = null, vuelta_cero_val = 0;

    if (lectura_actual !== undefined) {
        const lectActual = parseFloat(lectura_actual);
        if (isNaN(lectActual) || lectActual < 0) throw serviceError('lectura_actual debe ser un número >= 0', 400);

        const prevQuery = periodo
            ? `SELECT lectura_actual FROM lecturas WHERE medidor_id = ? AND (periodo < ? OR (periodo IS NULL AND fecha_lectura < ?)) AND lectura_actual IS NOT NULL ORDER BY periodo DESC, fecha_lectura DESC LIMIT 1`
            : `SELECT lectura_actual FROM lecturas WHERE medidor_id = ? AND lectura_actual IS NOT NULL ORDER BY fecha_lectura DESC LIMIT 1`;
        const prevArgs = periodo ? [medidor_id, periodo, `${periodo}-01`] : [medidor_id];
        const prevResult = await dbTurso.execute({ sql: prevQuery, args: prevArgs });
        let lectAnterior = null;
        if (prevResult.rows.length && prevResult.rows[0].lectura_actual !== null) {
            lectAnterior = parseFloat(prevResult.rows[0].lectura_actual);
        } else if (medidor.lectura_base !== null && medidor.lectura_base !== undefined) {
            lectAnterior = parseFloat(medidor.lectura_base);
        }

        lectura_actual_val = lectActual;
        lectura_anterior_val = lectAnterior;

        if (lectAnterior === null) {
            consumo_m3_final = 0;
        } else if (vuelta_cero) {
            if (lectActual >= lectAnterior) throw serviceError('vuelta_cero marcado pero lectura_actual es mayor o igual a lectura_anterior. Desmarca el flag o verifica los valores.', 400);
            const capMax = (medidor.capacidad_maxima !== null && medidor.capacidad_maxima !== undefined) ? parseFloat(medidor.capacidad_maxima) : 99999;
            consumo_m3_final = parseFloat(((capMax - lectAnterior) + lectActual).toFixed(4));
            vuelta_cero_val = 1;
        } else {
            if (lectActual < lectAnterior) {
                const err = serviceError(`La lectura actual (${lectActual}) no puede ser menor a la lectura anterior (${lectAnterior}). Si el medidor dio la vuelta a cero, marca el flag vuelta_cero.`, 422);
                err.lectura_anterior = lectAnterior;
                err.lectura_actual = lectActual;
                throw err;
            }
            consumo_m3_final = parseFloat((lectActual - lectAnterior).toFixed(4));
        }
    } else {
        consumo_m3_final = parseFloat(consumo_m3_legacy);
        if (isNaN(consumo_m3_final) || consumo_m3_final <= 0) throw serviceError('consumo_m3 debe ser mayor a cero', 400);
    }

    const insertResult = await dbTurso.execute({
        sql: `INSERT INTO lecturas (medidor_id, ruta_id, consumo_m3, lectura_anterior, lectura_actual, vuelta_cero, fecha_lectura, periodo, modificado_por, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [medidor_id, ruta_id, consumo_m3_final, lectura_anterior_val, lectura_actual_val, vuelta_cero_val, fecha_lectura, periodo || null, usuarioId, 'pendiente']
    });
    const lectura_id = Number(insertResult.lastInsertRowid);

    const lecturaCompletaResult = await dbTurso.execute({
        sql: `SELECT l.*, m.numero_serie as medidor_numero, m.ubicacion as medidor_ubicacion, c.nombre as cliente_nombre, c.tarifa_id as cliente_tarifa_id, m.cliente_id as cliente_id, r.nombre as ruta_nombre FROM lecturas l LEFT JOIN medidores m ON l.medidor_id = m.id LEFT JOIN clientes c ON m.cliente_id = c.id LEFT JOIN rutas r ON l.ruta_id = r.id WHERE l.id = ?`,
        args: [lectura_id]
    });
    const lecturaCompleta = lecturaCompletaResult.rows[0];

    return {
        lectura_id,
        consumo_m3_final,
        lectura_anterior_val,
        lectura_actual_val,
        vuelta_cero_val,
        lecturaCompleta
    };
}

export async function obtenerLecturas({ id } = {}) {
    if (id) {
        const r = await dbTurso.execute({ sql: `${BASE_LECTURAS} WHERE l.id = ?`, args: [id] });
        if (!r.rows.length) throw serviceError('Lectura no encontrada', 404);
        return { tipo: 'unico', lectura: mapLectura(r.rows[0]) };
    }
    const r = await dbTurso.execute(`${BASE_LECTURAS} ORDER BY l.fecha_lectura DESC`);
    return { tipo: 'lista', lecturas: r.rows.map(mapLectura) };
}

export async function modificarLectura(id, { medidor_id, lectura_actual, consumo_m3, fecha_lectura, periodo }, usuarioId) {
    const setClauses = [];
    const args = [];
    if (medidor_id !== undefined)    { setClauses.push('medidor_id = ?');    args.push(medidor_id); }
    if (lectura_actual !== undefined) { setClauses.push('lectura_actual = ?'); args.push(lectura_actual); }
    if (consumo_m3 != null)           { setClauses.push('consumo_m3 = ?');    args.push(consumo_m3); }
    if (fecha_lectura !== undefined)  { setClauses.push('fecha_lectura = ?'); args.push(fecha_lectura); }
    if (periodo !== undefined)        { setClauses.push('periodo = ?');       args.push(periodo); }
    setClauses.push('estado = ?');       args.push('pendiente');
    setClauses.push('modificado_por = ?'); args.push(usuarioId);
    args.push(id);

    const result = await dbTurso.execute({ sql: `UPDATE lecturas SET ${setClauses.join(', ')} WHERE id = ?`, args });
    if (result.rowsAffected === 0) throw serviceError('Lectura no encontrada', 404);

    const r = await dbTurso.execute({
        sql: `SELECT l.*, m.numero_serie as medidor_numero, c.nombre as cliente_nombre FROM lecturas l LEFT JOIN medidores m ON l.medidor_id = m.id LEFT JOIN clientes c ON m.cliente_id = c.id WHERE l.id = ?`,
        args: [id]
    });
    return r.rows[0] || null;
}

export async function obtenerLecturasPorRutaYPeriodo({ ruta_id, periodo }) {
    const result = await dbTurso.execute({
        sql: `SELECT l.id, l.fecha_lectura, l.consumo_m3, l.periodo, m.numero_serie, c.nombre AS cliente FROM lecturas l INNER JOIN medidores m ON l.medidor_id = m.id INNER JOIN clientes c ON m.cliente_id = c.id WHERE l.ruta_id = ? AND l.periodo = ? ORDER BY l.fecha_lectura ASC`,
        args: [ruta_id, periodo]
    });
    return { lecturas: result.rows.map(r => ({ id: Number(r.id), fecha_lectura: r.fecha_lectura, consumo_m3: Number(r.consumo_m3), periodo: r.periodo, numero_serie: r.numero_serie, cliente: r.cliente })) };
}

async function _generarFacturaUnica({ lectura_id, cliente_id, tarifa_id, consumo_m3, fecha_emision, modificado_por }) {
    if (!fecha_emision) fecha_emision = nowDate();

    const facturaExistente = await dbTurso.execute({ sql: `SELECT id FROM facturas WHERE lectura_id = ?`, args: [lectura_id] });
    if (facturaExistente.rows.length) return { success: false, error: 'Ya existe una factura para esta lectura' };

    let total;
    try {
        const resultado = await calcularTarifaDesdeDB(consumo_m3, tarifa_id, dbTurso);
        total = resultado.total;
    } catch (e) {
        return { success: false, error: e.message };
    }

    const configResult = await dbTurso.execute({ sql: `SELECT dias_vencimiento_factura FROM configuracion_servicio WHERE activo = 1 ORDER BY id DESC LIMIT 1`, args: [] });
    const diasVencimiento = configResult.rows.length ? (Number(configResult.rows[0].dias_vencimiento_factura) || 15) : 15;
    const fecha_vencimiento_str = calcularVencimiento(diasVencimiento, fecha_emision);

    const insertResult = await dbTurso.execute({
        sql: `INSERT INTO facturas (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, estado, total, saldo_pendiente, modificado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento_str, 'Pendiente', total, total, modificado_por]
    });
    const factura_id = Number(insertResult.lastInsertRowid);

    const facturaCompletaResult = await dbTurso.execute({
        sql: `SELECT f.*, c.nombre as cliente_nombre, c.correo as cliente_correo, t.nombre as tarifa_nombre, l.consumo_m3, l.periodo, m.numero_serie as medidor_numero FROM facturas f JOIN clientes c ON f.cliente_id = c.id JOIN tarifas t ON f.tarifa_id = t.id JOIN lecturas l ON f.lectura_id = l.id JOIN medidores m ON l.medidor_id = m.id WHERE f.id = ?`,
        args: [factura_id]
    });

    return { success: true, factura_id, total, detalles: facturaCompletaResult.rows[0] || null };
}

export async function generarFacturasParaLecturasSinFactura({ periodo, ruta_id, recalcular: recalcularRaw, motivoRecalculo: motivoRaw, fecha_emision: fechaRaw }, usuarioId) {
    const recalcular = parseBooleanInput(recalcularRaw);
    const motivoRecalculo = typeof motivoRaw === 'string' ? motivoRaw.trim() : '';
    const fecha_emision = fechaRaw || nowDate();

    const condiciones = ['l.periodo = ?', 'c.tarifa_id IS NOT NULL', 'm.cliente_id IS NOT NULL'];
    if (!recalcular) {
        condiciones.push('f.id IS NULL');
        condiciones.push("l.estado = 'pendiente'");
    } else {
        condiciones.push("l.estado IN ('pendiente', 'facturada')");
    }
    const queryArgs = [periodo];
    if (ruta_id) { condiciones.push('l.ruta_id = ?'); queryArgs.push(ruta_id); }

    const result = await dbTurso.execute({
        sql: `SELECT l.id as lectura_id, l.consumo_m3, l.fecha_lectura, l.periodo, m.cliente_id, c.tarifa_id, c.nombre as cliente_nombre, m.numero_serie as medidor_numero, f.id as factura_existente_id, f.total as factura_existente_total, f.saldo_pendiente as factura_existente_saldo, f.estado as factura_existente_estado FROM lecturas l LEFT JOIN medidores m ON l.medidor_id = m.id LEFT JOIN clientes c ON m.cliente_id = c.id LEFT JOIN facturas f ON l.id = f.lectura_id WHERE ${condiciones.join(' AND ')}`,
        args: queryArgs
    });
    const lecturasSinFactura = result.rows || [];

    if (!lecturasSinFactura.length) {
        return { empty: true, periodo, ruta_id: ruta_id || null };
    }

    const resultados = { periodo, fecha_emision, recalculo_activado: recalcular, motivo_recalculo: recalcular ? (motivoRecalculo || null) : null, total_lecturas: lecturasSinFactura.length, facturas_generadas: 0, facturas_recalculadas: 0, facturas_fallidas: 0, detalles: [] };

    for (const lectura of lecturasSinFactura) {
        try {
            const facturaExistenteId = lectura.factura_existente_id ? Number(lectura.factura_existente_id) : null;

            if (recalcular && facturaExistenteId) {
                const pagosResult = await dbTurso.execute({ sql: 'SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pagos WHERE factura_id = ?', args: [facturaExistenteId] });
                const totalPagado = Number(pagosResult.rows[0]?.total_pagado || 0);

                if (totalPagado > 0) {
                    resultados.facturas_fallidas++;
                    resultados.detalles.push({ lectura_id: Number(lectura.lectura_id), factura_id: facturaExistenteId, cliente_nombre: lectura.cliente_nombre, medidor_numero: lectura.medidor_numero, error: `No se puede recalcular: la factura ya tiene pagos registrados (${totalPagado}).`, estado: 'fallida' });
                    continue;
                }

                const nuevoTotalResult = await calcularTarifaDesdeDB(Number(lectura.consumo_m3), lectura.tarifa_id, dbTurso);
                const nuevoTotal = Number(nuevoTotalResult.total);
                const totalAnterior = Number(lectura.factura_existente_total || 0);
                const saldoAnterior = Number(lectura.factura_existente_saldo || 0);
                const estadoAnterior = lectura.factura_existente_estado || 'Pendiente';

                await dbTurso.execute({ sql: `UPDATE facturas SET tarifa_id = ?, total = ?, saldo_pendiente = ?, estado = ?, modificado_por = ? WHERE id = ?`, args: [Number(lectura.tarifa_id), nuevoTotal, nuevoTotal, 'Pendiente', usuarioId, facturaExistenteId] });
                await dbTurso.execute({ sql: `INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios) VALUES (?, ?, ?, ?, ?)`, args: ['facturas', 'RECALCULO', facturaExistenteId, usuarioId, JSON.stringify({ accion: 'recalculo_factura_desde_lectura', lectura_id: Number(lectura.lectura_id), factura_id: facturaExistenteId, periodo, motivo_recalculo: motivoRecalculo || null, consumo_m3: Number(lectura.consumo_m3), antes: { total: totalAnterior, saldo_pendiente: saldoAnterior, estado: estadoAnterior }, despues: { total: nuevoTotal, saldo_pendiente: nuevoTotal, estado: 'Pendiente' } })] });
                await dbTurso.execute({ sql: 'UPDATE lecturas SET estado = ? WHERE id = ?', args: ['facturada', Number(lectura.lectura_id)] });

                resultados.facturas_recalculadas++;
                resultados.detalles.push({ lectura_id: Number(lectura.lectura_id), factura_id: facturaExistenteId, cliente_nombre: lectura.cliente_nombre, medidor_numero: lectura.medidor_numero, consumo_m3: Number(lectura.consumo_m3), total_anterior: totalAnterior, total_nuevo: nuevoTotal, estado: 'recalculada' });
                continue;
            }

            const facturaResult = await _generarFacturaUnica({ lectura_id: lectura.lectura_id, cliente_id: lectura.cliente_id, tarifa_id: lectura.tarifa_id, consumo_m3: Number(lectura.consumo_m3), fecha_emision, modificado_por: usuarioId });

            if (facturaResult.success) {
                resultados.facturas_generadas++;
                resultados.detalles.push({ lectura_id: Number(lectura.lectura_id), cliente_nombre: lectura.cliente_nombre, medidor_numero: lectura.medidor_numero, consumo_m3: Number(lectura.consumo_m3), factura_id: facturaResult.factura_id, total: facturaResult.total, estado: 'generada' });
                await dbTurso.execute({ sql: 'UPDATE lecturas SET estado = ? WHERE id = ?', args: ['facturada', Number(lectura.lectura_id)] });
            } else {
                resultados.facturas_fallidas++;
                resultados.detalles.push({ lectura_id: Number(lectura.lectura_id), cliente_nombre: lectura.cliente_nombre, medidor_numero: lectura.medidor_numero, consumo_m3: Number(lectura.consumo_m3), error: facturaResult.error, estado: 'fallida' });
            }
        } catch (error) {
            console.error(`Error procesando lectura ${lectura.lectura_id}:`, error);
            resultados.facturas_fallidas++;
            resultados.detalles.push({ lectura_id: Number(lectura.lectura_id), cliente_nombre: lectura.cliente_nombre, error: 'Error interno al procesar', estado: 'fallida' });
        }
    }

    return resultados;
}

export async function obtenerLecturasPorMedidor(medidor_id, limit = 100) {
    const medidorResult = await dbTurso.execute({
        sql: `SELECT m.id, m.numero_serie, m.cliente_id, c.nombre as cliente_nombre FROM medidores m LEFT JOIN clientes c ON m.cliente_id = c.id WHERE m.id = ?`,
        args: [medidor_id]
    });
    if (!medidorResult.rows.length) throw serviceError('Medidor no encontrado', 404);
    const medidor = medidorResult.rows[0];

    const lecturasResult = await dbTurso.execute({
        sql: `SELECT l.id, l.consumo_m3, l.periodo, l.fecha_lectura, f.id as factura_id, f.total as monto_total, f.estado as factura_estado FROM lecturas l LEFT JOIN facturas f ON l.id = f.lectura_id WHERE l.medidor_id = ? ORDER BY l.fecha_lectura DESC LIMIT ?`,
        args: [medidor_id, parseInt(limit)]
    });
    const lecturas = lecturasResult.rows.map(r => ({ id: Number(r.id), consumo_m3: Number(r.consumo_m3), periodo: r.periodo, fecha_lectura: r.fecha_lectura, factura: r.factura_id ? { id: Number(r.factura_id), monto_total: Number(r.monto_total), estado: r.factura_estado } : null }));

    const consumos = lecturas.map(l => l.consumo_m3);
    const promedio_consumo = consumos.length > 0 ? (consumos.reduce((a, b) => a + b, 0) / consumos.length).toFixed(2) : 0;
    const consumo_minimo = consumos.length > 0 ? Math.min(...consumos) : 0;
    const consumo_maximo = consumos.length > 0 ? Math.max(...consumos) : 0;
    const anomalias = lecturas.filter(l => { const p = parseFloat(promedio_consumo); return l.consumo_m3 > p * 2 || l.consumo_m3 < p * 0.5; });

    return {
        medidor: { id: Number(medidor.id), numero_serie: medidor.numero_serie, cliente_id: medidor.cliente_id ? Number(medidor.cliente_id) : null, cliente_nombre: medidor.cliente_nombre },
        estadisticas: { total_lecturas: lecturas.length, promedio_consumo: parseFloat(promedio_consumo), consumo_minimo, consumo_maximo, anomalias_detectadas: anomalias.length },
        lecturas_con_anomalia: anomalias.map(l => ({ id: l.id, periodo: l.periodo, consumo: l.consumo_m3, promedio: parseFloat(promedio_consumo), desviacion: ((l.consumo_m3 / parseFloat(promedio_consumo) - 1) * 100).toFixed(2) + '%' })),
        grafica_consumo: lecturas.slice(0, 12).reverse().map(l => ({ periodo: l.periodo, consumo: l.consumo_m3 })),
        historial: lecturas
    };
}

export async function obtenerLecturasPorCliente(cliente_id, periodo) {
    const clienteResult = await dbTurso.execute({ sql: `SELECT id, nombre FROM clientes WHERE id = ?`, args: [cliente_id] });
    if (!clienteResult.rows.length) throw serviceError('Cliente no encontrado', 404);
    const cliente = clienteResult.rows[0];

    const medidoresResult = await dbTurso.execute({ sql: `SELECT id, numero_serie, ubicacion FROM medidores WHERE cliente_id = ?`, args: [cliente_id] });
    if (!medidoresResult.rows.length) throw Object.assign(serviceError('Cliente no tiene medidores asignados', 404), { cliente: { id: Number(cliente.id), nombre: cliente.nombre } });

    const medidores = medidoresResult.rows.map(m => Number(m.id));
    const placeholders = medidores.map(() => '?').join(',');
    const args = [...medidores];
    let sql = `SELECT l.id, l.medidor_id, m.numero_serie, m.ubicacion, l.consumo_m3, l.periodo, l.fecha_lectura, f.id as factura_id, f.total as monto_total, f.estado as factura_estado FROM lecturas l INNER JOIN medidores m ON l.medidor_id = m.id LEFT JOIN facturas f ON l.id = f.lectura_id WHERE l.medidor_id IN (${placeholders})`;
    if (periodo) { sql += ` AND l.periodo = ?`; args.push(periodo); }
    sql += ` ORDER BY l.fecha_lectura DESC`;

    const lecturasResult = await dbTurso.execute({ sql, args });
    const lecturas = lecturasResult.rows.map(r => ({ id: Number(r.id), medidor: { id: Number(r.medidor_id), numero_serie: r.numero_serie, ubicacion: r.ubicacion }, consumo_m3: Number(r.consumo_m3), periodo: r.periodo, fecha_lectura: r.fecha_lectura, factura: r.factura_id ? { id: Number(r.factura_id), monto_total: Number(r.monto_total), estado: r.factura_estado } : null }));

    const consumoPorPeriodo = lecturas.reduce((acc, l) => {
        if (!acc[l.periodo]) acc[l.periodo] = { periodo: l.periodo, consumo_total: 0, cantidad_lecturas: 0, monto_total: 0 };
        acc[l.periodo].consumo_total += l.consumo_m3;
        acc[l.periodo].cantidad_lecturas += 1;
        if (l.factura) acc[l.periodo].monto_total += l.factura.monto_total;
        return acc;
    }, {});

    const consumoTotal = lecturas.reduce((s, l) => s + l.consumo_m3, 0);
    const montoTotalFacturado = lecturas.filter(l => l.factura).reduce((s, l) => s + l.factura.monto_total, 0);

    return {
        cliente: { id: Number(cliente.id), nombre: cliente.nombre, total_medidores: medidoresResult.rows.length },
        resumen: { total_lecturas: lecturas.length, consumo_total: consumoTotal.toFixed(2), promedio_por_lectura: lecturas.length > 0 ? (consumoTotal / lecturas.length).toFixed(2) : 0, monto_total_facturado: montoTotalFacturado.toFixed(2) },
        consumo_por_periodo: Object.values(consumoPorPeriodo).sort((a, b) => b.periodo.localeCompare(a.periodo)),
        lecturas
    };
}

export async function estadisticasLecturas() {
    const [totalR, porPeriodoR, facturacionR, consumoR, topR, mesActualR, sinLecturaR, rangosR] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM lecturas` }),
        dbTurso.execute({ sql: `SELECT periodo, COUNT(*) as cantidad_lecturas, SUM(consumo_m3) as consumo_total, AVG(consumo_m3) as consumo_promedio FROM lecturas GROUP BY periodo ORDER BY periodo DESC LIMIT 12` }),
        dbTurso.execute({ sql: `SELECT COUNT(*) as total_lecturas, SUM(CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END) as con_factura, SUM(CASE WHEN f.id IS NULL THEN 1 ELSE 0 END) as sin_factura FROM lecturas l LEFT JOIN facturas f ON l.id = f.lectura_id` }),
        dbTurso.execute({ sql: `SELECT SUM(consumo_m3) as consumo_total, AVG(consumo_m3) as consumo_promedio, MIN(consumo_m3) as consumo_minimo, MAX(consumo_m3) as consumo_maximo FROM lecturas` }),
        dbTurso.execute({ sql: `SELECT l.id, l.consumo_m3, l.periodo, m.numero_serie, c.nombre as cliente_nombre FROM lecturas l INNER JOIN medidores m ON l.medidor_id = m.id LEFT JOIN clientes c ON m.cliente_id = c.id ORDER BY l.consumo_m3 DESC LIMIT 10` }),
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM lecturas WHERE periodo = strftime('%Y-%m', 'now')` }),
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM medidores m WHERE m.estado_medidor = 'Activo' AND NOT EXISTS (SELECT 1 FROM lecturas l WHERE l.medidor_id = m.id AND l.periodo = strftime('%Y-%m', 'now'))` }),
        dbTurso.execute({ sql: `SELECT CASE WHEN consumo_m3 < 10 THEN '0-10 m³' WHEN consumo_m3 < 20 THEN '10-20 m³' WHEN consumo_m3 < 30 THEN '20-30 m³' WHEN consumo_m3 < 50 THEN '30-50 m³' ELSE '50+ m³' END as rango, COUNT(*) as cantidad FROM lecturas GROUP BY rango ORDER BY rango` })
    ]);

    const totalLecturas = Number(totalR.rows[0].total);
    const facturacion = facturacionR.rows[0];
    const consumo = consumoR.rows[0];

    return {
        resumen: { total_lecturas: totalLecturas, lecturas_mes_actual: Number(mesActualR.rows[0].total), medidores_sin_lectura_mes: Number(sinLecturaR.rows[0].total), lecturas_con_factura: Number(facturacion.con_factura), lecturas_sin_factura: Number(facturacion.sin_factura), porcentaje_facturacion: totalLecturas > 0 ? ((Number(facturacion.con_factura) / totalLecturas) * 100).toFixed(2) : 0 },
        consumo: { total: Number(consumo.consumo_total).toFixed(2), promedio: Number(consumo.consumo_promedio).toFixed(2), minimo: Number(consumo.consumo_minimo).toFixed(2), maximo: Number(consumo.consumo_maximo).toFixed(2) },
        distribucion_consumo: rangosR.rows.map(r => ({ rango: r.rango, cantidad: Number(r.cantidad) })),
        tendencias: { por_periodo: porPeriodoR.rows.map(r => ({ periodo: r.periodo, cantidad_lecturas: Number(r.cantidad_lecturas), consumo_total: Number(r.consumo_total).toFixed(2), consumo_promedio: Number(r.consumo_promedio).toFixed(2) })) },
        top_consumos: topR.rows.map(r => ({ lectura_id: Number(r.id), consumo_m3: Number(r.consumo_m3), periodo: r.periodo, numero_serie: r.numero_serie, cliente_nombre: r.cliente_nombre || 'Sin asignar' })),
        fecha_generacion: new Date().toISOString()
    };
}

export async function validarCobranzaPeriodoAnterior(ruta_id, periodo) {
    if (!periodo) throw serviceError('Periodo requerido', 400);

    // Buscar cuál fue realmente el último periodo facturado para esta ruta antes del periodo actual
    const resultUltimoPeriodo = await dbTurso.execute({
        sql: `SELECT MAX(l.periodo) as last_period FROM facturas f JOIN lecturas l ON f.lectura_id = l.id WHERE l.ruta_id = ? AND l.periodo < ?`,
        args: [ruta_id, periodo]
    });
    
    const periodoAnterior = resultUltimoPeriodo.rows[0].last_period;
    
    // Si no hay periodo anterior (es la primera vez que se usa el sistema o la ruta), no hay alerta
    if (!periodoAnterior) {
        return {
            periodoAnterior: null,
            totalPendientes: 0,
            totalFacturas: 0,
            porcentajePendiente: 0,
            alerta: false
        };
    }

    const resultPendientes = await dbTurso.execute({
        sql: `SELECT COUNT(*) as total_pendientes FROM facturas f JOIN lecturas l ON f.lectura_id = l.id WHERE l.ruta_id = ? AND l.periodo = ? AND f.estado != 'Pagado' AND f.estado != 'Cancelado'`,
        args: [ruta_id, periodoAnterior]
    });
    const resultTotal = await dbTurso.execute({
        sql: `SELECT COUNT(*) as total_facturas FROM facturas f JOIN lecturas l ON f.lectura_id = l.id WHERE l.ruta_id = ? AND l.periodo = ?`,
        args: [ruta_id, periodoAnterior]
    });

    const totalPendientes = Number(resultPendientes.rows[0].total_pendientes);
    const totalFacturas = Number(resultTotal.rows[0].total_facturas);
    const porcentajePendiente = totalFacturas > 0 ? (totalPendientes / totalFacturas) * 100 : 0;

    return {
        periodoAnterior,
        totalPendientes,
        totalFacturas,
        porcentajePendiente,
        alerta: porcentajePendiente > 30 // Alerta si > 30% no ha pagado
    };
}

function sumarMesStr(periodo, n = 1) {
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return periodo;
    const [anioStr, mesStr] = periodo.split('-');
    let anio = parseInt(anioStr, 10);
    let mes = parseInt(mesStr, 10) + n;
    while (mes > 12) {
        mes -= 12;
        anio += 1;
    }
    while (mes < 1) {
        mes += 12;
        anio -= 1;
    }
    return `${anio}-${String(mes).padStart(2, '0')}`;
}

export async function obtenerEstadoPeriodosLecturas() {
    const hoy = nowDate ? nowDate() : new Date().toISOString().slice(0, 10);

    let totalMedidores = 0;
    try {
        const rowMed = await dbTurso.execute({ 
            sql: `SELECT COUNT(*) as cnt FROM medidores WHERE estado_medidor = 'Activo' AND fecha_eliminacion IS NULL` 
        });
        totalMedidores = Number(rowMed.rows?.[0]?.cnt || 0);
    } catch {
        try {
            const rowMed = await dbTurso.execute({ sql: `SELECT COUNT(*) as cnt FROM medidores WHERE fecha_eliminacion IS NULL` });
            totalMedidores = Number(rowMed.rows?.[0]?.cnt || 0);
        } catch {
            totalMedidores = 0;
        }
    }

    // 1. Resumen de lecturas por período
    let lecturasRows = [];
    try {
        const res = await dbTurso.execute({
            sql: `
                SELECT 
                    periodo,
                    COUNT(DISTINCT medidor_id) as total_lecturas,
                    MAX(fecha_lectura) as ultima_fecha
                FROM lecturas
                WHERE periodo IS NOT NULL AND periodo != ''
                GROUP BY periodo
                ORDER BY periodo ASC
            `
        });
        lecturasRows = res.rows || [];
    } catch (e) {
        console.warn("Consulta a tabla lecturas omitida:", e.message);
    }

    // 2. Resumen de facturas por período (uniendo con lecturas para obtener el periodo)
    let facturasRows = [];
    try {
        const res = await dbTurso.execute({
            sql: `
                SELECT 
                    l.periodo,
                    COUNT(f.id) as total_facturas,
                    SUM(CASE WHEN LOWER(f.estado) = 'pagado' THEN 1 ELSE 0 END) as facturas_pagadas,
                    SUM(CASE WHEN LOWER(f.estado) != 'pagado' THEN 1 ELSE 0 END) as facturas_pendientes,
                    MIN(f.fecha_vencimiento) as min_vencimiento,
                    MAX(f.fecha_vencimiento) as max_vencimiento,
                    MAX(f.fecha_emision) as ultima_emision
                FROM facturas f
                JOIN lecturas l ON f.lectura_id = l.id
                WHERE l.periodo IS NOT NULL AND l.periodo != ''
                GROUP BY l.periodo
                ORDER BY l.periodo ASC
            `
        });
        facturasRows = res.rows || [];
    } catch (e) {
        console.warn("Consulta a tabla facturas omitida:", e.message);
    }

    const periodosInfo = {};
    const todosPeriodos = new Set();

    for (const r of lecturasRows) {
        if (r.periodo) todosPeriodos.add(r.periodo);
    }
    for (const f of facturasRows) {
        if (f.periodo) todosPeriodos.add(f.periodo);
    }

    const lecturasMap = new Map(lecturasRows.map(r => [r.periodo, r]));
    const facturasMap = new Map(facturasRows.map(f => [f.periodo, f]));

    const periodosOrdenados = Array.from(todosPeriodos).sort();

    let ultimoPeriodoRegistrado = null;
    let ultimoPeriodoFacturado = null;
    let ultimoPeriodoCompleto = null;

    for (const p of periodosOrdenados) {
        const lRow = lecturasMap.get(p);
        const fRow = facturasMap.get(p);

        const totalLecturas = Number(lRow?.total_lecturas || 0);
        const totalFacturas = Number(fRow?.total_facturas || 0);
        const facturasPagadas = Number(fRow?.facturas_pagadas || 0);
        const facturasPendientes = Number(fRow?.facturas_pendientes || 0);
        const fechaVencimiento = fRow?.max_vencimiento || null;
        const fechaEmision = fRow?.ultima_emision || null;

        const tieneLecturas = totalLecturas > 0;
        const tieneFacturas = totalFacturas > 0;

        const completado = tieneFacturas || (tieneLecturas && (totalMedidores > 0 ? totalLecturas >= totalMedidores : true));
        const registrado = tieneLecturas || tieneFacturas;

        let vencida = false;
        let diasParaVencer = null;
        if (fechaVencimiento) {
            const diffTime = new Date(fechaVencimiento).getTime() - new Date(hoy).getTime();
            diasParaVencer = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            vencida = diasParaVencer < 0;
        }

        periodosInfo[p] = {
            periodo: p,
            totalLecturas,
            totalFacturas,
            facturasPagadas,
            facturasPendientes,
            fechaVencimiento,
            fechaEmision,
            vencida,
            diasParaVencer,
            completado,
            registrado,
            tieneFacturas,
            tieneLecturas,
            estado: tieneFacturas 
                ? (vencida ? 'facturado_vencido' : 'facturado_vigente')
                : (completado ? 'completado' : 'parcial'),
            ultimaFecha: lRow?.ultima_fecha || fechaEmision
        };

        if (registrado) {
            ultimoPeriodoRegistrado = p;
        }
        if (tieneFacturas) {
            ultimoPeriodoFacturado = p;
        }
        if (completado || tieneFacturas) {
            ultimoPeriodoCompleto = p;
        }
    }

    const ahora = new Date();
    const periodoActualMes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    
    // Determinar siguiente período a capturar:
    // 1. Si no hay períodos registrados, empezar en el mes actual.
    // 2. Si el último período registrado está incompleto ('parcial'), ese es el período que aún se debe capturar.
    // 3. Si el último período registrado ya está completado o facturado, avanzar al mes siguiente.
    let siguientePeriodo;
    if (!ultimoPeriodoRegistrado) {
        siguientePeriodo = periodoActualMes;
    } else {
        const infoUltimo = periodosInfo[ultimoPeriodoRegistrado];
        if (infoUltimo && (infoUltimo.completado || infoUltimo.tieneFacturas)) {
            siguientePeriodo = sumarMesStr(ultimoPeriodoRegistrado, 1);
        } else {
            siguientePeriodo = ultimoPeriodoRegistrado;
        }
    }

    return {
        success: true,
        periodos: periodosInfo,
        ultimoPeriodoRegistrado,
        ultimoPeriodoFacturado,
        ultimoPeriodoCompleto,
        siguientePeriodo
    };
}
