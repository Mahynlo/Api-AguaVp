/**
 * Servicio de cortes y reconexiones de servicio
 *
 * File: src/v2/services/cortesService.js
 *
 * Los errores de negocio se lanzan con crearError(mensaje, status, { datos }):
 * el controller responde { error: mensaje, ...datos } con ese status.
 */

import db, { sqlite } from "../../database/db-sqlite.js";
import { crearError } from "../../utils/errores.js";

/**
 * Candidatos a corte: medidores con N facturas vencidas (según configuración) o con convenio activo.
 */
export async function detectarCandidatosCorte() {
    // 1. Obtener Configuración Activa
    const configResult = await db.execute({ sql: `SELECT * FROM configuracion_servicio ORDER BY id DESC LIMIT 1`, args: [] });

    // Valores por defecto si no hay config
    const umbralCorte = configResult.rows.length > 0 ? configResult.rows[0].facturas_para_corte : 4;
    const diasGracia = configResult.rows.length > 0 ? (configResult.rows[0].dias_gracia || 0) : 0;

    // 2. Buscar medidores con N facturas VENCIDAS pendientes
    // Incluye medidores con convenios para visualización completa
    const query = `
        SELECT
            m.id as medidor_id,
            m.numero_serie,
            m.estado_servicio,
            c.id as cliente_id,
            c.nombre as cliente_nombre,
            c.direccion,
            COUNT(CASE WHEN f.estado = 'Vencida' THEN f.id END) as facturas_vencidas,
            SUM(f.saldo_pendiente) as deuda_total,
            MIN(f.fecha_vencimiento) as fecha_vencimiento_mas_antigua,
            cp.id as convenio_id,
            cp.saldo_restante as convenio_saldo,
            cp.numero_parcialidades as convenio_parcialidades,
            (SELECT COUNT(*) FROM parcialidades_convenio pc WHERE pc.convenio_id = cp.id AND pc.estado = 'Pendiente') as parcialidades_pendientes,
            cp.numero_parcialidades as total_parcialidades
        FROM medidores m
        JOIN clientes c ON m.cliente_id = c.id
        JOIN lecturas l ON l.medidor_id = m.id
        JOIN facturas f ON f.lectura_id = l.id
        LEFT JOIN convenios_pago cp ON cp.medidor_id = m.id AND cp.estado = 'Activo'
        WHERE f.saldo_pendiente > 0
        AND f.estado IN ('Vencida', 'En Convenio')
        AND m.estado_servicio IN ('Activo', 'Cortado')
        AND (
            (f.estado = 'Vencida' AND f.fecha_vencimiento <= date('now', '-' || ? || ' days'))
            OR f.estado = 'En Convenio'
        )
        GROUP BY m.id, m.numero_serie, m.estado_servicio, c.id, c.nombre, c.direccion, cp.id, cp.saldo_restante, cp.numero_parcialidades
        HAVING facturas_vencidas >= ? OR cp.id IS NOT NULL
        ORDER BY
            CASE
                WHEN cp.id IS NOT NULL THEN 0
                WHEN m.estado_servicio = 'Cortado' THEN 1
                WHEN m.estado_servicio = 'Activo' THEN 2
            END,
            facturas_vencidas DESC
    `;

    const result = await db.execute({ sql: query, args: [diasGracia, umbralCorte] });

    // 3. Formatear respuesta
    const candidatos = result.rows.map(row => {
        const tieneConvenio = row.convenio_id !== null;

        return {
            cliente: {
                id: row.cliente_id,
                nombre: row.cliente_nombre,
                direccion: row.direccion
            },
            medidor: {
                id: row.medidor_id,
                serial: row.numero_serie,
                estado: row.estado_servicio,
                estado_servicio: row.estado_servicio
            },
            deuda: {
                facturas_vencidas: Number(row.facturas_vencidas),
                total: Number(row.deuda_total),
                fecha_mas_antigua: row.fecha_vencimiento_mas_antigua
            },
            convenio: tieneConvenio ? {
                id: row.convenio_id,
                saldo_restante: Number(row.convenio_saldo),
                parcialidades: Number(row.convenio_parcialidades),
                parcialidades_pendientes: Number(row.parcialidades_pendientes || 0),
                total_parcialidades: Number(row.total_parcialidades || 0)
            } : null,
            tiene_convenio: tieneConvenio,
            accion_sugerida: tieneConvenio ? "En Convenio" :
                (row.estado_servicio === 'Cortado' ? "Reconexión" : "Corte de Servicio"),
            // Campos de compatibilidad para el frontend
            fecha_vencimiento: row.fecha_vencimiento_mas_antigua,
            saldo_pendiente: Number(row.deuda_total)
        };
    });

    return {
        umbral_corte: umbralCorte,
        dias_gracia: diasGracia,
        total_candidatos: candidatos.length,
        candidatos
    };
}

/**
 * Corta el servicio de un medidor (registro en cortes_servicio + estado del medidor, atómico).
 */
export async function ejecutarCorte({ medidor_id, motivo, observaciones, autorizado_por }) {
    // 1. Obtener datos del medidor y cliente
    const medidorRes = await db.execute({ sql: `SELECT cliente_id, estado_servicio FROM medidores WHERE id = ?`, args: [medidor_id] });

    if (medidorRes.rows.length === 0) throw crearError("Medidor no encontrado", 404);

    const medidor = medidorRes.rows[0];

    if (medidor.estado_servicio === 'Cortado') throw crearError("El servicio ya se encuentra cortado", 400);

    // 2 y 3. Registrar corte y actualizar medidor — operación atómica.
    // Si falla cualquiera de las dos, SQLite hace rollback automático.
    const transaccionCorte = sqlite.transaction(() => {
        sqlite.prepare(`
            INSERT INTO cortes_servicio (cliente_id, medidor_id, fecha_corte, motivo, autorizado_por, observaciones)
            VALUES (?, ?, datetime('now'), ?, ?, ?)
        `).run(medidor.cliente_id, medidor_id, motivo, autorizado_por || null, observaciones || '');

        sqlite.prepare(`
            UPDATE medidores SET estado_servicio = 'Cortado', fecha_corte = date('now')
            WHERE id = ?
        `).run(medidor_id);
    });

    transaccionCorte();
}

/**
 * Reconecta un medidor cortado. Solo se permite si no tiene deuda o si tiene convenio activo.
 * @returns {{ nuevoEstado: string }}
 */
export async function procesarReconexion({ medidor_id, observaciones, reconectado_por }) {
    // 1. Validar Estado Actual
    const checkRes = await db.execute({ sql: `SELECT * FROM medidores WHERE id = ?`, args: [medidor_id] });
    if (checkRes.rows.length === 0) throw crearError("Medidor no encontrado", 404);
    const medidor = checkRes.rows[0];

    if (medidor.estado_servicio !== 'Cortado') throw crearError("El servicio no está reportado como Cortado", 400);

    // 2. Verificar Deuda (Saldo Pendiente) de las facturas del medidor
    const deudaRes = await db.execute({
        sql: `
            SELECT SUM(f.saldo_pendiente) as total_deuda
            FROM facturas f
            JOIN lecturas l ON l.id = f.lectura_id
            WHERE l.medidor_id = ?
              AND f.estado != 'Pagado'
        `,
        args: [medidor_id]
    });
    const deudaTotal = Number(deudaRes.rows[0]?.total_deuda || 0);

    // 3. Verificar Convenio Activo
    const convenioRes = await db.execute({
        sql: `
            SELECT * FROM convenios_pago
            WHERE medidor_id = ? AND estado = 'Activo'
        `,
        args: [medidor_id]
    });
    const tieneConvenio = convenioRes.rows.length > 0;

    // REGLA: Solo reconectar si Deuda es 0 O Tiene Convenio
    console.log("Validación reconexión:", { deudaTotal, tieneConvenio });

    if (deudaTotal > 0 && !tieneConvenio) {
        console.log("RECHAZADO: Deuda pendiente sin convenio");
        throw crearError("No es posible reconectar. Existe deuda pendiente y no hay convenio activo.", 403, {
            datos: { deuda_pendiente: deudaTotal, requiere: "Pagar deuda completa o crear convenio de pago" }
        });
    }

    // 4. Ejecutar Reconexión: cerrar el ciclo en cortes_servicio
    await db.execute({
        sql: `
            UPDATE cortes_servicio
            SET fecha_reconexion = datetime('now'), reconectado_por = ?, observaciones = ?
            WHERE medidor_id = ? AND fecha_reconexion IS NULL
        `,
        args: [reconectado_por, observaciones || 'Reconexión autorizada', medidor_id]
    });

    // Actualizar medidor. El estado 'En Convenio' ya no se usa en el medidor, vuelve a 'Activo'
    const nuevoEstado = 'Activo';
    await db.execute({
        sql: `UPDATE medidores SET estado_servicio = ? WHERE id = ?`,
        args: [nuevoEstado, medidor_id]
    });

    return { nuevoEstado };
}
