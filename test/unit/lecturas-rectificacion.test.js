import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { estadoRectificacion, motivoNoRectificable } from '../../src/v2/services/lecturasRectificacion.js';

describe('Rectificación de lecturas: solo la más reciente del medidor y sin pagos', () => {
    let conn;
    const lectura = (id, medidor, periodo) =>
        conn.prepare('INSERT INTO lecturas (id, medidor_id, periodo, consumo_m3) VALUES (?, ?, ?, 10)').run(id, medidor, periodo);
    const factura = (id, lecturaId, convenio = null) =>
        conn.prepare('INSERT INTO facturas (id, lectura_id, total, saldo_pendiente, convenio_id) VALUES (?, ?, 100, 100, ?)').run(id, lecturaId, convenio);
    const pago = (facturaId, monto) => conn.prepare('INSERT INTO pagos (factura_id, monto) VALUES (?, ?)').run(facturaId, monto);

    beforeEach(() => {
        conn = new DatabaseSync(':memory:');
        conn.exec(`
            CREATE TABLE lecturas (id INTEGER PRIMARY KEY, medidor_id INTEGER NOT NULL, periodo TEXT NOT NULL, consumo_m3 REAL);
            CREATE TABLE facturas (id INTEGER PRIMARY KEY, lectura_id INTEGER NOT NULL, total REAL, saldo_pendiente REAL, convenio_id INTEGER);
            CREATE TABLE pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, factura_id INTEGER NOT NULL, monto REAL NOT NULL);
        `);
        lectura(1, 10, '2026-02'); factura(1, 1);
    });

    it('la lectura más reciente con factura sin pagos se puede rectificar', () => {
        const e = estadoRectificacion(conn, 1);
        assert.equal(e.motivo, null);
        assert.equal(e.periodoPosterior, null);
    });

    it('una lectura todavía sin factura se puede rectificar', () => {
        lectura(2, 11, '2026-02');
        assert.equal(estadoRectificacion(conn, 2).motivo, null);
    });

    it('con la factura pagada no se puede rectificar', () => {
        pago(1, 100);
        assert.match(estadoRectificacion(conn, 1).motivo, /ya tiene pagos registrados \(\$100\.00\)/);
    });

    it('con un abono parcial tampoco', () => {
        pago(1, 30.5);
        assert.match(estadoRectificacion(conn, 1).motivo, /ya tiene pagos registrados \(\$30\.50\)/);
    });

    it('con la factura en convenio no se puede rectificar', () => {
        conn.prepare('UPDATE facturas SET convenio_id = 7 WHERE id = 1').run();
        assert.match(estadoRectificacion(conn, 1).motivo, /convenio/);
    });

    it('febrero queda cerrado en cuanto el medidor tiene la lectura de marzo, aunque no esté pagado', () => {
        lectura(2, 10, '2026-03');
        const e = estadoRectificacion(conn, 1);
        assert.equal(e.periodoPosterior, '2026-03');
        assert.match(e.motivo, /El período 2026-02 quedó cerrado.*lectura de 2026-03/);
        // marzo, que es la más reciente, sí se puede
        assert.equal(estadoRectificacion(conn, 2).motivo, null);
    });

    it('la lectura de marzo de OTRO medidor no cierra el febrero de este', () => {
        lectura(2, 99, '2026-03');
        assert.equal(estadoRectificacion(conn, 1).motivo, null);
    });

    it('se cuenta el período siguiente más cercano aunque haya varios', () => {
        lectura(2, 10, '2026-05'); lectura(3, 10, '2026-03');
        assert.equal(estadoRectificacion(conn, 1).periodoPosterior, '2026-03');
    });

    it('lectura inexistente devuelve null (el servicio responde 404)', () => {
        assert.equal(estadoRectificacion(conn, 999), null);
    });

    it('motivoNoRectificable: los pagos se informan antes que el período cerrado', () => {
        assert.match(motivoNoRectificable({ periodo: '2026-02', periodoPosterior: '2026-03', pagado: 50 }), /pagos/);
        assert.equal(motivoNoRectificable({ periodo: '2026-02' }), null);
    });
});
