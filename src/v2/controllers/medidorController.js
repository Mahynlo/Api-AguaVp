/**
 * Controlador para gestionar medidores - V2
 * File: src/v2/controllers/medidorController.js
 * 
 * Descripción: Controlador para manejar operaciones relacionadas con medidores.
 * 
 * Cambios en V2:
 * - Migrado de SQLite3 a Turso (@libsql/client)
 * - Reemplazado WebSockets por Server-Sent Events (SSE)
 * - Mantiene solo las funcionalidades de V1
 * - Respeta completamente el esquema de base de datos
 * - Conversión BigInt a Number para compatibilidad JSON
 * 
 * Funciones de V1 implementadas:
 * - registrarMedidor: Registra un nuevo medidor en la base de datos
 * - obtenerMedidores: Obtiene todos los medidores de la base de datos
 * - modificarMedidor: Modifica los datos de un medidor existente
 * 
 * Mejoras sobre V1:
 * - Validaciones robustas de número de serie duplicado
 * - Validación de cliente existente
 * - Manejo de errores mejorado con try/catch
 * - Historial de cambios automático
 * - Notificaciones SSE en tiempo real
 */

import dbTurso from "../../database/db-sqlite.js";

// Managers SSE - Configurados dinámicamente
let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

const MedidorController = {
    /**
     * Registrar medidor - V1 logic
     */
    registrarMedidor: async (req, res) => {
        const { cliente_id, numero_serie, marca, modelo, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, lectura_base, capacidad_maxima } = req.body;

        if (!numero_serie || !ubicacion || !fecha_instalacion || !latitud || !longitud) {
            return res.status(400).json({ success: false, message: "Todos los campos obligatorios excepto cliente_id" });
        }

        try {
            // Verificar si ya existe el número de serie
            const verificarQuery = `SELECT id FROM medidores WHERE numero_serie = ?`;
            const existingResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [numero_serie]
            });

            if (existingResult.rows.length > 0) {
                return res.status(409).json({ error: "El número de serie ya está registrado" });
            }

            // Verificar si el cliente existe (si se proporciona)
            if (cliente_id) {
                const verificarClienteQuery = `SELECT id FROM clientes WHERE id = ?`;
                const clienteResult = await dbTurso.execute({
                    sql: verificarClienteQuery,
                    args: [cliente_id]
                });

                if (clienteResult.rows.length === 0) {
                    return res.status(404).json({ error: "El cliente especificado no existe" });
                }
            }

            // Insertar nuevo medidor
            const insertQuery = `
                INSERT INTO medidores (cliente_id, numero_serie, marca, modelo, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, lectura_base, capacidad_maxima)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const insertResult = await dbTurso.execute({
                sql: insertQuery,
                args: [cliente_id || null, numero_serie, marca || null, modelo || null, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor || 'Activo', lectura_base ?? null, capacidad_maxima ?? null]
            });

            const nuevoMedidorId = Number(insertResult.lastInsertRowid); // Convertir BigInt a Number

            // Registrar en historial de cambios
            const modificado_por = req.usuario?.id || 1;
            const insertHistorial = `
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES (?, ?, ?, ?, ?)
            `;

            const datosInsertados = {
                cliente_id: cliente_id || null,
                numero_serie,
                marca: marca || null,
                modelo: modelo || null,
                ubicacion,
                fecha_instalacion,
                latitud,
                longitud,
                estado_medidor: estado_medidor || 'Activo'
            };

            await dbTurso.execute({
                sql: insertHistorial,
                args: [
                    'medidores',
                    'INSERT',
                    nuevoMedidorId,
                    modificado_por,
                    JSON.stringify(datosInsertados)
                ]
            });

            // Datos del medidor creado para SSE
            const medidorCreado = {
                id: nuevoMedidorId,
                ...datosInsertados,
                modificado_por,
                fecha_creacion: new Date().toISOString()
            };

            // Enviar notificación SSE si está disponible
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Medidor ${numero_serie} registrado`,
                        'success',
                        {
                            medidor_id: nuevoMedidorId,
                            numero_serie,
                            ubicacion,
                            estado_medidor: estado_medidor || 'Activo',
                            accion: 'medidor_registrado'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.status(201).json({
                success: true,
                message: "Medidor registrado exitosamente",
                data: { medidorID: nuevoMedidorId }
            });

        } catch (err) {
            console.error('Error registrando medidor v2:', err);
            res.status(500).json({ success: false, message: "Error al registrar medidor" });
        }
    },

    /**
     * Obtener todos los medidores - V1 logic (consulta simple)
     */
    /**
     * Obtener todos los medidores - V2 logic con Paginación y Búsqueda
     */
    obtenerMedidores: async (req, res) => {
        try {
            const { page, limit, search, estado, ubicacion } = req.query;

            // Si hay parámetros de paginación o búsqueda
            if (page || limit || search || estado || ubicacion) {
                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 60; // Buffer de 60 por defecto
                const offset = (pageNum - 1) * limitNum;
                const searchTerm = search ? `%${search}%` : null;

                let countQuery = `SELECT COUNT(*) as total FROM medidores`;
                let dataQuery = `SELECT m.*, rp.ruta_id, r.nombre AS ruta_nombre FROM medidores m LEFT JOIN rutas_puntos rp ON rp.medidor_id = m.id LEFT JOIN rutas r ON r.id = rp.ruta_id`;

                let whereArgs = [];
                let conditions = [];

                if (searchTerm) {
                    conditions.push(`(numero_serie LIKE ? OR marca LIKE ? OR modelo LIKE ? OR ubicacion LIKE ?)`);
                    whereArgs.push(searchTerm, searchTerm, searchTerm, searchTerm);
                }

                if (estado && estado !== 'All') {
                    if (estado === 'Cortado') {
                        conditions.push(`estado_servicio = ?`);
                        whereArgs.push(estado);
                    } else if (estado === 'Activo') {
                        // "Activo" podría significar estado_medidor='Activo' AND estado_servicio='Activo'
                        // O simplemente estado_medidor='Activo'. Asumiremos estado_servicio='Activo' para ser consistentes con la vista de cortes.
                        conditions.push(`(estado_medidor = ? AND estado_servicio = 'Activo')`);
                        whereArgs.push('Activo');
                    } else {
                        conditions.push(`estado_medidor = ?`);
                        whereArgs.push(estado);
                    }
                }

                // Filtro de ubicación exacto (si fuera necesario) o búsqueda general
                if (ubicacion && ubicacion !== 'All') {
                    conditions.push(`ubicacion LIKE ?`);
                    whereArgs.push(`%${ubicacion}%`);
                }

                const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

                // 1. Obtener total
                const countResult = await dbTurso.execute({
                    sql: countQuery + whereClause,
                    args: whereArgs
                });
                const total = Number(countResult.rows[0].total);

                // 2. Obtener datos
                dataQuery += whereClause + ` ORDER BY m.fecha_creacion DESC LIMIT ? OFFSET ?`;
                const dataArgs = [...whereArgs, limitNum, offset];

                const result = await dbTurso.execute({
                    sql: dataQuery,
                    args: dataArgs
                });

                // Convertir BigInt a Number para JSON
                const medidores = result.rows.map(row => ({
                    ...row,
                    id: Number(row.id),
                    cliente_id: row.cliente_id ? Number(row.cliente_id) : null,
                    ruta_id: row.ruta_id ? Number(row.ruta_id) : null,
                    ruta_nombre: row.ruta_nombre || null
                }));

                return res.json({
                    success: true,
                    data: medidores,
                    pagination: {
                        total,
                        page: pageNum,
                        limit: limitNum,
                        totalPages: Math.ceil(total / limitNum)
                    }
                });
            }

            // Comportamiento Legacy (sin parámetros, trae todo — incluye info de ruta asignada)
            const query = `
                SELECT m.*, rp.ruta_id, r.nombre AS ruta_nombre
                FROM medidores m
                LEFT JOIN rutas_puntos rp ON rp.medidor_id = m.id
                LEFT JOIN rutas r ON r.id = rp.ruta_id
                ORDER BY m.fecha_creacion DESC
            `;
            const result = await dbTurso.execute({ sql: query });

            const medidores = result.rows.map(row => ({
                ...row,
                id: Number(row.id),
                cliente_id: row.cliente_id ? Number(row.cliente_id) : null,
                ruta_id: row.ruta_id ? Number(row.ruta_id) : null,
                ruta_nombre: row.ruta_nombre || null
            }));

            res.json(medidores);

        } catch (err) {
            console.error('Error obteniendo medidores v2:', err);
            res.status(500).json({ error: "Error al obtener medidores" });
        }
    },

    /**
     * Modificar medidor - V1 logic con historial de cambios
     */
    modificarMedidor: async (req, res) => {
        const { id } = req.params;
        const { cliente_id, numero_serie, marca, modelo, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, estado_servicio, fecha_corte, lectura_base, capacidad_maxima } = req.body;

        if (!cliente_id && !numero_serie && !marca && !modelo && !ubicacion && !fecha_instalacion && !latitud && !longitud && !estado_medidor && !estado_servicio && fecha_corte === undefined && lectura_base === undefined && capacidad_maxima === undefined) {
            return res.status(400).json({ success: false, message: "Al menos un campo es obligatorio" });
        }

        try {
            // Verificar si el medidor existe
            const verificarQuery = `SELECT * FROM medidores WHERE id = ?`;
            const medidorResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [id]
            });

            if (medidorResult.rows.length === 0) {
                return res.status(404).json({ error: "Medidor no encontrado" });
            }

            const medidorExistente = medidorResult.rows[0];

            // Verificar si el nuevo número de serie ya existe (si se está cambiando)
            if (numero_serie && numero_serie !== medidorExistente.numero_serie) {
                const verificarSerieQuery = `SELECT id FROM medidores WHERE numero_serie = ? AND id != ?`;
                const serieResult = await dbTurso.execute({
                    sql: verificarSerieQuery,
                    args: [numero_serie, id]
                });

                if (serieResult.rows.length > 0) {
                    return res.status(409).json({ error: "El número de serie ya está en uso" });
                }
            }

            // Verificar si el cliente existe (si se está cambiando)
            if (cliente_id && cliente_id !== medidorExistente.cliente_id) {
                const verificarClienteQuery = `SELECT id FROM clientes WHERE id = ?`;
                const clienteResult = await dbTurso.execute({
                    sql: verificarClienteQuery,
                    args: [cliente_id]
                });

                if (clienteResult.rows.length === 0) {
                    return res.status(404).json({ error: "El cliente especificado no existe" });
                }
            }

            // Identificar cambios
            const cambios = {};
            if (cliente_id !== undefined && cliente_id !== medidorExistente.cliente_id)
                cambios.cliente_id = { antes: medidorExistente.cliente_id, despues: cliente_id };
            if (numero_serie && numero_serie !== medidorExistente.numero_serie)
                cambios.numero_serie = { antes: medidorExistente.numero_serie, despues: numero_serie };
            if (marca !== undefined && marca !== medidorExistente.marca)
                cambios.marca = { antes: medidorExistente.marca, despues: marca };
            if (modelo !== undefined && modelo !== medidorExistente.modelo)
                cambios.modelo = { antes: medidorExistente.modelo, despues: modelo };
            if (ubicacion && ubicacion !== medidorExistente.ubicacion)
                cambios.ubicacion = { antes: medidorExistente.ubicacion, despues: ubicacion };
            if (fecha_instalacion && fecha_instalacion !== medidorExistente.fecha_instalacion)
                cambios.fecha_instalacion = { antes: medidorExistente.fecha_instalacion, despues: fecha_instalacion };
            if (latitud !== undefined && latitud !== medidorExistente.latitud)
                cambios.latitud = { antes: medidorExistente.latitud, despues: latitud };
            if (longitud !== undefined && longitud !== medidorExistente.longitud)
                cambios.longitud = { antes: medidorExistente.longitud, despues: longitud };
            if (estado_medidor && estado_medidor !== medidorExistente.estado_medidor)
                cambios.estado_medidor = { antes: medidorExistente.estado_medidor, despues: estado_medidor };
            if (estado_servicio && estado_servicio !== medidorExistente.estado_servicio)
                cambios.estado_servicio = { antes: medidorExistente.estado_servicio, despues: estado_servicio };
            if (fecha_corte !== undefined && fecha_corte !== medidorExistente.fecha_corte)
                cambios.fecha_corte = { antes: medidorExistente.fecha_corte, despues: fecha_corte };
            if (lectura_base !== undefined && String(lectura_base) !== String(medidorExistente.lectura_base))
                cambios.lectura_base = { antes: medidorExistente.lectura_base, despues: lectura_base };
            if (capacidad_maxima !== undefined && String(capacidad_maxima) !== String(medidorExistente.capacidad_maxima))
                cambios.capacidad_maxima = { antes: medidorExistente.capacidad_maxima, despues: capacidad_maxima };

            // Actualizar medidor
            const updateQuery = `
                UPDATE medidores
                SET cliente_id = COALESCE(?, cliente_id),
                    numero_serie = COALESCE(?, numero_serie),
                    marca = COALESCE(?, marca),
                    modelo = COALESCE(?, modelo),
                    ubicacion = COALESCE(?, ubicacion),
                    fecha_instalacion = COALESCE(?, fecha_instalacion),
                    latitud = COALESCE(?, latitud),
                    longitud = COALESCE(?, longitud),
                    estado_medidor = COALESCE(?, estado_medidor),
                    estado_servicio = COALESCE(?, estado_servicio),
                    fecha_corte = COALESCE(?, fecha_corte),
                    lectura_base = CASE WHEN ? IS NULL THEN lectura_base ELSE ? END,
                    capacidad_maxima = CASE WHEN ? IS NULL THEN capacidad_maxima ELSE ? END
                WHERE id = ?
            `;

            const updateResult = await dbTurso.execute({
                sql: updateQuery,
                args: [
                    cliente_id ?? null,
                    numero_serie ?? null,
                    marca ?? null,
                    modelo ?? null,
                    ubicacion ?? null,
                    fecha_instalacion ?? null,
                    latitud ?? null,
                    longitud ?? null,
                    estado_medidor ?? null,
                    estado_servicio ?? null,
                    fecha_corte ?? null,
                    lectura_base !== undefined ? lectura_base : null,
                    lectura_base !== undefined ? lectura_base : null,
                    capacidad_maxima !== undefined ? capacidad_maxima : null,
                    capacidad_maxima !== undefined ? capacidad_maxima : null,
                    id
                ]
            });

            // Registrar cambios en historial
            if (Object.keys(cambios).length > 0) {
                const modificado_por = req.usuario?.id || 1;
                const insertHistorial = `
                    INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                    VALUES (?, ?, ?, ?, ?)
                `;

                await dbTurso.execute({
                    sql: insertHistorial,
                    args: [
                        'medidores',
                        'UPDATE',
                        id,
                        modificado_por,
                        JSON.stringify(cambios)
                    ]
                });
            }

            // Crear objeto del medidor actualizado
            const medidorActualizado = {
                id: parseInt(id),
                cliente_id: cliente_id !== undefined ? cliente_id : medidorExistente.cliente_id,
                numero_serie: numero_serie || medidorExistente.numero_serie,
                marca: marca !== undefined ? marca : medidorExistente.marca,
                modelo: modelo !== undefined ? modelo : medidorExistente.modelo,
                ubicacion: ubicacion || medidorExistente.ubicacion,
                fecha_instalacion: fecha_instalacion || medidorExistente.fecha_instalacion,
                latitud: latitud !== undefined ? latitud : medidorExistente.latitud,
                longitud: longitud !== undefined ? longitud : medidorExistente.longitud,
                estado_medidor: estado_medidor || medidorExistente.estado_medidor,
                estado_servicio: estado_servicio || medidorExistente.estado_servicio,
                fecha_corte: fecha_corte !== undefined ? fecha_corte : medidorExistente.fecha_corte,
                lectura_base: lectura_base !== undefined ? lectura_base : medidorExistente.lectura_base,
                capacidad_maxima: capacidad_maxima !== undefined ? capacidad_maxima : medidorExistente.capacidad_maxima,
                cambios_realizados: Object.keys(cambios),
                modificado_por: req.usuario?.id || 1
            };

            // Enviar notificación SSE
            if (notificationManager && Object.keys(cambios).length > 0) {
                try {
                    notificationManager.alertaSistema(
                        `Medidor ${medidorActualizado.numero_serie} modificado`,
                        'info',
                        {
                            medidor_id: parseInt(id),
                            numero_serie: medidorActualizado.numero_serie,
                            campos_modificados: Object.keys(cambios),
                            accion: 'medidor_modificado'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.json({
                success: true,
                message: "Medidor modificado correctamente",
                data: {
                    id: parseInt(id),
                    cambios_realizados: Object.keys(cambios),
                    rowsAffected: Number(updateResult.rowsAffected)
                }
            });

        } catch (err) {
            console.error('Error modificando medidor v2:', err);
            res.status(500).json({ success: false, message: "Error al modificar medidor" });
        }
    }
};

export default MedidorController;
