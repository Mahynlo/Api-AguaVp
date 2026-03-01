/**
 * Utilidad para cálculo de tarifas de agua potable
 * File: src/utils/tarifaUtils.js
 *
 * ============================================================
 * LÓGICA DE TARIFAS ESCALONADAS (fuente de verdad única)
 * ============================================================
 *
 * REGLA: El primer rango (consumo_min = 0) es un precio BASE FIJO.
 * Se cobra ese importe completo independientemente de cuántos m³
 * se hayan consumido dentro del rango.
 *
 * Los rangos siguientes son PROGRESIVOS: se cobra precio_por_m3
 * multiplicado SOLO por los metros consumidos DENTRO de ese tramo.
 *
 * EJEMPLO con la siguiente configuración:
 *   Rango 1: consumo_min=0,  consumo_max=10  → precio = $100  (base fija)
 *   Rango 2: consumo_min=11, consumo_max=20  → precio = $12.50/m³
 *   Rango 3: consumo_min=21, consumo_max=null→ precio = $18.00/m³
 *
 *   Consumo  8 m³  → $100  (dentro del rango base)
 *   Consumo 10 m³  → $100  (tope del rango base, se cobra solo la base)
 *   Consumo 15 m³  → $100 + (15 - 11 + 1) × $12.50 = $100 + $62.50 = $162.50
 *   Consumo 20 m³  → $100 + (20 - 11 + 1) × $12.50 = $100 + $125   = $225.00
 *   Consumo 25 m³  → $100 + (10 × $12.50) + (25 - 21 + 1) × $18   = $100 + $125 + $90 = $315.00
 *
 * NOTA: Se usa Math.floor(consumo_m3) para la búsqueda de rangos
 * (no se cobra fracción de rango), pero el cálculo final se redondea
 * a 2 decimales.
 */

/**
 * Calcula el total a cobrar dado un consumo y los rangos de una tarifa.
 *
 * @param {number} consumo_m3  Consumo en metros cúbicos (puede ser decimal)
 * @param {Array<{
 *   consumo_min: number|string,
 *   consumo_max: number|string|null,
 *   precio_por_m3: number|string
 * }>} rangos  Rangos de la tarifa (se ordenan internamente)
 * @returns {number}  Total calculado con exactamente 2 decimales
 * @throws {Error}  Si los rangos están vacíos o el consumo es negativo
 */
export const calcularTarifa = (consumo_m3, rangos) => {
    if (!rangos || rangos.length === 0) {
        throw new Error('La tarifa no tiene rangos definidos');
    }
    if (consumo_m3 < 0) {
        throw new Error('El consumo no puede ser negativo');
    }

    // Consumo 0 → solo se cobra la base
    const consumoEntero = Math.floor(consumo_m3);

    // Ordenar ascendentemente (defensa ante ordenamiento incorrecto de BD)
    const rangosOrdenados = [...rangos].sort(
        (a, b) => Number(a.consumo_min) - Number(b.consumo_min)
    );

    let total = 0;
    let rangoFinalEncontrado = false;

    for (const rango of rangosOrdenados) {
        const consumo_min  = Number(rango.consumo_min);
        const consumo_max  = rango.consumo_max != null ? Number(rango.consumo_max) : Infinity;
        const precio_por_m3 = Number(rango.precio_por_m3);

        const esPrimerRango = consumo_min === 0;

        if (consumoEntero > consumo_max) {
            // ── El consumo supera COMPLETAMENTE este tramo ──
            if (esPrimerRango) {
                // Primer rango: cobrar el precio base una sola vez
                total += precio_por_m3;
            } else {
                // Tramos intermedios: cobrar todos los metros del tramo
                const metros_en_rango = consumo_max - consumo_min + 1;
                total += metros_en_rango * precio_por_m3;
            }
        } else if (consumoEntero >= consumo_min) {
            // ── El consumo cae DENTRO de este tramo (tramo final) ──
            if (esPrimerRango) {
                // Primer rango: precio base fijo sin importar cuánto se consumió
                total += precio_por_m3;
            } else {
                // Tramos superiores: solo los metros consumidos en este tramo
                const metros_consumidos = consumoEntero - consumo_min + 1;
                total += metros_consumidos * precio_por_m3;
            }
            rangoFinalEncontrado = true;
            break;
        }
        // Si consumoEntero < consumo_min → este rango no aplica, continuar
    }

    // ── Consumo excede el último rango con tope definido ──
    if (!rangoFinalEncontrado && rangosOrdenados.length > 0) {
        const ultimoRango = rangosOrdenados[rangosOrdenados.length - 1];
        const ultimo_max   = ultimoRango.consumo_max != null ? Number(ultimoRango.consumo_max) : null;
        const ultimo_precio = Number(ultimoRango.precio_por_m3);

        if (ultimo_max !== null) {
            // Los metros por encima del límite se cobran al precio del último tramo
            const excedente = consumoEntero - ultimo_max;
            total += excedente * ultimo_precio;
        }
        // Si consumo_max es null (abierto), el bucle ya lo habría cubierto con Infinity
    }

    return parseFloat(total.toFixed(2));
};

/**
 * Versión async: obtiene los rangos desde la BD y devuelve el total calculado.
 * Útil para llamar directamente desde controladores sin repetir la query.
 *
 * @param {number}  consumo_m3  Consumo en metros cúbicos
 * @param {number}  tarifa_id   ID de la tarifa en BD
 * @param {object}  db          Instancia de base de datos (dbTurso / dbSqlite)
 * @returns {Promise<{ total: number, rangos: Array }>}
 * @throws {Error}  Si la tarifa no existe o no tiene rangos
 */
export const calcularTarifaDesdeDB = async (consumo_m3, tarifa_id, db) => {
    const rangosResult = await db.execute({
        sql: `SELECT consumo_min, consumo_max, precio_por_m3
              FROM rangos_tarifas
              WHERE tarifa_id = ?
              ORDER BY consumo_min ASC`,
        args: [tarifa_id]
    });

    if (rangosResult.rows.length === 0) {
        throw new Error(`La tarifa ID ${tarifa_id} no tiene rangos definidos`);
    }

    const total = calcularTarifa(consumo_m3, rangosResult.rows);
    return { total, rangos: rangosResult.rows };
};
