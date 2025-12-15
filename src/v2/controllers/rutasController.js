/**
 * Controlador de Rutas - V2
 * 
 * File: src/v2/controllers/rutasController.js
 * 
 * Descripción: Controlador para manejar operaciones relacionadas con rutas con compatibilidad V1.
 * 
 * Cambios en V2:
 * - Migración de SQLite3 a Turso (@libsql/client)
 * - Reemplazo de WebSockets con Server-Sent Events (SSE)
 * - Mantiene SOLO las funcionalidades de V1
 * - Respeta el esquema de la base de datos
 * - Conversión BigInt a Number para compatibilidad JSON
 * 
 * Funciones V1 implementadas (compatibilidad completa):
 * - crearRuta: Crear ruta con puntos y orden
 * - listarRutas: Listar rutas con información de lecturas
 * - agregarMedidorARuta: Agregar medidor a ruta existente
 * - obtenerRutaConMedidores: Obtener ruta completa con medidores ordenados
 */

import dbTurso from '../../database/db-turso.js';

// Managers SSE - Configurados dinámicamente
let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

const rutasController = {

    // =====================================================
    // FUNCIONES V1 - COMPATIBILIDAD COMPLETA
    // =====================================================

    /**
     * Crear ruta (V1 compatible)
     */
    crearRuta: async (req, res) => {
        try {
            const {
                nombre,
                descripcion,
                creado_por,
                distancia_km,
                ruta_calculada,
                instrucciones,
                puntos // contiene los medidores con su id
            } = req.body;

            if (!nombre || !creado_por || !Array.isArray(puntos) || puntos.some(p => !p.id)) {
                return res.status(400).json({ error: 'Faltan campos requeridos o puntos inválidos' });
            }

            // Obtener IDs únicos de medidores
            const medidorIds = puntos.map(p => p.id);
            const placeholders = medidorIds.map(() => '?').join(',');

            // Validar que todos los medidores existen
            const validarQuery = `SELECT id FROM medidores WHERE id IN (${placeholders})`;
            const validarResult = await dbTurso.execute({
                sql: validarQuery,
                args: medidorIds
            });

            const encontrados = validarResult.rows.map(r => Number(r.id)); // Convertir BigInt a Number
            const faltantes = medidorIds.filter(id => !encontrados.includes(id));

            if (faltantes.length > 0) {
                return res.status(400).json({
                    error: 'Algunos medidores no existen en la base de datos',
                    faltantes
                });
            }

            // Validar que los medidores no estén en otra ruta
            const duplicadosQuery = `
                SELECT medidor_id, ruta_id 
                FROM rutas_puntos 
                WHERE medidor_id IN (${placeholders})
            `;
            const duplicadosResult = await dbTurso.execute({
                sql: duplicadosQuery,
                args: medidorIds
            });

            if (duplicadosResult.rows.length > 0) {
                const medidoresDuplicados = duplicadosResult.rows.map(r => ({
                    medidor_id: Number(r.medidor_id),
                    ruta_id: Number(r.ruta_id)
                }));

                return res.status(409).json({
                    error: 'Algunos medidores ya están asignados a otras rutas',
                    medidores_duplicados: medidoresDuplicados
                });
            }

            // Crear la ruta
            const rutaJSON = JSON.stringify(ruta_calculada || []);
            const instruccionesJSON = JSON.stringify(instrucciones || []);

            const insertRutaQuery = `
                INSERT INTO rutas (nombre, descripcion, creado_por, distancia_km, ruta_json, instrucciones_json)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            const rutaResult = await dbTurso.execute({
                sql: insertRutaQuery,
                args: [nombre, descripcion, creado_por, distancia_km, rutaJSON, instruccionesJSON]
            });

            const ruta_id = Number(rutaResult.lastInsertRowid); // Convertir BigInt a Number

            // Insertar puntos de la ruta
            const insertPuntoQuery = `
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden)
                VALUES (?, ?, ?)
            `;

            for (let index = 0; index < puntos.length; index++) {
                const punto = puntos[index];
                await dbTurso.execute({
                    sql: insertPuntoQuery,
                    args: [ruta_id, punto.id, index + 1]
                });
            }

            // Datos completos de la ruta para notificaciones SSE
            const rutaCompleta = {
                id: ruta_id,
                nombre,
                descripcion,
                creado_por,
                distancia_km,
                ruta_calculada,
                instrucciones,
                puntos: puntos.map((punto, index) => ({
                    medidor_id: punto.id,
                    orden: index + 1
                })),
                fecha_creacion: new Date().toISOString()
            };

            // Enviar notificaciones SSE (reemplaza WebSockets de V1)
            if (notificationManager) {
                try {
                    // Notificar a operadores sobre nueva ruta
                    notificationManager.notificacionPersonalizada('ruta_creada', {
                        message: `Nueva ruta "${nombre}" creada`,
                        ruta: rutaCompleta,
                        timestamp: new Date().toISOString()
                    });

                    // Notificar a administradores
                    notificationManager.alertaSistema(
                        `Ruta "${nombre}" creada con ${puntos.length} puntos`,
                        'success',
                        {
                            ruta: rutaCompleta,
                            creado_por_id: creado_por
                        }
                    );

                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            // Respuesta compatible con V1
            return res.status(201).json({
                mensaje: '✅ Ruta creada correctamente',
                ruta_id,
                detalles: rutaCompleta
            });

        } catch (error) {
            console.error('❌ Error al crear ruta v2:', error);
            res.status(500).json({ error: 'Error interno del servidor al crear la ruta' });
        }
    },

    /**
     * Listar rutas (V1 compatible)
     */
    listarRutas: async (req, res) => {
        try {
            const periodoParam = req.query.periodo; // Ejemplo: '2025-08'

            // Primero obtenemos el período a usar (igual que V1)
            const periodoQuery = `
                SELECT COALESCE(?, (
                    SELECT 
                        CASE 
                            WHEN strftime('%Y-%m', 'now') > MAX(periodo) THEN strftime('%Y-%m', 'now')
                            ELSE MAX(periodo)
                        END 
                    FROM lecturas
                )) AS periodo_a_usar
            `;

            const periodoResult = await dbTurso.execute({
                sql: periodoQuery,
                args: [periodoParam || null]
            });

            const periodo = periodoResult.rows[0]?.periodo_a_usar;

            // Query principal para obtener información detallada de rutas (igual que V1)
            const query = `
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
                GROUP BY r.id, r.nombre, r.descripcion, r.fecha_creacion, r.distancia_km, r.creado_por
                ORDER BY r.fecha_creacion DESC
            `;

            const rutasResult = await dbTurso.execute({ sql: query });

            if (rutasResult.rows.length === 0) {
                return res.status(200).json({
                    periodo: periodo,
                    rutas: []
                });
            }

            // Convertir BigInt a Number y procesar cada ruta
            const rutas = rutasResult.rows.map(row => ({
                ...row,
                id: Number(row.id),
                creado_por: Number(row.creado_por),
                total_puntos: Number(row.total_puntos)
            }));

            // Para cada ruta, obtener información detallada de medidores (igual que V1)
            const rutasDetalladas = [];

            for (let index = 0; index < rutas.length; index++) {
                const ruta = rutas[index];
                
                const medidoresQuery = `
                    SELECT 
                        m.numero_serie,
                        m.id as medidor_id,
                        CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END as tiene_lectura
                    FROM rutas_puntos rp
                    JOIN medidores m ON rp.medidor_id = m.id
                    LEFT JOIN lecturas l ON l.medidor_id = m.id 
                        AND l.ruta_id = rp.ruta_id 
                        AND l.periodo = ?
                    WHERE rp.ruta_id = ?
                    ORDER BY rp.orden ASC
                `;

                const medidoresResult = await dbTurso.execute({
                    sql: medidoresQuery,
                    args: [periodo, ruta.id]
                });

                const medidores = medidoresResult.rows.map(row => ({
                    ...row,
                    medidor_id: Number(row.medidor_id)
                }));

                // Procesar datos de medidores (igual que V1)
                const numeros_serie = medidores.map(m => m.numero_serie);
                const medidores_completados = medidores
                    .filter(m => m.tiene_lectura === 1)
                    .map(m => m.numero_serie);
                const medidores_faltantes = medidores
                    .filter(m => m.tiene_lectura === 0)
                    .map(m => m.numero_serie);
                
                const completadas = medidores_completados.length;
                const faltantes = medidores_faltantes.length;
                const total_puntos = medidores.length;
                const porcentaje_completado = total_puntos > 0 
                    ? Math.round((completadas / total_puntos) * 100) 
                    : 0;

                // Construir objeto de ruta con información completa (igual que V1)
                const rutaDetallada = {
                    id: ruta.id,
                    nombre: ruta.nombre,
                    descripcion: ruta.descripcion,
                    fecha_creacion: ruta.fecha_creacion,
                    distancia_km: ruta.distancia_km,
                    creado_por: ruta.creado_por,
                    total_puntos: total_puntos,
                    completadas: completadas,
                    faltantes: faltantes,
                    porcentaje_completado: porcentaje_completado,
                    numeros_serie: numeros_serie,
                    medidores_completados: medidores_completados,
                    medidores_faltantes: medidores_faltantes,
                    periodo_mostrado: periodo
                };

                rutasDetalladas.push(rutaDetallada);
            }

            // Filtrar elementos undefined y ordenar por fecha de creación (igual que V1)
            const rutasFinales = rutasDetalladas
                .filter(r => r !== undefined)
                .sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));

            return res.status(200).json({
                periodo: periodo,
                rutas: rutasFinales
            });

        } catch (error) {
            console.error('❌ Error al listar rutas v2:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Agregar medidor a ruta (V1 compatible)
     */
    agregarMedidorARuta: async (req, res) => {
        try {
            const { ruta_id, medidor_id, orden } = req.body;

            if (!ruta_id || !medidor_id || orden == null) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            // Verificar si el medidor ya está en otra ruta
            const verificarQuery = `
                SELECT ruta_id 
                FROM rutas_puntos 
                WHERE medidor_id = ?
            `;
            const verificarResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [medidor_id]
            });

            if (verificarResult.rows.length > 0) {
                const ruta_existente = Number(verificarResult.rows[0].ruta_id);
                return res.status(409).json({ 
                    error: `El medidor ya está asignado a la ruta ${ruta_existente}`,
                    ruta_existente
                });
            }

            const query = `
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden)
                VALUES (?, ?, ?)
            `;

            await dbTurso.execute({
                sql: query,
                args: [ruta_id, medidor_id, orden]
            });

            return res.status(201).json({ mensaje: 'Medidor agregado a la ruta' });

        } catch (error) {
            console.error('Error al agregar medidor v2:', error);
            return res.status(500).json({ error: 'No se pudo agregar el medidor. Verifica si ya existe en la ruta.' });
        }
    },

    /**
     * Obtener ruta con medidores (V1 compatible)
     */
    obtenerRutaConMedidores: async (req, res) => {
        try {
            const { ruta_id } = req.params;

            const query = `
                SELECT 
                    r.id AS ruta_id, 
                    r.nombre AS ruta_nombre, 
                    r.descripcion AS ruta_descripcion, 
                    rp.orden, 
                    m.id AS medidor_id, 
                    m.numero_serie, 
                    m.ubicacion,
                    m.latitud,
                    m.longitud,
                    m.estado_medidor,
                    c.id AS cliente_id,
                    c.nombre AS cliente_nombre,
                    c.direccion AS cliente_direccion,
                    c.telefono AS cliente_telefono,
                    c.estado_cliente
                FROM rutas r
                JOIN rutas_puntos rp ON r.id = rp.ruta_id
                JOIN medidores m ON rp.medidor_id = m.id
                JOIN clientes c ON m.cliente_id = c.id
                WHERE r.id = ?
                ORDER BY rp.orden ASC
            `;

            const result = await dbTurso.execute({
                sql: query,
                args: [ruta_id]
            });

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Ruta no encontrada o sin medidores' });
            }

            // Convertir BigInt a Number y construir respuesta igual que V1
            const rows = result.rows.map(row => ({
                ...row,
                ruta_id: Number(row.ruta_id),
                medidor_id: Number(row.medidor_id),
                cliente_id: Number(row.cliente_id)
            }));

            const ruta = {
                ruta_id: rows[0].ruta_id,
                nombre: rows[0].ruta_nombre,
                descripcion: rows[0].ruta_descripcion,
                puntos: rows.map(r => ({
                    orden: r.orden,
                    medidor_id: r.medidor_id,
                    numero_serie: r.numero_serie,
                    ubicacion: r.ubicacion,
                    latitud: r.latitud,
                    longitud: r.longitud,
                    estado_medidor: r.estado_medidor,
                    cliente_id: r.cliente_id,
                    cliente_nombre: r.cliente_nombre,
                    cliente_direccion: r.cliente_direccion,
                    cliente_telefono: r.cliente_telefono,
                    estado_cliente: r.estado_cliente
                }))
            };

            return res.status(200).json({ ruta });

        } catch (error) {
            console.error('❌ Error al obtener ruta v2:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    // =====================================================
    // NUEVAS FUNCIONES - V2
    // =====================================================

    /**
     * Modificar ruta - UPDATE
     * PUT /api/v2/rutas/:ruta_id
     * Body: { nombre?, descripcion?, distancia_km?, ruta_calculada?, instrucciones? }
     */
    modificarRuta: async (req, res) => {
        try {
            const { ruta_id } = req.params;
            const { nombre, descripcion, distancia_km, ruta_calculada, instrucciones } = req.body;

            if (!ruta_id) {
                return res.status(400).json({ error: 'ID de ruta requerido' });
            }

            // Verificar que la ruta existe
            const verificarQuery = `SELECT id, nombre FROM rutas WHERE id = ?`;
            const verificarResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [ruta_id]
            });

            if (verificarResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ruta no encontrada' });
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

            if (updates.length === 0) {
                return res.status(400).json({ error: 'No hay campos para actualizar' });
            }

            args.push(ruta_id);

            const updateQuery = `
                UPDATE rutas 
                SET ${updates.join(', ')}
                WHERE id = ?
            `;

            await dbTurso.execute({
                sql: updateQuery,
                args: args
            });

            // Notificar cambios
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Ruta "${nombre || verificarResult.rows[0].nombre}" actualizada`,
                        'info',
                        {
                            ruta_id: Number(ruta_id),
                            campos_actualizados: Object.keys(req.body)
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            return res.status(200).json({
                success: true,
                mensaje: 'Ruta actualizada correctamente',
                ruta_id: Number(ruta_id)
            });

        } catch (error) {
            console.error('❌ Error al modificar ruta:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Eliminar medidor de ruta - DELETE relación
     * DELETE /api/v2/rutas/:ruta_id/medidores/:medidor_id
     * Quita el medidor y reordena automáticamente
     */
    eliminarMedidorDeRuta: async (req, res) => {
        try {
            const { ruta_id, medidor_id } = req.params;

            if (!ruta_id || !medidor_id) {
                return res.status(400).json({ error: 'ID de ruta y medidor requeridos' });
            }

            // Verificar que el medidor está en la ruta
            const verificarQuery = `
                SELECT orden 
                FROM rutas_puntos 
                WHERE ruta_id = ? AND medidor_id = ?
            `;
            const verificarResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [ruta_id, medidor_id]
            });

            if (verificarResult.rows.length === 0) {
                return res.status(404).json({ error: 'El medidor no está en esta ruta' });
            }

            const ordenEliminado = verificarResult.rows[0].orden;

            // Eliminar el medidor de la ruta
            const deleteQuery = `
                DELETE FROM rutas_puntos 
                WHERE ruta_id = ? AND medidor_id = ?
            `;
            await dbTurso.execute({
                sql: deleteQuery,
                args: [ruta_id, medidor_id]
            });

            // Reordenar automáticamente los medidores restantes
            const reordenarQuery = `
                UPDATE rutas_puntos 
                SET orden = orden - 1
                WHERE ruta_id = ? AND orden > ?
            `;
            await dbTurso.execute({
                sql: reordenarQuery,
                args: [ruta_id, ordenEliminado]
            });

            // Notificar cambios
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Medidor removido de ruta`,
                        'info',
                        {
                            ruta_id: Number(ruta_id),
                            medidor_id: Number(medidor_id),
                            orden_eliminado: ordenEliminado
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            return res.status(200).json({
                success: true,
                mensaje: 'Medidor eliminado de la ruta y orden actualizado',
                ruta_id: Number(ruta_id),
                medidor_id: Number(medidor_id)
            });

        } catch (error) {
            console.error('❌ Error al eliminar medidor de ruta:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Reordenar medidores - UPDATE especializada
     * PUT /api/v2/rutas/:ruta_id/reordenar
     * Body: { orden: [{ medidor_id: 1, orden: 1 }, { medidor_id: 2, orden: 2 }, ...] }
     */
    reordenarMedidores: async (req, res) => {
        try {
            const { ruta_id } = req.params;
            const { orden } = req.body;

            if (!ruta_id || !Array.isArray(orden) || orden.length === 0) {
                return res.status(400).json({ 
                    error: 'ID de ruta y array de orden requeridos',
                    ejemplo: { orden: [{ medidor_id: 1, orden: 1 }, { medidor_id: 2, orden: 2 }] }
                });
            }

            // Verificar que todos los medidores pertenecen a la ruta
            const medidorIds = orden.map(o => o.medidor_id);
            const placeholders = medidorIds.map(() => '?').join(',');

            const verificarQuery = `
                SELECT medidor_id 
                FROM rutas_puntos 
                WHERE ruta_id = ? AND medidor_id IN (${placeholders})
            `;
            const verificarResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [ruta_id, ...medidorIds]
            });

            if (verificarResult.rows.length !== medidorIds.length) {
                return res.status(400).json({ 
                    error: 'Algunos medidores no pertenecen a esta ruta' 
                });
            }

            // Actualizar el orden de cada medidor
            for (const item of orden) {
                const updateQuery = `
                    UPDATE rutas_puntos 
                    SET orden = ?
                    WHERE ruta_id = ? AND medidor_id = ?
                `;
                await dbTurso.execute({
                    sql: updateQuery,
                    args: [item.orden, ruta_id, item.medidor_id]
                });
            }

            // Notificar cambios
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Orden de medidores actualizado en ruta`,
                        'info',
                        {
                            ruta_id: Number(ruta_id),
                            medidores_reordenados: medidorIds.length
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            return res.status(200).json({
                success: true,
                mensaje: 'Orden de medidores actualizado correctamente',
                ruta_id: Number(ruta_id),
                medidores_actualizados: medidorIds.length
            });

        } catch (error) {
            console.error('❌ Error al reordenar medidores:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Obtener progreso de captura de ruta - ANALYTICS
     * GET /api/v2/rutas/:ruta_id/progreso?periodo=2025-12
     * Estadísticas: medidores leídos/total, % completado
     */
    obtenerProgresoCapturaRuta: async (req, res) => {
        try {
            const { ruta_id } = req.params;
            const periodoParam = req.query.periodo;

            if (!ruta_id) {
                return res.status(400).json({ error: 'ID de ruta requerido' });
            }

            // Determinar periodo a usar
            const periodoQuery = `
                SELECT COALESCE(?, (
                    SELECT 
                        CASE 
                            WHEN strftime('%Y-%m', 'now') > MAX(periodo) THEN strftime('%Y-%m', 'now')
                            ELSE MAX(periodo)
                        END 
                    FROM lecturas
                )) AS periodo_a_usar
            `;

            const periodoResult = await dbTurso.execute({
                sql: periodoQuery,
                args: [periodoParam || null]
            });

            const periodo = periodoResult.rows[0]?.periodo_a_usar;

            // Obtener información de la ruta
            const rutaQuery = `
                SELECT id, nombre, descripcion 
                FROM rutas 
                WHERE id = ?
            `;
            const rutaResult = await dbTurso.execute({
                sql: rutaQuery,
                args: [ruta_id]
            });

            if (rutaResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ruta no encontrada' });
            }

            const ruta = rutaResult.rows[0];

            // Obtener estadísticas detalladas
            const statsQuery = `
                SELECT 
                    COUNT(DISTINCT rp.medidor_id) as total_medidores,
                    COUNT(DISTINCT CASE WHEN l.id IS NOT NULL THEN rp.medidor_id END) as medidores_leidos,
                    COUNT(DISTINCT CASE WHEN l.id IS NULL THEN rp.medidor_id END) as medidores_pendientes
                FROM rutas_puntos rp
                LEFT JOIN lecturas l ON l.medidor_id = rp.medidor_id 
                    AND l.ruta_id = rp.ruta_id 
                    AND l.periodo = ?
                WHERE rp.ruta_id = ?
            `;

            const statsResult = await dbTurso.execute({
                sql: statsQuery,
                args: [periodo, ruta_id]
            });

            const stats = statsResult.rows[0];
            const total = Number(stats.total_medidores);
            const leidos = Number(stats.medidores_leidos);
            const pendientes = Number(stats.medidores_pendientes);
            const porcentaje = total > 0 ? Math.round((leidos / total) * 100) : 0;

            // Obtener lista detallada de medidores con su estado
            const medidoresQuery = `
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
            `;

            const medidoresResult = await dbTurso.execute({
                sql: medidoresQuery,
                args: [periodo, ruta_id]
            });

            const medidores = medidoresResult.rows.map(row => ({
                medidor_id: Number(row.medidor_id),
                numero_serie: row.numero_serie,
                ubicacion: row.ubicacion,
                orden: row.orden,
                cliente_nombre: row.cliente_nombre,
                estado: row.tiene_lectura === 1 ? 'Leído' : 'Pendiente',
                consumo: row.consumo_m3,
                fecha_lectura: row.fecha_lectura
            }));

            const medidores_leidos = medidores.filter(m => m.estado === 'Leído');
            const medidores_pendientes = medidores.filter(m => m.estado === 'Pendiente');

            return res.status(200).json({
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
                    porcentaje_pendiente: 100 - porcentaje
                },
                detalle: {
                    medidores_leidos: medidores_leidos,
                    medidores_pendientes: medidores_pendientes
                },
                todos_los_medidores: medidores
            });

        } catch (error) {
            console.error('❌ Error al obtener progreso de ruta:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
};

export default rutasController;
