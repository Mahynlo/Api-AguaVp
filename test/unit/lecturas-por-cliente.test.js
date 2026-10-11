/**
 * Pruebas de lecturasService.obtenerLecturasPorCliente (GET /api/v2/lecturas/cliente/:id)
 *
 * A diferencia de los mocks, estas pruebas usan el servicio real contra una base
 * SQLite temporal con todas las migraciones aplicadas.
 *
 * Regresión cubierta: al mover la lógica del controller al service se perdió la
 * definición de `medidores` y el endpoint respondía 500 (ReferenceError) para
 * cualquier cliente con medidores.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { customMigrate } from '../../src/database/sqlite-migrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, '../../src/database/migrations');

let tmpDir;
let service;
let ids;

before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguavp-lecturas-cliente-'));
    const dbPath = path.join(tmpDir, 'test.db');

    // Base con el esquema real
    const setup = new Database(dbPath);
    customMigrate(setup, MIGRATIONS, () => {});

    const insertCliente = setup.prepare(`INSERT INTO clientes (nombre, direccion, telefono, ciudad) VALUES (?, 'Calle 1', ?, 'Villa Pesqueira')`);
    const conMedidor = Number(insertCliente.run('Cliente con medidor', '6620000001').lastInsertRowid);
    const sinMedidor = Number(insertCliente.run('Cliente sin medidor', '6620000002').lastInsertRowid);

    const medidor = Number(setup.prepare(`INSERT INTO medidores (numero_serie, estado_medidor, cliente_id) VALUES ('MED-001', 'Activo', ?)`).run(conMedidor).lastInsertRowid);

    const insertLectura = setup.prepare(`INSERT INTO lecturas (medidor_id, fecha_lectura, consumo_m3, periodo) VALUES (?, ?, ?, ?)`);
    const lecturaEnero = Number(insertLectura.run(medidor, '2026-01-31', 12, '2026-01').lastInsertRowid);
    insertLectura.run(medidor, '2026-02-28', 8, '2026-02');

    // Solo la lectura de enero tiene factura
    setup.prepare(`INSERT INTO facturas (cliente_id, lectura_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado)
                   VALUES (?, ?, '2026-02-01', '2026-02-15', 150, 150, 'Pendiente')`).run(conMedidor, lecturaEnero);
    setup.close();

    ids = { conMedidor, sinMedidor, medidor };

    // db-sqlite.js lee DB_PATH al cargarse: se fija antes del import
    process.env.DB_PATH = dbPath;
    service = await import('../../src/v2/services/lecturasService.js');
});

after(async () => {
    // Cerrar la conexión del servicio antes de borrar (en Windows el archivo queda bloqueado)
    const { sqlite } = await import('../../src/database/db-sqlite.js');
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('obtenerLecturasPorCliente', () => {
    it('devuelve las lecturas del cliente con su resumen (regresión: antes lanzaba ReferenceError)', async () => {
        const r = await service.obtenerLecturasPorCliente(ids.conMedidor);

        assert.deepEqual(r.cliente, { id: ids.conMedidor, nombre: 'Cliente con medidor', total_medidores: 1 });
        assert.equal(r.lecturas.length, 2);
        assert.deepEqual(r.lecturas.map(l => l.periodo), ['2026-02', '2026-01']); // más reciente primero
        assert.equal(r.lecturas[0].medidor.numero_serie, 'MED-001');
        assert.equal(r.lecturas[0].factura, null);
        assert.deepEqual(r.lecturas[1].factura, { id: r.lecturas[1].factura.id, monto_total: 150, estado: 'Pendiente' });

        assert.deepEqual(r.resumen, {
            total_lecturas: 2,
            consumo_total: '20.00',
            promedio_por_lectura: '10.00',
            monto_total_facturado: '150.00'
        });
        assert.deepEqual(r.consumo_por_periodo, [
            { periodo: '2026-02', consumo_total: 8, cantidad_lecturas: 1, monto_total: 0 },
            { periodo: '2026-01', consumo_total: 12, cantidad_lecturas: 1, monto_total: 150 }
        ]);
    });

    it('filtra por periodo', async () => {
        const r = await service.obtenerLecturasPorCliente(ids.conMedidor, '2026-01');
        assert.equal(r.lecturas.length, 1);
        assert.equal(r.lecturas[0].periodo, '2026-01');
    });

    it('responde 404 si el cliente no existe', async () => {
        await assert.rejects(service.obtenerLecturasPorCliente(999999), { message: 'Cliente no encontrado', status: 404 });
    });

    it('responde 404 con los datos del cliente si no tiene medidores', async () => {
        await assert.rejects(service.obtenerLecturasPorCliente(ids.sinMedidor), {
            message: 'Cliente no tiene medidores asignados',
            status: 404,
            cliente: { id: ids.sinMedidor, nombre: 'Cliente sin medidor' }
        });
    });
});
