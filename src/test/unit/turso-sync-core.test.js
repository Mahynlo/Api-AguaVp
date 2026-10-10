/**
 * Pruebas de protección de datos de la sincronización con Turso (tursoSyncCore.js).
 * La "nube" es un archivo libsql local: no requiere internet ni cuenta de Turso.
 *
 * Ejecutar: node --test src/test/unit/turso-sync-core.test.js
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    incrementalRemote,
    readPendingChanges,
    disableChangeTracking,
    seedRemote,
    getOrCreateInstanciaId,
    readRemoteMeta,
    REMOTE_META_TABLE,
    LOCAL_STATE_TABLE
} from '../../v2/services/tursoSyncCore.js';

const SCHEMA = `
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
    CREATE TABLE tarifas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
    CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
        tarifa_id INTEGER REFERENCES tarifas(id));
    CREATE TABLE facturas (id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER REFERENCES clientes(id), total NUMERIC NOT NULL, saldo_pendiente NUMERIC NOT NULL);
    CREATE TABLE pagos (id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER REFERENCES facturas(id), monto NUMERIC NOT NULL);
    CREATE TABLE rutas_puntos (id INTEGER PRIMARY KEY AUTOINCREMENT, ruta_id INTEGER NOT NULL, orden INTEGER NOT NULL);
    CREATE TABLE rangos_tarifas (id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarifa_id INTEGER NOT NULL REFERENCES tarifas(id) ON DELETE CASCADE, precio NUMERIC);
    CREATE TABLE sesiones (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT);
    CREATE INDEX idx_pagos_factura ON pagos(factura_id);
    CREATE TRIGGER actualizar_saldo_factura AFTER INSERT ON pagos FOR EACH ROW
    BEGIN UPDATE facturas SET saldo_pendiente = ROUND(saldo_pendiente - NEW.monto, 2) WHERE id = NEW.factura_id; END;
`;

function newLocal() {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA);
    return db;
}

function fillLocal(db, clientes = 3) {
    db.exec(`INSERT INTO usuarios (nombre) VALUES ('admin')`);
    db.exec(`INSERT INTO tarifas (nombre) VALUES ('Domestica')`);
    db.exec(`INSERT INTO rangos_tarifas (tarifa_id, precio) VALUES (1, 10), (1, 20)`);
    db.exec(`INSERT INTO sesiones (token) VALUES ('secreto')`);
    for (let i = 1; i <= clientes; i++) {
        db.prepare(`INSERT INTO clientes (nombre, tarifa_id) VALUES (?, 1)`).run(`Cliente ${i}`);
        db.prepare(`INSERT INTO facturas (cliente_id, total, saldo_pendiente) VALUES (?, 100, 100)`).run(i);
        db.prepare(`INSERT INTO pagos (factura_id, monto) VALUES (?, 40)`).run(i);
        db.prepare(`INSERT INTO rutas_puntos (ruta_id, orden) VALUES (1, ?)`).run(i);
    }
}

async function remoteCount(remote, table) {
    return Number((await remote.execute(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
}

const ts = () => new Date().toISOString();

describe('tursoSyncCore — protección de la copia en la nube', () => {
    let dir;
    let remote;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-sync-'));
        remote = createClient({ url: 'file:' + path.join(dir, 'nube.db').replace(/\\/g, '/') });
    });

    afterEach(() => {
        remote.close();
        // En Windows el archivo puede seguir bloqueado unos ms tras cerrar el cliente
        try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch (_) {}
    });

    it('primera carga: copia todo, sin triggers en la nube y con identidad', async () => {
        const local = newLocal();
        fillLocal(local);
        const id = getOrCreateInstanciaId(local);

        const res = await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(res.success, true);
        assert.equal(await remoteCount(remote, 'clientes'), 3);
        assert.equal(await remoteCount(remote, 'pagos'), 3);
        // Saldo copiado tal cual (sin re-aplicar triggers): 100 - 40
        const saldo = (await remote.execute('SELECT saldo_pendiente FROM facturas WHERE id = 1')).rows[0].saldo_pendiente;
        assert.equal(Number(saldo), 60);
        const triggers = (await remote.execute(`SELECT name FROM sqlite_master WHERE type = 'trigger'`)).rows;
        assert.equal(triggers.length, 0);
        // Tablas solo-locales no se suben
        const tablas = (await remote.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map(r => r.name);
        assert.ok(!tablas.includes(LOCAL_STATE_TABLE));
        const meta = await readRemoteMeta(remote);
        assert.equal(meta.instancia_id, id);
    });

    it('base local vacía (perdida) NO sobrescribe la nube', async () => {
        const original = newLocal();
        fillLocal(original);
        await seedRemote(original, remote, { instanciaId: getOrCreateInstanciaId(original), timestamp: ts() });

        const nuevaVacia = newLocal(); // base recreada por las migraciones tras perder la original
        const res = await seedRemote(nuevaVacia, remote, { instanciaId: getOrCreateInstanciaId(nuevaVacia), timestamp: ts() });

        assert.equal(res.success, false);
        assert.equal(res.conflict, true);
        assert.ok(res.motivos.some(m => m.tipo === 'instancia'));
        assert.ok(res.motivos.some(m => m.tipo === 'conteo'));
        assert.equal(await remoteCount(remote, 'clientes'), 3, 'la nube conserva sus datos');
    });

    it('respaldo local antiguo de la misma base NO sobrescribe datos más nuevos de la nube', async () => {
        const local = newLocal();
        fillLocal(local, 5);
        const id = getOrCreateInstanciaId(local);
        await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        // Simula restaurar un respaldo anterior: misma identidad, menos registros
        local.exec('DELETE FROM pagos WHERE id > 2; DELETE FROM facturas WHERE id > 2; DELETE FROM clientes WHERE id > 2');
        const res = await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(res.conflict, true);
        assert.equal(await remoteCount(remote, 'clientes'), 5);
    });

    it('reemplazo forzado (confirmado por el admin) sí actualiza la nube', async () => {
        const original = newLocal();
        fillLocal(original, 4);
        await seedRemote(original, remote, { instanciaId: getOrCreateInstanciaId(original), timestamp: ts() });

        const otra = newLocal();
        fillLocal(otra, 2);
        const idOtra = getOrCreateInstanciaId(otra);
        const res = await seedRemote(otra, remote, { instanciaId: idOtra, force: true, timestamp: ts() });

        assert.equal(res.success, true);
        assert.equal(await remoteCount(remote, 'clientes'), 2);
        assert.equal((await readRemoteMeta(remote)).instancia_id, idOtra);
    });

    it('borrado local se refleja en la nube sin vaciarla', async () => {
        const local = newLocal();
        fillLocal(local, 3);
        const id = getOrCreateInstanciaId(local);
        await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        // Reordenar una ruta borra puntos; además se agrega un cliente
        local.exec('DELETE FROM rutas_puntos WHERE id = 3');
        local.exec(`INSERT INTO clientes (nombre, tarifa_id) VALUES ('Cliente 4', 1)`);
        const res = await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(res.success, true);
        assert.equal(res.pruned, 1);
        assert.equal(await remoteCount(remote, 'rutas_puntos'), 2);
        assert.equal(await remoteCount(remote, 'clientes'), 4);
    });

    it('faltan pagos en local respecto a la nube: se bloquea (tabla protegida)', async () => {
        const local = newLocal();
        fillLocal(local, 3);
        const id = getOrCreateInstanciaId(local);
        await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        local.exec('DELETE FROM pagos WHERE id = 3');
        const res = await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(res.conflict, true);
        assert.deepEqual(res.comparacion.find(c => c.tabla === 'pagos'), { tabla: 'pagos', local: 2, nube: 3 });
        assert.equal(await remoteCount(remote, 'pagos'), 3);
    });

    it('columna nueva en local (actualización de la API) se agrega en la nube y se copia', async () => {
        const local = newLocal();
        fillLocal(local);
        const id = getOrCreateInstanciaId(local);
        await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        local.exec(`ALTER TABLE clientes ADD COLUMN numero_predio TEXT NOT NULL DEFAULT 'S/N'`);
        local.exec(`UPDATE clientes SET numero_predio = 'P-' || id`);
        const res = await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(res.success, true);
        assert.deepEqual(res.schema.columnasAgregadas, ['clientes.numero_predio']);
        const predio = (await remote.execute('SELECT numero_predio FROM clientes WHERE id = 2')).rows[0].numero_predio;
        assert.equal(predio, 'P-2');
    });

    it('nube con datos de una versión anterior (sin identidad) se adopta si la local está completa', async () => {
        const local = newLocal();
        fillLocal(local, 3);
        // Copia "heredada": misma data, sin tabla de metadatos
        await seedRemote(local, remote, { instanciaId: 'temporal', timestamp: ts() });
        await remote.execute(`DROP TABLE ${REMOTE_META_TABLE}`);

        const res = await seedRemote(local, remote, { instanciaId: getOrCreateInstanciaId(local), timestamp: ts() });
        assert.equal(res.success, true);
    });

    it('base descargada de la nube hereda la identidad y continúa sin conflicto', async () => {
        const original = newLocal();
        fillLocal(original);
        const id = getOrCreateInstanciaId(original);
        await seedRemote(original, remote, { instanciaId: id, timestamp: ts() });

        // Simula un .dump de la nube: datos + tabla de metadatos remota, sin sync_estado
        const descargada = newLocal();
        fillLocal(descargada);
        descargada.exec(`CREATE TABLE ${REMOTE_META_TABLE} (clave TEXT PRIMARY KEY, valor TEXT)`);
        descargada.prepare(`INSERT INTO ${REMOTE_META_TABLE} VALUES ('instancia_id', ?)`).run(id);

        assert.equal(getOrCreateInstanciaId(descargada), id);
        const res = await seedRemote(descargada, remote, { instanciaId: id, timestamp: ts() });
        assert.equal(res.success, true);
        // La tabla de metadatos de la base descargada no se re-sube como dato
        assert.equal((await readRemoteMeta(remote)).instancia_id, id);
    });
});

describe('tursoSyncCore — registro de cambios, verificación e integridad', () => {
    let dir;
    let remote;
    let local;
    let id;

    const remoteRow = async (table, rowId) =>
        (await remote.execute({ sql: `SELECT * FROM "${table}" WHERE id = ?`, args: [rowId] })).rows[0];

    // Remoto que falla ante cualquier llamada: prueba que no se usa la red
    const sinRed = new Proxy({}, { get: () => () => { throw new Error('llamada de red inesperada'); } });

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-sync2-'));
        remote = createClient({ url: 'file:' + path.join(dir, 'nube.db').split(path.sep).join('/') });
        local = newLocal();
        fillLocal(local, 3);
        id = getOrCreateInstanciaId(local);
        await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });
    });

    afterEach(() => {
        remote.close();
        try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch (_) {}
    });

    it('tablas de sesiones/tokens no se suben a la nube ni registran cambios', async () => {
        const tablas = (await remote.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map(r => r.name);
        assert.ok(!tablas.includes('sesiones'));
        local.exec(`INSERT INTO sesiones (token) VALUES ('otro')`);
        assert.equal(readPendingChanges(local).total, 0);
    });

    it('sin cambios locales no hay llamadas de red', async () => {
        const res = await incrementalRemote(local, sinRed, { instanciaId: id, timestamp: ts() });
        assert.equal(res.reason, 'no_local_changes');
    });

    it('altas, ediciones y borrados de cualquier tabla llegan a la nube y el registro se vacía', async () => {
        local.exec(`INSERT INTO clientes (nombre, tarifa_id) VALUES ('Nuevo', 1)`);
        local.exec(`UPDATE tarifas SET nombre = 'Comercial' WHERE id = 1`);
        local.exec(`UPDATE rutas_puntos SET orden = 9 WHERE id = 2`);
        local.exec(`DELETE FROM rutas_puntos WHERE id = 3`);
        assert.ok(readPendingChanges(local).total >= 4);

        const res = await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(res.success, true);
        assert.equal((await remoteRow('clientes', 4)).nombre, 'Nuevo');
        assert.equal((await remoteRow('tarifas', 1)).nombre, 'Comercial');
        assert.equal(Number((await remoteRow('rutas_puntos', 2)).orden), 9);
        assert.equal(await remoteRow('rutas_puntos', 3), undefined);
        assert.equal(res.verificacion.ok, true);
        assert.equal(readPendingChanges(local).total, 0);
        assert.equal(Number(local.prepare('SELECT COUNT(*) AS n FROM sync_cambios').get().n), 0);
    });

    it('cambios hechos por triggers de negocio y borrados en cascada también se suben', async () => {
        // El trigger de negocio descuenta el saldo de la factura al insertar el pago
        local.exec(`INSERT INTO pagos (factura_id, monto) VALUES (1, 10)`);
        local.exec(`INSERT INTO tarifas (nombre) VALUES ('Temporal')`);
        local.exec(`INSERT INTO rangos_tarifas (tarifa_id, precio) VALUES (2, 5)`);
        await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts() });
        // ON DELETE CASCADE borra los rangos de la tarifa
        local.exec(`DELETE FROM tarifas WHERE id = 2`);

        await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(Number((await remoteRow('facturas', 1)).saldo_pendiente), 50);
        assert.equal(await remoteRow('tarifas', 2), undefined);
        const rangos = (await remote.execute('SELECT COUNT(*) AS n FROM rangos_tarifas WHERE tarifa_id = 2')).rows[0].n;
        assert.equal(Number(rangos), 0);
    });

    it('verificación completa repara una tabla desincronizada', async () => {
        await remote.execute('DELETE FROM rutas_puntos WHERE id = 1');
        const res = await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts(), verifyAll: true });
        assert.equal(res.verificacion.ok, true);
        assert.deepEqual(res.verificacion.reparadas, ['rutas_puntos']);
        assert.ok(await remoteRow('rutas_puntos', 1));
    });

    it('la reparación NO borra registros extra de la nube en tablas protegidas', async () => {
        await remote.execute(`INSERT INTO clientes (id, nombre, tarifa_id) VALUES (50, 'Solo en la nube', 1)`);
        const res = await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts(), verifyAll: true });
        assert.equal(res.verificacion.ok, false);
        assert.deepEqual(res.verificacion.conservadas.map(c => c.tabla), ['clientes']);
        assert.ok(await remoteRow('clientes', 50), 'el registro se conserva');
    });

    it('nube de otra base o tabla nueva sin registro de cambios → requiere carga completa', async () => {
        local.exec(`INSERT INTO clientes (nombre, tarifa_id) VALUES ('X', 1)`);
        const otra = await incrementalRemote(local, remote, { instanciaId: 'otra-base', timestamp: ts() });
        assert.deepEqual([otra.needsSeed, otra.reason], [true, 'remote_identity']);

        local.exec(`CREATE TABLE inventario (id INTEGER PRIMARY KEY, nombre TEXT)`);
        const nueva = await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts() });
        assert.deepEqual([nueva.needsSeed, nueva.reason], [true, 'tracking_installed']);
    });

    it('al desvincular se quitan solo los triggers de registro', () => {
        disableChangeTracking(local);
        const n = local.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name LIKE '_sync_%'`).get().n;
        assert.equal(Number(n), 0);
        assert.ok(local.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE name = 'actualizar_saldo_factura'`).get());
    });

    it('una base local dañada (quick_check) nunca se sube, ni forzando', async () => {
        const danada = {
            exec: (sql) => local.exec(sql),
            prepare: (sql) => (/PRAGMA quick_check/i.test(sql)
                ? { all: () => [{ quick_check: '*** in database main *** Page 5: btreeInitPage() returns error code 11' }] }
                : local.prepare(sql))
        };
        await assert.rejects(
            seedRemote(danada, remote, { instanciaId: id, force: true, timestamp: ts() }),
            /integridad/
        );
        assert.equal(await remoteCount(remote, 'clientes'), 3);
    });
});
