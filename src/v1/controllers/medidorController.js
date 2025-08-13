/**
 * Controlador para gestionar los medidores
 * File: src/controllers/medidorController.js
 * Descripción: Controlador para manejar operaciones relacionadas con medidores, incluyendo registro, modificación y obtención de datos.
 * 
 * Nota: Este controlador está diseñado para interactuar con una base de datos SQLite a través de la biblioteca 'sqlite3'.
 * 
 * Funciones:
 * - registrarMedidor: Registra un nuevo medidor en la base de datos.
 * - obtenerMedidores: Obtiene todos los medidores de la base de datos.
 * - modificarMedidor: Modifica los datos de un medidor existente.
 * 
 * 
 * Pendiente de implementar:
 * - eliminarMedidor: Elimina un medidor de la base de datos. --> Pendiente de implementar
 * - obtenerMedidorPorId: Obtiene un medidor específico por su ID. --> Pendiente de implementar
 * * - obtenerMedidoresPorCliente: Obtiene todos los medidores asociados a un cliente específico. --> Pendiente de implementar
 * * - obtenerMedidoresPorEstado: Obtiene todos los medidores filtrados por su estado. --> Pendiente de implementar
 * * - obtenerMedidoresPorUbicacion: Obtiene todos los medidores filtrados por su ubicación. --> Pendiente de implementar
 * * - obtenerMedidoresPorFecha: Obtiene todos los medidores filtrados por su fecha de instalación. --> Pendiente de implementar
 * * - obtenerMedidoresPorLatitudandLongitud: Obtiene todos los medidores filtrados por su latitud y longitud. --> Pendiente de implementar
 * * * - obtenerMedidoresPorNumeroSerie: Obtiene todos los medidores filtrados por su número de serie. --> Pendiente de implementar
 * 
 *  Pruebas de implementación:
*/
import db from '../../database/db.js';
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

const MedidorController = {

    // registrar medidor
    registrarMedidor: (req, res) => {
        console.log('🔌 [medidorController] About to register medidor with WebSocket integration');
        const { cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor } = req.body;

        console.log('Datos recibidos para registrar medidor:', { cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor });

        if (!numero_serie || !ubicacion || !fecha_instalacion || !latitud || !longitud) {
            return res.status(400).json({ error: "Todos los campos obligatorios excepto cliente_id" });
        }

        // Verificar si ya existe el número de serie
        const verificarQuery = `SELECT id FROM medidores WHERE numero_serie = ?`;
        db.get(verificarQuery, [numero_serie], (err, existente) => {
            if (err) return res.status(500).json({ error: "Error al verificar medidor existente" });

            if (existente) {
                return res.status(409).json({ error: "El número de serie ya está registrado" });
            }

            const query = `
                INSERT INTO medidores (cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(query, [cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor || 'Activo'], function (err) {
                if (err) return res.status(500).json({ error: "Error al registrar medidor" });
                
                // Historial de cambios
                let nuevoMedidoreId = this.lastID;
                console.log('🔍 [medidorController] Nuevo medidor ID:', nuevoMedidoreId, 'this.lastID:', this.lastID, 'this:', this);

                if (!nuevoMedidoreId) {
                    // Fallback: obtener el ID por número de serie
                    console.log('⚠️ [medidorController] lastID es null, obteniendo ID por numero_serie');
                    db.get('SELECT id FROM medidores WHERE numero_serie = ?', [numero_serie], (err, row) => {
                        if (err || !row) {
                            return res.status(500).json({ error: "Error: Medidor registrado pero no se pudo obtener el ID" });
                        }
                        
                        nuevoMedidoreId = row.id;
                        console.log('✅ [medidorController] ID obtenido por fallback:', nuevoMedidoreId);
                        
                        // Continuar con el proceso de historial
                        procesarHistorial(nuevoMedidoreId);
                    });
                } else {
                    // Continuar normalmente
                    procesarHistorial(nuevoMedidoreId);
                }

                function procesarHistorial(medidorId) {
                    // Historial de cambios
                    const insertHistorial = `
                    INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                    VALUES (?, ?, ?, ?, ?)
                    `;

                    const modificado_por = req.usuario.id; // ID del usuario que modifica desde el token enviado al servidor
                    const datosInsertados = {
                        cliente_id, numero_serie, ubicacion, fecha_instalacion,
                        latitud, longitud, estado_medidor: estado_medidor || 'Activo'
                    };

                    db.run(insertHistorial, [
                        'medidores',
                        'INSERT',
                        medidorId,
                        modificado_por,
                        JSON.stringify(datosInsertados)
                    ], function (err) {
                        if (err) {
                            console.error('Error al registrar historial:', err.message);
                            return res.status(500).json({ 
                                error: "Se ha registrado el medidor pero no se ha podido registrar el historial", 
                                medidorID: medidorId 
                            });
                        }

                        // Solo continuar si no hay error en el historial
                        const medidorCompleto = {
                            id: medidorId,
                            cliente_id,
                            numero_serie,
                            ubicacion,
                            fecha_instalacion,
                            latitud,
                            longitud,
                            estado_medidor: estado_medidor || 'Activo',
                            modificado_por
                        };

                        // Emitir eventos WebSocket
                        console.log('🔌 [medidorController] About to emit WebSocket events for medidor_created');
                        if (res.websocket) {
                            res.websocket.notifyBusiness('medidor_creado', medidorCompleto);
                            res.websocket.trackOperation('medidor_registrado', { 
                                cliente_id: cliente_id,
                                medidor_id: medidorId, 
                                numero_serie: numero_serie,
                                ubicacion: ubicacion,
                                fecha_instalacion: fecha_instalacion,
                                longitud: longitud,
                                latitud: latitud,
                                estado_medidor: estado_medidor || 'Activo',
                                modificado_por: modificado_por
                            });
                        }
                        console.log('🔌 [medidorController] WebSocket events emitted successfully');

                        res.json({ mensaje: "Medidor registrado", medidorID: medidorId });
                    });
                }
            });
        });
    },

    // se obtinene todos los medidores
    obtenerMedidores: (req, res) => {
        const query = `SELECT * FROM medidores`;
        db.all(query, [], (err, rows) => {
            if (err) return res.status(500).json({ error: "Error al obtener medidores" });
            res.json(rows);
        });
    },

    // modificar medidor y guardar cambios en el historial
    modificarMedidor: (req, res) => {
        console.log('🔌 [medidorController] About to modify medidor with WebSocket integration');
        const { id } = req.params;
        const { cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor } = req.body;

        console.log('Datos recibidos para modificar medidor:', { id, cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor });

        if (!cliente_id && !numero_serie && !ubicacion && !fecha_instalacion && !latitud && !longitud && !estado_medidor) {
            return res.status(400).json({ error: "Al menos un campo es obligatorio" });
        }

        // Obtener todos los datos del medidor existente
        db.get(`SELECT * FROM medidores WHERE id = ?`, [id], (err, medidorExistente) => {
            if (err) return res.status(500).json({ error: "Error al verificar medidor existente" });

            if (!medidorExistente) {
                return res.status(404).json({ error: "Medidor no encontrado" });
            }

            const cambios = {};
            if (cliente_id && cliente_id !== medidorExistente.cliente_id) cambios.cliente_id = { antes: medidorExistente.cliente_id, despues: cliente_id };
            if (numero_serie && numero_serie !== medidorExistente.numero_serie) cambios.numero_serie = { antes: medidorExistente.numero_serie, despues: numero_serie };
            if (ubicacion && ubicacion !== medidorExistente.ubicacion) cambios.ubicacion = { antes: medidorExistente.ubicacion, despues: ubicacion };
            if (fecha_instalacion && fecha_instalacion !== medidorExistente.fecha_instalacion) cambios.fecha_instalacion = { antes: medidorExistente.fecha_instalacion, despues: fecha_instalacion };
            if (latitud && latitud !== medidorExistente.latitud) cambios.latitud = { antes: medidorExistente.latitud, despues: latitud };
            if (longitud && longitud !== medidorExistente.longitud) cambios.longitud = { antes: medidorExistente.longitud, despues: longitud };
            if (estado_medidor && estado_medidor !== medidorExistente.estado_medidor) cambios.estado_medidor = { antes: medidorExistente.estado_medidor, despues: estado_medidor };

            const query = `
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

            db.run(query, [cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, id], function (err) {
                if (err) return res.status(500).json({ error: "Error al modificar medidor" });

                if (Object.keys(cambios).length > 0) {
                    const insertHistorial = `
                    INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                    VALUES (?, ?, ?, ?, ?)
                `;

                    const modificado_por = req.usuario.id;

                    db.run(insertHistorial, [
                        'medidores',
                        'UPDATE',
                        id,
                        modificado_por,
                        JSON.stringify(cambios)
                    ], function (err) {
                        if (err) return res.status(500).json({ error: "Error al registrar historial de cambios" });
                    });
                }

                // Crear objeto del medidor actualizado para WebSockets
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
                    modificado_por: req.usuario.id
                };

                // Emitir eventos WebSocket
                console.log('🔌 [medidorController] About to emit WebSocket events for medidor_updated');
                if (res.websocket) {
                    res.websocket.notifyBusiness('medidor_actualizado', medidorActualizado);
                    res.websocket.trackOperation('medidor_modificado', { 
                        medidor_id: parseInt(id), 
                        numero_serie: medidorActualizado.numero_serie,
                        campos_modificados: Object.keys(cambios)
                    });
                }
                console.log('🔌 [medidorController] WebSocket events emitted successfully');

                res.json({ mensaje: "Medidor modificado", cambios: this.changes });
            });
        });
    },

    // Middleware de WebSocket para todas las operaciones de medidores
    withWebSocket: ControllerIntegration.withWebSocket
};

export default MedidorController;

