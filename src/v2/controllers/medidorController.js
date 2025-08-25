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

import dbTurso from "../../database/db-turso.js";

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
        console.log('🔌 [medidorController v2] About to register medidor with SSE integration');
        const { cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor } = req.body;

        console.log('Datos recibidos para registrar medidor v2:', { cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor });

        if (!numero_serie || !ubicacion || !fecha_instalacion || !latitud || !longitud) {
            return res.status(400).json({ error: "Todos los campos obligatorios excepto cliente_id" });
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
                INSERT INTO medidores (cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            const insertResult = await dbTurso.execute({
                sql: insertQuery,
                args: [cliente_id || null, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor || 'Activo']
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

            console.log('🔌 [medidorController v2] SSE events sent successfully');

            res.status(201).json({
                mensaje: "Medidor registrado",
                medidorID: nuevoMedidorId
            });

        } catch (err) {
            console.error('Error registrando medidor v2:', err);
            res.status(500).json({ error: "Error al registrar medidor" });
        }
    },

    /**
     * Obtener todos los medidores - V1 logic (consulta simple)
     */
    obtenerMedidores: async (req, res) => {
        try {
            // Mantener misma query que V1 para compatibilidad
            const query = `SELECT * FROM medidores`;

            const result = await dbTurso.execute({ sql: query });

            // Convertir BigInt a Number para compatibilidad JSON
            const medidores = result.rows.map(row => ({
                ...row,
                id: Number(row.id),
                cliente_id: row.cliente_id ? Number(row.cliente_id) : null
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
        console.log('🔌 [medidorController v2] About to modify medidor with SSE integration');
        const { id } = req.params;
        const { cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor } = req.body;

        console.log('Datos recibidos para modificar medidor v2:', { id, cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor });

        if (!cliente_id && !numero_serie && !ubicacion && !fecha_instalacion && !latitud && !longitud && !estado_medidor) {
            return res.status(400).json({ error: "Al menos un campo es obligatorio" });
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
            if (cliente_id && cliente_id !== medidorExistente.cliente_id) 
                cambios.cliente_id = { antes: medidorExistente.cliente_id, despues: cliente_id };
            if (numero_serie && numero_serie !== medidorExistente.numero_serie) 
                cambios.numero_serie = { antes: medidorExistente.numero_serie, despues: numero_serie };
            if (ubicacion && ubicacion !== medidorExistente.ubicacion) 
                cambios.ubicacion = { antes: medidorExistente.ubicacion, despues: ubicacion };
            if (fecha_instalacion && fecha_instalacion !== medidorExistente.fecha_instalacion) 
                cambios.fecha_instalacion = { antes: medidorExistente.fecha_instalacion, despues: fecha_instalacion };
            if (latitud && latitud !== medidorExistente.latitud) 
                cambios.latitud = { antes: medidorExistente.latitud, despues: latitud };
            if (longitud && longitud !== medidorExistente.longitud) 
                cambios.longitud = { antes: medidorExistente.longitud, despues: longitud };
            if (estado_medidor && estado_medidor !== medidorExistente.estado_medidor) 
                cambios.estado_medidor = { antes: medidorExistente.estado_medidor, despues: estado_medidor };

            // Actualizar medidor
            const updateQuery = `
                UPDATE medidores
                SET cliente_id = COALESCE(?, cliente_id),
                    numero_serie = COALESCE(?, numero_serie),
                    ubicacion = COALESCE(?, ubicacion),
                    fecha_instalacion = COALESCE(?, fecha_instalacion),
                    latitud = COALESCE(?, latitud),
                    longitud = COALESCE(?, longitud),
                    estado_medidor = COALESCE(?, estado_medidor)
                WHERE id = ?
            `;

            const updateResult = await dbTurso.execute({
                sql: updateQuery,
                args: [cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, id]
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
                cliente_id: cliente_id || medidorExistente.cliente_id,
                numero_serie: numero_serie || medidorExistente.numero_serie,
                ubicacion: ubicacion || medidorExistente.ubicacion,
                fecha_instalacion: fecha_instalacion || medidorExistente.fecha_instalacion,
                latitud: latitud || medidorExistente.latitud,
                longitud: longitud || medidorExistente.longitud,
                estado_medidor: estado_medidor || medidorExistente.estado_medidor,
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

            console.log('🔌 [medidorController v2] SSE events sent successfully');

            res.json({
                mensaje: "Medidor modificado",
                cambios: Number(updateResult.rowsAffected)
            });

        } catch (err) {
            console.error('Error modificando medidor v2:', err);
            res.status(500).json({ error: "Error al modificar medidor" });
        }
    }
};

export default MedidorController;
