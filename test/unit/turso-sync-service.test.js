/**
 * Pruebas del servicio de sincronización (tursoSyncService.js): primer ciclo automático tras arrancar.
 * La "nube" es un archivo libsql local: no requiere internet ni cuenta de Turso.
 *
 * Ejecutar: node --test test/unit/turso-sync-service.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-sync-service-'));
const localPath = path.join(dir, 'local.db');
const remoteUrl = (nombre) => `file:${path.join(dir, nombre).split(path.sep).join('/')}`;

// La base local debe existir antes de importar el servicio (db-sqlite.js abre DB_PATH al cargarse)
const semilla = new Database(localPath);
semilla.exec(`
    CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
    INSERT INTO clientes (nombre) VALUES ('Ana'), ('Luis');
`);
semilla.close();
process.env.DB_PATH = localPath;

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const HORA = 60 * 60 * 1000;

describe('tursoSyncService — primer ciclo automático', () => {
    let servicio;
    let sqlite;

    before(async () => {
        servicio = await import('../../src/v2/services/tursoSyncService.js');
        ({ sqlite } = await import('../../src/database/db-sqlite.js'));
    });

    after(() => {
        servicio.configure({ tursoUrl: '', tursoToken: '' }); // detiene los temporizadores
        sqlite.close();
        // En Windows los clientes libsql del servicio pueden retener los archivos de la "nube"
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* carpeta temporal del sistema */ }
    });

    it('sin initialSyncDelayMs (reconfiguración en caliente) no sube nada por su cuenta', async () => {
        servicio.configure({ tursoUrl: remoteUrl('nube-a.db'), tursoToken: 'x', autoSync: true, syncIntervalMs: HORA });
        await esperar(400);
        assert.equal(servicio.getStatus().lastSync, null);
    });

    it('con initialSyncDelayMs sube los datos sin esperar al intervalo', async () => {
        const url = remoteUrl('nube-b.db');
        servicio.configure({ tursoUrl: url, tursoToken: 'x', autoSync: true, syncIntervalMs: HORA, initialSyncDelayMs: 50 });

        for (let i = 0; i < 50 && !servicio.getStatus().lastSync; i++) await esperar(100);
        const estado = servicio.getStatus();
        assert.ok(estado.lastSync, `no sincronizó: ${estado.lastError}`);
        assert.equal(estado.lastSyncSuccess, true);

        const nube = createClient({ url });
        const { rows } = await nube.execute('SELECT nombre FROM clientes ORDER BY id');
        nube.close();
        assert.deepEqual(rows.map(r => r.nombre), ['Ana', 'Luis']);
    });

    it('con autoSync desactivado no programa el primer ciclo', async () => {
        servicio.configure({ tursoUrl: remoteUrl('nube-c.db'), tursoToken: 'x', autoSync: false, initialSyncDelayMs: 50 });
        await esperar(400);
        assert.equal(servicio.getStatus().lastSync, null);
    });
});
