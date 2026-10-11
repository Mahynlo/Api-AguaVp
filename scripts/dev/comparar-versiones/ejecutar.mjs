/**
 * Ejecuta los escenarios contra UNA versión del código y guarda respuestas + estado final de la base.
 * Lo invoca index.mjs (una vez por versión, cada una en su propio proceso).
 *
 * Uso: node ejecutar.mjs <carpeta src de la versión> <salida.json>
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Database from 'better-sqlite3';
import { cargarDatosPrueba } from '../../../test/helpers/datos-prueba.js';
import { escenarios } from './escenarios.mjs';

const [, , srcDir, salida] = process.argv;
const importar = (rel) => import(pathToFileURL(path.join(srcDir, rel)).href);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLAVE = 'Clave123!';

// No ensuciar la salida con los console.* de la API
const salidaOriginal = process.stdout.write.bind(process.stdout);
console.log = console.warn = console.error = console.info = () => {};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-comparar-'));
const dbPath = path.join(tmp, 'db.sqlite');
Object.assign(process.env, {
    DB_PATH: dbPath, JWT_SECRET: 'comparar-jwt', SECRET_APP_KEY: 'comparar-appkey', APPKEY_INICIAL: 'comparar-inicial',
    JWT_EXPIRES_IN: '15m', EXECUTION_MODE: 'LOCAL', NODE_ENV: 'test',
});

// 1. Esquema (migrador de la versión) + usuarios + datos de prueba
const { customMigrate } = await importar('database/sqlite-migrator.js');
const seed = new Database(dbPath);
seed.pragma('journal_mode = WAL');
customMigrate(seed, path.join(srcDir, 'database', 'migrations'), () => {});
// Hash con sal fija: la tabla usuarios queda idéntica entre versiones
const bcrypt = (await import('bcryptjs')).default;
const HASH_CLAVE = bcrypt.hashSync(CLAVE, '$2b$04$abcdefghijklmnopqrstuu');
const crearUsuario = (rol, n) => Number(seed.prepare(
    `INSERT INTO usuarios (correo, nombre, "contraseña", username, rol, estado_usuario, requiere_cambio_password, fecha_creacion)
     VALUES (?, ?, ?, ?, ?, 'Activo', 0, '2025-01-01 00:00:00')`
).run(`${rol}@comparar.com`, `${rol} ${n}`, HASH_CLAVE, `${rol}${n}`, rol).lastInsertRowid);
const usuarios = { S: crearUsuario('superadmin', 1), A: crearUsuario('administrador', 2), O: crearUsuario('operador', 3) };
const ids = cargarDatosPrueba(seed, { usuarioId: usuarios.S });
ids.usuarios = usuarios;

// 2. App igual a server.js (sin cron ni swagger) con el código de la versión
const { default: express } = await import('express');
const { default: SSEManager } = await importar('v2/sse/sseManager.js');
const { default: SSENotificationManager } = await importar('v2/sse/notificationManager.js');
const { default: routes } = await importar('routes/index.js');
const si = globalThis.setInterval;
globalThis.setInterval = (...a) => si(...a).unref();
const sse = new SSEManager();
globalThis.setInterval = si;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('sseManager', sse);
app.set('notificationManager', new SSENotificationManager(sse));
app.use('/api', routes);
const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

async function pedir(metodo, ruta, { token, appKey, body } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (appKey) headers['x-app-key'] = `AppKey ${appKey}`;
    const r = await fetch(base + ruta, { method: metodo, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = t; }
    return { status: r.status, body: b };
}

const reg = await pedir('POST', '/api/v2/app/registrarApp', { appKey: 'comparar-inicial', body: { nombre: 'comparar' } });
const appKey = reg.body.token;
const tokens = {};
for (const [k, rol] of Object.entries({ S: 'superadmin', A: 'administrador', O: 'operador' })) {
    tokens[k] = (await pedir('POST', '/api/v2/auth/login', { appKey, body: { correo: `${rol}@comparar.com`, contraseña: CLAVE } })).body.accessToken;
}

// 3. Escenarios
const resultados = [];
for (const e of escenarios) {
    if (e.sql) { seed.exec(e.sql(ids)); resultados.push({ nombre: e.nombre, sql: true }); continue; }
    const ruta = typeof e.ruta === 'function' ? e.ruta(ids) : e.ruta;
    const body = typeof e.body === 'function' ? e.body(ids) : e.body;
    const opciones = { appKey: e.sinAppKey ? undefined : appKey, token: e.como ? tokens[e.como] : undefined, body };
    if (e.oauth) Object.assign(opciones, { token: undefined });
    const r = await pedir(e.metodo, ruta, opciones);
    if (e.guardar) e.guardar(r.body, ids); // valores para pasos posteriores (p. ej. refresh_token)
    resultados.push({ nombre: e.nombre, peticion: `${e.metodo} ${ruta}`, status: r.status, body: r.body });
}

// 4. Estado final de todas las tablas
const tablas = seed.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('sqlite_sequence','__drizzle_migrations') ORDER BY name`).all().map(t => t.name);
const dump = {};
for (const t of tablas) dump[t] = seed.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all();

await new Promise((r) => server.close(r));
seed.close();
(await importar('database/db-sqlite.js')).sqlite.close();
fs.rmSync(tmp, { recursive: true, force: true });

fs.writeFileSync(salida, JSON.stringify({ resultados, dump }, null, 1));
salidaOriginal(`${resultados.length} pasos ejecutados con ${path.relative(path.join(__dirname, '../../..'), srcDir) || srcDir}\n`);
process.exit(0);
