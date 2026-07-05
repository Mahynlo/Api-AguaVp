import dbTurso from "../../database/db-sqlite.js";

function serviceError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

export async function registrarMedidor(datos, usuarioId) {
    const { cliente_id, numero_serie, marca, modelo, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, lectura_base, capacidad_maxima } = datos;

    const existeSerie = await dbTurso.execute({ sql: `SELECT id FROM medidores WHERE numero_serie = ?`, args: [numero_serie] });
    if (existeSerie.rows.length > 0) throw serviceError("El número de serie ya está registrado", 409);

    if (cliente_id) {
        const existeCliente = await dbTurso.execute({ sql: `SELECT id FROM clientes WHERE id = ?`, args: [cliente_id] });
        if (existeCliente.rows.length === 0) throw serviceError("El cliente especificado no existe", 404);
    }

    const insertResult = await dbTurso.execute({
        sql: `INSERT INTO medidores (cliente_id, numero_serie, marca, modelo, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, lectura_base, capacidad_maxima)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [cliente_id ?? null, numero_serie, marca ?? null, modelo ?? null, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor ?? 'Activo', lectura_base ?? null, capacidad_maxima ?? null]
    });

    const id = Number(insertResult.lastInsertRowid);

    const datosInsertados = { cliente_id: cliente_id ?? null, numero_serie, marca: marca ?? null, modelo: modelo ?? null, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor: estado_medidor ?? 'Activo' };

    await dbTurso.execute({
        sql: `INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios) VALUES (?, ?, ?, ?, ?)`,
        args: ['medidores', 'INSERT', id, usuarioId, JSON.stringify(datosInsertados)]
    });

    return { id, ...datosInsertados, modificado_por: usuarioId, fecha_creacion: new Date().toISOString() };
}

export async function obtenerMedidores(query = {}) {
    const { page, limit, search, estado, ubicacion, cliente_id, cliente_nombre, numero_predio, asignacion, incluirEliminados } = query;
    const incluirEliminadosBool = incluirEliminados === 'true' || incluirEliminados === true;
    const hayPaginacion = page || limit || search || estado || ubicacion || cliente_id || cliente_nombre || numero_predio || asignacion;

    const baseSelect = `SELECT m.*, c.nombre AS cliente_nombre, c.numero_predio, rp.ruta_id, r.nombre AS ruta_nombre
                        FROM medidores m
                        LEFT JOIN clientes c ON c.id = m.cliente_id
                        LEFT JOIN rutas_puntos rp ON rp.medidor_id = m.id
                        LEFT JOIN rutas r ON r.id = rp.ruta_id`;

    const mapRow = row => ({
        ...row,
        id: Number(row.id),
        cliente_id: row.cliente_id ? Number(row.cliente_id) : null,
        ruta_id: row.ruta_id ? Number(row.ruta_id) : null,
        ruta_nombre: row.ruta_nombre || null
    });

    if (!hayPaginacion) {
        const sqlQuery = baseSelect + 
            (incluirEliminadosBool ? "" : " WHERE m.fecha_eliminacion IS NULL") + 
            " ORDER BY m.fecha_creacion DESC";
        const result = await dbTurso.execute({ sql: sqlQuery });
        return result.rows.map(mapRow);
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 60;
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const args = [];

    if (!incluirEliminadosBool) {
        conditions.push(`m.fecha_eliminacion IS NULL`);
    }

    if (search) {
        const t = `%${search}%`;
        conditions.push(`(m.numero_serie LIKE ? OR m.marca LIKE ? OR m.modelo LIKE ? OR m.ubicacion LIKE ? OR c.nombre LIKE ? OR c.numero_predio LIKE ?)`);
        args.push(t, t, t, t, t, t);
    }
    if (estado && estado !== 'All') {
        if (estado === 'Cortado') { conditions.push(`m.estado_servicio = ?`); args.push(estado); }
        else if (estado === 'Activo') { conditions.push(`(m.estado_medidor = ? AND m.estado_servicio = 'Activo')`); args.push('Activo'); }
        else { conditions.push(`m.estado_medidor = ?`); args.push(estado); }
    }
    if (ubicacion && ubicacion !== 'All') { conditions.push(`m.ubicacion LIKE ?`); args.push(`%${ubicacion}%`); }
    if (cliente_id && cliente_id !== 'All') { conditions.push(`m.cliente_id = ?`); args.push(cliente_id); }
    if (cliente_nombre) { conditions.push(`c.nombre LIKE ?`); args.push(`%${cliente_nombre}%`); }
    if (numero_predio) { conditions.push(`c.numero_predio LIKE ?`); args.push(`%${numero_predio}%`); }
    if (asignacion && asignacion !== 'All') {
        if (asignacion === 'asignados') conditions.push(`m.cliente_id IS NOT NULL`);
        else if (asignacion === 'sin_asignar' || asignacion === 'no_asignados') conditions.push(`m.cliente_id IS NULL`);
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const [countResult, dataResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM medidores m LEFT JOIN clientes c ON c.id = m.cliente_id${where}`, args }),
        dbTurso.execute({ sql: baseSelect + where + ` ORDER BY m.fecha_creacion DESC LIMIT ? OFFSET ?`, args: [...args, limitNum, offset] })
    ]);

    return {
        data: dataResult.rows.map(mapRow),
        pagination: {
            total: Number(countResult.rows[0].total),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(Number(countResult.rows[0].total) / limitNum)
        }
    };
}

export async function modificarMedidor(id, datos, usuarioId) {
    const { cliente_id, numero_serie, marca, modelo, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, estado_servicio, fecha_corte, lectura_base, capacidad_maxima } = datos;

    const medidorResult = await dbTurso.execute({ sql: `SELECT * FROM medidores WHERE id = ?`, args: [id] });
    if (medidorResult.rows.length === 0) throw serviceError("Medidor no encontrado", 404);
    const prev = medidorResult.rows[0];

    if (lectura_base !== undefined && String(lectura_base) !== String(prev.lectura_base)) {
        const count = await dbTurso.execute({ sql: `SELECT COUNT(*) AS total FROM lecturas WHERE medidor_id = ?`, args: [id] });
        if (Number(count.rows[0].total) > 0) {
            throw serviceError("No se puede modificar la lectura base porque el medidor ya tiene lecturas registradas.", 409);
        }
    }

    if (numero_serie && numero_serie !== prev.numero_serie) {
        const dupe = await dbTurso.execute({ sql: `SELECT id FROM medidores WHERE numero_serie = ? AND id != ?`, args: [numero_serie, id] });
        if (dupe.rows.length > 0) throw serviceError("El número de serie ya está en uso", 409);
    }

    if (cliente_id && cliente_id !== prev.cliente_id) {
        const cli = await dbTurso.execute({ sql: `SELECT id FROM clientes WHERE id = ?`, args: [cliente_id] });
        if (cli.rows.length === 0) throw serviceError("El cliente especificado no existe", 404);
    }

    const cambios = {};
    const track = (campo, nuevo, anterior) => { if (nuevo !== undefined && String(nuevo) !== String(anterior)) cambios[campo] = { antes: anterior, despues: nuevo }; };
    track('cliente_id', cliente_id, prev.cliente_id);
    track('numero_serie', numero_serie, prev.numero_serie);
    track('marca', marca, prev.marca);
    track('modelo', modelo, prev.modelo);
    track('ubicacion', ubicacion, prev.ubicacion);
    track('fecha_instalacion', fecha_instalacion, prev.fecha_instalacion);
    track('latitud', latitud, prev.latitud);
    track('longitud', longitud, prev.longitud);
    track('estado_medidor', estado_medidor, prev.estado_medidor);
    track('estado_servicio', estado_servicio, prev.estado_servicio);
    track('fecha_corte', fecha_corte, prev.fecha_corte);
    track('lectura_base', lectura_base, prev.lectura_base);
    track('capacidad_maxima', capacidad_maxima, prev.capacidad_maxima);

    const updateResult = await dbTurso.execute({
        sql: `UPDATE medidores SET
              cliente_id = COALESCE(?, cliente_id),
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
              WHERE id = ?`,
        args: [
            cliente_id ?? null, numero_serie ?? null, marca ?? null, modelo ?? null,
            ubicacion ?? null, fecha_instalacion ?? null, latitud ?? null, longitud ?? null,
            estado_medidor ?? null, estado_servicio ?? null, fecha_corte ?? null,
            lectura_base !== undefined ? lectura_base : null, lectura_base !== undefined ? lectura_base : null,
            capacidad_maxima !== undefined ? capacidad_maxima : null, capacidad_maxima !== undefined ? capacidad_maxima : null,
            id
        ]
    });

    if (Object.keys(cambios).length > 0) {
        await dbTurso.execute({
            sql: `INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios) VALUES (?, ?, ?, ?, ?)`,
            args: ['medidores', 'UPDATE', id, usuarioId, JSON.stringify(cambios)]
        });
    }

    return {
        id: parseInt(id),
        numero_serie: numero_serie || prev.numero_serie,
        cambios,
        rowsAffected: Number(updateResult.rowsAffected)
    };
}

export async function eliminarMedidor(id, usuarioId, razon) {
    const medidorResult = await dbTurso.execute({ sql: `SELECT * FROM medidores WHERE id = ?`, args: [id] });
    if (medidorResult.rows.length === 0) throw serviceError("Medidor no encontrado", 404);
    const medidor = medidorResult.rows[0];

    if (medidor.fecha_eliminacion) throw serviceError("El medidor ya está eliminado", 400);

    // Validar si está asignado a un cliente activo
    if (medidor.cliente_id) {
        const clienteResult = await dbTurso.execute({ sql: `SELECT id, nombre, estado_cliente FROM clientes WHERE id = ?`, args: [medidor.cliente_id] });
        if (clienteResult.rows.length > 0) {
            const cliente = clienteResult.rows[0];
            if (cliente.estado_cliente !== 'Eliminado') {
                throw serviceError(`No se puede eliminar el medidor porque está asignado al cliente activo "${cliente.nombre}". Libérelo primero.`, 400);
            }
        }
    }

    const clienteIdAnterior = medidor.cliente_id ? Number(medidor.cliente_id) : null;

    // Ejecutar actualización
    await dbTurso.execute({
        sql: `UPDATE medidores SET 
                cliente_id = NULL,
                fecha_eliminacion = datetime('now'),
                eliminado_por = ?,
                razon_eliminacion = ?
              WHERE id = ?`,
        args: [usuarioId, razon || 'Sin razón especificada', id]
    });

    // Si estaba en una ruta, eliminarlo
    await dbTurso.execute({
        sql: `DELETE FROM rutas_puntos WHERE medidor_id = ?`,
        args: [id]
    });

    // Registrar en historial_cambios
    await dbTurso.execute({
        sql: `INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios) VALUES (?, ?, ?, ?, ?)`,
        args: ['medidores', 'SOFT_DELETE', id, usuarioId, JSON.stringify({
            estado_anterior: medidor.estado_medidor,
            cliente_id_anterior: clienteIdAnterior,
            razon: razon || 'Sin razón especificada'
        })]
    });

    return { numero_serie: medidor.numero_serie };
}

export async function restaurarMedidor(id, usuarioId) {
    const medidorResult = await dbTurso.execute({ sql: `SELECT * FROM medidores WHERE id = ?`, args: [id] });
    if (medidorResult.rows.length === 0) throw serviceError("Medidor no encontrado", 404);
    const medidor = medidorResult.rows[0];

    if (!medidor.fecha_eliminacion) throw serviceError("El medidor no está eliminado", 400);

    await dbTurso.execute({
        sql: `UPDATE medidores SET 
                fecha_eliminacion = NULL,
                eliminado_por = NULL,
                razon_eliminacion = NULL
              WHERE id = ?`,
        args: [id]
    });

    await dbTurso.execute({
        sql: `INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios) VALUES (?, ?, ?, ?, ?)`,
        args: ['medidores', 'RESTORE', id, usuarioId, JSON.stringify({
            razon_eliminacion_anterior: medidor.razon_eliminacion
        })]
    });

    return { numero_serie: medidor.numero_serie };
}

export async function obtenerMedidoresEliminados() {
    const result = await dbTurso.execute({
        sql: `SELECT m.*, u.username as eliminado_por_nombre 
              FROM medidores m 
              LEFT JOIN usuarios u ON m.eliminado_por = u.id 
              WHERE m.fecha_eliminacion IS NOT NULL 
              ORDER BY m.fecha_eliminacion DESC`
    });
    return { total: result.rows.length, medidores_eliminados: result.rows };
}

export async function purgarMedidor(id) {
    const medidorResult = await dbTurso.execute({ sql: `SELECT * FROM medidores WHERE id = ?`, args: [id] });
    if (medidorResult.rows.length === 0) throw serviceError("Medidor no encontrado", 404);
    const medidor = medidorResult.rows[0];

    if (!medidor.fecha_eliminacion) throw serviceError("El medidor debe estar en la papelera para poder eliminarlo definitivamente", 400);

    // 1. Verificar lecturas
    const lecturas = await dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM lecturas WHERE medidor_id = ?`, args: [id] });
    if (Number(lecturas.rows[0].total) > 0) {
        throw serviceError("No se puede eliminar definitivamente el medidor porque tiene historial de lecturas registradas", 400);
    }

    // 2. Verificar historial de asignación
    const historial = await dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM cliente_medidor_historial WHERE medidor_id = ?`, args: [id] });
    if (Number(historial.rows[0].total) > 0) {
        throw serviceError("No se puede eliminar definitivamente el medidor porque tiene historial de asignación a clientes", 400);
    }

    // 3. Ejecutar DELETE físico
    await dbTurso.execute({ sql: `DELETE FROM medidores WHERE id = ?`, args: [id] });
    await dbTurso.execute({
        sql: `INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios) VALUES (?, ?, ?, ?, ?)`,
        args: ['medidores', 'HARD_DELETE', id, null, JSON.stringify({ numero_serie: medidor.numero_serie })]
    });

    return { numero_serie: medidor.numero_serie };
}
