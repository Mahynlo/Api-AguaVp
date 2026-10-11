/**
 * Servicio de aplicaciones registradas (tabla apps)
 *
 * File: src/v2/services/appService.js
 */

import db from "../../database/db-sqlite.js";

/** Inserta una app registrada. */
export async function insertarApp({ appId, token, nombre, ip, scopes, clientSecret, redirectUris }) {
    await db.execute({
        sql: `INSERT INTO apps (app_id, token, nombre, ip_registro, scopes, client_secret, redirect_uris)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [appId, token, nombre, ip, scopes, clientSecret, redirectUris]
    });
}

/** Guarda el token renovado de una app. */
export async function actualizarTokenApp(appId, token) {
    await db.execute({ sql: `UPDATE apps SET token = ? WHERE app_id = ?`, args: [token, appId] });
}

/** Comprueba que la base responde (lanza el error de la base si no). */
export async function verificarConexion() {
    await db.execute({ sql: 'SELECT 1 as test' });
}
