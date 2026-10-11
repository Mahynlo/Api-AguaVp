import dbTurso from "../../database/db-sqlite.js";
import { nowDate } from "../../utils/timezone.js";

const DEFAULTS = {
    facturas_para_primer_aviso: 1,
    facturas_para_segundo_aviso: 2,
    facturas_para_tercer_aviso: 3,
    facturas_para_corte: 4,
    dias_gracia: 0,
    dias_vencimiento_factura: 15
};

export async function getConfiguracion() {
    const result = await dbTurso.execute({ sql: `SELECT * FROM configuracion_servicio ORDER BY id DESC LIMIT 1` });
    if (result.rows.length === 0) return { ...DEFAULTS, activo: 1, mensaje: "Configuración por defecto (sin registros en BD)" };
    return result.rows[0];
}

export async function updateConfiguracion(datos, usuarioId) {
    const {
        facturas_para_primer_aviso = 1, facturas_para_segundo_aviso = 2,
        facturas_para_tercer_aviso = 3, facturas_para_corte = 4,
        dias_gracia = 0, dias_vencimiento_factura = 15
    } = datos;

    await dbTurso.execute({ sql: `UPDATE configuracion_servicio SET activo = 0 WHERE activo = 1` });

    const result = await dbTurso.execute({
        sql: `INSERT INTO configuracion_servicio (facturas_para_primer_aviso, facturas_para_segundo_aviso, facturas_para_tercer_aviso, facturas_para_corte, dias_gracia, dias_vencimiento_factura, modificado_por, fecha_modificacion, activo) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 1)`,
        args: [facturas_para_primer_aviso, facturas_para_segundo_aviso, facturas_para_tercer_aviso, facturas_para_corte, dias_gracia, Number(dias_vencimiento_factura), usuarioId ?? null]
    });

    return Number(result.lastInsertRowid);
}

export async function recalcularVencimientosPorPeriodo({ periodo, incluir_pagadas = false, actualizar_fecha_emision = false, fecha_emision_objetivo = null }, usuarioId) {
    const includePagadas = Boolean(incluir_pagadas);
    const actualizarFechaEmision = Boolean(actualizar_fecha_emision);

    let fechaEmisionObjetivo = null;
    if (actualizarFechaEmision) {
        fechaEmisionObjetivo = fecha_emision_objetivo || nowDate();
    }

    const configResult = await dbTurso.execute({ sql: `SELECT dias_vencimiento_factura FROM configuracion_servicio WHERE activo = 1 ORDER BY id DESC LIMIT 1` });
    const diasVencimiento = configResult.rows.length > 0 ? (Number(configResult.rows[0].dias_vencimiento_factura) || 15) : 15;

    const countResult = await dbTurso.execute({
        sql: `SELECT COUNT(*) AS total FROM facturas f JOIN lecturas l ON f.lectura_id = l.id WHERE l.periodo = ? AND (? = 1 OR f.fecha_emision IS NOT NULL) AND (? = 1 OR (f.estado IS NULL OR f.estado != 'Pagado'))`,
        args: [periodo, actualizarFechaEmision ? 1 : 0, includePagadas ? 1 : 0]
    });

    const totalObjetivo = Number(countResult.rows?.[0]?.total || 0);

    if (totalObjetivo > 0) {
        if (actualizarFechaEmision) {
            await dbTurso.execute({
                sql: `UPDATE facturas SET fecha_emision = ?, fecha_vencimiento = date(?, '+' || ? || ' day'), modificado_por = COALESCE(?, modificado_por) WHERE lectura_id IN (SELECT id FROM lecturas WHERE periodo = ?) AND (? = 1 OR (estado IS NULL OR estado != 'Pagado'))`,
                args: [fechaEmisionObjetivo, fechaEmisionObjetivo, diasVencimiento, usuarioId, periodo, includePagadas ? 1 : 0]
            });
        } else {
            await dbTurso.execute({
                sql: `UPDATE facturas SET fecha_vencimiento = date(fecha_emision, '+' || ? || ' day'), modificado_por = COALESCE(?, modificado_por) WHERE lectura_id IN (SELECT id FROM lecturas WHERE periodo = ?) AND fecha_emision IS NOT NULL AND (? = 1 OR (estado IS NULL OR estado != 'Pagado'))`,
                args: [diasVencimiento, usuarioId, periodo, includePagadas ? 1 : 0]
            });
        }
    }

    return {
        diasVencimiento, includePagadas, actualizarFechaEmision,
        fechaEmisionObjetivo, totalObjetivo
    };
}
