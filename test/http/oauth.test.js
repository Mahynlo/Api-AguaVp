/**
 * Tests HTTP de /api/v2/oauth/token (caracterización)
 *
 * Fijan el comportamiento ACTUAL de los grants password y refresh_token,
 * incluida la rotación del refresh token.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { crearServidorPrueba, PASSWORD_PRUEBA } from '../helpers/servidor-prueba.js';

let srv, A;
const token = (body, appKey = srv.appKey) => srv.pedir('POST', '/api/v2/oauth/token', { appKey, body });

before(async () => {
    console.log = console.error = console.warn = () => {};
    srv = await crearServidorPrueba();
    A = await srv.crearUsuarioYLogin({ rol: 'administrador' });
});

after(async () => { await srv.cerrar(); });

describe('POST /oauth/token', () => {
    it('requiere app key (401)', async () => {
        const r = await token({ grant_type: 'password', username: A.correo, password: PASSWORD_PRUEBA }, null);
        assert.equal(r.status, 401);
    });

    it('grant_type ausente o desconocido: 400', async () => {
        assert.deepEqual(await token({}), { status: 400, body: { error: 'grant_type no soportado' } });
        assert.deepEqual(await token({ grant_type: 'otro' }), { status: 400, body: { error: 'grant_type no soportado' } });
    });

    it('password: credenciales faltantes (400) o inválidas (401)', async () => {
        assert.deepEqual(await token({ grant_type: 'password' }), { status: 400, body: { error: 'Credenciales requeridas' } });
        assert.deepEqual(await token({ grant_type: 'password', username: A.correo, password: 'mal' }), { status: 401, body: { error: 'Credenciales inválidas' } });
        assert.deepEqual(await token({ grant_type: 'password', username: 'nadie@x.com', password: PASSWORD_PRUEBA }), { status: 401, body: { error: 'Credenciales inválidas' } });
    });

    it('password: emite access y refresh token, y una sesión oauth', async () => {
        const r = await token({ grant_type: 'password', username: A.correo, password: PASSWORD_PRUEBA, scope: 'read:reports' });
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.body).sort(), ['access_token', 'expires_in', 'refresh_token', 'scope', 'token_type']);
        assert.equal(r.body.token_type, 'Bearer');
        assert.equal(r.body.expires_in, 900);
        assert.equal(r.body.scope, 'read:reports');
        const payload = jwt.verify(r.body.access_token, process.env.JWT_SECRET);
        assert.deepEqual({ id: payload.id, role: payload.role, scope: payload.scope }, { id: A.id, role: 'administrador', scope: 'read:reports' });

        const sesion = srv.db.prepare('SELECT usuario_id, tipo_sesion, dispositivo FROM sesiones WHERE token = ?').get(r.body.access_token);
        assert.deepEqual({ ...sesion }, { usuario_id: A.id, tipo_sesion: 'oauth', dispositivo: 'OAuth Client' });
        const rt = srv.db.prepare('SELECT usuario_id, revocado, app_id FROM refresh_tokens WHERE token = ?').get(r.body.refresh_token);
        assert.equal(rt.usuario_id, A.id);
        assert.equal(rt.revocado, 0);
        assert.ok(rt.app_id);
    });

    it('refresh_token: rota el token (el usado queda revocado y no sirve otra vez)', async () => {
        const inicial = await token({ grant_type: 'password', username: A.correo, password: PASSWORD_PRUEBA });
        assert.deepEqual(await token({ grant_type: 'refresh_token' }), { status: 400, body: { error: 'refresh_token requerido' } });

        // Hallazgo previo (no corregido): un refresh en el mismo segundo que el login genera
        // un access token idéntico (mismo payload e iat) y choca con sesiones_token_unique → 500.
        await new Promise(r => setTimeout(r, 1100));
        const r =await token({ grant_type: 'refresh_token', refresh_token: inicial.body.refresh_token });
        assert.equal(r.status, 200);
        assert.equal(r.body.scope, 'default');
        assert.notEqual(r.body.refresh_token, inicial.body.refresh_token);

        const usado = srv.db.prepare('SELECT revocado, razon_revocacion FROM refresh_tokens WHERE token = ?').get(inicial.body.refresh_token);
        assert.deepEqual({ ...usado }, { revocado: 1, razon_revocacion: 'Rotation' });

        assert.deepEqual(await token({ grant_type: 'refresh_token', refresh_token: inicial.body.refresh_token }), { status: 401, body: { error: 'Refresh token inválido o revocado' } });
        assert.deepEqual(await token({ grant_type: 'refresh_token', refresh_token: 'no-existe' }), { status: 401, body: { error: 'Refresh token inválido o revocado' } });
    });
});
