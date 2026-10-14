/**
 * Servicio OAuth 2.0 (grant_type password y refresh_token)
 *
 * File: src/v2/services/oauthService.js
 *
 * Los errores de negocio se lanzan con crearError(mensaje, status).
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from "../../database/db-sqlite.js";
import { crearError } from "../../utils/errores.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;

/** App activa por su app_id (texto) o null. */
export async function obtenerAppActiva(appId) {
    const appResult = await db.execute({
        sql: "SELECT * FROM apps WHERE app_id = ? AND activo = 1",
        args: [appId]
    });
    return appResult.rows[0] ?? null;
}

/** grant_type=password: valida usuario (correo) y contraseña y emite tokens. */
export async function emitirTokensPorPassword({ username, password, scope, appData }) {
    if (!username || !password) throw crearError("Credenciales requeridas", 400);

    const userResult = await db.execute({
        sql: "SELECT * FROM usuarios WHERE correo = ?",
        args: [username]
    });
    if (userResult.rows.length === 0) throw crearError("Credenciales inválidas", 401);

    const usuario = userResult.rows[0];
    const passwordMatch = await bcrypt.compare(password, usuario.contraseña);
    if (!passwordMatch) throw crearError("Credenciales inválidas", 401);

    return generarTokens(usuario, appData, scope);
}

/** grant_type=refresh_token: valida el refresh token, lo revoca (rotación) y emite tokens nuevos. */
export async function emitirTokensPorRefresh({ refresh_token, appData }) {
    if (!refresh_token) throw crearError("refresh_token requerido", 400);

    const rtResult = await db.execute({
        sql: "SELECT * FROM refresh_tokens WHERE token = ? AND revocado = 0",
        args: [refresh_token]
    });
    if (rtResult.rows.length === 0) throw crearError("Refresh token inválido o revocado", 401);

    const storedRt = rtResult.rows[0];
    if (new Date(storedRt.expira_en) < new Date()) throw crearError("Refresh token expirado", 401);

    // Nota: no se valida que el refresh token pertenezca a la misma app (validación laxa).

    const usuarioResult = await db.execute({
        sql: "SELECT * FROM usuarios WHERE id = ?",
        args: [storedRt.usuario_id]
    });
    const usuario = usuarioResult.rows[0];

    // Revocar el refresh token usado (Rotation)
    await db.execute({
        sql: "UPDATE refresh_tokens SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'Rotation' WHERE id = ?",
        args: [storedRt.id]
    });

    // El scope se hereda como "default"
    return generarTokens(usuario, appData, null);
}

async function generarTokens(usuario, appData, scope) {
    // apps.id (PK) a partir del app_id de texto (appKeyMiddleware entrega { id: app_id texto })
    let appPk = null;
    if (appData) {
        const q = await db.execute({
            sql: "SELECT id FROM apps WHERE app_id = ?",
            args: [appData.id || appData.app_id]
        });
        if (q.rows.length > 0) appPk = q.rows[0].id;
    }

    const payload = {
        id: usuario.id,
        role: usuario.rol,
        aud: appData?.id || "unknown", // Client ID publico
        scope: scope || "default"
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Sesión vinculada al access token para que authMiddleware lo acepte
    await db.execute({
        sql: `INSERT INTO sesiones (usuario_id, token, app_id, direccion_ip, dispositivo, tipo_sesion)
              VALUES (?, ?, ?, ?, ?, 'oauth')`,
        args: [usuario.id, accessToken, appPk, '::1', 'OAuth Client']
    });

    // Refresh Token
    const refreshToken = uuidv4();
    const rtExpireDate = new Date();
    rtExpireDate.setDate(rtExpireDate.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await db.execute({
        sql: `INSERT INTO refresh_tokens (token, usuario_id, app_id, expira_en) VALUES (?, ?, ?, ?)`,
        args: [refreshToken, usuario.id, appPk, rtExpireDate.toISOString()]
    });

    // 15m = 900s
    const expiresInSeconds = 15 * 60;

    return { accessToken, refreshToken, expiresIn: expiresInSeconds };
}
