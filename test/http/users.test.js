/**
 * Tests HTTP de /api/v2/users (caracterización)
 *
 * Fijan el comportamiento ACTUAL de cada endpoint (status y cuerpo) con autenticación real
 * y SQLite real. Sirven de red de seguridad para refactorizar userController/userService:
 * deben seguir pasando sin modificarse.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidorPrueba } from '../helpers/servidor-prueba.js';

let srv, S, A, O, S2, O2;
const silenciar = () => { console.log = console.error = console.warn = () => {}; };

before(async () => {
    silenciar();
    srv = await crearServidorPrueba();
    S = await srv.crearUsuarioYLogin({ rol: 'superadmin' });
    A = await srv.crearUsuarioYLogin({ rol: 'administrador' });
    O = await srv.crearUsuarioYLogin({ rol: 'operador' });
    S2 = await srv.crearUsuarioYLogin({ rol: 'superadmin' });
    O2 = await srv.crearUsuarioYLogin({ rol: 'operador' });
});

after(async () => { await srv.cerrar(); });

const CAMPOS_USUARIO = ['correo', 'eliminado_por', 'estado_usuario', 'fecha_creacion', 'fecha_eliminacion', 'id', 'nombre', 'razon_eliminacion', 'rol', 'ultimo_acceso', 'username'];

describe('GET /users/me/permissions', () => {
    it('devuelve el snapshot de permisos del usuario autenticado (cualquier rol)', async () => {
        const r = await srv.pedir('GET', '/api/v2/users/me/permissions', { token: O.token });
        assert.equal(r.status, 200);
        assert.equal(r.body.success, true);
        assert.equal(r.body.user_id, O.id);
        assert.equal(r.body.role, 'operador');
        const tomar = r.body.permissions.find(p => p.key === 'lecturas.tomar');
        assert.deepEqual(Object.keys(tomar).sort(), ['action', 'description', 'granted', 'key', 'module', 'override', 'source']);
        assert.equal(tomar.granted, true);
        assert.equal(r.body.permissions.find(p => p.key === 'clientes.crear').granted, false);
    });

    it('sin token responde 401', async () => {
        const r = await srv.pedir('GET', '/api/v2/users/me/permissions');
        assert.equal(r.status, 401);
        assert.deepEqual(r.body, { error: 'Token no proporcionado o formato incorrecto' });
    });
});

describe('GET /users', () => {
    it('un operador no tiene acceso (403)', async () => {
        const r = await srv.pedir('GET', '/api/v2/users', { token: O.token });
        assert.equal(r.status, 403);
        assert.deepEqual(r.body, {
            error: 'Acceso denegado: privilegios insuficientes',
            message: "El rol 'operador' no tiene acceso a este recurso.",
            required_roles: ['administrador', 'superadmin']
        });
    });

    it('superadmin ve a todos, con los campos esperados', async () => {
        const r = await srv.pedir('GET', '/api/v2/users', { token: S.token });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.map(u => u.id).sort(), [S.id, A.id, O.id, S2.id, O2.id].sort());
        assert.deepEqual(Object.keys(r.body[0]).sort(), [...CAMPOS_USUARIO, 'eliminador_username'].sort());
        assert.equal(typeof r.body[0].id, 'number');
    });

    it('un administrador no ve a los superadmin', async () => {
        const r = await srv.pedir('GET', '/api/v2/users', { token: A.token });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.map(u => u.id).sort(), [A.id, O.id, O2.id].sort());
    });

    it('filtra por rol y por búsqueda', async () => {
        const porRol = await srv.pedir('GET', '/api/v2/users?rol=operador', { token: S.token });
        assert.deepEqual(porRol.body.map(u => u.id).sort(), [O.id, O2.id].sort());
        const porTexto = await srv.pedir('GET', '/api/v2/users?busqueda=administrador', { token: S.token });
        assert.deepEqual(porTexto.body.map(u => u.id), [A.id]);
    });
});

describe('GET /users/permissions/catalog', () => {
    it('devuelve el catálogo de permisos', async () => {
        const r = await srv.pedir('GET', '/api/v2/users/permissions/catalog', { token: A.token });
        assert.equal(r.status, 200);
        assert.equal(r.body.success, true);
        assert.deepEqual(r.body.data.find(p => p.key === 'clientes.crear'), { key: 'clientes.crear', module: 'clientes', action: 'crear', description: 'Crear clientes' });
    });
});

describe('GET /users/:id/permissions', () => {
    it('devuelve los permisos del usuario indicado', async () => {
        const r = await srv.pedir('GET', `/api/v2/users/${S2.id}/permissions`, { token: S.token });
        assert.equal(r.status, 200);
        assert.equal(r.body.success, true);
        assert.equal(r.body.user_id, S2.id);
        assert.equal(r.body.role, 'superadmin');
        assert.ok(r.body.permissions.every(p => p.granted === true && p.source === 'role'));
    });

    it('usuario inexistente o id no numérico: 404', async () => {
        for (const id of ['9999', 'abc']) {
            const r = await srv.pedir('GET', `/api/v2/users/${id}/permissions`, { token: S.token });
            assert.equal(r.status, 404);
            assert.deepEqual(r.body, { error: 'Usuario no encontrado' });
        }
    });
});

describe('PUT /users/:id/permissions', () => {
    it('un administrador no puede modificar permisos de un superadmin (403)', async () => {
        const r = await srv.pedir('PUT', `/api/v2/users/${S2.id}/permissions`, { token: A.token, body: { overrides: [] } });
        assert.equal(r.status, 403);
        assert.deepEqual(r.body, { error: 'No tienes permiso para modificar los permisos de un superadmin' });
    });

    it('aplica overrides y devuelve los permisos actualizados', async () => {
        const r = await srv.pedir('PUT', `/api/v2/users/${O2.id}/permissions`, { token: S.token, body: { overrides: [{ key: 'clientes.crear', effect: 'allow' }] } });
        assert.equal(r.status, 200);
        assert.equal(r.body.success, true);
        assert.equal(r.body.message, 'Permisos actualizados correctamente');
        assert.equal(r.body.user_id, O2.id);
        const clientesCrear = r.body.permissions.find(p => p.key === 'clientes.crear');
        assert.equal(clientesCrear.granted, true);
        assert.equal(clientesCrear.source, 'override_allow');

        // Se revierte para no afectar a otros tests
        await srv.pedir('PUT', `/api/v2/users/${O2.id}/permissions`, { token: S.token, body: { overrides: [] } });
    });

    it('usuario inexistente: 404', async () => {
        const r = await srv.pedir('PUT', '/api/v2/users/9999/permissions', { token: S.token, body: { overrides: [] } });
        assert.equal(r.status, 404);
        assert.deepEqual(r.body, { error: 'Usuario no encontrado' });
    });

    it('cuerpo inválido: 400 de validación Zod', async () => {
        const r = await srv.pedir('PUT', `/api/v2/users/${O2.id}/permissions`, { token: S.token, body: { overrides: 'x' } });
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'Validación fallida');
        assert.equal(r.body.code, 'VALIDATION_ERROR');
    });
});

describe('GET /users/:id', () => {
    it('un administrador no puede ver a un superadmin (403)', async () => {
        const r = await srv.pedir('GET', `/api/v2/users/${S2.id}`, { token: A.token });
        assert.equal(r.status, 403);
        assert.deepEqual(r.body, { error: 'No tienes permiso para ver a un superadmin' });
    });

    it('devuelve el usuario con los campos esperados', async () => {
        const r = await srv.pedir('GET', `/api/v2/users/${O.id}`, { token: S.token });
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.body).sort(), CAMPOS_USUARIO);
        assert.equal(r.body.id, O.id);
        assert.equal(r.body.rol, 'operador');
    });

    it('inexistente: 404', async () => {
        const r = await srv.pedir('GET', '/api/v2/users/9999', { token: S.token });
        assert.equal(r.status, 404);
        assert.deepEqual(r.body, { error: 'Usuario no encontrado' });
    });
});

describe('POST /users', () => {
    it('campos faltantes (o sin cuerpo): 400', async () => {
        for (const body of [{ correo: 'x@x.com' }, undefined]) {
            const r = await srv.pedir('POST', '/api/v2/users', { token: S.token, body });
            assert.equal(r.status, 400);
            assert.deepEqual(r.body, { error: 'Todos los campos obligatorios' });
        }
    });

    it('un administrador no puede crear un superadmin (403)', async () => {
        const r = await srv.pedir('POST', '/api/v2/users', { token: A.token, body: { correo: 'n@x.com', contrasena: 'Abc12345!', username: 'nuevo', rol: 'superadmin' } });
        assert.equal(r.status, 403);
        assert.deepEqual(r.body, { error: 'No tienes permiso para crear un superadmin' });
    });

    it('crea el usuario (201) con cambio de contraseña obligatorio, y rechaza duplicados (409)', async () => {
        const r = await srv.pedir('POST', '/api/v2/users', { token: S.token, body: { correo: 'creado@x.com', nombre: 'Creado', contrasena: 'Abc12345!', username: 'creado', rol: 'operador' } });
        assert.equal(r.status, 201);
        assert.deepEqual(r.body, { success: true, mensaje: 'Usuario creado correctamente', requiere_cambio_password: true });
        const fila = srv.db.prepare(`SELECT rol, estado_usuario, requiere_cambio_password FROM usuarios WHERE correo = 'creado@x.com'`).get();
        assert.deepEqual({ ...fila }, { rol: 'operador', estado_usuario: 'Activo', requiere_cambio_password: 1 });

        const dup = await srv.pedir('POST', '/api/v2/users', { token: S.token, body: { correo: 'creado@x.com', contrasena: 'Abc12345!', username: 'otro', rol: 'operador' } });
        assert.equal(dup.status, 409);
        assert.deepEqual(dup.body, { error: 'Usuario ya existe' });
    });
});

describe('PUT /users/:id', () => {
    it('un administrador no puede modificar a un superadmin ni asignar ese rol (403)', async () => {
        const a = await srv.pedir('PUT', `/api/v2/users/${S2.id}`, { token: A.token, body: { nombre: 'x' } });
        assert.equal(a.status, 403);
        assert.deepEqual(a.body, { error: 'No tienes permiso para modificar a un superadmin' });
        const b = await srv.pedir('PUT', `/api/v2/users/${O2.id}`, { token: A.token, body: { rol: 'superadmin' } });
        assert.equal(b.status, 403);
        assert.deepEqual(b.body, { error: 'No tienes permiso para asignar el rol de superadmin' });
    });

    it('actualiza el nombre', async () => {
        const r = await srv.pedir('PUT', `/api/v2/users/${O2.id}`, { token: S.token, body: { nombre: 'Renombrado' } });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body, { success: true, mensaje: 'Usuario actualizado correctamente' });
        assert.equal(srv.db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(O2.id).nombre, 'Renombrado');
    });

    it('sin campos: 400; inexistente: 404', async () => {
        const vacio = await srv.pedir('PUT', `/api/v2/users/${O2.id}`, { token: S.token, body: {} });
        assert.equal(vacio.status, 400);
        assert.deepEqual(vacio.body, { error: 'Nada que actualizar' });
        const noExiste = await srv.pedir('PUT', '/api/v2/users/9999', { token: S.token, body: { nombre: 'x' } });
        assert.equal(noExiste.status, 404);
        assert.deepEqual(noExiste.body, { error: 'Usuario no encontrado' });
    });
});

describe('DELETE /users/:id y PATCH /users/:id/activar', () => {
    it('no se puede eliminar a sí mismo (400) ni un administrador a un superadmin (403)', async () => {
        const self = await srv.pedir('DELETE', `/api/v2/users/${S.id}`, { token: S.token, body: {} });
        assert.equal(self.status, 400);
        assert.deepEqual(self.body, { error: 'No puedes eliminarte a ti mismo' });
        const sa = await srv.pedir('DELETE', `/api/v2/users/${S2.id}`, { token: A.token, body: {} });
        assert.equal(sa.status, 403);
        assert.deepEqual(sa.body, { error: 'No tienes permiso para desactivar a un superadmin' });
    });

    it('sin cuerpo responde 500 (comportamiento actual: lee req.body.razon)', async () => {
        const r = await srv.pedir('DELETE', `/api/v2/users/${O.id}`, { token: S.token });
        assert.equal(r.status, 500);
        assert.deepEqual(r.body, { error: "Cannot read properties of undefined (reading 'razon')" });
    });

    it('elimina (soft delete), cierra sus sesiones y luego lo reactiva', async () => {
        const del = await srv.pedir('DELETE', `/api/v2/users/${O2.id}`, { token: S.token, body: { razon: 'prueba' } });
        assert.equal(del.status, 200);
        assert.deepEqual(del.body, { success: true, mensaje: 'Usuario eliminado correctamente' });
        const fila = srv.db.prepare('SELECT estado_usuario, eliminado_por, razon_eliminacion FROM usuarios WHERE id = ?').get(O2.id);
        assert.deepEqual({ ...fila }, { estado_usuario: 'Eliminado', eliminado_por: S.id, razon_eliminacion: 'prueba' });

        const tokenViejo = await srv.pedir('GET', '/api/v2/users/me/permissions', { token: O2.token });
        assert.equal(tokenViejo.status, 403);
        assert.deepEqual(tokenViejo.body, { error: 'Token inválido o sesión expirada' });

        const act = await srv.pedir('PATCH', `/api/v2/users/${O2.id}/activar`, { token: S.token });
        assert.equal(act.status, 200);
        assert.deepEqual(act.body, { success: true, mensaje: 'Usuario reactivado correctamente' });
        const reactivado = srv.db.prepare('SELECT estado_usuario, eliminado_por, razon_eliminacion FROM usuarios WHERE id = ?').get(O2.id);
        assert.deepEqual({ ...reactivado }, { estado_usuario: 'Activo', eliminado_por: null, razon_eliminacion: null });
    });

    it('un administrador no puede reactivar a un superadmin (403)', async () => {
        const r = await srv.pedir('PATCH', `/api/v2/users/${S2.id}/activar`, { token: A.token });
        assert.equal(r.status, 403);
        assert.deepEqual(r.body, { error: 'No tienes permiso para reactivar a un superadmin' });
    });
});

describe('DELETE /users/:id/purgar', () => {
    it('un administrador no puede purgar a un superadmin (403); inexistente: 404', async () => {
        const sa = await srv.pedir('DELETE', `/api/v2/users/${S2.id}/purgar`, { token: A.token });
        assert.equal(sa.status, 403);
        assert.deepEqual(sa.body, { error: 'No tienes permiso para eliminar definitivamente a un superadmin' });
        const noExiste = await srv.pedir('DELETE', '/api/v2/users/9999/purgar', { token: S.token });
        assert.equal(noExiste.status, 404);
        assert.deepEqual(noExiste.body, { error: 'Usuario no encontrado' });
    });

    it('con registros asociados (FK) responde 409', async () => {
        const id = Number(srv.db.prepare(`INSERT INTO usuarios (correo, nombre, "contraseña", username, rol) VALUES ('fk@x.com', 'FK', 'x', 'fk', 'operador')`).run().lastInsertRowid);
        srv.db.prepare(`INSERT INTO clientes (nombre, direccion, telefono, ciudad, modificado_por) VALUES ('Cliente FK', 'd', '1', 'c', ?)`).run(id);
        const r = await srv.pedir('DELETE', `/api/v2/users/${id}/purgar`, { token: S.token });
        assert.equal(r.status, 409);
        assert.match(r.body.error, /^No se puede eliminar definitivamente este usuario/);
    });

    it('purga el usuario y deja de existir', async () => {
        const id = Number(srv.db.prepare(`INSERT INTO usuarios (correo, nombre, "contraseña", username, rol) VALUES ('purga@x.com', 'P', 'x', 'purga', 'operador')`).run().lastInsertRowid);
        const r = await srv.pedir('DELETE', `/api/v2/users/${id}/purgar`, { token: S.token });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body, { success: true, mensaje: 'Usuario eliminado definitivamente de la base de datos' });
        const despues = await srv.pedir('GET', `/api/v2/users/${id}`, { token: S.token });
        assert.equal(despues.status, 404);
    });
});

// Al final: rompe tablas a propósito para fijar las respuestas de error interno (500)
describe('errores internos (500)', () => {
    it('mensaje fijo, sin exponer el error (catálogo de permisos)', async () => {
        srv.db.exec('ALTER TABLE permissions_catalog RENAME TO permissions_catalog_x');
        try {
            const r = await srv.pedir('GET', '/api/v2/users/permissions/catalog', { token: S.token });
            assert.equal(r.status, 500);
            assert.deepEqual(r.body, { error: 'Error al obtener catálogo de permisos' });
        } finally {
            srv.db.exec('ALTER TABLE permissions_catalog_x RENAME TO permissions_catalog');
        }
    });

    it('expone el mensaje del error (listar usuarios)', async () => {
        srv.db.exec('ALTER TABLE usuarios RENAME TO usuarios_x');
        try {
            const r = await srv.pedir('GET', '/api/v2/users', { token: S.token });
            assert.equal(r.status, 500);
            assert.match(r.body.error, /no such table: usuarios/);
            assert.deepEqual(Object.keys(r.body), ['error']);
        } finally {
            srv.db.exec('ALTER TABLE usuarios_x RENAME TO usuarios');
        }
    });
});
