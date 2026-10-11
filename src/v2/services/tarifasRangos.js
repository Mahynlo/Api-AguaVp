/**
 * Escritura de los rangos de una tarifa (sin depender de la conexión global, para poder probarla).
 * `conn` es una conexión SQLite síncrona: better-sqlite3 (producción) o node:sqlite (pruebas).
 *
 * Siempre se valida el conjunto COMPLETO de rangos que queda en la tarifa (validarRangosTarifa)
 * y se escribe todo o nada dentro de una transacción. Cada alta o cambio queda en historial_tarifas.
 */
import { validarRangosTarifa } from '../../utils/tarifaUtils.js';

function rangosError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

const normalizar = (r) => ({
    id: r.id == null || r.id === '' ? null : Number(r.id),
    consumo_min: Number(r.consumo_min),
    consumo_max: r.consumo_max == null || r.consumo_max === '' ? null : Number(r.consumo_max),
    precio_por_m3: Number(r.precio_por_m3)
});

function enTransaccion(conn, fn) {
    conn.exec('BEGIN');
    try {
        const out = fn();
        conn.exec('COMMIT');
        return out;
    } catch (err) {
        conn.exec('ROLLBACK');
        throw err;
    }
}

function rangosActuales(conn, tarifa_id) {
    if (!conn.prepare('SELECT id FROM tarifas WHERE id = ?').get(tarifa_id)) throw rangosError('Tarifa no encontrada', 404);
    return conn.prepare('SELECT id, consumo_min, consumo_max, precio_por_m3 FROM rangos_tarifas WHERE tarifa_id = ? ORDER BY consumo_min')
        .all(tarifa_id).map(normalizar);
}

function registrarHistorial(conn, tarifa_id, rango_id, r, precioAnterior) {
    conn.prepare(`INSERT INTO historial_tarifas (tarifa_id, rango_id, consumo_min, consumo_max, precio_anterior, precio_nuevo)
                  VALUES (?, ?, ?, ?, ?, ?)`)
        .run(tarifa_id, rango_id, r.consumo_min, r.consumo_max, precioAnterior, r.precio_por_m3);
}

/**
 * Agrega rangos a una tarifa. Los nuevos, junto con los que ya tiene, deben formar una escala válida.
 * @returns {{ agregados: number }}
 */
export function agregarRangosTarifa(conn, tarifa_id, rangos) {
    const nuevos = rangos.map(normalizar);
    const existentes = rangosActuales(conn, tarifa_id);
    const error = validarRangosTarifa([...existentes, ...nuevos]);
    if (error) throw rangosError(error);

    return enTransaccion(conn, () => {
        const insertar = conn.prepare('INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, ?, ?, ?)');
        for (const r of nuevos) {
            const res = insertar.run(tarifa_id, r.consumo_min, r.consumo_max, r.precio_por_m3);
            registrarHistorial(conn, tarifa_id, Number(res.lastInsertRowid), r, null);
        }
        return { agregados: nuevos.length };
    });
}

/**
 * Reemplaza los rangos de una tarifa por la lista recibida (la que muestra la pantalla de edición):
 * los que traen `id` se actualizan, los que no lo traen se agregan y los que ya no vienen se eliminan.
 * @returns {{ agregados: number, actualizados: number, eliminados: number }}
 */
export function reemplazarRangosTarifa(conn, tarifa_id, rangos) {
    const lista = rangos.map(normalizar);
    const error = validarRangosTarifa(lista);
    if (error) throw rangosError(error);

    const existentes = new Map(rangosActuales(conn, tarifa_id).map(r => [r.id, r]));
    const idsRecibidos = new Set();
    for (const r of lista) {
        if (r.id === null) continue;
        if (!existentes.has(r.id)) throw rangosError(`El rango ${r.id} no pertenece a esta tarifa. Vuelve a abrir la tarifa e inténtalo de nuevo.`);
        if (idsRecibidos.has(r.id)) throw rangosError(`El rango ${r.id} viene repetido`);
        idsRecibidos.add(r.id);
    }

    return enTransaccion(conn, () => {
        let agregados = 0;
        let actualizados = 0;
        let eliminados = 0;

        // Rangos quitados en la pantalla: el historial conserva sus datos, sin la referencia al rango borrado
        for (const id of existentes.keys()) {
            if (idsRecibidos.has(id)) continue;
            conn.prepare('UPDATE historial_tarifas SET rango_id = NULL WHERE rango_id = ?').run(id);
            conn.prepare('DELETE FROM rangos_tarifas WHERE id = ? AND tarifa_id = ?').run(id, tarifa_id);
            eliminados++;
        }

        for (const r of lista) {
            if (r.id === null) {
                const res = conn.prepare('INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, ?, ?, ?)')
                    .run(tarifa_id, r.consumo_min, r.consumo_max, r.precio_por_m3);
                registrarHistorial(conn, tarifa_id, Number(res.lastInsertRowid), r, null);
                agregados++;
                continue;
            }
            const antes = existentes.get(r.id);
            if (antes.consumo_min === r.consumo_min && antes.consumo_max === r.consumo_max && antes.precio_por_m3 === r.precio_por_m3) continue;
            conn.prepare('UPDATE rangos_tarifas SET consumo_min = ?, consumo_max = ?, precio_por_m3 = ? WHERE id = ? AND tarifa_id = ?')
                .run(r.consumo_min, r.consumo_max, r.precio_por_m3, r.id, tarifa_id);
            registrarHistorial(conn, tarifa_id, r.id, r, antes.precio_por_m3);
            actualizados++;
        }
        return { agregados, actualizados, eliminados };
    });
}
