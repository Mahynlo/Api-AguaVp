const db = require('../../database/db');
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

const tarifasController = {
    registrarTarifa: (req, res) => {
        try {
            const { nombre, descripcion, fecha_inicio, fecha_fin, modificado_por } = req.body;

            //validamos que la fecha inicio sea mayor a fecha fin
            if (fecha_fin && new Date(fecha_inicio) > new Date(fecha_fin)) {
                return res.status(400).json({ error: 'La fecha de inicio no puede ser mayor a la fecha de fin' });
            }

            console.log("Body Tarifa", req.body);

            if (!nombre || !descripcion || !fecha_inicio || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            const query = `
            INSERT INTO tarifas (nombre, descripcion, fecha_inicio, fecha_fin, modificado_por)
            VALUES (?, ?, ?, ?, ?)
        `;

            db.run(query, [nombre, descripcion, fecha_inicio, fecha_fin || null, modificado_por], function (err) {
                if (err) {
                    console.error('Error al crear tarifa:', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                const tarifa_id = this.lastID;
                
                // Datos completos de la tarifa para WebSocket
                const tarifaCompleta = {
                    id: tarifa_id,
                    nombre,
                    descripcion,
                    fecha_inicio,
                    fecha_fin: fecha_fin || null,
                    modificado_por,
                    fecha_creacion: new Date().toISOString()
                };

                // Emitir eventos WebSocket
                console.log('🔌 [tarifasController] Emitiendo eventos WebSocket para tarifa creada:', tarifaCompleta);
                if (res.websocket) {
                    // Notificar a administradores sobre nueva tarifa
                    res.websocket.emitToRoom('administradores', 'tarifa_creada', {
                        message: `Nueva tarifa "${nombre}" creada`,
                        tarifa: tarifaCompleta,
                        timestamp: new Date().toISOString()
                    });
                    console.log('🔌 [tarifasController] WebSocket events emitted successfully');

                    // Notificar a operadores que manejan facturación
                    res.websocket.emitToRoom('operadores', 'nueva_tarifa_disponible', {
                        message: `Tarifa "${nombre}" disponible para facturación`,
                        tarifa_id,
                        nombre,
                        vigencia: {
                            inicio: fecha_inicio,
                            fin: fecha_fin
                        }
                    });

                    console.log('🔌 [tarifasController] Notificación a operadores enviada');

                    // Broadcast para actualización de dashboard
                    res.websocket.broadcast('dashboard_update', {
                        type: 'tarifa_creada',
                        data: {
                            tarifa_id,
                            nombre,
                            fecha_inicio,
                            fecha_fin
                        }
                    });
                    console.log('🔌 [tarifasController] Dashboard update broadcasted');
                }

                return res.status(201).json({ 
                    mensaje: 'Tarifa creada exitosamente', 
                    tarifa_id,
                    detalles: tarifaCompleta
                });
            });

        } catch (error) {
            console.error('Error al crear tarifa:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },


    /**
     * Reglas de Validación a Implementar en los rangos 
        No se permiten valores negativos en consumo_min, consumo_max y precio_por_m3.

        consumo_min < consumo_max siempre.

        No se repiten rangos exactamente iguales (min, max, tarifa_id).

        No se permite que un consumo_min sea igual a un consumo_max existente.

        Evitar huecos involuntarios, por ejemplo, si un rango termina en 10, el siguiente debería comenzar en 11.

        Sugerencia (opcional): automatizar el próximo consumo_min si falta, usando último consumo_max + 1.
     */

   registrarRangosTarifa: (req, res) => {
    try {
        const { tarifa_id, rangos } = req.body;

        if (!tarifa_id || !Array.isArray(rangos) || rangos.length === 0) {
            return res.status(400).json({ error: 'Faltan datos de tarifa o rangos (error-BK)' });
        }

        // Validación interna y de formato
        for (const rango of rangos) {
            const { consumo_min, consumo_max, precio_por_m3 } = rango;

            if (
                consumo_min == null || consumo_max == null || precio_por_m3 == null ||
                consumo_min < 0 || consumo_max < 0 || precio_por_m3 < 0
            ) {
                return res.status(400).json({
                    error: 'Los valores de consumo y precio no pueden ser negativos o nulos (error-BK)',
                });
            }

            if (consumo_min >= consumo_max) {
                return res.status(400).json({
                    error: `El consumo mínimo (${consumo_min}) debe ser menor que el consumo máximo (${consumo_max}) (error-BK)`,
                });
            }
        }

        // Validación cruzada entre rangos del mismo lote
        const ordenados = [...rangos].sort((a, b) => a.consumo_min - b.consumo_min);
        const clavesSet = new Set();

        for (let i = 0; i < ordenados.length; i++) {
            const actual = ordenados[i];
            const clave = `${actual.consumo_min}-${actual.consumo_max}`;

            // Duplicado exacto en el lote
            if (clavesSet.has(clave)) {
                return res.status(400).json({
                    error: `Ya existe un rango duplicado en la solicitud: [${clave}] (error-BK)`,
                });
            }
            clavesSet.add(clave);

            // consumo_min igual a consumo_max de otro rango
            for (let j = 0; j < ordenados.length; j++) {
                if (i !== j && actual.consumo_min === ordenados[j].consumo_max) {
                    return res.status(400).json({
                        error: `El consumo mínimo (${actual.consumo_min}) no puede ser igual al consumo máximo (${ordenados[j].consumo_max}) de otro rango (error-BK)`,
                    });
                }
            }

            // Verificar huecos involuntarios
            const siguiente = ordenados[i + 1];
            if (siguiente && actual.consumo_max + 1 < siguiente.consumo_min) {
                return res.status(400).json({
                    error: `Hay un hueco entre los rangos [${actual.consumo_min}-${actual.consumo_max}] y [${siguiente.consumo_min}-${siguiente.consumo_max}] (error-BK)`,
                });
            }
        }

        // Insertar todos después de validar
        const insertQuery = `
            INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3)
            VALUES (?, ?, ?, ?)
        `;
        const insertStmt = db.prepare(insertQuery);

        for (const { consumo_min, consumo_max, precio_por_m3 } of rangos) {
            insertStmt.run([tarifa_id, consumo_min, consumo_max, precio_por_m3]);
        }

        insertStmt.finalize(() => {
            console.log(`✅ [tarifasController] Rangos registrados exitosamente para tarifa ID ${tarifa_id}`);
            // Emitir eventos WebSocket tras completar rangos
            if (res.websocket) {
                // Notificar configuración completa de tarifa
                res.websocket.emitToRoom('administradores', 'tarifa_configurada', {
                    message: `Tarifa ID ${tarifa_id} configurada con ${rangos.length} rangos`,
                    tarifa_id,
                    total_rangos: rangos.length,
                    rangos_resumen: rangos.map(r => ({
                        min: r.consumo_min,
                        max: r.consumo_max,
                        precio: r.precio_por_m3
                    })),
                    timestamp: new Date().toISOString()
                });
                console.log('🔌 [tarifasController] WebSocket events emitted successfully');


                // Notificar a operadores que la tarifa está lista
                res.websocket.emitToRoom('operadores', 'tarifa_lista', {
                    message: `Tarifa ID ${tarifa_id} lista para usar en facturación`,
                    tarifa_id,
                    total_rangos: rangos.length
                });
                console.log('🔌 [tarifasController] Notificación a operadores enviada');
            }

            return res.status(200).json({ 
                mensaje: 'Rangos registrados correctamente (error-BK)',
                tarifa_id,
                rangos_procesados: rangos.length
            });
        });

    } catch (error) {
        console.error('Error al registrar rangos:', error);
        return res.status(500).json({
            error: 'Error interno del servidor (error-BK)',
            detalle: error.message,
        });
    }
},


    obtenerTodasLasTarifas: (req, res) => {
        try {
            const tarifasQuery = `SELECT * FROM tarifas`;

            db.all(tarifasQuery, [], (err, tarifas) => {
                if (err) {
                    //console.error('Error al obtener tarifas:', err);
                    return res.status(500).json({ error: 'Error interno del servidor(error-BK)' });
                }

                if (!tarifas || tarifas.length === 0) {
                    return res.status(404).json({ error: 'No hay tarifas registradas(error-BK)' });
                }

                const tarifasConRangos = [];

                let completadas = 0;

                tarifas.forEach((tarifa) => {
                    const rangosQuery = `SELECT * FROM rangos_tarifas WHERE tarifa_id = ? ORDER BY consumo_min ASC`;

                    db.all(rangosQuery, [tarifa.id], (err, rangos) => {
                        if (err) {
                            console.error('Error al obtener rangos:', err);
                            return res.status(500).json({ error: 'Error interno del servidor(error-BK)' });
                        }

                        tarifasConRangos.push({
                            ...tarifa,
                            rangos
                        });

                        completadas++;

                        if (completadas === tarifas.length) {
                            return res.status(200).json(tarifasConRangos);
                        }
                    });
                });
            });
        } catch (error) {
            console.error('Error al obtener tarifas:', error);
            return res.status(500).json({ error: 'Error interno del servidor(error-BK)' });
        }
    },



    obtenerHistorialTarifas: (req, res) => {
        try {
            const query = `SELECT * FROM historial_tarifas`;
            db.all(query, [], (err, rows) => {
                if (err) {
                    console.error('Error al obtener historial de tarifas:', err);
                    return res.status(500).json({ error: 'Error interno del servidor(error-BK)' });
                }
                return res.status(200).json(rows);
            });
        } catch (error) {
            console.error('Error al obtener historial de tarifas:', error);
            return res.status(500).json({ error: 'Error interno del servidor(error-BK)' });
        }
    },


    //modificar una tarifa
    modificarTarifa: (req, res) => {
        try {
            const { id } = req.params;
            const { nombre, descripcion, fecha_inicio, fecha_fin } = req.body;
            const modificado_por = req.usuario.id;

            if (!descripcion || !fecha_inicio || !modificado_por) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            const query = `
        UPDATE tarifas
        SET nombre = ?, descripcion = ?, fecha_inicio = ?, fecha_fin = ?, modificado_por = ?
        WHERE id = ?
        `;

            db.run(query, [nombre, descripcion, fecha_inicio, fecha_fin || null, modificado_por, id], function (err) {
                if (err) {
                    console.error('Error al modificar tarifa:', err);
                    return res.status(500).json({ error: 'Error interno del servidor' });
                }

                return res.status(200).json({ mensaje: 'Tarifa modificada exitosamente' });
            });

        } catch (error) {
            console.error('Error al modificar tarifa:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },


    modificarRangosTarifa: (req, res) => {
    try {
        const { tarifa_id, rangos } = req.body;

        if (!tarifa_id || !Array.isArray(rangos) || rangos.length === 0) {
            return res.status(400).json({ error: 'Faltan datos de tarifa o rangos (error-BK)' });
        }

        // Validar individualmente
        for (const r of rangos) {
            const { consumo_min, consumo_max, precio_por_m3 } = r;
            if (consumo_min < 0 || (consumo_max != null && consumo_max < 0) || precio_por_m3 < 0) {
                return res.status(400).json({ error: 'Los valores no pueden ser negativos (error-BK)' });
            }
            if (consumo_max != null && consumo_min >= consumo_max) {
                return res.status(400).json({ error: 'El consumo mínimo debe ser menor que el máximo (error-BK)' });
            }
        }

        // Validar contra duplicados en el mismo lote
        for (let i = 0; i < rangos.length; i++) {
            for (let j = i + 1; j < rangos.length; j++) {
                const a = rangos[i];
                const b = rangos[j];

                if (a.consumo_min === b.consumo_min && a.consumo_max === b.consumo_max) {
                    return res.status(400).json({ error: `Rango duplicado [${a.consumo_min}-${a.consumo_max}] en el lote (error-BK)` });
                }

                if (a.consumo_min === b.consumo_max || a.consumo_max === b.consumo_min) {
                    return res.status(400).json({ error: `No se permite que un mínimo sea igual al máximo de otro rango (error-BK)` });
                }
            }
        }

        // Ordenar por consumo_min para verificar continuidad
        const ordenados = [...rangos].sort((a, b) => a.consumo_min - b.consumo_min);
        for (let i = 0; i < ordenados.length - 1; i++) {
            const actual = ordenados[i];
            const siguiente = ordenados[i + 1];

            if (actual.consumo_max != null && siguiente.consumo_min !== actual.consumo_max + 1) {
                console.warn(`⚠️ Advertencia: Posible hueco entre rangos [${actual.consumo_min}-${actual.consumo_max}] y [${siguiente.consumo_min}-${siguiente.consumo_max}]`);
                // Puedes convertir esto en un return si no deseas permitir huecos.
            }
        }

        // Preparar consultas
        const updateQuery = `
            UPDATE rangos_tarifas
            SET consumo_min = ?, consumo_max = ?, precio_por_m3 = ?
            WHERE id = ? AND tarifa_id = ?
        `;
        const insertQuery = `
            INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3)
            VALUES (?, ?, ?, ?)
        `;

        const updateStmt = db.prepare(updateQuery);
        const insertStmt = db.prepare(insertQuery);

        for (const r of rangos) {
            const { id, consumo_min, consumo_max, precio_por_m3 } = r;
            if (id != null) {
                updateStmt.run([consumo_min, consumo_max ?? null, precio_por_m3, id, tarifa_id]);
            } else {
                insertStmt.run([tarifa_id, consumo_min, consumo_max ?? null, precio_por_m3]);
            }
        }

        updateStmt.finalize();
        insertStmt.finalize();

        return res.status(200).json({ mensaje: 'Rangos modificados/agregados exitosamente (error-BK)' });

    } catch (error) {
        console.error('Error al modificar/agregar rangos:', error);
        return res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
    }
},

    // Middleware de WebSocket para todas las operaciones de tarifas
    withWebSocket: ControllerIntegration.withWebSocket
}

module.exports = tarifasController;


