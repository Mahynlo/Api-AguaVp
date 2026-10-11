/**
 * Verifica que CORE_TRIGGERS (los triggers que ensureCoreTriggers recrea al arrancar, p. ej. tras
 * restaurar una base descargada de Turso) sean idénticos a la ÚLTIMA definición de cada trigger
 * en las migraciones. Si una migración corrige un trigger, esta prueba obliga a actualizar CORE_TRIGGERS.
 *
 * Ejecutar: node --test src/test/unit/core-triggers.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CORE_TRIGGERS } from '../../database/sqlite-migrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, '../../database/migrations');

const normalize = (sql) => sql
    .replace(/--[^\n]*/g, '')
    .replace(/IF\s+NOT\s+EXISTS\s+/gi, '')
    .replace(/[`"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),;])\s*/g, '$1')
    .trim()
    .toLowerCase();

/** Estado final de los triggers tras aplicar todas las migraciones en orden del journal. */
function finalTriggersFromMigrations() {
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf-8'));
    const triggers = new Map();

    for (const entry of journal.entries) {
        const sql = fs.readFileSync(path.join(MIGRATIONS, `${entry.tag}.sql`), 'utf-8')
            .replace(/--[^\n]*/g, '');
        const re = /CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?[\s\S]*?\bEND\s*;(?=\s*(?:$|CREATE\b|DROP\b|ALTER\b|INSERT\b|UPDATE\b|DELETE\b|PRAGMA\b))|DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
        let m;
        while ((m = re.exec(sql)) !== null) {
            if (m[1]) triggers.set(m[1], m[0]);
            else triggers.delete(m[2]);
        }
    }
    return triggers;
}

describe('CORE_TRIGGERS coincide con las migraciones', () => {
    const finales = finalTriggersFromMigrations();

    it('contiene exactamente los triggers vigentes', () => {
        assert.deepEqual(
            CORE_TRIGGERS.map(t => t.name).sort(),
            [...finales.keys()].sort()
        );
    });

    for (const trig of CORE_TRIGGERS) {
        it(`${trig.name} es igual a su última definición`, () => {
            assert.ok(finales.has(trig.name), `${trig.name} no existe en las migraciones`);
            assert.equal(normalize(trig.sql.trim().replace(/;?\s*$/, ';')), normalize(finales.get(trig.name)));
        });
    }
});

describe('CORE_TRIGGERS funcionan sobre una base restaurada (sin triggers)', async () => {
    const { DatabaseSync } = await import('node:sqlite');

    const nuevaBase = () => {
        const db = new DatabaseSync(':memory:');
        db.exec(`
            CREATE TABLE facturas (id INTEGER PRIMARY KEY, total NUMERIC, saldo_pendiente NUMERIC,
                estado TEXT, modificado_por INTEGER);
            CREATE TABLE parcialidades_convenio (id INTEGER PRIMARY KEY, monto_esperado NUMERIC);
            CREATE TABLE pagos (id INTEGER PRIMARY KEY, factura_id INTEGER, parcialidad_id INTEGER, monto NUMERIC);
            CREATE TABLE historial_cambios (id INTEGER PRIMARY KEY, tabla TEXT, operacion TEXT,
                registro_id INTEGER, modificado_por INTEGER, cambios TEXT);
            CREATE TABLE medidores (id INTEGER PRIMARY KEY, cliente_id INTEGER);
            CREATE TABLE cliente_medidor_historial (id INTEGER PRIMARY KEY, cliente_id INTEGER, medidor_id INTEGER,
                fecha_inicio TEXT, fecha_fin TEXT);
        `);
        for (const t of CORE_TRIGGERS) db.exec(t.sql);
        return db;
    };

    it('pago parcial deja la factura en "Parcial" y el pago total en "Pagado"', () => {
        const db = nuevaBase();
        db.exec(`INSERT INTO facturas VALUES (1, 100, 100, 'Pendiente', NULL)`);
        db.exec(`INSERT INTO pagos (factura_id, monto) VALUES (1, 30)`);
        assert.deepEqual({ ...db.prepare('SELECT estado, saldo_pendiente FROM facturas').get() },
            { estado: 'Parcial', saldo_pendiente: 70 });
        db.exec(`INSERT INTO pagos (factura_id, monto) VALUES (1, 70)`);
        assert.equal(db.prepare('SELECT estado FROM facturas').get().estado, 'Pagado');
        assert.throws(() => db.exec(`INSERT INTO pagos (factura_id, monto) VALUES (1, 5)`), /excede el saldo/);
    });

    it('asignar un medidor libre y retirarlo registra y cierra su historial', () => {
        const db = nuevaBase();
        db.exec(`INSERT INTO medidores VALUES (1, NULL)`);
        db.exec(`UPDATE medidores SET cliente_id = 7 WHERE id = 1`);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cliente_medidor_historial WHERE fecha_fin IS NULL').get().n, 1);
        db.exec(`UPDATE medidores SET cliente_id = NULL WHERE id = 1`);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cliente_medidor_historial WHERE fecha_fin IS NULL').get().n, 0);
    });
});
