/**
 * Pruebas de src/utils/logger.js
 *
 * Lo más importante: la consola recibe exactamente los mismos argumentos que con
 * console.*, para que adoptar el logger no cambie la salida.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, setLogReceptor } from '../../src/utils/logger.js';

describe('logger', () => {
    let consola;

    beforeEach(() => {
        consola = {
            log: mock.method(console, 'log', () => {}),
            warn: mock.method(console, 'warn', () => {}),
            error: mock.method(console, 'error', () => {}),
        };
    });

    afterEach(() => {
        mock.restoreAll();
        setLogReceptor(null);
    });

    it('pasa a la consola los mismos argumentos que console.* (info→log, warn→warn, error→error)', () => {
        const log = createLogger('prueba');
        const err = new Error('falló');
        const obj = { id: 1 };

        log.info('[Cron] Mensaje', 42, obj);
        log.warn('Aviso');
        log.error('Error al guardar:', err);

        assert.deepEqual(consola.log.mock.calls[0].arguments, ['[Cron] Mensaje', 42, obj]);
        assert.strictEqual(consola.log.mock.calls[0].arguments[2], obj); // mismo objeto, no una copia
        assert.deepEqual(consola.warn.mock.calls[0].arguments, ['Aviso']);
        assert.strictEqual(consola.error.mock.calls[0].arguments[1], err);
    });

    it('sin receptor registrado solo escribe en consola', () => {
        createLogger('prueba').info('hola');
        assert.equal(consola.log.mock.callCount(), 1);
    });

    it('reenvía nivel, módulo y mensaje como texto al receptor', () => {
        const recibidos = [];
        setLogReceptor((nivel, modulo, mensaje) => recibidos.push({ nivel, modulo, mensaje }));

        const log = createLogger('lecturas');
        log.info('Lectura', 7, { periodo: '2026-01' });
        log.warn('Sin tarifa');
        log.error('Error al registrar:', new Error('UNIQUE constraint failed'));

        assert.deepEqual(recibidos, [
            { nivel: 'info', modulo: 'lecturas', mensaje: 'Lectura 7 {"periodo":"2026-01"}' },
            { nivel: 'warn', modulo: 'lecturas', mensaje: 'Sin tarifa' },
            { nivel: 'error', modulo: 'lecturas', mensaje: 'Error al registrar: UNIQUE constraint failed' },
        ]);
    });

    it('un receptor que lanza error no interrumpe a quien registra el mensaje', () => {
        setLogReceptor(() => { throw new Error('receptor roto'); });
        assert.doesNotThrow(() => createLogger('prueba').error('algo'));
        assert.equal(consola.error.mock.callCount(), 1);
    });

    it('setLogReceptor(null) deja de reenviar', () => {
        const recibidos = [];
        setLogReceptor((...a) => recibidos.push(a));
        setLogReceptor(null);
        createLogger('prueba').info('hola');
        assert.equal(recibidos.length, 0);
    });

    it('tolera objetos que no se pueden convertir a JSON (referencias circulares)', () => {
        const recibidos = [];
        setLogReceptor((nivel, modulo, mensaje) => recibidos.push(mensaje));
        const circular = {}; circular.yo = circular;
        createLogger('prueba').info('obj', circular);
        assert.deepEqual(recibidos, ['obj [object Object]']);
    });
});
