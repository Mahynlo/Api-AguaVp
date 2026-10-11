/**
 * Tests HTTP de /api/v2/app (caracterización)
 *
 * Es el flujo que usa Electron en el primer arranque: registrar la app con la app key
 * inicial y usar/renovar el token resultante. Fijan el comportamiento ACTUAL (status,
 * cuerpo y filas en la base) para refactorizar appController sin cambiarlo.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { crearServidorPrueba, APPKEY_INICIAL } from '../helpers/servidor-prueba.js';

let srv;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

before(async () => {
    console.log = console.error = console.warn = () => {};
    srv = await crearServidorPrueba();
});

after(async () => { await srv.cerrar(); });

describe('POST /app/registrarApp', () => {
    it('sin header o con formato incorrecto: 401', async () => {
        for (const headers of [undefined, 'Bearer x', 'appkey x']) {
            const r = await fetch(`${srv.baseUrl}/api/v2/app/registrarApp`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(headers ? { 'x-app-key': headers } : {}) },
                body: '{}'
            });
            assert.equal(r.status, 401);
            assert.deepEqual(await r.json(), { error: 'AppKey no proporcionado o formato incorrecto' });
        }
    });

    it('app key inicial incorrecta: 403', async () => {
        const r = await srv.pedir('POST', '/api/v2/app/registrarApp', { appKey: 'otra-clave', body: { nombre: 'x' } });
        assert.equal(r.status, 403);
        assert.deepEqual(r.body, { error: 'AppKey inicial inválido' });
    });

    it('registra la app (201): uuid, token JWT de 90 días y fila en apps con scope por defecto', async () => {
        const r = await srv.pedir('POST', '/api/v2/app/registrarApp', { appKey: APPKEY_INICIAL, body: { nombre: 'Equipo caja' } });
        assert.equal(r.status, 201);
        assert.deepEqual(Object.keys(r.body).sort(), ['app_id', 'database', 'mensaje', 'token']);
        assert.equal(r.body.mensaje, 'Nueva app registrada con Turso');
        assert.equal(r.body.database, 'Turso');
        assert.match(r.body.app_id, UUID);

        const payload = jwt.verify(r.body.token, process.env.SECRET_APP_KEY);
        assert.equal(payload.app_id, r.body.app_id);
        assert.equal(payload.exp - payload.iat, 90 * 24 * 60 * 60);

        const fila = srv.db.prepare('SELECT token, nombre, scopes, client_secret, redirect_uris, activo FROM apps WHERE app_id = ?').get(r.body.app_id);
        assert.deepEqual({ ...fila }, { token: r.body.token, nombre: 'Equipo caja', scopes: 'read:reports', client_secret: null, redirect_uris: null, activo: 1 });
    });

    it('guarda los campos OAuth opcionales; sin nombre queda null', async () => {
        const r = await srv.pedir('POST', '/api/v2/app/registrarApp', { appKey: APPKEY_INICIAL, body: { scopes: 'admin', client_secret: 's3cr3t', redirect_uris: 'http://localhost/cb' } });
        assert.equal(r.status, 201);
        const fila = srv.db.prepare('SELECT nombre, scopes, client_secret, redirect_uris FROM apps WHERE app_id = ?').get(r.body.app_id);
        assert.deepEqual({ ...fila }, { nombre: null, scopes: 'admin', client_secret: 's3cr3t', redirect_uris: 'http://localhost/cb' });
    });

    it('sin cuerpo también registra (nombre null)', async () => {
        const r = await srv.pedir('POST', '/api/v2/app/registrarApp', { appKey: APPKEY_INICIAL });
        assert.equal(r.status, 201);
        assert.equal(srv.db.prepare('SELECT nombre FROM apps WHERE app_id = ?').get(r.body.app_id).nombre, null);
    });

    it('el token emitido sirve como app key en otras rutas', async () => {
        const reg = await srv.pedir('POST', '/api/v2/app/registrarApp', { appKey: APPKEY_INICIAL, body: { nombre: 'x' } });
        const r = await srv.pedir('GET', '/api/v2/app/version', { appKey: reg.body.token });
        assert.equal(r.status, 200);
    });
});

describe('POST /app/recuperarToken', () => {
    it('sin header: 401; token inválido: 403', async () => {
        const sin = await srv.pedir('POST', '/api/v2/app/recuperarToken');
        assert.equal(sin.status, 401);
        assert.deepEqual(sin.body, { error: 'AppKey no proporcionado o formato incorrecto' });

        const malo = await srv.pedir('POST', '/api/v2/app/recuperarToken', { appKey: 'no-es-un-jwt' });
        assert.equal(malo.status, 403);
        assert.deepEqual(malo.body, { error: 'Token inválido o expirado' });
    });

    it('emite un token nuevo para la misma app y lo guarda en apps', async () => {
        const reg = await srv.pedir('POST', '/api/v2/app/registrarApp', { appKey: APPKEY_INICIAL, body: { nombre: 'renovar' } });
        // Esperar 1 s para que el nuevo token tenga otro iat (si no, el JWT sería idéntico)
        await new Promise(r => setTimeout(r, 1100));

        const r = await srv.pedir('POST', '/api/v2/app/recuperarToken', { appKey: reg.body.token });
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.body).sort(), ['database', 'mensaje', 'nuevo_token']);
        assert.equal(r.body.mensaje, 'Token actualizado con Turso');
        assert.equal(r.body.database, 'Turso');
        assert.notEqual(r.body.nuevo_token, reg.body.token);
        assert.equal(jwt.verify(r.body.nuevo_token, process.env.SECRET_APP_KEY).app_id, reg.body.app_id);
        assert.equal(srv.db.prepare('SELECT token FROM apps WHERE app_id = ?').get(reg.body.app_id).token, r.body.nuevo_token);

        // El token anterior sigue siendo aceptado (appKeyMiddleware no compara con apps.token)
        const viejo = await srv.pedir('GET', '/api/v2/app/version', { appKey: reg.body.token });
        assert.equal(viejo.status, 200);
    });
});

describe('GET /app/version y GET /app/status', () => {
    it('requieren app key (401 sin ella)', async () => {
        for (const ruta of ['/api/v2/app/version', '/api/v2/app/status']) {
            const r = await srv.pedir('GET', ruta);
            assert.equal(r.status, 401);
        }
    });

    it('version devuelve la información fija de la v2', async () => {
        const r = await srv.pedir('GET', '/api/v2/app/version', { appKey: srv.appKey });
        assert.equal(r.status, 200);
        const { timestamp, ...resto } = r.body;
        assert.ok(!Number.isNaN(Date.parse(timestamp)));
        assert.deepEqual(resto, {
            version: '2.0.0',
            api_version: 'v2',
            environment: 'test',
            database: 'Turso (@libsql/client)',
            realtime: 'Server-Sent Events (SSE)',
            features: [
                'Gestión de clientes', 'Gestión de medidores', 'Control de lecturas', 'Sistema de facturación',
                'Gestión de pagos', 'Sistema de tarifas', 'Rutas de lectura', 'Autenticación JWT',
                'Server-Sent Events (SSE)', 'Turso Database', 'Health check endpoints', 'Real-time notifications'
            ],
            changes_from_v1: ['WebSockets → Server-Sent Events (SSE)', 'SQLite3 → Turso Database', 'Improved real-time notifications']
        });
    });

    it('status reporta la base de datos OK', async () => {
        const r = await srv.pedir('GET', '/api/v2/app/status', { appKey: srv.appKey });
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.body).sort(), ['database', 'memory_usage', 'realtime', 'services', 'status', 'timestamp', 'uptime', 'version']);
        assert.equal(r.body.status, 'OK');
        assert.equal(r.body.version, '2.0.0');
        assert.deepEqual(r.body.services, { api: 'OK', database: 'OK', sse: 'OK' });
        assert.deepEqual(r.body.database, { type: 'Turso', status: 'OK', error: null });
        assert.deepEqual(r.body.realtime, { type: 'SSE', status: 'OK' });
    });
});

// Al final: rompe la tabla apps a propósito para fijar las respuestas de error interno
describe('errores internos (500)', () => {
    it('registrarApp y recuperarToken responden su mensaje fijo si falla la base', async () => {
        const reg = await srv.pedir('POST', '/api/v2/app/registrarApp', { appKey: APPKEY_INICIAL, body: { nombre: 'antes' } });
        srv.db.exec('ALTER TABLE apps RENAME TO apps_x');
        try {
            const a = await srv.pedir('POST', '/api/v2/app/registrarApp', { appKey: APPKEY_INICIAL, body: { nombre: 'x' } });
            assert.equal(a.status, 500);
            assert.deepEqual(a.body, { error: 'Error al registrar la nueva app' });

            const b = await srv.pedir('POST', '/api/v2/app/recuperarToken', { appKey: reg.body.token });
            assert.equal(b.status, 500);
            assert.deepEqual(b.body, { error: 'Error al actualizar el token' });
        } finally {
            srv.db.exec('ALTER TABLE apps_x RENAME TO apps');
        }
    });
});
