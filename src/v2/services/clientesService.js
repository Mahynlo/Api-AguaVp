import dbTurso, { sqlite } from '../../database/db-sqlite.js';

function serviceError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function mapCliente(c) {
    return { id: Number(c.id), numero_predio: c.numero_predio || null, nombre: c.nombre, direccion: c.direccion, telefono: c.telefono, ciudad: c.ciudad, correo: c.correo, estado_cliente: c.estado_cliente, tarifa_id: c.tarifa_id ? Number(c.tarifa_id) : null, tarifa_nombre: c.tarifa_nombre || null, modificado_por: c.modificado_por ? Number(c.modificado_por) : null, fecha_creacion: c.fecha_creacion, fecha_eliminacion: c.fecha_eliminacion || null, razon_eliminacion: c.razon_eliminacion || null };
}

async function insertarHistorial(tabla, operacion, registroId, modificadoPor, cambios) {
    await dbTurso.execute({ sql: `INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios) VALUES (?, ?, ?, ?, ?)`, args: [tabla, operacion, registroId, modificadoPor, JSON.stringify(cambios)] });
}

export async function registrarCliente(datos, usuarioId) {
    const { nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id, numero_predio } = datos;
    const safeNumeroPredio = numero_predio ? numero_predio.toString().trim().toUpperCase() : null;

    if (safeNumeroPredio) {
        const dupe = await dbTurso.execute({ sql: `SELECT id FROM clientes WHERE numero_predio = ?`, args: [safeNumeroPredio] });
        if (dupe.rows.length > 0) throw serviceError(`Ya existe un cliente registrado con el número de predio "${safeNumeroPredio}"`, 409);
    }

    const dupeName = await dbTurso.execute({ sql: `SELECT id FROM clientes WHERE nombre = ? AND telefono = ?`, args: [nombre, telefono] });
    if (dupeName.rows.length > 0) throw serviceError('Ya existe un cliente con ese nombre y teléfono', 409);

    if (tarifa_id) {
        const tarifa = await dbTurso.execute({ sql: `SELECT * FROM tarifas WHERE id = ?`, args: [tarifa_id] });
        if (!tarifa.rows.length) throw serviceError('La tarifa especificada no existe', 404);
    }

    const insertResult = await dbTurso.execute({
        sql: `INSERT INTO clientes (numero_predio, nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id, modificado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [safeNumeroPredio, nombre, direccion, telefono, ciudad, correo, estado_cliente || 'Activo', tarifa_id || null, usuarioId]
    });
    const id = Number(insertResult.lastInsertRowid);

    const datosInsertados = { numero_predio: safeNumeroPredio, nombre, direccion, telefono, ciudad, correo, estado_cliente: estado_cliente || 'Activo', tarifa_id: tarifa_id || null };
    await insertarHistorial('clientes', 'INSERT', id, usuarioId, datosInsertados);

    return { id, ...datosInsertados, fecha_registro: new Date().toISOString(), modificado_por: usuarioId };
}

const ORDER_CLAUSES = {
    numero_predio: `CASE WHEN c.numero_predio IS NULL OR c.numero_predio = '' THEN 1 ELSE 0 END, LENGTH(c.numero_predio) ASC, c.numero_predio ASC, c.nombre ASC`,
    default: `c.nombre ASC`
};

export async function obtenerClientes({ page, limit, search, ciudad, estado, estado_cliente, numero_predio, orderBy } = {}) {
    const estadoFiltro = estado || estado_cliente;
    const incluirEliminados = estadoFiltro === 'All' || estadoFiltro === 'Eliminado';
    const hayPaginacion = page || limit || search || ciudad || numero_predio;
    const orderClause = ORDER_CLAUSES[orderBy] || ORDER_CLAUSES.default;
    const baseData = `SELECT c.*, t.nombre as tarifa_nombre FROM clientes c LEFT JOIN tarifas t ON c.tarifa_id = t.id`;

    if (!hayPaginacion) {
        const sqlQuery = `${baseData} ${incluirEliminados ? "" : "WHERE c.estado_cliente != 'Eliminado'"} ORDER BY ${orderClause}`;
        const result = await dbTurso.execute({ sql: sqlQuery });
        return result.rows.map(mapCliente);
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    const args = [];

    if (search) {
        const t = `%${search}%`;
        conditions.push(`(c.nombre LIKE ? OR c.telefono LIKE ? OR c.correo LIKE ? OR c.ciudad LIKE ? OR c.numero_predio LIKE ? OR c.direccion LIKE ?)`);
        args.push(t, t, t, t, t, t);
    }
    if (numero_predio) { conditions.push(`c.numero_predio = ?`); args.push(numero_predio.toString().toUpperCase()); }
    if (ciudad && ciudad !== 'All') { conditions.push(`c.ciudad = ?`); args.push(ciudad); }
    if (estadoFiltro && estadoFiltro !== 'All') {
        conditions.push(`c.estado_cliente = ?`);
        args.push(estadoFiltro);
    } else if (!incluirEliminados) {
        conditions.push(`c.estado_cliente != 'Eliminado'`);
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const [countResult, dataResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM clientes c${where}`, args }),
        dbTurso.execute({ sql: `${baseData}${where} ORDER BY ${orderClause} LIMIT ? OFFSET ?`, args: [...args, limitNum, offset] })
    ]);

    return { data: dataResult.rows.map(mapCliente), pagination: { total: Number(countResult.rows[0].total), page: pageNum, limit: limitNum, totalPages: Math.ceil(Number(countResult.rows[0].total) / limitNum) } };
}

export async function modificarCliente(clienteId, datos, usuarioId) {
    const { nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id, numero_predio, medidor_id, medidores_liberados } = datos;

    const clienteResult = await dbTurso.execute({ sql: `SELECT * FROM clientes WHERE id = ?`, args: [clienteId] });
    if (!clienteResult.rows.length) throw serviceError('Cliente no encontrado', 404);
    const prev = clienteResult.rows[0];

    const safeNumeroPredio = numero_predio !== undefined ? (numero_predio ? numero_predio.toString().trim().toUpperCase() : null) : null;
    const safeTarifaId = tarifa_id !== undefined ? Number(tarifa_id) || null : null;
    const safeClienteId = Number(clienteId);
    const safeModificadoPor = Number(usuarioId);

    if (safeNumeroPredio && safeNumeroPredio !== prev.numero_predio) {
        const dupe = await dbTurso.execute({ sql: `SELECT id FROM clientes WHERE numero_predio = ? AND id != ?`, args: [safeNumeroPredio, safeClienteId] });
        if (dupe.rows.length > 0) throw serviceError(`El número de predio "${safeNumeroPredio}" ya está asignado a otro cliente`, 409);
    }
    if (safeTarifaId) {
        const tarifa = await dbTurso.execute({ sql: `SELECT * FROM tarifas WHERE id = ?`, args: [safeTarifaId] });
        if (!tarifa.rows.length) throw serviceError('La tarifa especificada no existe', 404);
    }

    const medidoresAsignar = Array.isArray(medidor_id) ? [...new Set(medidor_id.map(Number).filter(v => Number.isFinite(v) && v > 0))] : (medidor_id != null ? [Number(medidor_id)].filter(v => Number.isFinite(v) && v > 0) : []);
    const medidoresLiberar = Array.isArray(medidores_liberados) ? [...new Set(medidores_liberados.map(Number).filter(v => Number.isFinite(v) && v > 0))] : [];

    const cambios = {};
    const track = (k, n, a) => { if (n !== null && String(n) !== String(a)) cambios[k] = { antes: a, despues: n }; };
    track('numero_predio', safeNumeroPredio, prev.numero_predio);
    track('nombre', nombre || null, prev.nombre);
    track('direccion', direccion || null, prev.direccion);
    track('telefono', telefono || null, prev.telefono);
    track('ciudad', ciudad || null, prev.ciudad);
    track('correo', correo || null, prev.correo);
    track('estado_cliente', estado_cliente || null, prev.estado_cliente);
    track('tarifa_id', safeTarifaId, prev.tarifa_id);

    const tx = sqlite.transaction(() => {
        sqlite.prepare(`UPDATE clientes SET numero_predio = CASE WHEN ? IS NOT NULL THEN ? ELSE numero_predio END, nombre = COALESCE(?, nombre), direccion = COALESCE(?, direccion), telefono = COALESCE(?, telefono), ciudad = COALESCE(?, ciudad), correo = COALESCE(?, correo), estado_cliente = COALESCE(?, estado_cliente), tarifa_id = CASE WHEN ? IS NOT NULL THEN ? ELSE tarifa_id END, modificado_por = ? WHERE id = ?`).run(safeNumeroPredio, safeNumeroPredio, nombre || null, direccion || null, telefono || null, ciudad || null, correo || null, estado_cliente || null, safeTarifaId, safeTarifaId, safeModificadoPor, safeClienteId);

        const selMedidor = sqlite.prepare(`SELECT id, cliente_id FROM medidores WHERE id = ?`);
        const selRutaPunto = sqlite.prepare(`SELECT ruta_id, orden FROM rutas_puntos WHERE medidor_id = ?`);

        for (const mid of medidoresLiberar) {
            const m = selMedidor.get(mid);
            if (!m) throw { status: 400, error: [`Medidor ${mid} no encontrado`] };
            if (Number(m.cliente_id) !== safeClienteId) throw { status: 400, error: [`El medidor ${mid} no pertenece al cliente actual`] };
            sqlite.prepare(`UPDATE medidores SET cliente_id = NULL WHERE id = ?`).run(mid);
            cambios[`medidor_${mid}_liberado`] = { antes: safeClienteId, despues: null };
        }

        for (const mid of medidoresAsignar) {
            const m = selMedidor.get(mid);
            if (!m) throw { status: 400, error: [`Medidor ${mid} no encontrado`] };
            const mCli = m.cliente_id ? Number(m.cliente_id) : null;
            if (mCli && mCli !== safeClienteId) throw { status: 400, error: [`Medidor ${mid} ya está asignado a otro cliente`] };
            if (mCli !== safeClienteId) {
                sqlite.prepare(`UPDATE medidores SET cliente_id = ? WHERE id = ?`).run(safeClienteId, mid);
                cambios[`medidor_${mid}_asignado`] = { antes: mCli, despues: safeClienteId };
            }
        }

        if (medidoresLiberar.length === 1 && medidoresAsignar.length === 1 && medidoresLiberar[0] !== medidoresAsignar[0]) {
            const anterior = Number(medidoresLiberar[0]), nuevo = Number(medidoresAsignar[0]);
            const rutaAnterior = selRutaPunto.get(anterior);
            if (rutaAnterior) {
                if (selRutaPunto.get(nuevo)) throw { status: 400, error: [`No se pudo migrar ruta automáticamente: el medidor nuevo ${nuevo} ya pertenece a una ruta.`] };
                sqlite.prepare(`UPDATE rutas_puntos SET medidor_id = ? WHERE ruta_id = ? AND medidor_id = ?`).run(nuevo, Number(rutaAnterior.ruta_id), anterior);
                cambios.reasignacion_ruta_medidor = { ruta_id: Number(rutaAnterior.ruta_id), orden: Number(rutaAnterior.orden), medidor_anterior_id: anterior, medidor_nuevo_id: nuevo, accion: 'migracion_automatica_reemplazo_1_a_1' };
            }
        }

        if (medidoresLiberar.length > 0 && medidoresAsignar.length > 0) {
            cambios.reasignacion_medidor = { cliente_id: safeClienteId, medidores_liberados: medidoresLiberar, medidores_asignados: medidoresAsignar, tipo: 'reemplazo_o_reasignacion', timestamp: new Date().toISOString() };
        }

        if (Object.keys(cambios).length > 0) {
            sqlite.prepare(`INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios) VALUES (?, ?, ?, ?, ?)`).run('clientes', 'UPDATE', safeClienteId, safeModificadoPor, JSON.stringify(cambios));
        }
    });
    tx();

    return {
        id: parseInt(clienteId),
        nombre: nombre || prev.nombre,
        cambios
    };
}

export async function asignarTarifa(clienteId, tarifa_id, usuarioId) {
    const [clienteResult, tarifaResult] = await Promise.all([
        dbTurso.execute({ sql: `SELECT id, nombre, tarifa_id FROM clientes WHERE id = ?`, args: [clienteId] }),
        dbTurso.execute({ sql: `SELECT id, nombre, descripcion FROM tarifas WHERE id = ?`, args: [tarifa_id] })
    ]);

    if (!clienteResult.rows.length) throw serviceError('Cliente no encontrado', 404);
    if (!tarifaResult.rows.length) throw serviceError('La tarifa especificada no existe', 404);

    const cliente = clienteResult.rows[0];
    const tarifa = tarifaResult.rows[0];
    const tarifaAnterior = cliente.tarifa_id ? Number(cliente.tarifa_id) : null;

    if (tarifaAnterior === Number(tarifa_id)) throw serviceError('El cliente ya tiene esta tarifa asignada', 400);

    await dbTurso.execute({ sql: `UPDATE clientes SET tarifa_id = ?, modificado_por = ? WHERE id = ?`, args: [tarifa_id, usuarioId, clienteId] });
    await insertarHistorial('clientes', 'UPDATE', clienteId, usuarioId, { tarifa_id: { antes: tarifaAnterior, despues: Number(tarifa_id) }, tarifa_nombre: { antes: null, despues: tarifa.nombre }, tarifa_descripcion: { antes: null, despues: tarifa.descripcion } });

    return { cliente_id: Number(clienteId), cliente_nombre: cliente.nombre, tarifa_anterior: tarifaAnterior, tarifa_nueva: Number(tarifa_id), tarifa_nombre: tarifa.nombre, tarifa_descripcion: tarifa.descripcion };
}

export async function estadisticasClientes() {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const [totalR, estadosR, ultMesR, porMesR, porCiudadR, porTarifaR, medidoresR, sinMedidoresR, anoActualR, activosR] = await Promise.all([
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM clientes` }),
        dbTurso.execute({ sql: `SELECT estado_cliente, COUNT(*) as cantidad FROM clientes GROUP BY estado_cliente` }),
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM clientes WHERE fecha_creacion >= datetime('now', '-1 month')` }),
        dbTurso.execute({ sql: `SELECT strftime('%Y-%m', fecha_creacion) as mes, COUNT(*) as cantidad FROM clientes WHERE fecha_creacion >= datetime('now', '-12 months') GROUP BY mes ORDER BY mes ASC` }),
        dbTurso.execute({ sql: `SELECT ciudad, COUNT(*) as cantidad FROM clientes GROUP BY ciudad ORDER BY cantidad DESC` }),
        dbTurso.execute({ sql: `SELECT t.nombre as tarifa_nombre, t.descripcion as tarifa_descripcion, COUNT(c.id) as cantidad_clientes FROM clientes c LEFT JOIN tarifas t ON c.tarifa_id = t.id GROUP BY t.id, t.nombre, t.descripcion ORDER BY cantidad_clientes DESC` }),
        dbTurso.execute({ sql: `SELECT COUNT(DISTINCT c.id) as clientes_con_medidores, COUNT(m.id) as total_medidores_asignados FROM clientes c INNER JOIN medidores m ON c.id = m.cliente_id` }),
        dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM clientes c WHERE NOT EXISTS (SELECT 1 FROM medidores m WHERE m.cliente_id = c.id)` }),
        dbTurso.execute({ sql: `SELECT strftime('%m', fecha_creacion) as mes_numero, COUNT(*) as cantidad FROM clientes WHERE strftime('%Y', fecha_creacion) = strftime('%Y', 'now') GROUP BY mes_numero ORDER BY mes_numero ASC` }),
        dbTurso.execute({ sql: `SELECT CASE WHEN estado_cliente = 'Activo' THEN 'activos' ELSE 'inactivos' END as tipo, COUNT(*) as cantidad FROM clientes GROUP BY tipo` })
    ]);

    const totalClientes = Number(totalR.rows[0].total);
    const clientesConMedidores = Number(medidoresR.rows[0].clientes_con_medidores || 0);
    const totalMedidoresAsignados = Number(medidoresR.rows[0].total_medidores_asignados || 0);
    const distribucionActivos = {};
    activosR.rows.forEach(r => { distribucionActivos[r.tipo] = Number(r.cantidad); });

    return {
        resumen: { total_clientes: totalClientes, clientes_ultimo_mes: Number(ultMesR.rows[0].total), clientes_activos: distribucionActivos.activos || 0, clientes_inactivos: distribucionActivos.inactivos || 0, clientes_con_medidores: clientesConMedidores, clientes_sin_medidores: Number(sinMedidoresR.rows[0].total), total_medidores_asignados: totalMedidoresAsignados },
        distribucion: { por_estado: estadosR.rows.map(r => ({ estado: r.estado_cliente, cantidad: Number(r.cantidad) })), por_ciudad: porCiudadR.rows.map(r => ({ ciudad: r.ciudad, cantidad: Number(r.cantidad) })), por_tarifa: porTarifaR.rows.map(r => ({ tarifa_nombre: r.tarifa_nombre || 'Sin tarifa', tarifa_descripcion: r.tarifa_descripcion || null, cantidad_clientes: Number(r.cantidad_clientes) })) },
        tendencias: { registros_por_mes: porMesR.rows.map(r => ({ mes: r.mes, cantidad: Number(r.cantidad) })), registros_ano_actual: anoActualR.rows.map(r => ({ mes: meses[parseInt(r.mes_numero) - 1], cantidad: Number(r.cantidad) })) },
        medidores: { clientes_con_medidores: clientesConMedidores, clientes_sin_medidores: Number(sinMedidoresR.rows[0].total), total_medidores_asignados: totalMedidoresAsignados, porcentaje_con_medidores: totalClientes > 0 ? ((clientesConMedidores / totalClientes) * 100).toFixed(2) : 0 },
        fecha_generacion: new Date().toISOString()
    };
}

export async function eliminarCliente(id, eliminadoPor, razon) {
    const clienteResult = await dbTurso.execute({ sql: `SELECT * FROM clientes WHERE id = ?`, args: [id] });
    if (!clienteResult.rows.length) throw serviceError('Cliente no encontrado', 404);
    const cliente = clienteResult.rows[0];

    if (cliente.estado_cliente === 'Eliminado') throw serviceError('El cliente ya está eliminado', 400);

    const facturas = await dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM facturas WHERE cliente_id = ? AND estado IN ('Pendiente', 'Parcial')`, args: [id] });
    if (Number(facturas.rows[0].total) > 0) throw Object.assign(serviceError('No se puede eliminar el cliente porque tiene facturas pendientes', 400), { facturas_pendientes: Number(facturas.rows[0].total) });

    const medidores = await dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM medidores WHERE cliente_id = ? AND fecha_eliminacion IS NULL`, args: [id] });
    if (Number(medidores.rows[0].total) > 0) throw serviceError('No se puede desactivar/eliminar el cliente porque tiene un medidor activo asignado. Desvincúlelo primero.', 400);

    await dbTurso.execute({ sql: `UPDATE clientes SET estado_cliente = 'Eliminado', fecha_eliminacion = datetime('now'), eliminado_por = ?, razon_eliminacion = ? WHERE id = ?`, args: [eliminadoPor, razon || 'Sin razón especificada', id] });
    await insertarHistorial('clientes', 'SOFT_DELETE', id, eliminadoPor, { estado_anterior: cliente.estado_cliente, estado_nuevo: 'Eliminado', razon: razon || 'Sin razón especificada' });

    return { nombre: cliente.nombre };
}

export async function restaurarCliente(id, usuarioId) {
    const clienteResult = await dbTurso.execute({ sql: `SELECT * FROM clientes WHERE id = ?`, args: [id] });
    if (!clienteResult.rows.length) throw serviceError('Cliente no encontrado', 404);
    const cliente = clienteResult.rows[0];

    if (cliente.estado_cliente !== 'Eliminado') throw Object.assign(serviceError('El cliente no está eliminado', 400), { estado_actual: cliente.estado_cliente });

    await dbTurso.execute({ sql: `UPDATE clientes SET estado_cliente = 'Activo', fecha_eliminacion = NULL, eliminado_por = NULL, razon_eliminacion = NULL, modificado_por = ? WHERE id = ?`, args: [usuarioId, id] });
    await insertarHistorial('clientes', 'RESTORE', id, usuarioId, { estado_anterior: 'Eliminado', estado_nuevo: 'Activo', razon_eliminacion_anterior: cliente.razon_eliminacion });

    return { nombre: cliente.nombre };
}

export async function obtenerClientesEliminados() {
    const result = await dbTurso.execute({
        sql: `SELECT c.id, c.numero_predio, c.nombre, c.direccion, c.telefono, c.ciudad, c.correo, c.estado_cliente, c.fecha_eliminacion, c.razon_eliminacion, u.username as eliminado_por_nombre, (SELECT COUNT(*) FROM facturas f WHERE f.cliente_id = c.id) as total_facturas, (SELECT COUNT(*) FROM medidores m WHERE m.cliente_id = c.id) as total_medidores FROM clientes c LEFT JOIN usuarios u ON c.eliminado_por = u.id WHERE c.estado_cliente = 'Eliminado' ORDER BY c.fecha_eliminacion DESC`
    });
    return { total: result.rows.length, clientes_eliminados: result.rows };
}

export async function purgarCliente(id) {
    const clienteResult = await dbTurso.execute({ sql: `SELECT * FROM clientes WHERE id = ?`, args: [id] });
    if (!clienteResult.rows.length) throw serviceError('Cliente no encontrado', 404);
    const cliente = clienteResult.rows[0];

    if (cliente.estado_cliente !== 'Eliminado') throw serviceError('El cliente debe estar desactivado/en la papelera para poder eliminarlo definitivamente', 400);

    // 1. Verificar facturas
    const facturas = await dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM facturas WHERE cliente_id = ?`, args: [id] });
    if (Number(facturas.rows[0].total) > 0) {
        throw serviceError('No se puede eliminar definitivamente el cliente porque tiene historial de facturación en el sistema', 400);
    }

    // 2. Verificar historial de medidores
    const historialMedidores = await dbTurso.execute({ sql: `SELECT COUNT(*) as total FROM cliente_medidor_historial WHERE cliente_id = ?`, args: [id] });
    if (Number(historialMedidores.rows[0].total) > 0) {
        throw serviceError('No se puede eliminar definitivamente el cliente porque tiene historial de asignación de medidores', 400);
    }

    // 3. Ejecutar DELETE físico
    await dbTurso.execute({ sql: `DELETE FROM clientes WHERE id = ?`, args: [id] });
    await insertarHistorial('clientes', 'HARD_DELETE', id, null, { nombre: cliente.nombre, direccion: cliente.direccion });

    return { nombre: cliente.nombre };
}
