import dbTurso, { sqlite } from '../../database/db-sqlite.js';

// === Utilidades de precisión decimal ===
const redondear = (n) => Math.round(n * 100) / 100;
export const toDecimal = (v) => redondear(parseFloat(v) || 0);
const resta = (a, b) => redondear(a - b);
const suma = (a, b) => redondear(a + b);

export function formatearMesPeriodo(periodo) {
    if (!periodo?.match(/^\d{4}-\d{2}$/)) return periodo;
    const meses = { '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre' };
    const [año, mes] = periodo.split('-');
    return `${meses[mes]} ${año}`;
}

export function registrarPago({ factura_id, fecha_pago, cantidad_entregada, metodo_pago, comentario }, usuarioId) {
    const ejecutarPago = sqlite.transaction(() => {
        const factura = sqlite.prepare(`SELECT id, saldo_pendiente, estado, convenio_id FROM facturas WHERE id = ?`).get(factura_id);
        if (!factura) throw { statusCode: 404, error: 'Factura no encontrada' };
        if (factura.convenio_id !== null) throw { statusCode: 403, error: 'Esta factura está incluida en un convenio de pago activo.', mensaje: 'Debe pagar las parcialidades del convenio en lugar de la factura directamente.', convenio_id: factura.convenio_id, tipo_error: 'FACTURA_EN_CONVENIO' };

        const saldo = toDecimal(factura.saldo_pendiente);
        if (saldo <= 0) throw { statusCode: 400, error: 'La factura ya está completamente pagada' };

        const monto = toDecimal(Math.min(saldo, cantidad_entregada));
        const cambio = resta(cantidad_entregada, monto);

        if (monto > saldo + 0.01) throw { statusCode: 400, error: 'El monto del pago excede el saldo pendiente', detalles: { saldo_pendiente: saldo, monto_solicitado: monto, cantidad_entregada } };

        const insertResult = sqlite.prepare(`INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, comentario, modificado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, comentario || null, usuarioId);

        return { pagoId: Number(insertResult.lastInsertRowid), monto, cambio };
    });
    return ejecutarPago();
}

export async function getPagoCompleto(pagoId) {
    const result = await dbTurso.execute({
        sql: `SELECT p.*, f.id as factura_numero, c.nombre as cliente_nombre FROM pagos p JOIN facturas f ON p.factura_id = f.id JOIN clientes c ON f.cliente_id = c.id WHERE p.id = ?`,
        args: [pagoId]
    });
    return result.rows[0] || null;
}

export function registrarPagoDistribuido({ cliente_id, fecha_pago, cantidad_entregada, metodo_pago, comentario }, usuarioId) {
    const ejecutarDistribucion = sqlite.transaction(() => {
        const facturasPendientes = sqlite.prepare(`
            SELECT f.id, f.saldo_pendiente, f.fecha_emision, f.fecha_creacion, f.convenio_id, l.periodo
            FROM facturas f LEFT JOIN lecturas l ON f.lectura_id = l.id
            WHERE f.cliente_id = ? AND f.saldo_pendiente > 0 AND f.estado != 'Pagado' AND f.convenio_id IS NULL
            ORDER BY COALESCE(f.fecha_emision, f.fecha_creacion) ASC, f.id ASC
        `).all(cliente_id);

        if (!facturasPendientes?.length) throw { statusCode: 404, error: 'El cliente no tiene facturas pendientes para aplicar pago' };

        let restante = toDecimal(cantidad_entregada);
        const aplicaciones = [];
        const pagoIds = [];

        for (const factura of facturasPendientes) {
            if (restante <= 0) break;
            const saldoFactura = toDecimal(factura.saldo_pendiente);
            if (saldoFactura <= 0) continue;
            const montoAplicado = toDecimal(Math.min(restante, saldoFactura));
            if (montoAplicado <= 0) continue;

            const insertResult = sqlite.prepare(`INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, comentario, modificado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(factura.id, fecha_pago, montoAplicado, montoAplicado, 0, metodo_pago, comentario || null, usuarioId);

            const saldoEsperado = toDecimal(Math.max(0, saldoFactura - montoAplicado));
            const saldoDespuesInsert = sqlite.prepare(`SELECT saldo_pendiente FROM facturas WHERE id = ?`).get(factura.id);
            if (Math.abs(toDecimal(saldoDespuesInsert?.saldo_pendiente) - saldoFactura) < 0.01) {
                sqlite.prepare(`UPDATE facturas SET saldo_pendiente = ?, estado = CASE WHEN ? <= 0 THEN 'Pagado' ELSE estado END, modificado_por = ? WHERE id = ?`).run(saldoEsperado, saldoEsperado, usuarioId, factura.id);
            }

            const saldoFinal = toDecimal(sqlite.prepare(`SELECT saldo_pendiente FROM facturas WHERE id = ?`).get(factura.id)?.saldo_pendiente);
            aplicaciones.push({ factura_id: factura.id, periodo: factura.periodo || null, saldo_antes: saldoFactura, monto_aplicado: montoAplicado, saldo_despues: saldoFinal });
            pagoIds.push(Number(insertResult.lastInsertRowid));
            restante = resta(restante, montoAplicado);
        }

        if (!aplicaciones.length) throw { statusCode: 400, error: 'No fue posible aplicar el pago a facturas pendientes' };

        const montoAplicadoTotal = aplicaciones.reduce((s, i) => suma(s, i.monto_aplicado), 0);
        return { pagoIds, aplicaciones, montoAplicadoTotal, cambio: toDecimal(Math.max(0, toDecimal(cantidad_entregada) - montoAplicadoTotal)), facturasAfectadas: aplicaciones.length };
    });
    return ejecutarDistribucion();
}

const BASE_PAGOS = `SELECT p.*, f.estado AS estado_factura, f.total AS total_factura, f.fecha_emision AS fecha_emision_factura, f.saldo_pendiente AS saldo_pendiente_factura, u.username AS modificado_por_nombre, c.nombre AS cliente_nombre, c.direccion AS direccion_cliente, l.periodo AS periodo_facturado, l.consumo_m3, l.fecha_lectura, m.numero_serie AS medidor_numero_serie FROM pagos p JOIN facturas f ON p.factura_id = f.id JOIN usuarios u ON p.modificado_por = u.id JOIN clientes c ON f.cliente_id = c.id LEFT JOIN lecturas l ON f.lectura_id = l.id LEFT JOIN medidores m ON l.medidor_id = m.id`;
const COUNT_JOIN = `FROM pagos p JOIN facturas f ON p.factura_id = f.id JOIN clientes c ON f.cliente_id = c.id LEFT JOIN lecturas l ON f.lectura_id = l.id`;

const mapPago = r => ({ ...r, id: Number(r.id), factura_id: Number(r.factura_id), modificado_por: Number(r.modificado_por) });

export async function obtenerPagos({ id, periodo, page, limit, search, metodo_pago, ciudad }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 60;
    const offset = (pageNum - 1) * limitNum;
    const searchTerm = search ? `%${search.toLowerCase()}%` : null;
    const normalizedSearch = search ? `%${search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}%` : null;

    const conditions = [];
    const queryParams = [];
    const countParams = [];

    if (id) {
        conditions.push('p.id = ?');
        queryParams.push(id);
    } else {
        if (periodo) { conditions.push('l.periodo = ?'); queryParams.push(periodo); countParams.push(periodo); }
        if (metodo_pago?.trim()) { conditions.push('p.metodo_pago = ?'); queryParams.push(metodo_pago); countParams.push(metodo_pago); }
        if (ciudad?.trim() && ciudad !== 'All') { conditions.push('c.ciudad = ?'); queryParams.push(ciudad); countParams.push(ciudad); }
        if (searchTerm) {
            conditions.push('(unaccent(c.nombre) LIKE ? OR CAST(p.id AS TEXT) LIKE ? OR CAST(f.id AS TEXT) LIKE ? OR unaccent(p.metodo_pago) LIKE ?)');
            queryParams.push(normalizedSearch, searchTerm, searchTerm, normalizedSearch);
            countParams.push(normalizedSearch, searchTerm, searchTerm, normalizedSearch);
        }
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    if (id) {
        const r = await dbTurso.execute({ sql: `${BASE_PAGOS} ${where}`, args: queryParams });
        const pago = r.rows.length > 0 ? mapPago(r.rows[0]) : null;
        if (!pago) { const e = new Error('Pago no encontrado'); e.status = 404; throw e; }
        return { tipo: 'unico', pago: { ...pago, periodo_info: { periodo_facturado: pago.periodo_facturado, mes_facturado: pago.periodo_facturado ? formatearMesPeriodo(pago.periodo_facturado) : null } } };
    }

    const [countResult, dataResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total ${COUNT_JOIN} ${where}`, args: countParams }),
        dbTurso.execute({ sql: `${BASE_PAGOS} ${where} ORDER BY p.fecha_pago DESC LIMIT ? OFFSET ?`, args: [...queryParams, limitNum, offset] })
    ]);

    const totalItems = Number(countResult.rows[0].total);
    const pagos = dataResult.rows.map(mapPago);

    if (!pagos.length) return { tipo: 'lista', pagos: [], pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 }, resumen: { total_pagado: 0, cantidad_pagos: 0, promedio_pago: 0 }, periodos_encontrados: [], resumen_por_periodo: {}, filtro: periodo ? { tipo: 'periodo', valor: periodo, mes_facturado: formatearMesPeriodo(periodo) } : null };

    const totalPagado = toDecimal(pagos.reduce((s, p) => suma(s, toDecimal(p.monto || 0)), 0));
    const periodosUnicos = [...new Set(pagos.map(p => p.periodo_facturado).filter(Boolean))].sort();
    const resumenPorPeriodo = periodosUnicos.reduce((acc, per) => {
        const del = pagos.filter(p => p.periodo_facturado === per);
        const tot = toDecimal(del.reduce((s, p) => suma(s, toDecimal(p.monto || 0)), 0));
        acc[per] = { cantidad_pagos: del.length, total_pagado: tot, promedio_pago: toDecimal(tot / del.length) };
        return acc;
    }, {});

    return {
        tipo: 'lista',
        pagos: pagos.map(p => ({ ...p, mes_facturado: p.periodo_facturado ? formatearMesPeriodo(p.periodo_facturado) : null })),
        pagination: { total: totalItems, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalItems / limitNum) },
        resumen: { total_pagado: totalPagado, cantidad_pagos: pagos.length, promedio_pago: toDecimal(totalPagado / pagos.length) },
        periodos_encontrados: periodosUnicos,
        resumen_por_periodo: resumenPorPeriodo,
        filtro: periodo ? { tipo: 'periodo', valor: periodo, mes_facturado: formatearMesPeriodo(periodo) } : null
    };
}

export function modificarPago(id, { fecha_pago, monto, metodo_pago, comentario }, usuarioId) {
    if (monto !== undefined) {
        const ejecutarModificacion = sqlite.transaction(() => {
            const pagoActual = sqlite.prepare('SELECT id, factura_id, monto FROM pagos WHERE id = ?').get(id);
            if (!pagoActual) throw { statusCode: 404, error: 'Pago no encontrado' };

            const montoAnterior = toDecimal(pagoActual.monto);
            const montoNuevo = toDecimal(monto);
            const diferencia = resta(montoNuevo, montoAnterior);

            if (diferencia > 0 && pagoActual.factura_id) {
                const factura = sqlite.prepare('SELECT saldo_pendiente FROM facturas WHERE id = ?').get(pagoActual.factura_id);
                if (factura && diferencia > toDecimal(factura.saldo_pendiente) + 0.01) {
                    throw { statusCode: 400, error: 'El nuevo monto excede el saldo pendiente disponible', detalles: { saldo_disponible: toDecimal(factura.saldo_pendiente), incremento_solicitado: diferencia } };
                }
            }

            const setClauses = ['modificado_por = ?', 'monto = ?'];
            const args = [usuarioId, montoNuevo];
            if (fecha_pago !== undefined) { setClauses.push('fecha_pago = ?'); args.push(fecha_pago); }
            if (metodo_pago !== undefined) { setClauses.push('metodo_pago = ?'); args.push(metodo_pago); }
            if (comentario !== undefined) { setClauses.push('comentario = ?'); args.push(comentario); }
            args.push(id);
            sqlite.prepare(`UPDATE pagos SET ${setClauses.join(', ')} WHERE id = ?`).run(...args);

            if (pagoActual.factura_id && diferencia !== 0) {
                sqlite.prepare(`UPDATE facturas SET saldo_pendiente = ROUND(saldo_pendiente - ?, 2) WHERE id = ?`).run(diferencia, pagoActual.factura_id);
            }
        });
        ejecutarModificacion();
        return;
    }

    // Actualización simple sin cambio de monto (asíncrona)
    return (async () => {
        const setClauses = ['modificado_por = ?'];
        const args = [usuarioId];
        if (fecha_pago !== undefined) { setClauses.push('fecha_pago = ?'); args.push(fecha_pago); }
        if (metodo_pago !== undefined) { setClauses.push('metodo_pago = ?'); args.push(metodo_pago); }
        if (comentario !== undefined) { setClauses.push('comentario = ?'); args.push(comentario); }
        if (setClauses.length <= 1) { const e = new Error('No se proporcionaron campos para actualizar'); e.status = 400; throw e; }
        args.push(id);
        const result = await dbTurso.execute({ sql: `UPDATE pagos SET ${setClauses.join(', ')} WHERE id = ?`, args });
        if (result.rowsAffected === 0) { const e = new Error('Pago no encontrado'); e.status = 404; throw e; }
    })();
}
