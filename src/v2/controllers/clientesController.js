/**
 * Controlador para gestionar clientes - V2
 * File: src/v2/controllers/clientesController.js
 * 
 * Descripción: Controlador para manejar operaciones relacionadas con clientes.
 * 
 * Cambios en V2:
 * - Migrado de SQLite3 a Turso (@libsql/client)
 * - Reemplazado WebSockets por Server-Sent Events (SSE)
 * - Mantiene solo las funcionalidades de V1
 * - Respeta el esquema de la base de datos actual
 * 
 * Funciones (solo V1):
 * - registrarCliente: Registra un nuevo cliente en la base de datos.
 * - obtenerClientes: Obtiene todos los clientes de la base de datos.
 * - modificarCliente: Modifica los datos de un cliente existente + gestión de medidores.
 * 
 * Funcionalidades de medidores incluidas:
 * - Asignación de medidores a clientes
 * - Liberación de medidores de clientes
 * - Validaciones de medidores ya asignados
 * - Registro completo en historial de cambios
 */

import dbTurso from "../../database/db-turso.js";

// Helper para obtener los managers SSE
let sseManager = null;
let notificationManager = null;

// Función para establecer los managers SSE
export function setSSEManagers(sse, notification) {
    sseManager = sse;
    notificationManager = notification;
}

const clientesController = {

    // Registrar un cliente 
    registrarCliente: async (req, res) => {
        const { nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id } = req.body;
        const modificado_por = req.usuario.id; // ID del usuario que modifica desde el token enviado al servidor

        console.log("Datos recibidos para registrar cliente:", req.body);

        if (!nombre || !direccion || !telefono || !ciudad || !tarifa_id) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        try {
            // Verificar si el cliente ya existe
            const verificarQuery = `SELECT * FROM clientes WHERE nombre = ? AND telefono = ?`;
            const existingResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [nombre, telefono]
            });

            if (existingResult.rows.length > 0) {
                return res.status(409).json({ error: "Este cliente ya está registrado" });
            }

            // Verificar si la tarifa existe (si se proporciona)
            if (tarifa_id) {
                const verificarTarifaQuery = `SELECT * FROM tarifas WHERE id = ?`;
                const tarifaResult = await dbTurso.execute({
                    sql: verificarTarifaQuery,
                    args: [tarifa_id]
                });

                if (tarifaResult.rows.length === 0) {
                    return res.status(404).json({ error: "La tarifa especificada no existe" });
                }
            }

            // Insertar el nuevo cliente
            const insertQuery = `
                INSERT INTO clientes (nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id, modificado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const insertResult = await dbTurso.execute({
                sql: insertQuery,
                args: [nombre, direccion, telefono, ciudad, correo, estado_cliente || 'Activo', tarifa_id || null, modificado_por]
            });

            const nuevoClienteID = Number(insertResult.lastInsertRowid); // Convertir BigInt a Number

            // Registrar en historial de cambios
            const insertHistorial = `
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES (?, ?, ?, ?, ?)
            `;

            const datosInsertados = {
                nombre, direccion, telefono, ciudad, correo,
                estado_cliente: estado_cliente || 'Activo',
                tarifa_id: tarifa_id || null
            };

            await dbTurso.execute({
                sql: insertHistorial,
                args: [
                    'clientes',
                    'INSERT',
                    nuevoClienteID,
                    modificado_por,
                    JSON.stringify(datosInsertados)
                ]
            });

            // Datos del cliente creado para SSE
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

            // Enviar notificación SSE si está disponible
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Nuevo cliente "${nombre}" registrado`,
                        'success',
                        {
                            cliente: clienteCreado,
                            accion: 'cliente_creado'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.status(201).json({
                mensaje: "Cliente registrado con éxito",
                clienteID: nuevoClienteID
            });

        } catch (err) {
            console.error('Error registrando cliente v2:', err);
            res.status(500).json({ error: "Error al registrar cliente" });
        }
    },

    // Obtener todos los clientes
    obtenerClientes: async (req, res) => {
        try {
            const query = `SELECT * FROM clientes`;

            const result = await dbTurso.execute({ sql: query });

            // Convertir BigInt a Number para compatibilidad JSON
            const clientes = result.rows.map(cliente => ({
                id: Number(cliente.id),
                nombre: cliente.nombre,
                direccion: cliente.direccion,
                telefono: cliente.telefono,
                ciudad: cliente.ciudad,
                correo: cliente.correo,
                estado_cliente: cliente.estado_cliente,
                tarifa_id: cliente.tarifa_id ? Number(cliente.tarifa_id) : null,
                modificado_por: cliente.modificado_por ? Number(cliente.modificado_por) : null,
                fecha_creacion: cliente.fecha_creacion
            }));

            res.json(clientes);

        } catch (err) {
            console.error('Error obteniendo clientes v2:', err);
            res.status(500).json({ error: "Error al obtener clientes" });
        }
    },

    // Modificar cliente
    modificarCliente: async (req, res) => {
        const clienteId = req.params.id;
        const { nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id } = req.body;
        const medidor_id = req.body.medidor_id; // Medidores a asignar
        const medidores_liberados = req.body.medidores_liberados; // Medidores a liberar
        const modificado_por = req.usuario.id;

        console.log("Datos recibidos para modificar cliente:", req.body);
        console.log("ID del cliente a modificar:", clienteId);
        console.log("ID del usuario que modifica:", modificado_por);
        console.log("Tipo de tarifa_id:", typeof tarifa_id, "Valor:", tarifa_id);
        console.log("Tipo de medidor_id:", typeof medidor_id, "Valor:", medidor_id);
        console.log("Tipo de medidores_liberados:", typeof medidores_liberados, "Valor:", medidores_liberados);

        if (!nombre && !direccion && !telefono && !ciudad && !correo && !estado_cliente && tarifa_id === undefined && medidor_id === undefined && medidores_liberados === undefined) {
            return res.status(400).json({ error: "Al menos un campo es obligatorio" });
        }

        try {
            // Verificar si el cliente existe
            const verificarQuery = `SELECT * FROM clientes WHERE id = ?`;
            const clienteResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [clienteId]
            });

            if (clienteResult.rows.length === 0) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }

            const clienteAnterior = clienteResult.rows[0];

            // Asegurar que los valores sean del tipo correcto para Turso
            const safeNombre = nombre || null;
            const safeDireccion = direccion || null;
            const safeTelefono = telefono || null;
            const safeCiudad = ciudad || null;
            const safeCorreo = correo || null;
            const safeEstadoCliente = estado_cliente || null;
            const safeTarifaId = tarifa_id !== undefined ? Number(tarifa_id) || null : null;
            const safeModificadoPor = Number(modificado_por);
            const safeClienteId = Number(clienteId);

            console.log("Valores preparados para la consulta:", {
                safeNombre, safeDireccion, safeTelefono, safeCiudad, 
                safeCorreo, safeEstadoCliente, safeTarifaId, safeModificadoPor, safeClienteId
            });

            // Verificar si la tarifa existe (si se proporciona)
            if (safeTarifaId) {
                const verificarTarifaQuery = `SELECT * FROM tarifas WHERE id = ?`;
                const tarifaResult = await dbTurso.execute({
                    sql: verificarTarifaQuery,
                    args: [safeTarifaId]
                });

                if (tarifaResult.rows.length === 0) {
                    return res.status(404).json({ error: "La tarifa especificada no existe" });
                }
            }

            // Construir cambios para historial (usar valores seguros)
            const cambios = {};
            if (safeNombre && safeNombre !== clienteAnterior.nombre) cambios.nombre = { antes: clienteAnterior.nombre, despues: safeNombre };
            if (safeDireccion && safeDireccion !== clienteAnterior.direccion) cambios.direccion = { antes: clienteAnterior.direccion, despues: safeDireccion };
            if (safeTelefono && safeTelefono !== clienteAnterior.telefono) cambios.telefono = { antes: clienteAnterior.telefono, despues: safeTelefono };
            if (safeCiudad && safeCiudad !== clienteAnterior.ciudad) cambios.ciudad = { antes: clienteAnterior.ciudad, despues: safeCiudad };
            if (safeCorreo && safeCorreo !== clienteAnterior.correo) cambios.correo = { antes: clienteAnterior.correo, despues: safeCorreo };
            if (safeEstadoCliente && safeEstadoCliente !== clienteAnterior.estado_cliente) cambios.estado_cliente = { antes: clienteAnterior.estado_cliente, despues: safeEstadoCliente };
            if (safeTarifaId !== null && safeTarifaId !== clienteAnterior.tarifa_id) cambios.tarifa_id = { antes: clienteAnterior.tarifa_id, despues: safeTarifaId };

            // Actualizar cliente
            const updateQuery = `
                UPDATE clientes 
                SET nombre = COALESCE(?, nombre),
                    direccion = COALESCE(?, direccion),
                    telefono = COALESCE(?, telefono),
                    ciudad = COALESCE(?, ciudad),
                    correo = COALESCE(?, correo),
                    estado_cliente = COALESCE(?, estado_cliente),
                    tarifa_id = CASE WHEN ? IS NOT NULL THEN ? ELSE tarifa_id END,
                    modificado_por = ?
                WHERE id = ?
            `;

            await dbTurso.execute({
                sql: updateQuery,
                args: [safeNombre, safeDireccion, safeTelefono, safeCiudad, safeCorreo, safeEstadoCliente, safeTarifaId, safeTarifaId, safeModificadoPor, safeClienteId]
            });

            // Gestionar medidores
            const errores = [];
            let totalOperaciones = 0;
            let completadas = 0;

            // Calcular operaciones de medidores
            const totalMedidoresAsignar = Array.isArray(medidor_id) ? medidor_id.length : 0;
            const totalMedidoresLiberar = Array.isArray(medidores_liberados) ? medidores_liberados.length : 0;
            totalOperaciones = totalMedidoresAsignar + totalMedidoresLiberar;

            // Si no hay operaciones de medidores, ir directo al historial
            if (totalOperaciones === 0) {
                return await registrarHistorial();
            }

            // Liberar medidores
            if (totalMedidoresLiberar > 0) {
                for (const mid of medidores_liberados) {
                    try {
                        const medidorResult = await dbTurso.execute({
                            sql: `SELECT * FROM medidores WHERE id = ?`,
                            args: [mid]
                        });

                        if (medidorResult.rows.length === 0) {
                            errores.push(`Medidor ${mid} no encontrado`);
                        } else {
                            const medidor = medidorResult.rows[0];
                            if (Number(medidor.cliente_id) !== parseInt(clienteId)) {
                                errores.push(`El medidor ${mid} no pertenece al cliente actual`);
                            } else {
                                await dbTurso.execute({
                                    sql: `UPDATE medidores SET cliente_id = NULL WHERE id = ?`,
                                    args: [mid]
                                });
                                
                                cambios[`medidor_${mid}`] = {
                                    antes: Number(medidor.cliente_id),
                                    despues: null
                                };
                            }
                        }
                    } catch (err) {
                        errores.push(`Error al liberar medidor ${mid}: ${err.message}`);
                    }
                    
                    completadas++;
                    if (completadas === totalOperaciones) {
                        return await finalizarOperacion();
                    }
                }
            }

            // Asignar medidores
            if (totalMedidoresAsignar > 0) {
                for (const mid of medidor_id) {
                    try {
                        const medidorResult = await dbTurso.execute({
                            sql: `SELECT * FROM medidores WHERE id = ?`,
                            args: [mid]
                        });

                        if (medidorResult.rows.length === 0) {
                            errores.push(`Medidor ${mid} no encontrado`);
                        } else {
                            const medidor = medidorResult.rows[0];
                            const medidorClienteId = medidor.cliente_id ? Number(medidor.cliente_id) : null;
                            
                            if (medidorClienteId && medidorClienteId !== parseInt(clienteId)) {
                                errores.push(`Medidor ${mid} ya está asignado a otro cliente`);
                            } else if (medidorClienteId !== parseInt(clienteId)) {
                                await dbTurso.execute({
                                    sql: `UPDATE medidores SET cliente_id = ? WHERE id = ?`,
                                    args: [clienteId, mid]
                                });
                                
                                cambios[`medidor_${mid}`] = {
                                    antes: medidorClienteId,
                                    despues: parseInt(clienteId)
                                };
                            }
                        }
                    } catch (err) {
                        errores.push(`Error al asignar medidor ${mid}: ${err.message}`);
                    }
                    
                    completadas++;
                    if (completadas === totalOperaciones) {
                        return await finalizarOperacion();
                    }
                }
            }

            async function finalizarOperacion() {
                if (errores.length > 0) {
                    return res.status(400).json({ error: errores });
                }
                return await registrarHistorial();
            }

            async function registrarHistorial() {
                // Registrar cambios en historial
                if (Object.keys(cambios).length > 0) {
                    const insertHistorial = `
                        INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                        VALUES (?, ?, ?, ?, ?)
                    `;

                    await dbTurso.execute({
                        sql: insertHistorial,
                        args: [
                            'clientes',
                            'UPDATE',
                            clienteId,
                            modificado_por,
                            JSON.stringify(cambios)
                        ]
                    });
                }

                // Datos del cliente actualizado
                const clienteActualizado = {
                    id: parseInt(clienteId),
                    nombre: nombre || clienteAnterior.nombre,
                    direccion: direccion || clienteAnterior.direccion,
                    telefono: telefono || clienteAnterior.telefono,
                    ciudad: ciudad || clienteAnterior.ciudad,
                    correo: correo || clienteAnterior.correo,
                    estado_cliente: estado_cliente || clienteAnterior.estado_cliente,
                    tarifa_id: tarifa_id !== undefined ? tarifa_id : clienteAnterior.tarifa_id,
                    cambios: cambios,
                    fecha_modificacion: new Date().toISOString(),
                    modificado_por: modificado_por
                };

                // Enviar notificación SSE
                if (notificationManager) {
                    try {
                        notificationManager.alertaSistema(
                            `Cliente "${clienteActualizado.nombre}" ha sido modificado`,
                            'info',
                            {
                                cliente: clienteActualizado,
                                cambios_realizados: Object.keys(cambios).length,
                                accion: 'cliente_actualizado'
                            }
                        );
                    } catch (sseError) {
                        console.warn('Error enviando notificación SSE:', sseError);
                    }
                }

                res.json({ mensaje: "Cliente modificado", cambios });
            }

        } catch (err) {
            console.error('Error modificando cliente v2:', err);
            res.status(500).json({ error: "Error al modificar cliente" });
        }
    },

    // Asignar tarifa a un cliente (UPDATE especializado)
    asignarTarifa: async (req, res) => {
        const clienteId = req.params.id;
        const { tarifa_id } = req.body;
        const modificado_por = req.usuario.id;

        console.log("Asignando tarifa al cliente:", { clienteId, tarifa_id, modificado_por });

        if (!tarifa_id) {
            return res.status(400).json({ error: "El ID de la tarifa es obligatorio" });
        }

        try {
            // Verificar si el cliente existe
            const verificarClienteQuery = `SELECT id, nombre, tarifa_id FROM clientes WHERE id = ?`;
            const clienteResult = await dbTurso.execute({
                sql: verificarClienteQuery,
                args: [clienteId]
            });

            if (clienteResult.rows.length === 0) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }

            const cliente = clienteResult.rows[0];
            const tarifaAnterior = cliente.tarifa_id ? Number(cliente.tarifa_id) : null;

            // Verificar si la tarifa existe
            const verificarTarifaQuery = `SELECT id, nombre, descripcion FROM tarifas WHERE id = ?`;
            const tarifaResult = await dbTurso.execute({
                sql: verificarTarifaQuery,
                args: [tarifa_id]
            });

            if (tarifaResult.rows.length === 0) {
                return res.status(404).json({ error: "La tarifa especificada no existe" });
            }

            const tarifa = tarifaResult.rows[0];

            // Verificar si ya tiene esa tarifa asignada
            if (tarifaAnterior === Number(tarifa_id)) {
                return res.status(400).json({ 
                    error: "El cliente ya tiene esta tarifa asignada",
                    tarifa_actual: tarifaAnterior
                });
            }

            // Actualizar la tarifa del cliente
            const updateQuery = `
                UPDATE clientes 
                SET tarifa_id = ?, modificado_por = ?
                WHERE id = ?
            `;

            await dbTurso.execute({
                sql: updateQuery,
                args: [tarifa_id, modificado_por, clienteId]
            });

            // Registrar en historial
            const cambios = {
                tarifa_id: {
                    antes: tarifaAnterior,
                    despues: Number(tarifa_id)
                },
                tarifa_nombre: {
                    antes: null,
                    despues: tarifa.nombre
                },
                tarifa_descripcion: {
                    antes: null,
                    despues: tarifa.descripcion
                }
            };

            const insertHistorial = `
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES (?, ?, ?, ?, ?)
            `;

            await dbTurso.execute({
                sql: insertHistorial,
                args: [
                    'clientes',
                    'UPDATE',
                    clienteId,
                    modificado_por,
                    JSON.stringify(cambios)
                ]
            });

            // Enviar notificación SSE
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Tarifa actualizada para cliente "${cliente.nombre}"`,
                        'info',
                        {
                            cliente_id: Number(clienteId),
                            cliente_nombre: cliente.nombre,
                            tarifa_anterior: tarifaAnterior,
                            tarifa_nueva: Number(tarifa_id),
                            tarifa_nombre: tarifa.nombre,
                            accion: 'tarifa_asignada'
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            res.json({
                mensaje: "Tarifa asignada exitosamente",
                cliente_id: Number(clienteId),
                tarifa_anterior: tarifaAnterior,
                tarifa_nueva: Number(tarifa_id),
                tarifa_nombre: tarifa.nombre,
                tarifa_descripcion: tarifa.descripcion
            });

        } catch (err) {
            console.error('Error asignando tarifa:', err);
            res.status(500).json({ error: "Error al asignar tarifa" });
        }
    },

    // Estadísticas y analíticas de clientes
    estadisticas: async (req, res) => {
        try {
            // 1. Total de clientes
            const totalQuery = `SELECT COUNT(*) as total FROM clientes`;
            const totalResult = await dbTurso.execute({ sql: totalQuery });
            const totalClientes = Number(totalResult.rows[0].total);

            // 2. Clientes por estado
            const estadosQuery = `
                SELECT estado_cliente, COUNT(*) as cantidad
                FROM clientes
                GROUP BY estado_cliente
            `;
            const estadosResult = await dbTurso.execute({ sql: estadosQuery });
            const clientesPorEstado = estadosResult.rows.map(row => ({
                estado: row.estado_cliente,
                cantidad: Number(row.cantidad)
            }));

            // 3. Clientes registrados en el último mes
            const ultimoMesQuery = `
                SELECT COUNT(*) as total
                FROM clientes
                WHERE fecha_creacion >= datetime('now', '-1 month')
            `;
            const ultimoMesResult = await dbTurso.execute({ sql: ultimoMesQuery });
            const clientesUltimoMes = Number(ultimoMesResult.rows[0].total);

            // 4. Clientes registrados por mes (últimos 12 meses)
            const porMesQuery = `
                SELECT 
                    strftime('%Y-%m', fecha_creacion) as mes,
                    COUNT(*) as cantidad
                FROM clientes
                WHERE fecha_creacion >= datetime('now', '-12 months')
                GROUP BY strftime('%Y-%m', fecha_creacion)
                ORDER BY mes ASC
            `;
            const porMesResult = await dbTurso.execute({ sql: porMesQuery });
            const registrosPorMes = porMesResult.rows.map(row => ({
                mes: row.mes,
                cantidad: Number(row.cantidad)
            }));

            // 5. Clientes por ciudad/pueblo
            const porCiudadQuery = `
                SELECT ciudad, COUNT(*) as cantidad
                FROM clientes
                GROUP BY ciudad
                ORDER BY cantidad DESC
            `;
            const porCiudadResult = await dbTurso.execute({ sql: porCiudadQuery });
            const clientesPorCiudad = porCiudadResult.rows.map(row => ({
                ciudad: row.ciudad,
                cantidad: Number(row.cantidad)
            }));

            // 6. Clientes por tarifa
            const porTarifaQuery = `
                SELECT 
                    t.nombre as tarifa_nombre,
                    t.descripcion as tarifa_descripcion,
                    COUNT(c.id) as cantidad_clientes
                FROM clientes c
                LEFT JOIN tarifas t ON c.tarifa_id = t.id
                GROUP BY t.id, t.nombre, t.descripcion
                ORDER BY cantidad_clientes DESC
            `;
            const porTarifaResult = await dbTurso.execute({ sql: porTarifaQuery });
            const clientesPorTarifa = porTarifaResult.rows.map(row => ({
                tarifa_nombre: row.tarifa_nombre || 'Sin tarifa',
                tarifa_descripcion: row.tarifa_descripcion || null,
                cantidad_clientes: Number(row.cantidad_clientes)
            }));

            // 7. Clientes con medidores asignados
            const conMedidoresQuery = `
                SELECT 
                    COUNT(DISTINCT c.id) as clientes_con_medidores,
                    COUNT(m.id) as total_medidores_asignados
                FROM clientes c
                INNER JOIN medidores m ON c.id = m.cliente_id
            `;
            const conMedidoresResult = await dbTurso.execute({ sql: conMedidoresQuery });
            const clientesConMedidores = Number(conMedidoresResult.rows[0].clientes_con_medidores || 0);
            const totalMedidoresAsignados = Number(conMedidoresResult.rows[0].total_medidores_asignados || 0);

            // 8. Clientes sin medidores
            const sinMedidoresQuery = `
                SELECT COUNT(*) as total
                FROM clientes c
                WHERE NOT EXISTS (
                    SELECT 1 FROM medidores m WHERE m.cliente_id = c.id
                )
            `;
            const sinMedidoresResult = await dbTurso.execute({ sql: sinMedidoresQuery });
            const clientesSinMedidores = Number(sinMedidoresResult.rows[0].total);

            // 9. Distribución por mes de registro (año actual)
            const anoActualQuery = `
                SELECT 
                    strftime('%m', fecha_creacion) as mes_numero,
                    COUNT(*) as cantidad
                FROM clientes
                WHERE strftime('%Y', fecha_creacion) = strftime('%Y', 'now')
                GROUP BY strftime('%m', fecha_creacion)
                ORDER BY mes_numero ASC
            `;
            const anoActualResult = await dbTurso.execute({ sql: anoActualQuery });
            const registrosAnoActual = anoActualResult.rows.map(row => {
                const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                return {
                    mes: meses[parseInt(row.mes_numero) - 1],
                    cantidad: Number(row.cantidad)
                };
            });

            // 10. Clientes activos vs inactivos
            const activosQuery = `
                SELECT 
                    CASE 
                        WHEN estado_cliente = 'Activo' THEN 'activos'
                        ELSE 'inactivos'
                    END as tipo,
                    COUNT(*) as cantidad
                FROM clientes
                GROUP BY tipo
            `;
            const activosResult = await dbTurso.execute({ sql: activosQuery });
            const distribucionActivos = {};
            activosResult.rows.forEach(row => {
                distribucionActivos[row.tipo] = Number(row.cantidad);
            });

            // Respuesta consolidada
            res.json({
                resumen: {
                    total_clientes: totalClientes,
                    clientes_ultimo_mes: clientesUltimoMes,
                    clientes_activos: distribucionActivos.activos || 0,
                    clientes_inactivos: distribucionActivos.inactivos || 0,
                    clientes_con_medidores: clientesConMedidores,
                    clientes_sin_medidores: clientesSinMedidores,
                    total_medidores_asignados: totalMedidoresAsignados
                },
                distribucion: {
                    por_estado: clientesPorEstado,
                    por_ciudad: clientesPorCiudad,
                    por_tarifa: clientesPorTarifa
                },
                tendencias: {
                    registros_por_mes: registrosPorMes,
                    registros_ano_actual: registrosAnoActual
                },
                medidores: {
                    clientes_con_medidores: clientesConMedidores,
                    clientes_sin_medidores: clientesSinMedidores,
                    total_medidores_asignados: totalMedidoresAsignados,
                    porcentaje_con_medidores: totalClientes > 0 
                        ? ((clientesConMedidores / totalClientes) * 100).toFixed(2) 
                        : 0
                },
                fecha_generacion: new Date().toISOString()
            });

        } catch (err) {
            console.error('Error obteniendo estadísticas de clientes:', err);
            res.status(500).json({ error: "Error al obtener estadísticas" });
        }
    },

    // Eliminar cliente (soft delete)
    eliminarCliente: async (req, res) => {
        const { id } = req.params;
        const { razon } = req.body;
        const eliminado_por = req.usuario.id;

        try {
            // Verificar si el cliente existe
            const verificarQuery = `SELECT * FROM clientes WHERE id = ?`;
            const clienteResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [id]
            });

            if (clienteResult.rows.length === 0) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }

            const cliente = clienteResult.rows[0];

            if (cliente.estado_cliente === 'Eliminado') {
                return res.status(400).json({ error: "El cliente ya está eliminado" });
            }

            // Verificar si tiene facturas pendientes
            const facturasQuery = `
                SELECT COUNT(*) as total FROM facturas 
                WHERE cliente_id = ? AND estado IN ('Pendiente', 'Parcial')
            `;
            const facturasResult = await dbTurso.execute({
                sql: facturasQuery,
                args: [id]
            });

            const facturasPendientes = facturasResult.rows[0].total;
            if (facturasPendientes > 0) {
                return res.status(400).json({ 
                    error: "No se puede eliminar el cliente porque tiene facturas pendientes",
                    facturas_pendientes: facturasPendientes
                });
            }

            // Soft delete: actualizar estado a 'Eliminado'
            const updateQuery = `
                UPDATE clientes 
                SET estado_cliente = 'Eliminado',
                    fecha_eliminacion = datetime('now'),
                    eliminado_por = ?,
                    razon_eliminacion = ?
                WHERE id = ?
            `;

            await dbTurso.execute({
                sql: updateQuery,
                args: [eliminado_por, razon || 'Sin razón especificada', id]
            });

            // Registrar en historial de cambios
            const insertHistorial = `
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES (?, ?, ?, ?, ?)
            `;

            await dbTurso.execute({
                sql: insertHistorial,
                args: [
                    'clientes',
                    'SOFT_DELETE',
                    id,
                    eliminado_por,
                    JSON.stringify({
                        estado_anterior: cliente.estado_cliente,
                        estado_nuevo: 'Eliminado',
                        razon: razon || 'Sin razón especificada'
                    })
                ]
            });

            // Emitir evento SSE
            if (notificationManager) {
                notificationManager.notifyAll({
                    type: 'cliente_eliminado',
                    data: {
                        cliente_id: id,
                        nombre: cliente.nombre,
                        razon: razon || 'Sin razón especificada'
                    }
                });
            }

            res.json({ 
                message: "Cliente eliminado correctamente",
                cliente_id: id 
            });

        } catch (err) {
            console.error('Error eliminando cliente:', err);
            res.status(500).json({ error: "Error al eliminar cliente" });
        }
    },

    // Restaurar cliente eliminado
    restaurarCliente: async (req, res) => {
        const { id } = req.params;
        const modificado_por = req.usuario.id;

        try {
            // Verificar si el cliente existe y está eliminado
            const verificarQuery = `SELECT * FROM clientes WHERE id = ?`;
            const clienteResult = await dbTurso.execute({
                sql: verificarQuery,
                args: [id]
            });

            if (clienteResult.rows.length === 0) {
                return res.status(404).json({ error: "Cliente no encontrado" });
            }

            const cliente = clienteResult.rows[0];

            if (cliente.estado_cliente !== 'Eliminado') {
                return res.status(400).json({ 
                    error: "El cliente no está eliminado",
                    estado_actual: cliente.estado_cliente
                });
            }

            // Restaurar cliente: cambiar estado a 'Activo'
            const updateQuery = `
                UPDATE clientes 
                SET estado_cliente = 'Activo',
                    fecha_eliminacion = NULL,
                    eliminado_por = NULL,
                    razon_eliminacion = NULL,
                    modificado_por = ?
                WHERE id = ?
            `;

            await dbTurso.execute({
                sql: updateQuery,
                args: [modificado_por, id]
            });

            // Registrar en historial de cambios
            const insertHistorial = `
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES (?, ?, ?, ?, ?)
            `;

            await dbTurso.execute({
                sql: insertHistorial,
                args: [
                    'clientes',
                    'RESTORE',
                    id,
                    modificado_por,
                    JSON.stringify({
                        estado_anterior: 'Eliminado',
                        estado_nuevo: 'Activo',
                        razon_eliminacion_anterior: cliente.razon_eliminacion
                    })
                ]
            });

            // Emitir evento SSE
            if (notificationManager) {
                notificationManager.notifyAll({
                    type: 'cliente_restaurado',
                    data: {
                        cliente_id: id,
                        nombre: cliente.nombre
                    }
                });
            }

            res.json({ 
                message: "Cliente restaurado correctamente",
                cliente_id: id 
            });

        } catch (err) {
            console.error('Error restaurando cliente:', err);
            res.status(500).json({ error: "Error al restaurar cliente" });
        }
    },

    // Obtener clientes eliminados
    obtenerClientesEliminados: async (req, res) => {
        try {
            const query = `
                SELECT 
                    c.id,
                    c.nombre,
                    c.direccion,
                    c.telefono,
                    c.ciudad,
                    c.correo,
                    c.fecha_eliminacion,
                    c.razon_eliminacion,
                    u.nombre as eliminado_por_nombre,
                    (SELECT COUNT(*) FROM facturas f WHERE f.cliente_id = c.id) as total_facturas,
                    (SELECT COUNT(*) FROM medidores m WHERE m.cliente_id = c.id) as total_medidores
                FROM clientes c
                LEFT JOIN usuarios u ON c.eliminado_por = u.id
                WHERE c.estado_cliente = 'Eliminado'
                ORDER BY c.fecha_eliminacion DESC
            `;

            const result = await dbTurso.execute(query);

            res.json({
                total: result.rows.length,
                clientes_eliminados: result.rows
            });

        } catch (err) {
            console.error('Error obteniendo clientes eliminados:', err);
            res.status(500).json({ error: "Error al obtener clientes eliminados" });
        }
    }
};

export default clientesController;
