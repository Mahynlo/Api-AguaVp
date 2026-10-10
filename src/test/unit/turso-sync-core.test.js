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
    restoreRemoteInto,
    describeRemoteCopy,
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
    CREATE TABLE rutas_puntos (id INTEGER PRIMARY KEY AUTOINCREMENT, ruta_id INTEGER NOT NULL, orden INTEGER NOT NULL,
        UNIQUE(ruta_id, orden));
    CREATE TABLE user_permission_overrides (id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, permission_key TEXT NOT NULL);
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
    db.exec(`INSERT INTO user_permission_overrides (user_id, updated_by, permission_key) VALUES (1, 1, 'clientes.crear')`);
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

describe('tursoSyncCore — restauración desde la nube', () => {
    let dir;
    let remote;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-restore-'));
        remote = createClient({ url: 'file:' + path.join(dir, 'nube.db').split(path.sep).join('/') });
    });

    afterEach(() => {
        remote.close();
        try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch (_) {}
    });

    // Base "recién migrada" de una versión más nueva: esquema actual + triggers + filas sembradas por migración
    const nuevaBaseMigrada = () => {
        const db = newLocal();
        db.exec(`ALTER TABLE clientes ADD COLUMN estado TEXT NOT NULL DEFAULT 'Activo'`);
        db.exec(`INSERT INTO tarifas (nombre) VALUES ('Sembrada por migración')`);
        return db;
    };

    it('ida y vuelta: local → nube → base nueva con mismos datos, triggers funcionando e identidad heredada', async () => {
        const original = newLocal();
        fillLocal(original, 4);
        original.exec(`INSERT INTO pagos (factura_id, monto) VALUES (2, 60)`); // factura 2 queda en 0
        const id = getOrCreateInstanciaId(original);
        await seedRemote(original, remote, { instanciaId: id, timestamp: ts() });

        const restaurada = nuevaBaseMigrada();
        const res = await restoreRemoteInto(restaurada, remote);

        assert.equal(res.instanciaId, id);
        for (const t of ['usuarios', 'tarifas', 'clientes', 'facturas', 'pagos', 'rutas_puntos', 'rangos_tarifas']) {
            const a = original.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
            const b = restaurada.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
            assert.equal(b, a, `registros de ${t}`);
        }
        // La fila sembrada por la migración fue reemplazada por los datos de la nube
        assert.equal(restaurada.prepare(`SELECT nombre FROM tarifas WHERE id = 1`).get().nombre, 'Domestica');
        // Saldos copiados tal cual (sin re-aplicar triggers durante la copia)
        assert.equal(Number(restaurada.prepare('SELECT saldo_pendiente FROM facturas WHERE id = 2').get().saldo_pendiente), 0);
        // Columna nueva (no existe en la nube) toma su DEFAULT
        assert.equal(restaurada.prepare('SELECT estado FROM clientes WHERE id = 1').get().estado, 'Activo');
        // Triggers de negocio de nuevo activos
        restaurada.exec(`INSERT INTO pagos (factura_id, monto) VALUES (1, 10)`);
        assert.equal(Number(restaurada.prepare('SELECT saldo_pendiente FROM facturas WHERE id = 1').get().saldo_pendiente), 50);
        // Tablas excluidas vacías; marcada para carga completa al volver a vincular
        assert.equal(Number(restaurada.prepare('SELECT COUNT(*) AS n FROM sesiones').get().n), 0);
        assert.equal(restaurada.prepare(`SELECT valor FROM sync_estado WHERE clave = 'requiere_carga_completa'`).get().valor, '1');
    });

    it('al volver a vincular, la base restaurada continúa con la misma copia sin conflicto', async () => {
        const original = newLocal();
        fillLocal(original, 3);
        const id = getOrCreateInstanciaId(original);
        await seedRemote(original, remote, { instanciaId: id, timestamp: ts() });

        const restaurada = newLocal();
        await restoreRemoteInto(restaurada, remote);
        const res = await seedRemote(restaurada, remote, { instanciaId: getOrCreateInstanciaId(restaurada), timestamp: ts() });

        assert.equal(res.success, true);
        assert.equal(res.pruned, 0);
        assert.equal(res.verificacion.ok, true);
    });

    it('columnas y tablas que la versión instalada no conoce se conservan al restaurar', async () => {
        // Base original con una columna y una tabla de una migración que ya no existe en el código
        const original = newLocal();
        original.exec(`ALTER TABLE facturas ADD COLUMN fecha_entrega_recibo DATE`);
        original.exec(`CREATE TABLE notas_internas (id INTEGER PRIMARY KEY, texto TEXT)`);
        fillLocal(original, 3);
        original.exec(`UPDATE facturas SET fecha_entrega_recibo = '2026-05-0' || id`);
        original.exec(`INSERT INTO notas_internas (texto) VALUES ('importante')`);
        const id = getOrCreateInstanciaId(original);
        await seedRemote(original, remote, { instanciaId: id, timestamp: ts() });

        const restaurada = newLocal(); // esquema de la versión instalada: sin esa columna ni tabla
        const res = await restoreRemoteInto(restaurada, remote);

        assert.deepEqual(res.columnasConservadas, ['facturas.fecha_entrega_recibo']);
        assert.deepEqual(res.tablasConservadas, ['notas_internas']);
        assert.equal(restaurada.prepare('SELECT fecha_entrega_recibo AS f FROM facturas WHERE id = 2').get().f, '2026-05-02');
        assert.equal(restaurada.prepare('SELECT texto FROM notas_internas').get().texto, 'importante');

        // Y al volver a vincular no se pierde nada en la nube
        const seed = await seedRemote(restaurada, remote, { instanciaId: getOrCreateInstanciaId(restaurada), timestamp: ts() });
        assert.equal(seed.success, true);
        const enNube = (await remote.execute('SELECT COUNT(*) AS n FROM facturas WHERE fecha_entrega_recibo IS NOT NULL')).rows[0].n;
        assert.equal(Number(enNube), 3);
    });

    it('una base sin columnas que la nube sí tiene NO puede subirse (se vaciarían en la nube)', async () => {
        const original = newLocal();
        original.exec(`ALTER TABLE facturas ADD COLUMN fecha_entrega_recibo DATE`);
        fillLocal(original, 3);
        original.exec(`UPDATE facturas SET fecha_entrega_recibo = '2026-05-01'`);
        const id = getOrCreateInstanciaId(original);
        await seedRemote(original, remote, { instanciaId: id, timestamp: ts() });

        // Misma identidad y mismos registros, pero sin la columna (restauración de una versión anterior)
        const sinColumna = newLocal();
        fillLocal(sinColumna, 3);
        const { setLocalState: set } = await import('../../v2/services/tursoSyncCore.js');
        getOrCreateInstanciaId(sinColumna);
        set(sinColumna, 'instancia_id', id);

        const seed = await seedRemote(sinColumna, remote, { instanciaId: id, timestamp: ts() });
        assert.equal(seed.conflict, true);
        assert.deepEqual(seed.motivos.map(m => m.tipo), ['columnas']);
        const enNube = (await remote.execute('SELECT COUNT(*) AS n FROM facturas WHERE fecha_entrega_recibo IS NOT NULL')).rows[0].n;
        assert.equal(Number(enNube), 3, 'la nube conserva los valores');
    });

    it('nube vacía: no hay nada que restaurar', async () => {
        await assert.rejects(restoreRemoteInto(newLocal(), remote), /no contiene una copia/);
    });

    it('describeRemoteCopy no incluye tablas internas ni excluidas', async () => {
        const original = newLocal();
        fillLocal(original);
        await seedRemote(original, remote, { instanciaId: getOrCreateInstanciaId(original), timestamp: ts() });
        const copia = await describeRemoteCopy(remote);
        const nombres = copia.tablas.map(t => t.tabla);
        assert.equal(copia.disponible, true);
        assert.ok(nombres.includes('clientes'));
        for (const t of ['sesiones', '_aguavp_sync_meta', 'sync_estado', 'sync_cambios']) assert.ok(!nombres.includes(t));
    });
});

describe('tursoSyncCore — nube con llaves foráneas activas (como Turso)', () => {
    let dir;
    let remote;
    let local;
    let id;

    const remoteCount = async (sql) => Number((await remote.execute(sql)).rows[0].n);

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-fk-'));
        remote = createClient({ url: 'file:' + path.join(dir, 'nube.db').split(path.sep).join('/') });
        local = newLocal();
        fillLocal(local, 3);
        id = getOrCreateInstanciaId(local);
        await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });
        await remote.execute('PRAGMA foreign_keys = ON');
        assert.equal(Number((await remote.execute('PRAGMA foreign_keys')).rows[0].foreign_keys), 1);
    });

    afterEach(() => {
        remote.close();
        try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch (_) {}
    });

    it('subir un usuario editado no borra ni vacía sus permisos en la nube', async () => {
        local.exec(`UPDATE usuarios SET nombre = 'Admin (último acceso)' WHERE id = 1`);
        await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(await remoteCount(`SELECT COUNT(*) AS n FROM user_permission_overrides WHERE user_id = 1`), 1);
        assert.equal(await remoteCount(`SELECT COUNT(*) AS n FROM user_permission_overrides WHERE updated_by = 1`), 1);
    });

    it('subir una tarifa editada no borra sus rangos en la nube', async () => {
        local.exec(`UPDATE tarifas SET nombre = 'Doméstica 2026' WHERE id = 1`);
        await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts() });
        assert.equal(await remoteCount(`SELECT COUNT(*) AS n FROM rangos_tarifas WHERE tarifa_id = 1`), 2);
    });

    it('la carga completa tampoco borra dependientes en la nube', async () => {
        const res = await seedRemote(local, remote, { instanciaId: id, timestamp: ts() });
        assert.equal(res.verificacion.ok, true);
        assert.equal(await remoteCount(`SELECT COUNT(*) AS n FROM rangos_tarifas`), 2);
        assert.equal(await remoteCount(`SELECT COUNT(*) AS n FROM user_permission_overrides WHERE updated_by = 1`), 1);
    });

    it('intercambiar el orden de dos puntos de ruta (clave única) se sube sin error', async () => {
        local.exec(`UPDATE rutas_puntos SET orden = -1 WHERE id = 1`);
        local.exec(`UPDATE rutas_puntos SET orden = 1 WHERE id = 2`);
        local.exec(`UPDATE rutas_puntos SET orden = 2 WHERE id = 1`);

        const res = await incrementalRemote(local, remote, { instanciaId: id, timestamp: ts() });

        assert.equal(res.success, true);
        const filas = (await remote.execute('SELECT id, orden FROM rutas_puntos ORDER BY id')).rows.map(r => [Number(r.id), Number(r.orden)]);
        assert.deepEqual(filas, [[1, 2], [2, 1], [3, 3]]);
        assert.equal(res.verificacion.ok, true);
    });
});

describe('tursoSyncCore — equipos, vista previa de eliminación y verificación por contenido', () => {
    let dir;
    let remote;
    let local;
    let id;

    const remoteValue = async (sql) => (await remote.execute(sql)).rows[0];

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-p1-'));
        remote = createClient({ url: 'file:' + path.join(dir, 'nube.db').split(path.sep).join('/') });
        local = newLocal();
        fillLocal(local, 3);
        id = getOrCreateInstanciaId(local);
        await seedRemote(local, remote, { instanciaId: id, equipoId: 'PC-A', timestamp: ts() });
    });

    afterEach(() => {
        remote.close();
        try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch (_) {}
    });

    it('otra computadora con la misma base no puede escribir en la copia sin confirmación', async () => {
        local.exec(`UPDATE clientes SET nombre = 'Desde PC-B' WHERE id = 1`);
        const inc = await incrementalRemote(local, remote, { instanciaId: id, equipoId: 'PC-B', timestamp: ts() });
        assert.deepEqual([inc.needsSeed, inc.reason], [true, 'other_device']);

        const seed = await seedRemote(local, remote, { instanciaId: id, equipoId: 'PC-B', timestamp: ts() });
        assert.equal(seed.conflict, true);
        assert.deepEqual(seed.motivos.map(m => m.tipo), ['equipo']);
        assert.equal((await remoteValue('SELECT nombre FROM clientes WHERE id = 1')).nombre, 'Cliente 1', 'la nube no cambió');
    });

    it('una base restaurada desde la nube toma el control en su computadora; la anterior queda bloqueada', async () => {
        const enPcB = newLocal();
        await restoreRemoteInto(enPcB, remote);
        const seedB = await seedRemote(enPcB, remote, { instanciaId: getOrCreateInstanciaId(enPcB), equipoId: 'PC-B', timestamp: ts() });
        assert.equal(seedB.success, true);
        assert.equal((await readRemoteMeta(remote)).equipo_id, 'PC-B');

        // PC-A sigue en uso y hace un cambio: no puede subirlo
        local.exec(`UPDATE clientes SET nombre = 'Desde PC-A' WHERE id = 2`);
        const incA = await incrementalRemote(local, remote, { instanciaId: id, equipoId: 'PC-A', timestamp: ts() });
        assert.equal(incA.reason, 'other_device');
        const seedA = await seedRemote(local, remote, { instanciaId: id, equipoId: 'PC-A', timestamp: ts() });
        assert.deepEqual(seedA.motivos.map(m => m.tipo), ['equipo']);
    });

    it('el conflicto lista exactamente qué registros se eliminarían de la nube', async () => {
        const vieja = newLocal();
        fillLocal(vieja, 1);
        const seed = await seedRemote(vieja, remote, { instanciaId: id, equipoId: 'PC-A', timestamp: ts() });
        assert.equal(seed.conflict, true);
        const clientes = seed.eliminaria.find(e => e.tabla === 'clientes');
        assert.deepEqual([clientes.total, clientes.ids], [2, [2, 3]]);
        assert.ok(seed.eliminaria.some(e => e.tabla === 'pagos' && e.total === 2));
    });

    it('la verificación diaria detecta y repara campos cambiados o vaciados en la nube', async () => {
        await remote.execute('UPDATE user_permission_overrides SET updated_by = NULL');
        await remote.execute(`UPDATE clientes SET nombre = 'alterado' WHERE id = 3`);

        // La verificación rápida (cantidades) no lo ve
        local.exec(`UPDATE tarifas SET nombre = 'x' WHERE id = 1`);
        const rapida = await incrementalRemote(local, remote, { instanciaId: id, equipoId: 'PC-A', timestamp: ts() });
        assert.equal(rapida.verificacion.tipo, 'conteo');
        assert.equal(rapida.verificacion.ok, true);

        const diaria = await incrementalRemote(local, remote, { instanciaId: id, equipoId: 'PC-A', timestamp: ts(), verifyAll: true });
        assert.equal(diaria.verificacion.tipo, 'contenido');
        assert.equal(diaria.verificacion.ok, true);
        assert.deepEqual(diaria.verificacion.reparadas.sort(), ['clientes', 'user_permission_overrides']);
        assert.equal(Number((await remoteValue('SELECT updated_by AS u FROM user_permission_overrides')).u), 1);
        assert.equal((await remoteValue('SELECT nombre FROM clientes WHERE id = 3')).nombre, 'Cliente 3');
        assert.equal(diaria.fkViolaciones, 0);
    });

    it('la verificación diaria no sube nada si la base local está dañada', async () => {
        local.exec(`UPDATE clientes SET nombre = 'no debe subir' WHERE id = 1`);
        const danada = {
            exec: (sql) => local.exec(sql),
            prepare: (sql) => (/PRAGMA quick_check/i.test(sql)
                ? { all: () => [{ quick_check: 'row 3 missing from index' }] }
                : local.prepare(sql))
        };
        const res = await incrementalRemote(danada, remote, { instanciaId: id, equipoId: 'PC-A', timestamp: ts(), verifyAll: true });
        assert.equal(res.success, false);
        assert.match(res.error, /integridad/);
        assert.equal((await remoteValue('SELECT nombre FROM clientes WHERE id = 1')).nombre, 'Cliente 1');
    });

    it('la restauración verifica el contenido fila por fila', async () => {
        const restaurada = newLocal();
        const res = await restoreRemoteInto(restaurada, remote);
        assert.ok(res.filasVerificadas >= res.totalRegistros);
    });
});
