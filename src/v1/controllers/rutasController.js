// File: src/controllers/rutasController.js
const db = require('../../database/db');
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

const rutasController = {
    crearRuta: (req, res) => {
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
        const placeholders = medidorIds.map(() => '?').join(','); // (?, ?, ?, ...)

        const validarQuery = `SELECT id FROM medidores WHERE id IN (${placeholders})`;

        db.all(validarQuery, medidorIds, (err, rows) => {
            if (err) {
                console.error('❌ Error al validar medidores:', err);
                return res.status(500).json({ error: 'Error al validar medidores' });
            }

            const encontrados = rows.map(r => r.id);
            const faltantes = medidorIds.filter(id => !encontrados.includes(id));

            if (faltantes.length > 0) {
                return res.status(400).json({
                    error: 'Algunos medidores no existen en la base de datos',
                    faltantes
                });
            }

            // Si todos los medidores son válidos, continuar con la creación
            const insertRutaQuery = `
      INSERT INTO rutas (nombre, descripcion, creado_por, distancia_km, ruta_json, instrucciones_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

            const rutaJSON = JSON.stringify(ruta_calculada || []);
            const instruccionesJSON = JSON.stringify(instrucciones || []);

            db.run(insertRutaQuery, [nombre, descripcion, creado_por, distancia_km, rutaJSON, instruccionesJSON], function (err) {
                if (err) {
                    console.error('❌ Error al crear ruta:', err);
                    return res.status(500).json({ error: 'Error interno del servidor al crear la ruta' });
                }

                const ruta_id = this.lastID;
                const insertPuntoQuery = `
        INSERT INTO rutas_puntos (ruta_id, medidor_id, orden)
        VALUES (?, ?, ?)
      `;
                const stmt = db.prepare(insertPuntoQuery);

                let errorEnInsert = false;

                puntos.forEach((punto, index) => {
                    stmt.run(ruta_id, punto.id, index + 1, (err) => {
                        if (err) {
                            errorEnInsert = true;
                            console.error('❌ Error al insertar punto de ruta:', err.message);
                        }
                    });
                });

                stmt.finalize(() => {
                    if (errorEnInsert) {
                        return res.status(500).json({ error: 'Ruta creada, pero hubo errores al agregar puntos de ruta' });
                    }

                    // Datos completos de la ruta para WebSocket
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

                    // Emitir eventos WebSocket
                    if (res.websocket) {
                        // Notificar a operadores sobre nueva ruta
                        res.websocket.emitToRoom('operadores', 'ruta_creada', {
                            message: `Nueva ruta "${nombre}" creada`,
                            ruta: rutaCompleta,
                            timestamp: new Date().toISOString()
                        });

                        // Notificar a administradores
                        res.websocket.emitToRoom('administradores', 'nueva_ruta_admin', {
                            message: `Ruta "${nombre}" creada con ${puntos.length} puntos`,
                            ruta: rutaCompleta,
                            creado_por_id: creado_por
                        });

                        // Broadcast general para dashboard
                        res.websocket.broadcast('dashboard_update', {
                            type: 'ruta_creada',
                            data: {
                                ruta_id,
                                nombre,
                                total_puntos: puntos.length,
                                distancia_km
                            }
                        });
                    }

                    return res.status(201).json({
                        mensaje: '✅ Ruta creada correctamente',
                        ruta_id,
                        detalles: rutaCompleta
                    });
                });
            });
        });
    },

    listarRutas: (req, res) => {
        const periodoParam = req.query.periodo; // Ejemplo: '2025-08'

        // Primero obtenemos el período a usar
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

        db.get(periodoQuery, [periodoParam || null], (err, periodoRow) => {
            if (err) {
                console.error('❌ Error al obtener período:', err.message);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            const periodo = periodoRow.periodo_a_usar;

            // Query principal para obtener información detallada de rutas
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

            db.all(query, [], (err, rutas) => {
                if (err) {
                    console.error('❌ Error al listar rutas:', err.message);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                if (rutas.length === 0) {
                    return res.status(200).json({
                        periodo: periodo,
                        rutas: []
                    });
                }

                // Para cada ruta, obtener información detallada de medidores
                let processedRutas = 0;
                const rutasDetalladas = [];

                rutas.forEach((ruta, index) => {
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

                    db.all(medidoresQuery, [periodo, ruta.id], (err, medidores) => {
                        if (err) {
                            console.error('❌ Error al obtener medidores de ruta:', err.message);
                            return res.status(500).json({ error: 'Error interno del servidor' });
                        }

                        // Procesar datos de medidores
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

                        // Construir objeto de ruta con información completa
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

                        rutasDetalladas[index] = rutaDetallada;
                        processedRutas++;

                        // Cuando todas las rutas estén procesadas, enviar respuesta
                        if (processedRutas === rutas.length) {
                            // Filtrar elementos undefined y ordenar por fecha de creación
                            const rutasFinales = rutasDetalladas
                                .filter(r => r !== undefined)
                                .sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));

                            return res.status(200).json({
                                periodo: periodo,
                                rutas: rutasFinales
                            });
                        }
                    });
                });
            });
        });
    },



    // Agregar medidor a ruta
    agregarMedidorARuta: (req, res) => {
        const { ruta_id, medidor_id, orden } = req.body;

        if (!ruta_id || !medidor_id || orden == null) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }

        const query = `
      INSERT INTO rutas_puntos (ruta_id, medidor_id, orden)
      VALUES (?, ?, ?)
    `;
        db.run(query, [ruta_id, medidor_id, orden], function (err) {
            if (err) {
                console.error('Error al agregar medidor:', err.message);
                return res.status(500).json({ error: 'No se pudo agregar el medidor. Verifica si ya existe en la ruta.' });
            }
            return res.status(201).json({ mensaje: 'Medidor agregado a la ruta' });
        });
    },

    // Obtener medidores de una ruta
    obtenerRutaConMedidores: (req, res) => {
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

        db.all(query, [ruta_id], (err, rows) => {
            if (err) {
                console.error('❌ Error al obtener ruta:', err);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Ruta no encontrada o sin medidores' });
            }

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
        });
    },

    // Middleware de WebSocket para todas las operaciones de rutas
    withWebSocket: ControllerIntegration.withWebSocket
}

module.exports = rutasController;