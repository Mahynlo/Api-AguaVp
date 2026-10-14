/**
 * Regla de rectificación de lecturas (sin depender de la conexión global, para poder probarla).
 * `conn` es una conexión SQLite síncrona: better-sqlite3 (producción) o node:sqlite (pruebas).
 *
 * Una lectura solo se puede rectificar (y su factura recalcular) si:
 *   - su factura no tiene pagos ni está en un convenio: lo cobrado no se altera;
 *   - es la lectura más reciente de su medidor: en cuanto el medidor tiene la lectura del período
 *     siguiente, el anterior queda cerrado (así no se rompe la continuidad anterior → actual).
 */

const dinero = (n) => `$${Number(n).toFixed(2)}`;

/**
 * Motivo por el que una lectura NO se puede rectificar, o null si se puede.
 * @param {{ periodo: string, periodoPosterior?: string|null, pagado?: number, convenioId?: number|null }} datos
 */
export function motivoNoRectificable({ periodo, periodoPosterior = null, pagado = 0, convenioId = null }) {
    if (Number(pagado) > 0) {
        return `La factura de esta lectura ya tiene pagos registrados (${dinero(pagado)}); no se puede rectificar.`;
    }
    if (convenioId != null) {
        return 'La factura de esta lectura está en un convenio de pago; no se puede rectificar.';
    }
    if (periodoPosterior) {
        return `El período ${periodo} quedó cerrado para este medidor: ya tiene la lectura de ${periodoPosterior}. Solo se puede rectificar la lectura más reciente.`;
    }
    return null;
}

/**
 * Datos de una lectura para decidir si se puede rectificar.
 * @returns {{ id, medidor_id, periodo, periodoPosterior, pagado, convenioId, motivo } | null}  null si no existe
 */
export function estadoRectificacion(conn, lecturaId) {
    const l = conn.prepare(`
        SELECT l.id, l.medidor_id, l.periodo,
               (SELECT MIN(s.periodo) FROM lecturas s WHERE s.medidor_id = l.medidor_id AND s.periodo > l.periodo) AS periodo_posterior,
               (SELECT COALESCE(SUM(p.monto), 0) FROM facturas f JOIN pagos p ON p.factura_id = f.id WHERE f.lectura_id = l.id) AS pagado,
               (SELECT f.convenio_id FROM facturas f WHERE f.lectura_id = l.id LIMIT 1) AS convenio_id
        FROM lecturas l WHERE l.id = ?`).get(lecturaId);
    if (!l) return null;
    const datos = {
        id: Number(l.id),
        medidor_id: Number(l.medidor_id),
        periodo: l.periodo,
        periodoPosterior: l.periodo_posterior ?? null,
        pagado: Number(l.pagado || 0),
        convenioId: l.convenio_id ?? null
    };
    return { ...datos, motivo: motivoNoRectificable(datos) };
}
