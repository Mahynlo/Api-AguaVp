/**
 * Controlador para gestionar clientes
 * File: src/controllers/clientesController.js
 * Descripción: Controlador para manejar operaciones relacionadas con clientes, incluyendo registro, modificación y obtención de datos.
 * 
 * Funciones:
 * - registrarCliente: Registra un nuevo cliente en la base de datos.
 * - obtenerClientes: Obtiene todos los clientes de la base de datos.
 * - modificarCliente: Modifica los datos de un cliente existente.
 * 
 * Notas:
 * - Se utiliza sqlite3 para interactuar con la base de datos SQLite.
 * - Se utiliza un middleware para verificar la autenticación de los usuarios.
 * - Integrado con WebSockets para notificaciones en tiempo real
 * 
 * Pendiente de implementar:
 * - eliminarCliente: Elimina un cliente de la base de datos.
 * - obtenerClientePorId: Obtiene un cliente específico por su ID.
 * - obtenerClientesPorEstado: Obtiene todos los clientes filtrados por su estado.
 * * - obtenerClientesPorCiudad: Obtiene todos los clientes filtrados por su ciudad.
 * * * - obtenerClientesPorCorreo: Obtiene todos los clientes filtrados por su correo electrónico.
 * * * * - obtenerClientesPorTelefono: Obtiene todos los clientes filtrados por su número de teléfono.
 * * * * * * - obtenerClientesPorNombre: Obtiene todos los clientes filtrados por su nombre.
 * * * * * * * * - obtenerClientesPorDireccion: Obtiene todos los clientes filtrados por su dirección.
 * * * * * * * * * * - obtenerClientesPorFechaRegistro: Obtiene todos los clientes filtrados por su fecha de registro.
 * 
 * * Pruebas de implementación:
 * 
 * 
*/
import db from "../../database/db.js";
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

const clientesController = {

    // se registra un cliente 
    registrarCliente: (req, res) => {
        const { nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id } = req.body;
        const modificado_por = req.usuario.id; // ID del usuario que modifica desde el token enviado al servidor

        console.log("Datos recibidos para registrar cliente:", req.body);

        if (!nombre || !direccion || !telefono || !ciudad || !tarifa_id) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        const verificarQuery = `SELECT * FROM clientes WHERE nombre = ? AND telefono = ?`;
        db.get(verificarQuery, [nombre, telefono], (err, clienteExistente) => { // Verifica si el cliente ya existe
            if (err) return res.status(500).json({ error: "Error al verificar cliente existente" });

            if (clienteExistente) {
                return res.status(409).json({ error: "Este cliente ya está registrado" });
            }

            // Verificar si la tarifa existe (si se proporciona)
            if (tarifa_id) {
                const verificarTarifaQuery = `SELECT * FROM tarifas WHERE id = ?`;
                db.get(verificarTarifaQuery, [tarifa_id], (err, tarifaExistente) => {
                    if (err) return res.status(500).json({ error: "Error al verificar tarifa" });
                    if (!tarifaExistente) {
                        return res.status(404).json({ error: "La tarifa especificada no existe" });
                    }
                    procederConRegistro();
                });
            } else {
                procederConRegistro();
            }

            function procederConRegistro() {
                const insertQuery = `
                INSERT INTO clientes (nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id, modificado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                db.run(insertQuery, [nombre, direccion, telefono, ciudad, correo, estado_cliente || 'Activo', tarifa_id || null, modificado_por], function (err) {
                    if (err) return res.status(500).json({ error: "Error al registrar cliente" });
                    const nuevoClienteID = this.lastID;

                    // Historial de cambios
                    const insertHistorial = `
                    INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                    VALUES (?, ?, ?, ?, ?)
                    `;

                    const datosInsertados = {
                        nombre, direccion, telefono, ciudad, correo,
                        estado_cliente: estado_cliente || 'Activo',
                        tarifa_id: tarifa_id || null
                    };

                    db.run(insertHistorial, [
                        'clientes',
                        'INSERT',
                        nuevoClienteID,
                        modificado_por,
                        JSON.stringify(datosInsertados)
                    ]);

                    // Datos del cliente creado para WebSocket
                    const clienteCreado = {
                        id: nuevoClienteID,
                        nombre,
                        direccion,
                        telefono,
                        ciudad,
                        correo,
                        estado_cliente: estado_cliente || 'Activo',
                        tarifa_id: tarifa_id || null,
                        fecha_registro: new Date().toISOString(),
                        modificado_por
                    };

                    // Emitir evento de WebSocket
                    res.websocket.notifyBusiness('cliente_creado', clienteCreado);
                    console.log('🔌 [clientesController] About to call trackOperation');
                    res.websocket.trackOperation('cliente_registrado', {
                        cliente_id: nuevoClienteID,
                        nombre: nombre
                    });
                    console.log('🔌 [clientesController] trackOperation called successfully');

                    res.status(201).json({
                        mensaje: "Cliente registrado con éxito",
                        clienteID: nuevoClienteID
                    });
                });
            }
        });
    },


    // se obtinene todos los clientes 
    obtenerClientes: (req, res) => {
        const query = `SELECT * FROM clientes`;
        db.all(query, [], (err, rows) => {
            if (err) return res.status(500).json({ error: "Error al obtener clientes" });
            res.json(rows);
        });
    },


    //Se modifica uno o varios campos de un cliente
    modificarCliente: (req, res) => {
    const { id } = req.params;
    const { nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id } = req.body;
    const medidor_id = req.body.medidor_id;
    const medidores_liberados = req.body.medidores_liberados;
    const modificado_por = req.usuario.id;

    console.log("Datos recibidos para modificar cliente:", req.body);
    console.log("ID del cliente a modificar:", id);
    console.log("ID del usuario que modifica:", modificado_por);

    if (!nombre && !direccion && !telefono && !ciudad && !correo && !estado_cliente && tarifa_id === undefined && medidor_id === undefined && medidores_liberados === undefined) {
        return res.status(400).json({ error: "Al menos un campo es obligatorio" });
    }

    const verificarQuery = `SELECT * FROM clientes WHERE id = ?`;

    db.get(verificarQuery, [id], (err, clienteExistente) => {
        if (err) return res.status(500).json({ error: "Error al verificar cliente existente" });
        if (!clienteExistente) return res.status(404).json({ error: "Cliente no encontrado" });

        // Verificar si la tarifa existe (si se proporciona)
        if (tarifa_id) {
            const verificarTarifaQuery = `SELECT * FROM tarifas WHERE id = ?`;
            db.get(verificarTarifaQuery, [tarifa_id], (err, tarifaExistente) => {
                if (err) return res.status(500).json({ error: "Error al verificar tarifa" });
                if (!tarifaExistente) {
                    return res.status(404).json({ error: "La tarifa especificada no existe" });
                }
                procederConModificacion();
            });
        } else {
            procederConModificacion();
        }

        function procederConModificacion() {
            const cambios = {};
            if (nombre && nombre !== clienteExistente.nombre) cambios.nombre = { antes: clienteExistente.nombre, despues: nombre };
            if (direccion && direccion !== clienteExistente.direccion) cambios.direccion = { antes: clienteExistente.direccion, despues: direccion };
            if (telefono && telefono !== clienteExistente.telefono) cambios.telefono = { antes: clienteExistente.telefono, despues: telefono };
            if (ciudad && ciudad !== clienteExistente.ciudad) cambios.ciudad = { antes: clienteExistente.ciudad, despues: ciudad };
            if (correo && correo !== clienteExistente.correo) cambios.correo = { antes: clienteExistente.correo, despues: correo };
            if (estado_cliente && estado_cliente !== clienteExistente.estado_cliente) cambios.estado_cliente = { antes: clienteExistente.estado_cliente, despues: estado_cliente };
            if (tarifa_id !== undefined && tarifa_id !== clienteExistente.tarifa_id) cambios.tarifa_id = { antes: clienteExistente.tarifa_id, despues: tarifa_id };

            const updateClienteQuery = `
                UPDATE clientes
                SET 
                    nombre = COALESCE(?, nombre),
                    direccion = COALESCE(?, direccion),
                    telefono = COALESCE(?, telefono),
                    ciudad = COALESCE(?, ciudad),
                    correo = COALESCE(?, correo),
                    estado_cliente = COALESCE(?, estado_cliente),
                    tarifa_id = CASE WHEN ? IS NOT NULL THEN ? ELSE tarifa_id END,
                    modificado_por = ?
                WHERE id = ?
            `;

            db.run(updateClienteQuery, [nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id, tarifa_id, modificado_por, id], function (err) {
                if (err) return res.status(500).json({ error: "Error al modificar cliente" });

                const errores = [];
                let totalOperaciones = 0;
                let completadas = 0;

                // Calcular cuántas operaciones se deben procesar
                const totalMedidoresAsignar = Array.isArray(medidor_id) ? medidor_id.length : 0;
                const totalMedidoresLiberar = Array.isArray(medidores_liberados) ? medidores_liberados.length : 0;
                totalOperaciones = totalMedidoresAsignar + totalMedidoresLiberar;

                if (totalOperaciones === 0) return registrarHistorial();

            // Liberar medidores
            if (totalMedidoresLiberar > 0) {
                medidores_liberados.forEach((mid) => {
                    db.get(`SELECT * FROM medidores WHERE id = ?`, [mid], (err, medidor) => {
                        if (err || !medidor) {
                            errores.push(`Error al verificar medidor ${mid}`);
                            finalizarOperacion();
                        } else if (medidor.cliente_id !== parseInt(id)) {
                            errores.push(`El medidor ${mid} no pertenece al cliente actual`);
                            finalizarOperacion();
                        } else {
                            db.run(`UPDATE medidores SET cliente_id = NULL WHERE id = ?`, [mid], (err) => {
                                if (err) {
                                    errores.push(`Error al liberar medidor ${mid}`);
                                } else {
                                    cambios[`medidor_${mid}`] = {
                                        antes: medidor.cliente_id,
                                        despues: null
                                    };
                                }
                                finalizarOperacion();
                            });
                        }
                    });
                });
            }

            // Asignar medidores
            if (totalMedidoresAsignar > 0) {
                medidor_id.forEach((mid) => {
                    db.get(`SELECT * FROM medidores WHERE id = ?`, [mid], (err, medidor) => {
                        if (err) {
                            errores.push(`Error al buscar medidor ${mid}`);
                            finalizarOperacion();
                        } else if (!medidor) {
                            errores.push(`Medidor ${mid} no encontrado`);
                            finalizarOperacion();
                        } else if (medidor.cliente_id && medidor.cliente_id !== parseInt(id)) {
                            errores.push(`Medidor ${mid} ya está asignado a otro cliente`);
                            finalizarOperacion();
                        } else {
                            if (medidor.cliente_id !== parseInt(id)) {
                                db.run(`UPDATE medidores SET cliente_id = ? WHERE id = ?`, [id, mid], (err) => {
                                    if (err) {
                                        errores.push(`Error al asignar medidor ${mid}`);
                                    } else {
                                        cambios[`medidor_${mid}`] = {
                                            antes: medidor.cliente_id ?? null,
                                            despues: id
                                        };
                                    }
                                    finalizarOperacion();
                                });
                            } else {
                                finalizarOperacion(); // No se hizo cambio
                            }
                        }
                    });
                });
            }

            function finalizarOperacion() {
                completadas++;
                if (completadas === totalOperaciones) {
                    if (errores.length > 0) {
                        return res.status(400).json({ error: errores });
                    }
                    registrarHistorial();
                }
            }

            function registrarHistorial() {
                if (Object.keys(cambios).length > 0) {
                    const historialQuery = `
                        INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                        VALUES (?, ?, ?, ?, ?)
                    `;
                    db.run(historialQuery, ['clientes', 'UPDATE', id, modificado_por, JSON.stringify(cambios)]);
                }

                // Datos del cliente actualizado para WebSocket
                const clienteActualizado = {
                    id: id,
                    nombre: nombre || clienteExistente.nombre,
                    direccion: direccion || clienteExistente.direccion,
                    telefono: telefono || clienteExistente.telefono,
                    ciudad: ciudad || clienteExistente.ciudad,
                    correo: correo || clienteExistente.correo,
                    estado_cliente: estado_cliente || clienteExistente.estado_cliente,
                    tarifa_id: tarifa_id !== undefined ? tarifa_id : clienteExistente.tarifa_id,
                    cambios: cambios,
                    fecha_modificacion: new Date().toISOString(),
                    modificado_por: modificado_por
                };

                // Emitir evento de WebSocket para cliente actualizado
                res.websocket.notifyBusiness('cliente_actualizado', clienteActualizado);
                res.websocket.trackOperation('cliente_modificado', {
                    cliente_id: id,
                    cambios_realizados: Object.keys(cambios).length
                });

                res.json({ mensaje: "Cliente modificado", cambios });
            }
            });
        }
    });
}


};


export default clientesController;