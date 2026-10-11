/**
 * Servicio de rutas de lectura
 *
 * File: src/v2/services/rutasService.js
 *
 * Consultas y reglas de las rutas (medidores asignados, orden, progreso de captura).
 * Los errores de negocio se lanzan con crearError(mensaje, status, { datos }):
 * el controller responde { error: mensaje, ...datos }.
 */

import db from '../../database/db-sqlite.js';
import { crearError } from '../../utils/errores.js';

// Periodo a mostrar: el solicitado, o el mayor entre el mes actual y el último periodo con lecturas
const PERIODO_A_USAR_SQL = `
    SELECT COALESCE(?, (
        SELECT
            CASE
                WHEN strftime('%Y-%m', 'now') > MAX(periodo) THEN strftime('%Y-%m', 'now')
                ELSE MAX(periodo)
            END
        FROM lecturas
    )) AS periodo_a_usar
`;

/**
 * Crea una ruta con sus puntos (medidores en orden).
 * @returns {Promise<number>} id de la ruta creada
 */
export async function crearRuta({ nombre, descripcion, creado_por, distancia_km, ruta_calculada, instrucciones, puntos }) {
    // Obtener IDs únicos de medidores
    const medidorIds = puntos.map(p => p.id);
    const placeholders = medidorIds.map(() => '?').join(',');

    // Validar que todos los medidores existen
    const validarResult = await db.execute({
        sql: `SELECT id FROM medidores WHERE id IN (${placeholders})`,
        args: medidorIds
    });

    const encontrados = validarResult.rows.map(r => Number(r.id));
    const faltantes = medidorIds.filter(id => !encontrados.includes(id));

    if (faltantes.length > 0) {
        throw crearError('Algunos medidores no existen en la base de datos', 400, { datos: { faltantes } });
    }

    // Validar que los medidores no estén en otra ruta
    const duplicadosResult = await db.execute({
        sql: `
            SELECT medidor_id, ruta_id
            FROM rutas_puntos
            WHERE medidor_id IN (${placeholders})
        `,
        args: medidorIds
    });

    if (duplicadosResult.rows.length > 0) {
        const medidoresDuplicados = duplicadosResult.rows.map(r => ({
            medidor_id: Number(r.medidor_id),
            ruta_id: Number(r.ruta_id)
        }));
        throw crearError('Algunos medidores ya están asignados a otras rutas', 409, { datos: { medidores_duplicados: medidoresDuplicados } });
    }

    // Crear la ruta
    const rutaJSON = JSON.stringify(ruta_calculada || []);
    const instruccionesJSON = JSON.stringify(instrucciones || []);

    const rutaResult = await db.execute({
        sql: `
            INSERT INTO rutas (nombre, descripcion, creado_por, distancia_km, ruta_json, instrucciones_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [nombre, descripcion, creado_por, distancia_km, rutaJSON, instruccionesJSON]
    });

    const ruta_id = Number(rutaResult.lastInsertRowid);

    // Insertar puntos en una transacción — atómico y mucho más rápido que N awaits
    if (puntos.length > 0) {
        const insertPuntoStmt = db.sqlite.prepare(
            `INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (?, ?, ?)`
        );
        const insertarPuntos = db.sqlite.transaction((pts) => {
            pts.forEach((p, i) => insertPuntoStmt.run(ruta_id, p.id, i + 1));
        });
        insertarPuntos(puntos);
    }

    return ruta_id;
}

/**
 * Listado paginado de rutas con el avance de captura del periodo.
 */
export async function listarRutas({ periodoParam, page, limit, search }) {
    const periodoResult = await db.execute({
        sql: PERIODO_A_USAR_SQL,
        args: [periodoParam || null]
    });

    const periodo = periodoResult.rows[0]?.periodo_a_usar;

    // --- Filtrado y paginación ---
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10; // Default 10 items (tarjetas)
    const offset = (pageNum - 1) * limitNum;
    const searchTerm = search ? `%${search}%` : null;

    let baseQuery = `
        FROM rutas r
        LEFT JOIN rutas_puntos rp ON rp.ruta_id = r.id
    `;

    let whereConditions = [];
    let whereArgs = [];

    if (searchTerm) {
        whereConditions.push(`(r.nombre LIKE ? OR r.descripcion LIKE ?)`);
        whereArgs.push(searchTerm, searchTerm);
    }

    // La paginación se aplica sobre el listado base de rutas; el filtro por estado
    // (completas/incompletas) lo hace el cliente sobre lo recibido.
    const whereClause = whereConditions.length > 0 ? ' WHERE ' + whereConditions.join(' AND ') : '';

    // 1. Contar total de rutas (para paginación)
    const countResult = await db.execute({
        sql: `SELECT COUNT(DISTINCT r.id) as total ${baseQuery} ${whereClause}`,
        args: whereArgs
    });
    const totalItems = Number(countResult.rows[0].total);

    // 2. Obtener IDs de rutas paginadas
    const rutasIdsResult = await db.execute({
        sql: `
            SELECT DISTINCT r.id, r.fecha_creacion
            ${baseQuery}
            ${whereClause}
            ORDER BY r.fecha_creacion DESC
            LIMIT ? OFFSET ?
        `,
        args: [...whereArgs, limitNum, offset]
    });

    const rutasPageIds = rutasIdsResult.rows.map(r => Number(r.id));

    const pagination = {
        total: totalItems,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalItems / limitNum)
    };

    if (rutasPageIds.length === 0) {
        return { periodo: periodo, rutas: [], pagination };
    }

    // 3. Obtener detalles SOLO de las rutas de esta página
    const idsPlaceholder = rutasPageIds.map(() => '?').join(',');
    const rutasResult = await db.execute({
        sql: `
            SELECT
                r.id,
                r.nombre,
                r.descripcion,
                r.fecha_creacion,
                r.distancia_km,
                r.creado_por,
                COUNT(DISTINCT rp.medidor_id) AS total_puntos
            FROM rutas r
            LEFT JOIN rutas_puntos rp ON rp.ruta_id = r.id
            WHERE r.id IN (${idsPlaceholder})
            GROUP BY r.id, r.nombre, r.descripcion, r.fecha_creacion, r.distancia_km, r.creado_por
            ORDER BY r.fecha_creacion DESC
        `,
        args: rutasPageIds
    });

    // Convertir BigInt a Number y procesar cada ruta
    const rutas = rutasResult.rows.map(row => ({
        ...row,
        id: Number(row.id),
        creado_por: Number(row.creado_por),
        total_puntos: Number(row.total_puntos)
    }));

    // Medidores de TODAS las rutas de la página en una sola query (evita N+1)
    const idsPlaceholder2 = rutasPageIds.map(() => '?').join(',');
    const medidoresBulkQuery = `
        WITH puntos_ruta AS (
            SELECT
                rp.ruta_id,
                rp.medidor_id,
                rp.orden
            FROM rutas_puntos rp
            WHERE rp.ruta_id IN (${idsPlaceholder2})

            UNION

            SELECT
                l.ruta_id,
                l.medidor_id,
                COALESCE(
                    rp.orden,
                    (
                        SELECT rp2.orden
                        FROM rutas_puntos rp2
                        JOIN medidores m2 ON rp2.medidor_id = m2.id
                        WHERE m2.cliente_id = COALESCE(
                            m.cliente_id,
                            (SELECT cmh.cliente_id FROM cliente_medidor_historial cmh WHERE cmh.medidor_id = l.medidor_id ORDER BY cmh.id DESC LIMIT 1),
                            (SELECT f.cliente_id FROM facturas f WHERE f.lectura_id = l.id LIMIT 1)
                        )
                        AND rp2.ruta_id = l.ruta_id
                        LIMIT 1
                    ),
                    CASE
                        WHEN INSTR(c_pred.numero_predio, '-') > 0
                        THEN CAST(SUBSTR(c_pred.numero_predio, INSTR(c_pred.numero_predio, '-') + 1) AS INTEGER)
                        ELSE CAST(c_pred.numero_predio AS INTEGER)
                    END,
                    9999
                ) AS orden
            FROM lecturas l
            JOIN medidores m ON l.medidor_id = m.id
            LEFT JOIN clientes c_pred ON c_pred.id = COALESCE(
                m.cliente_id,
                (SELECT cmh.cliente_id FROM cliente_medidor_historial cmh WHERE cmh.medidor_id = l.medidor_id ORDER BY cmh.id DESC LIMIT 1),
                (SELECT f.cliente_id FROM facturas f WHERE f.lectura_id = l.id LIMIT 1)
            )
            LEFT JOIN rutas_puntos rp ON rp.medidor_id = l.medidor_id AND rp.ruta_id = l.ruta_id
            WHERE l.periodo = ?
              AND l.ruta_id IN (${idsPlaceholder2})
        )
        SELECT
            pr.ruta_id,
            m.numero_serie,
            m.id AS medidor_id,
            CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END AS tiene_lectura
        FROM puntos_ruta pr
        JOIN medidores m ON pr.medidor_id = m.id
        LEFT JOIN lecturas l ON l.medidor_id = m.id
            AND l.ruta_id = pr.ruta_id
            AND l.periodo = ?
        ORDER BY pr.ruta_id, pr.orden ASC
    `;

    const medidoresBulkResult = await db.execute({
        sql: medidoresBulkQuery,
        args: [...rutasPageIds, periodo, ...rutasPageIds, periodo]
    });

    // Cuántas facturas existen por ruta en el período mostrado
    const facturasBulkResult = await db.execute({
        sql: `
            SELECT
                l.ruta_id,
                COUNT(f.id) AS facturas_generadas_periodo
            FROM lecturas l
            JOIN facturas f ON f.lectura_id = l.id
            WHERE l.periodo = ?
              AND l.ruta_id IN (${idsPlaceholder2})
            GROUP BY l.ruta_id
        `,
        args: [periodo, ...rutasPageIds]
    });

    const facturasPorRuta = new Map();
    for (const row of facturasBulkResult.rows) {
        facturasPorRuta.set(Number(row.ruta_id), Number(row.facturas_generadas_periodo || 0));
    }

    // Agrupar medidores por ruta_id en un Map para lookup O(1)
    const medidoresPorRuta = new Map();
    for (const row of medidoresBulkResult.rows) {
        const rid = Number(row.ruta_id);
        if (!medidoresPorRuta.has(rid)) medidoresPorRuta.set(rid, []);
        medidoresPorRuta.get(rid).push({
            medidor_id: Number(row.medidor_id),
            numero_serie: row.numero_serie,
            tiene_lectura: row.tiene_lectura
        });
    }

    // Construir objetos de ruta con estadísticas calculadas
    const rutasFinales = rutas.map(ruta => {
        const medidores = medidoresPorRuta.get(ruta.id) || [];
        const facturas_generadas_periodo = facturasPorRuta.get(ruta.id) || 0;

        // Si el periodo ya tiene facturación, se considera cerrado para captura:
        // no se muestran como pendientes medidores agregados posteriormente.
        const medidoresBase = facturas_generadas_periodo > 0
            ? medidores.filter(m => m.tiene_lectura === 1)
            : medidores;

        const numeros_serie = medidoresBase.map(m => m.numero_serie);
        const medidores_completados = medidoresBase.filter(m => m.tiene_lectura === 1).map(m => m.numero_serie);
        const medidores_faltantes = medidoresBase.filter(m => m.tiene_lectura === 0).map(m => m.numero_serie);
        const completadas = medidores_completados.length;
        const faltantes = medidores_faltantes.length;
        const total_puntos = medidoresBase.length;
        const porcentaje_completado = total_puntos > 0
            ? Math.round((completadas / total_puntos) * 100)
            : 0;
        return {
            id: ruta.id,
            nombre: ruta.nombre,
            descripcion: ruta.descripcion,
            fecha_creacion: ruta.fecha_creacion,
            distancia_km: ruta.distancia_km,
            creado_por: ruta.creado_por,
            total_puntos,
            completadas,
            faltantes,
            porcentaje_completado,
            numeros_serie,
            medidores_completados,
            medidores_faltantes,
            periodo_mostrado: periodo,
            facturas_generadas_periodo,
            tiene_facturacion_periodo: facturas_generadas_periodo > 0,
            periodo_cerrado: facturas_generadas_periodo > 0
        };
    });

    return { periodo: periodo, rutas: rutasFinales, pagination };
}

/** Agrega un medidor a una ruta (si no está ya en otra). */
export async function agregarMedidorARuta({ ruta_id, medidor_id, orden }) {
    // Verificar si el medidor ya está en otra ruta
    const verificarResult = await db.execute({
        sql: `
            SELECT ruta_id
            FROM rutas_puntos
            WHERE medidor_id = ?
        `,
        args: [medidor_id]
    });

    if (verificarResult.rows.length > 0) {
        const ruta_existente = Number(verificarResult.rows[0].ruta_id);
        throw crearError(`El medidor ya está asignado a la ruta ${ruta_existente}`, 409, { datos: { ruta_existente } });
    }

    await db.execute({
        sql: `
            INSERT INTO rutas_puntos (ruta_id, medidor_id, orden)
            VALUES (?, ?, ?)
        `,
        args: [ruta_id, medidor_id, orden]
    });
}

/**
 * Ruta con sus medidores en orden y los datos de lectura del período
 * (incluye medidores retirados/reasignados que tuvieron lectura en la ruta ese período).
 */
export async function obtenerRutaConMedidores(ruta_id, periodoParam) {
    // Determinar período a usar si no se proporcionó
    let periodo = periodoParam;
    if (!periodo) {
        const periodoResult = await db.execute({
            sql: PERIODO_A_USAR_SQL,
            args: [null]
        });
        periodo = periodoResult.rows[0]?.periodo_a_usar || new Date().toISOString().slice(0, 7);
    }

    const query = `
        WITH puntos_ruta AS (
            SELECT
                rp.ruta_id,
                rp.medidor_id,
                rp.orden
            FROM rutas_puntos rp
            WHERE rp.ruta_id = ?

            UNION

            SELECT
                l.ruta_id,
                l.medidor_id,
                COALESCE(
                    rp.orden,
                    (
                        SELECT rp2.orden
                        FROM rutas_puntos rp2
                        JOIN medidores m2 ON rp2.medidor_id = m2.id
                        WHERE m2.cliente_id = COALESCE(
                            m_hist.cliente_id,
                            (SELECT cmh.cliente_id FROM cliente_medidor_historial cmh WHERE cmh.medidor_id = l.medidor_id ORDER BY cmh.id DESC LIMIT 1),
                            (SELECT f.cliente_id FROM facturas f WHERE f.lectura_id = l.id LIMIT 1)
                        )
                        AND rp2.ruta_id = l.ruta_id
                        LIMIT 1
                    ),
                    CASE
                        WHEN INSTR(c_pred.numero_predio, '-') > 0
                        THEN CAST(SUBSTR(c_pred.numero_predio, INSTR(c_pred.numero_predio, '-') + 1) AS INTEGER)
                        ELSE CAST(c_pred.numero_predio AS INTEGER)
                    END,
                    9999
                ) AS orden
            FROM lecturas l
            JOIN medidores m_hist ON l.medidor_id = m_hist.id
            LEFT JOIN clientes c_pred ON c_pred.id = COALESCE(
                m_hist.cliente_id,
                (SELECT cmh.cliente_id FROM cliente_medidor_historial cmh WHERE cmh.medidor_id = l.medidor_id ORDER BY cmh.id DESC LIMIT 1),
                (SELECT f.cliente_id FROM facturas f WHERE f.lectura_id = l.id LIMIT 1)
            )
            LEFT JOIN rutas_puntos rp ON rp.medidor_id = l.medidor_id AND rp.ruta_id = l.ruta_id
            WHERE l.ruta_id = ? AND l.periodo = ?
        )
        SELECT
            r.id AS ruta_id,
            r.nombre AS ruta_nombre,
            r.descripcion AS ruta_descripcion,
            pr.orden,
            m.id AS medidor_id,
            m.numero_serie,
            m.ubicacion,
            m.latitud,
            m.longitud,
            m.estado_medidor,
            m.lectura_base,
            m.capacidad_maxima,
            COALESCE(c.id, c_hist.id, c_fac.id) AS cliente_id,
            COALESCE(c.nombre, c_hist.nombre, c_fac.nombre) AS cliente_nombre,
            COALESCE(c.numero_predio, c_hist.numero_predio, c_fac.numero_predio) AS cliente_numero_predio,
            COALESCE(c.direccion, c_hist.direccion, c_fac.direccion) AS cliente_direccion,
            COALESCE(c.telefono, c_hist.telefono, c_fac.telefono) AS cliente_telefono,
            COALESCE(c.estado_cliente, c_hist.estado_cliente, c_fac.estado_cliente, 'Activo') AS estado_cliente,
            (
                SELECT m_act.numero_serie
                FROM medidores m_act
                WHERE m_act.cliente_id = COALESCE(c.id, c_hist.id, c_fac.id)
                  AND m_act.id != m.id
                  AND m_act.estado_medidor = 'Activo'
                ORDER BY m_act.id DESC
                LIMIT 1
            ) AS medidor_actual_reemplazo,
            -- Datos de la lectura tomada específicamente en este período:
            lp.id AS lectura_id_periodo,
            lp.lectura_actual AS lectura_actual_periodo,
            lp.lectura_anterior AS lectura_anterior_periodo,
            lp.consumo_m3 AS consumo_periodo,
            lp.vuelta_cero AS vuelta_cero_periodo,
            lp.estado AS estado_lectura_periodo,
            lp.fecha_lectura AS fecha_lectura_periodo,
            -- Lectura anterior de referencia (la última registrada ANTES de este período):
            (
                SELECT l_ant.lectura_actual
                FROM lecturas l_ant
                WHERE l_ant.medidor_id = m.id
                  AND (l_ant.periodo < ? OR (l_ant.periodo IS NULL AND l_ant.fecha_lectura < ?))
                  AND l_ant.lectura_actual IS NOT NULL
                ORDER BY l_ant.periodo DESC, l_ant.fecha_lectura DESC
                LIMIT 1
            ) AS lectura_anterior_referencia,
            -- Última lectura absoluta registrada (fallback para compatibilidad):
            (
                SELECT l_ult.lectura_actual
                FROM lecturas l_ult
                WHERE l_ult.medidor_id = m.id AND l_ult.lectura_actual IS NOT NULL
                ORDER BY l_ult.fecha_lectura DESC
                LIMIT 1
            ) AS ultima_lectura_real,
            (
                SELECT l_ult.lectura_anterior
                FROM lecturas l_ult
                WHERE l_ult.medidor_id = m.id AND l_ult.lectura_actual IS NOT NULL
                ORDER BY l_ult.fecha_lectura DESC
                LIMIT 1
            ) AS ultima_lectura_anterior_real,
            (
                SELECT l_ult.id
                FROM lecturas l_ult
                WHERE l_ult.medidor_id = m.id AND l_ult.lectura_actual IS NOT NULL
                ORDER BY l_ult.fecha_lectura DESC
                LIMIT 1
            ) AS ultima_lectura_id_real
        FROM rutas r
        JOIN puntos_ruta pr ON r.id = pr.ruta_id
        JOIN medidores m ON pr.medidor_id = m.id
        LEFT JOIN clientes c ON m.cliente_id = c.id
        LEFT JOIN cliente_medidor_historial cmh ON cmh.medidor_id = m.id AND cmh.id = (
            SELECT id FROM cliente_medidor_historial WHERE medidor_id = m.id ORDER BY id DESC LIMIT 1
        )
        LEFT JOIN clientes c_hist ON cmh.cliente_id = c_hist.id
        LEFT JOIN lecturas lp ON lp.medidor_id = m.id AND lp.periodo = ? AND lp.ruta_id = r.id
        LEFT JOIN facturas f_fac ON lp.id IS NOT NULL AND f_fac.lectura_id = lp.id
        LEFT JOIN clientes c_fac ON f_fac.cliente_id = c_fac.id
        WHERE r.id = ?
        ORDER BY pr.orden ASC
    `;

    const [result, facturasCountResult] = await Promise.all([
        db.execute({
            sql: query,
            args: [ruta_id, ruta_id, periodo, periodo, `${periodo}-01`, periodo, ruta_id]
        }),
        db.execute({
            sql: `SELECT COUNT(f.id) AS facturas_generadas_periodo
                  FROM facturas f
                  JOIN lecturas l ON f.lectura_id = l.id
                  WHERE l.periodo = ? AND l.ruta_id = ?`,
            args: [periodo, ruta_id]
        })
    ]);

    if (result.rows.length === 0) throw crearError('Ruta no encontrada o sin medidores', 404);

    const facturasGeneradasPeriodo = Number(facturasCountResult.rows?.[0]?.facturas_generadas_periodo || 0);

    // Convertir BigInt a Number y construir respuesta compatible
    const rows = result.rows.map(row => ({
        ...row,
        ruta_id: Number(row.ruta_id),
        medidor_id: Number(row.medidor_id),
        cliente_id: row.cliente_id !== null && row.cliente_id !== undefined ? Number(row.cliente_id) : null
    }));

    const ruta = {
        ruta_id: rows[0].ruta_id,
        nombre: rows[0].ruta_nombre,
        descripcion: rows[0].ruta_descripcion,
        periodo: periodo,
        facturas_generadas_periodo: facturasGeneradasPeriodo,
        tiene_facturacion_periodo: facturasGeneradasPeriodo > 0,
        periodo_cerrado: facturasGeneradasPeriodo > 0,
        puntos: rows.map(r => {
            const tieneLectura = r.lectura_id_periodo !== null && r.lectura_id_periodo !== undefined;
            const lectActualNum = r.lectura_actual_periodo !== null && r.lectura_actual_periodo !== undefined ? Number(r.lectura_actual_periodo) : null;
            const lectAnteriorRegistrada = r.lectura_anterior_periodo !== null && r.lectura_anterior_periodo !== undefined ? Number(r.lectura_anterior_periodo) : null;
            const consumoRegistrado = r.consumo_periodo !== null && r.consumo_periodo !== undefined ? Number(r.consumo_periodo) : null;

            // Línea base para nueva lectura: anterior histórica a este período > lectura_base > null
            const lectAnteriorReferencia = r.lectura_anterior_referencia !== null && r.lectura_anterior_referencia !== undefined
                ? Number(r.lectura_anterior_referencia)
                : (r.lectura_base !== null && r.lectura_base !== undefined ? Number(r.lectura_base) : null);

            return {
                orden: r.orden,
                medidor_id: r.medidor_id,
                numero_serie: r.numero_serie,
                numero_predio: r.cliente_numero_predio || null,
                ubicacion: r.ubicacion,
                latitud: r.latitud,
                longitud: r.longitud,
                estado_medidor: r.estado_medidor,
                es_retirado: r.estado_medidor === 'Retirado',
                medidor_actual_reemplazo: r.medidor_actual_reemplazo || null,
                lectura_base: r.lectura_base !== null && r.lectura_base !== undefined ? Number(r.lectura_base) : null,
                capacidad_maxima: r.capacidad_maxima !== null && r.capacidad_maxima !== undefined ? Number(r.capacidad_maxima) : null,
                // Datos específicos del período consultado:
                tiene_lectura: tieneLectura ? 1 : 0,
                lectura_actual: lectActualNum,
                lectura_anterior: lectAnteriorRegistrada,
                consumo_m3: consumoRegistrado,
                vuelta_cero: r.vuelta_cero_periodo === 1,
                lectura_id: r.lectura_id_periodo ? Number(r.lectura_id_periodo) : null,
                estado_lectura: r.estado_lectura_periodo || (tieneLectura ? 'pendiente' : null),
                periodo_consultado: periodo,
                // Campos legacy compatibles:
                lectura_anterior_disponible: lectAnteriorReferencia,
                ultima_lectura_anterior: lectAnteriorRegistrada !== null ? lectAnteriorRegistrada : lectAnteriorReferencia,
                ultima_lectura_id: r.lectura_id_periodo ? Number(r.lectura_id_periodo) : (r.ultima_lectura_id_real ? Number(r.ultima_lectura_id_real) : null),
                cliente_id: r.cliente_id,
                cliente_nombre: r.cliente_nombre,
                cliente_numero_predio: r.cliente_numero_predio || null,
                cliente_direccion: r.cliente_direccion,
                cliente_telefono: r.cliente_telefono,
                estado_cliente: r.estado_cliente
            };
        })
    };

    return { ruta };
}

/**
 * Actualiza datos de la ruta y, si se envían puntos, reemplaza sus medidores.
 * @returns {Promise<{ nombreActual: string, medidores_actualizados: number }>}
 */
export async function modificarRuta(ruta_id, { nombre, descripcion, distancia_km, ruta_calculada, instrucciones, puntos }) {
    // Verificar que la ruta existe
    const verificarResult = await db.execute({
        sql: `SELECT id, nombre FROM rutas WHERE id = ?`,
        args: [ruta_id]
    });

    if (verificarResult.rows.length === 0) throw crearError('Ruta no encontrada', 404);

    // Si se envían puntos, validar que los medidores no estén en otra ruta
    if (puntos && Array.isArray(puntos) && puntos.length > 0) {
        const medidorIds = puntos.map(p => p.id);
        const placeholders = medidorIds.map(() => '?').join(',');

        const checkResult = await db.execute({
            sql: `
                SELECT m.id, m.numero_serie, r.id as ruta_id, r.nombre as ruta_nombre
                FROM medidores m
                LEFT JOIN rutas_puntos rp ON m.id = rp.medidor_id
                LEFT JOIN rutas r ON rp.ruta_id = r.id
                WHERE m.id IN (${placeholders})
                AND rp.ruta_id IS NOT NULL
                AND rp.ruta_id != ?
            `,
            args: [...medidorIds, ruta_id]
        });

        if (checkResult.rows.length > 0) {
            const conflictos = checkResult.rows.map(row => ({
                medidor_id: Number(row.id),
                numero_serie: row.numero_serie,
                ruta_actual: row.ruta_nombre
            }));
            throw crearError('Algunos medidores ya están asignados a otra ruta', 409, { datos: { conflictos: conflictos } });
        }
    }

    // Construir query de actualización dinámica
    const updates = [];
    const args = [];

    if (nombre !== undefined) {
        updates.push('nombre = ?');
        args.push(nombre);
    }
    if (descripcion !== undefined) {
        updates.push('descripcion = ?');
        args.push(descripcion);
    }
    if (distancia_km !== undefined) {
        updates.push('distancia_km = ?');
        args.push(distancia_km);
    }
    if (ruta_calculada !== undefined) {
        updates.push('ruta_json = ?');
        args.push(JSON.stringify(ruta_calculada));
    }
    if (instrucciones !== undefined) {
        updates.push('instrucciones_json = ?');
        args.push(JSON.stringify(instrucciones));
    }

    // Actualizar información de la ruta si hay cambios
    if (updates.length > 0) {
        args.push(ruta_id);
        await db.execute({
            sql: `
                UPDATE rutas
                SET ${updates.join(', ')}
                WHERE id = ?
            `,
            args: args
        });
    }

    // Si se envían puntos, reemplazar todos los medidores de la ruta
    let medidores_actualizados = 0;
    if (puntos && Array.isArray(puntos)) {
        // 1. Eliminar todos los medidores actuales de la ruta
        await db.execute({
            sql: `DELETE FROM rutas_puntos WHERE ruta_id = ?`,
            args: [ruta_id]
        });

        // 2. Insertar los nuevos medidores en una transacción
        if (puntos.length > 0) {
            const insertPuntoStmt = db.sqlite.prepare(
                `INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (?, ?, ?)`
            );
            const insertarPuntos = db.sqlite.transaction((pts) => {
                pts.forEach((p, i) => insertPuntoStmt.run(Number(ruta_id), p.id, i + 1));
            });
            insertarPuntos(puntos);
            medidores_actualizados = puntos.length;
        }
    }

    return { nombreActual: verificarResult.rows[0].nombre, medidores_actualizados };
}

/**
 * Quita un medidor de la ruta y recorre el orden de los siguientes.
 * @returns {Promise<number>} orden que tenía el medidor eliminado
 */
export async function eliminarMedidorDeRuta(ruta_id, medidor_id) {
    // Verificar que el medidor está en la ruta
    const verificarResult = await db.execute({
        sql: `
            SELECT orden
            FROM rutas_puntos
            WHERE ruta_id = ? AND medidor_id = ?
        `,
        args: [ruta_id, medidor_id]
    });

    if (verificarResult.rows.length === 0) throw crearError('El medidor no está en esta ruta', 404);

    const ordenEliminado = verificarResult.rows[0].orden;

    // Eliminar el medidor de la ruta
    await db.execute({
        sql: `
            DELETE FROM rutas_puntos
            WHERE ruta_id = ? AND medidor_id = ?
        `,
        args: [ruta_id, medidor_id]
    });

    // Reordenar automáticamente los medidores restantes
    await db.execute({
        sql: `
            UPDATE rutas_puntos
            SET orden = orden - 1
            WHERE ruta_id = ? AND orden > ?
        `,
        args: [ruta_id, ordenEliminado]
    });

    return ordenEliminado;
}

/** Aplica un nuevo orden a los medidores de la ruta (todos deben pertenecer a ella). */
export async function reordenarMedidores(ruta_id, orden) {
    // Verificar que todos los medidores pertenecen a la ruta
    const medidorIds = orden.map(o => o.medidor_id);
    const placeholders = medidorIds.map(() => '?').join(',');

    const verificarResult = await db.execute({
        sql: `
            SELECT medidor_id
            FROM rutas_puntos
            WHERE ruta_id = ? AND medidor_id IN (${placeholders})
        `,
        args: [ruta_id, ...medidorIds]
    });

    if (verificarResult.rows.length !== medidorIds.length) {
        throw crearError('Algunos medidores no pertenecen a esta ruta', 400);
    }

    // Actualizar el orden de todos los medidores en una sola transacción
    const reordenarStmt = db.sqlite.prepare(
        `UPDATE rutas_puntos SET orden = ? WHERE ruta_id = ? AND medidor_id = ?`
    );
    const reordenarTodos = db.sqlite.transaction((items) => {
        items.forEach(item => reordenarStmt.run(item.orden, Number(ruta_id), item.medidor_id));
    });
    reordenarTodos(orden);
}

/** Progreso de captura de lecturas de la ruta en un período. */
export async function obtenerProgresoCapturaRuta(ruta_id, periodoParam) {
    const periodoResult = await db.execute({
        sql: PERIODO_A_USAR_SQL,
        args: [periodoParam || null]
    });

    const periodo = periodoResult.rows[0]?.periodo_a_usar;

    // Obtener información de la ruta
    const rutaResult = await db.execute({
        sql: `
            SELECT id, nombre, descripcion
            FROM rutas
            WHERE id = ?
        `,
        args: [ruta_id]
    });

    if (rutaResult.rows.length === 0) throw crearError('Ruta no encontrada', 404);

    const ruta = rutaResult.rows[0];

    // Si ya existen facturas para la ruta en este periodo, se trata como periodo cerrado.
    const cierrePeriodoResult = await db.execute({
        sql: `
            SELECT COUNT(*) AS total_facturas
            FROM facturas f
            JOIN lecturas l ON l.id = f.lectura_id
            WHERE l.ruta_id = ? AND l.periodo = ?
        `,
        args: [ruta_id, periodo]
    });
    const totalFacturasPeriodo = Number(cierrePeriodoResult.rows[0]?.total_facturas || 0);
    const periodoCerrado = totalFacturasPeriodo > 0;

    // Obtener estadísticas detalladas
    const statsResult = await db.execute({
        sql: `
            SELECT
                COUNT(DISTINCT rp.medidor_id) as total_medidores,
                COUNT(DISTINCT CASE WHEN l.id IS NOT NULL THEN rp.medidor_id END) as medidores_leidos,
                COUNT(DISTINCT CASE WHEN l.id IS NULL THEN rp.medidor_id END) as medidores_pendientes
            FROM rutas_puntos rp
            LEFT JOIN lecturas l ON l.medidor_id = rp.medidor_id
                AND l.ruta_id = rp.ruta_id
                AND l.periodo = ?
            WHERE rp.ruta_id = ?
        `,
        args: [periodo, ruta_id]
    });

    const stats = statsResult.rows[0];
    const totalRaw = Number(stats.total_medidores);
    const leidosRaw = Number(stats.medidores_leidos);
    const pendientesRaw = Number(stats.medidores_pendientes);

    // Obtener lista detallada de medidores con su estado
    const medidoresResult = await db.execute({
        sql: `
            SELECT
                m.id as medidor_id,
                m.numero_serie,
                m.ubicacion,
                rp.orden,
                c.nombre as cliente_nombre,
                CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END as tiene_lectura,
                l.consumo_m3,
                l.fecha_lectura
            FROM rutas_puntos rp
            JOIN medidores m ON rp.medidor_id = m.id
            LEFT JOIN clientes c ON m.cliente_id = c.id
            LEFT JOIN lecturas l ON l.medidor_id = m.id
                AND l.ruta_id = rp.ruta_id
                AND l.periodo = ?
            WHERE rp.ruta_id = ?
            ORDER BY rp.orden ASC
        `,
        args: [periodo, ruta_id]
    });

    const medidoresRaw = medidoresResult.rows.map(row => ({
        medidor_id: Number(row.medidor_id),
        numero_serie: row.numero_serie,
        ubicacion: row.ubicacion,
        orden: row.orden,
        cliente_nombre: row.cliente_nombre,
        estado: row.tiene_lectura === 1 ? 'Leído' : 'Pendiente',
        consumo: row.consumo_m3,
        fecha_lectura: row.fecha_lectura
    }));

    // En periodo cerrado, solo mostrar/contar medidores ya leídos para ese periodo.
    const medidores = periodoCerrado
        ? medidoresRaw.filter(m => m.estado === 'Leído')
        : medidoresRaw;

    const total = periodoCerrado ? medidores.length : totalRaw;
    const leidos = periodoCerrado ? medidores.length : leidosRaw;
    const pendientes = periodoCerrado ? 0 : pendientesRaw;
    const porcentaje = total > 0 ? Math.round((leidos / total) * 100) : 0;

    const medidores_leidos = medidores.filter(m => m.estado === 'Leído');
    const medidores_pendientes = medidores.filter(m => m.estado === 'Pendiente');

    return {
        ruta: {
            id: Number(ruta.id),
            nombre: ruta.nombre,
            descripcion: ruta.descripcion
        },
        periodo: periodo,
        resumen: {
            total_medidores: total,
            medidores_leidos: leidos,
            medidores_pendientes: pendientes,
            porcentaje_completado: porcentaje,
            porcentaje_pendiente: 100 - porcentaje,
            periodo_cerrado: periodoCerrado,
            total_facturas_periodo: totalFacturasPeriodo
        },
        detalle: {
            medidores_leidos: medidores_leidos,
            medidores_pendientes: medidores_pendientes
        },
        todos_los_medidores: medidores
    };
}
