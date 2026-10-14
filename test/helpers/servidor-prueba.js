/**
 * Servidor de pruebas para tests HTTP (node:test)
 *
 * Arma la misma app Express que src/server.js (mismos middlewares, SSE y rutas en /api),
 * pero SIN cron jobs ni Swagger, sobre una base SQLite temporal con todas las migraciones.
 * La autenticación usa el flujo real: registrar app con APPKEY_INICIAL → login → token.
 *
 * Uso:
 *   const srv = await crearServidorPrueba();
 *   const admin = await srv.crearUsuarioYLogin({ rol: 'superadmin' });
 *   const r = await srv.pedir('GET', '/api/v2/users', { token: admin.token });
 *   await srv.cerrar();
 *
 * Importante: db-sqlite.js se conecta al importarse, por eso cada archivo de test que use
 * este helper debe crear UN solo servidor (node --test ejecuta cada archivo en su propio proceso).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { customMigrate } from '../../src/database/sqlite-migrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, '../../src/database/migrations');

export const APPKEY_INICIAL = 'appkey-inicial-pruebas';
export const PASSWORD_PRUEBA = 'Clave123!';

export async function crearServidorPrueba() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-http-'));
    const dbPath = path.join(tmpDir, 'test.db');

    // Misma configuración que aplica AguaVPServer.setupEnvironment()
    Object.assign(process.env, {
        DB_PATH: dbPath,
        JWT_SECRET: 'jwt-secret-pruebas',
        SECRET_APP_KEY: 'secret-app-key-pruebas',
        APPKEY_INICIAL,
        JWT_EXPIRES_IN: '15m',
        EXECUTION_MODE: 'LOCAL',
        NODE_ENV: 'test',
    });

    // Esquema real
    const seed = new Database(dbPath);
    seed.pragma('journal_mode = WAL');
    customMigrate(seed, MIGRATIONS, () => {});

    // App igual a server.js (sin cron ni swagger)
    const { default: express } = await import('express');
    const { default: cors } = await import('cors');
    const { default: SSEManager } = await import('../../src/v2/sse/sseManager.js');
    const { default: SSENotificationManager } = await import('../../src/v2/sse/notificationManager.js');
    const { default: routes } = await import('../../src/routes/index.js');

    // SSEManager crea un setInterval en su constructor: se marca unref() para que no
    // mantenga vivo el proceso de pruebas (solo afecta a los tests).
    const setIntervalOriginal = globalThis.setInterval;
    globalThis.setInterval = (...args) => setIntervalOriginal(...args).unref();
    const sseManager = new SSEManager();
    globalThis.setInterval = setIntervalOriginal;

    const app = express();
    app.set('trust proxy', 1);
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.set('sseManager', sseManager);
    app.set('notificationManager', new SSENotificationManager(sseManager));
    app.use('/api', routes);

    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    /** Hace una petición y devuelve { status, body } (body parseado si es JSON). */
    async function pedir(metodo, ruta, { token, appKey, body } = {}) {
        const headers = { 'content-type': 'application/json' };
        if (token) headers.authorization = `Bearer ${token}`;
        if (appKey) headers['x-app-key'] = `AppKey ${appKey}`;
        const r = await fetch(baseUrl + ruta, { method: metodo, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const texto = await r.text();
        let json; try { json = JSON.parse(texto); } catch { json = texto; }
        return { status: r.status, body: json };
    }

    // Registrar la app (como hace Electron en el primer arranque)
    const registro = await pedir('POST', '/api/v2/app/registrarApp', { appKey: APPKEY_INICIAL, body: { nombre: 'tests' } });
    if (registro.status !== 201) throw new Error(`No se pudo registrar la app de pruebas: ${JSON.stringify(registro)}`);
    const appKey = registro.body.token;

    let contador = 0;
    /** Inserta un usuario (contraseña PASSWORD_PRUEBA) y devuelve { id, correo, rol, token }. */
    async function crearUsuarioYLogin({ rol, nombre } = {}) {
        contador++;
        const correo = `${rol}${contador}@pruebas.com`;
        const id = Number(seed.prepare(
            `INSERT INTO usuarios (correo, nombre, "contraseña", username, rol, estado_usuario, requiere_cambio_password)
             VALUES (?, ?, ?, ?, ?, 'Activo', 0)`
        ).run(correo, nombre || `${rol} ${contador}`, bcrypt.hashSync(PASSWORD_PRUEBA, 4), `${rol}${contador}`, rol).lastInsertRowid);

        const login = await pedir('POST', '/api/v2/auth/login', { appKey, body: { correo, contraseña: PASSWORD_PRUEBA } });
        if (login.status !== 200) throw new Error(`Login de prueba falló: ${JSON.stringify(login)}`);
        return { id, correo, rol, token: login.body.accessToken };
    }

    async function cerrar() {
        await new Promise((resolve) => server.close(resolve));
        seed.close();
        const { sqlite } = await import('../../src/database/db-sqlite.js');
        sqlite.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    return { baseUrl, appKey, db: seed, pedir, crearUsuarioYLogin, cerrar };
}
