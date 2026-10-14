/**
 * Reportes: generarReporteLecturas (ver services/reportsService.js)
 */

import db from "../../../database/db-sqlite.js";
import { subMonths, format, parseISO } from 'date-fns';
import { crearError } from '../../../utils/errores.js';

/**
 * Reporte de Lecturas (Lista para toma de lecturas)
 * Endpoint: GET /api/v2/reports/lecturas
 */
export async function generarReporteLecturas(filtros) {
    const { mes, localidad } = filtros; // mes: YYYY-MM

    if (!mes) {
        throw crearError("El parámetro 'mes' (YYYY-MM) es obligatorio", 400);
    }

    // Calcular mes anterior para obtener "Lectura Anterior"
    const fechaMes = parseISO(mes + '-01');
    const mesAnterior = format(subMonths(fechaMes, 1), 'yyyy-MM');

    // Query Principal
    let query = `
        SELECT 
            c.id as cliente_id,
            c.nombre as cliente_nombre,
            c.numero_predio,
            c.ciudad as localidad,
            c.direccion,
            m.id as medidor_id,
            m.numero_serie,
            m.ubicacion as medidor_ubicacion,
            m.latitud,
            m.longitud,
            m.lectura_base,
            -- Última lectura registrada específicamente para este medidor físico antes de este período
            (
                SELECT lf.lectura_actual 
                FROM lecturas lf 
                WHERE lf.medidor_id = m.id 
                  AND (lf.periodo < ? OR (lf.periodo IS NULL AND lf.fecha_lectura < ?))
                  AND lf.lectura_actual IS NOT NULL
                ORDER BY lf.periodo DESC, lf.fecha_lectura DESC, lf.id DESC 
                LIMIT 1
            ) as ultima_lectura_medidor,
            -- Consumo del mes anterior o último registrado
            COALESCE(
                (
                    SELECT lf.consumo_m3 
                    FROM lecturas lf 
                    WHERE lf.medidor_id = m.id 
                      AND lf.periodo = ?
                    LIMIT 1
                ),
                (
                    SELECT lf.consumo_m3 
                    FROM lecturas lf 
                    WHERE lf.medidor_id = m.id 
                      AND lf.periodo < ?
                    ORDER BY lf.periodo DESC, lf.id DESC 
                    LIMIT 1
                ),
                (
                    SELECT lf.consumo_m3 
                    FROM lecturas lf 
                    JOIN medidores m_all ON lf.medidor_id = m_all.id 
                    WHERE m_all.cliente_id = c.id 
                      AND lf.periodo = ?
                    LIMIT 1
                ),
                (
                    SELECT lf.consumo_m3 
                    FROM lecturas lf 
                    JOIN medidores m_all ON lf.medidor_id = m_all.id 
                    WHERE m_all.cliente_id = c.id 
                      AND lf.periodo < ?
                    ORDER BY lf.periodo DESC, lf.id DESC 
                    LIMIT 1
                ),
                0
            ) as consumo_anterior,
            -- Medidor anterior retirado si hubo cambio
            (
                SELECT m_prev.numero_serie 
                FROM medidores m_prev 
                WHERE m_prev.cliente_id = c.id 
                  AND m_prev.id != m.id 
                  AND m_prev.estado_medidor = 'Retirado'
                ORDER BY m_prev.id DESC 
                LIMIT 1
            ) as medidor_anterior_serie
        FROM clientes c
        LEFT JOIN medidores m ON c.id = m.cliente_id AND m.estado_medidor != 'Retirado'
        WHERE c.estado_cliente = 'Activo'
    `;

    const params = [mes, mes + '-01', mesAnterior, mes, mesAnterior, mes];

    if (localidad) {
        query += ` AND c.ciudad = ?`;
        params.push(localidad);
    }

    query += ` ORDER BY c.ciudad, c.nombre`;

    const result = await db.execute({ sql: query, args: params });

    // Agrupación por Localidad
    const porLocalidad = {};
    let totalClientes = 0;

    result.rows.forEach(row => {
        const loc = row.localidad || 'Sin Localidad';
        if (!porLocalidad[loc]) {
            porLocalidad[loc] = [];
        }

        const tieneMedidor = !!row.medidor_id;
        let lecturaFisica = null;
        let esCambioMedidor = false;
        let esMedidorNuevo = false;

        if (tieneMedidor) {
            const tieneLecturaPrevia = row.ultima_lectura_medidor !== null && row.ultima_lectura_medidor !== undefined;

            if (tieneLecturaPrevia) {
                const num = Number(row.ultima_lectura_medidor);
                lecturaFisica = isNaN(num) ? 0 : num;
            } else {
                // Es su primera lectura en este medidor: usar lectura base
                const base = (row.lectura_base !== null && row.lectura_base !== undefined)
                    ? Number(row.lectura_base)
                    : 0;
                lecturaFisica = isNaN(base) ? 0 : base;

                // Solo en esta primera toma se muestra si fue cambio o medidor nuevo
                if (row.medidor_anterior_serie) {
                    esCambioMedidor = true;
                } else {
                    esMedidorNuevo = true;
                }
            }
        }

        porLocalidad[loc].push({
            id: row.cliente_id,
            numero_predio: row.numero_predio || null,
            cliente: row.cliente_nombre,
            direccion: row.direccion || '',
            sin_medidor: !tieneMedidor,
            medidor: tieneMedidor ? {
                serie: row.numero_serie,
                ubicacion: row.medidor_ubicacion,
                coordenadas: {
                    lat: row.latitud ? Number(row.latitud) : null,
                    lng: row.longitud ? Number(row.longitud) : null
                }
            } : null,
            lectura_anterior: tieneMedidor ? {
                periodo: mesAnterior,
                valor: lecturaFisica ?? 0,
                consumo_registrado: Number(row.consumo_anterior || 0),
                lectura_fisica: lecturaFisica,
                es_cambio_medidor: esCambioMedidor,
                es_medidor_nuevo: esMedidorNuevo,
                medidor_anterior_serie: row.medidor_anterior_serie || null
            } : null
        });
        totalClientes++;
    });

    // Formato array para respuesta
    const reporte = Object.keys(porLocalidad).map(key => ({
        localidad: key,
        total_clientes: porLocalidad[key].length,
        clientes: porLocalidad[key]
    }));

    return {
        periodo_solicitado: mes,
        periodo_lectura_anterior: mesAnterior,
        total_general: totalClientes,
        total_localidades: reporte.length,
        datos: reporte
    };

}
