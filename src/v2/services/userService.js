import dbTurso from "../../database/db-sqlite.js";
import bcrypt from "bcryptjs";

function serviceError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

const SELECT_CAMPOS = `id, nombre, correo, username, rol, estado_usuario, fecha_creacion, ultimo_acceso`;

export async function obtenerUsuarios({ estado, rol, busqueda } = {}) {
    let query = `SELECT ${SELECT_CAMPOS} FROM usuarios WHERE 1=1`;
    const args = [];

    if (estado && estado !== 'todos') { query += ` AND estado_usuario = ?`; args.push(estado); }
    if (rol && rol !== 'todos') { query += ` AND rol = ?`; args.push(rol); }
    if (busqueda) {
        query += ` AND (nombre LIKE ? OR correo LIKE ? OR username LIKE ?)`;
        const t = `%${busqueda}%`;
        args.push(t, t, t);
    }
    query += ` ORDER BY fecha_creacion DESC`;

    const result = await dbTurso.execute({ sql: query, args });
    return result.rows.map(u => ({ ...u, id: Number(u.id) }));
}

export async function obtenerUsuarioPorId(id) {
    const result = await dbTurso.execute({ sql: `SELECT ${SELECT_CAMPOS} FROM usuarios WHERE id = ?`, args: [id] });
    if (result.rows.length === 0) throw serviceError("Usuario no encontrado", 404);
    return { ...result.rows[0], id: Number(result.rows[0].id) };
}

export async function crearUsuario({ correo, nombre, contrasena, username, rol }) {
    const check = await dbTurso.execute({ sql: `SELECT id FROM usuarios WHERE correo = ? OR username = ?`, args: [correo, username] });
    if (check.rows.length > 0) throw serviceError("Usuario ya existe", 409);

    const hashedPassword = await bcrypt.hash(contrasena, 10);
    await dbTurso.execute({
        sql: `INSERT INTO usuarios (correo, nombre, contraseña, username, rol, estado_usuario, requiere_cambio_password) VALUES (?, ?, ?, ?, ?, 'Activo', 1)`,
        args: [correo, nombre, hashedPassword, username, rol]
    });
}

export async function actualizarUsuario(id, { nombre, correo, rol, contrasena }) {
    const check = await dbTurso.execute({ sql: `SELECT id FROM usuarios WHERE id = ?`, args: [id] });
    if (check.rows.length === 0) throw serviceError("Usuario no encontrado", 404);

    const updates = [];
    const args = [];

    if (nombre) { updates.push("nombre = ?"); args.push(nombre); }
    if (correo) { updates.push("correo = ?"); args.push(correo); }
    if (rol) { updates.push("rol = ?"); args.push(rol); }
    if (contrasena) {
        updates.push("contraseña = ?", "requiere_cambio_password = 1");
        args.push(await bcrypt.hash(contrasena, 10));
    }

    if (updates.length === 0) throw serviceError("Nada que actualizar", 400);

    args.push(id);
    await dbTurso.execute({ sql: `UPDATE usuarios SET ${updates.join(", ")} WHERE id = ?`, args });
}

export async function eliminarUsuario(id, eliminadoPor, razon) {
    if (Number(id) === Number(eliminadoPor)) throw serviceError("No puedes eliminarte a ti mismo", 400);

    await dbTurso.execute({
        sql: `UPDATE usuarios SET estado_usuario = 'Eliminado', fecha_eliminacion = datetime('now'), eliminado_por = ?, razon_eliminacion = ? WHERE id = ?`,
        args: [eliminadoPor, razon || 'Eliminación administrativa', id]
    });

    await Promise.all([
        dbTurso.execute({ sql: `UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE usuario_id = ?`, args: [id] }),
        dbTurso.execute({ sql: `UPDATE refresh_tokens SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'usuario_eliminado' WHERE usuario_id = ? AND revocado = 0`, args: [id] })
    ]);
}

export async function activarUsuario(id) {
    await dbTurso.execute({
        sql: `UPDATE usuarios SET estado_usuario = 'Activo', fecha_eliminacion = NULL, eliminado_por = NULL, razon_eliminacion = NULL, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
        args: [id]
    });
}
