/**
 * Pruebas de src/utils/errores.js
 *
 * manejarErrores debe responder EXACTAMENTE igual que los bloques catch escritos a mano
 * en los controllers, para que adoptarlo no cambie lo que recibe la app.
 */

import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { manejarErrores, crearError } from '../../src/utils/errores.js';

// Respuesta falsa que registra status y cuerpo
function resFalsa() {
    const r = { statusCode: 200, body: undefined };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
}

const MENSAJE = 'Error al obtener datos';

// Implementaciones originales, copiadas tal cual de los controllers
const originales = {
    A: (err, res) => res.status(err.status || 500).json({ error: err.message || MENSAJE }),
    B: (err, res) => res.status(500).json({ error: MENSAJE }),
    C: (err, res) => res.status(err.status || 500).json({ success: false, message: err.message || MENSAJE }),
};
const opciones = {
    A: { mensaje: MENSAJE },
    B: { mensaje: MENSAJE, exponerMensaje: false, statusDelError: false },
    C: { mensaje: MENSAJE, formato: 'success' },
};

// Errores de distintas formas que lanzan hoy services y librerías
const errores = {
    'Error con status (serviceError)': () => Object.assign(new Error('Cliente no encontrado'), { status: 404 }),
    'Error sin status (p. ej. SQLite)': () => new Error('UNIQUE constraint failed: clientes.nombre'),
    'Error sin mensaje': () => new Error(''),
    'Error con status y sin mensaje': () => Object.assign(new Error(''), { status: 409 }),
    'objeto plano { status, message }': () => ({ status: 400, message: 'Datos inválidos' }),
    'texto lanzado con throw': () => 'algo salió mal',
};

describe('manejarErrores: misma respuesta que los catch originales', () => {
    afterEach(() => mock.restoreAll());

    for (const patron of ['A', 'B', 'C']) {
        for (const [nombre, crear] of Object.entries(errores)) {
            it(`patrón ${patron} – ${nombre}`, async () => {
                const esperado = resFalsa();
                originales[patron](crear(), esperado);

                const obtenido = resFalsa();
                await manejarErrores(async () => { throw crear(); }, opciones[patron])({}, obtenido, () => {});

                assert.equal(obtenido.statusCode, esperado.statusCode);
                assert.deepEqual(obtenido.body, esperado.body);
            });
        }
    }
});

describe('manejarErrores: comportamiento adicional', () => {
    afterEach(() => mock.restoreAll());

    it('si el handler no falla, no toca la respuesta y devuelve su resultado', async () => {
        const res = resFalsa();
        const resultado = await manejarErrores(async (req, r) => { r.json({ ok: true }); return 'listo'; }, { mensaje: MENSAJE })({}, res, () => {});
        assert.equal(resultado, 'listo');
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { ok: true });
    });

    it('pasa req, res y next al handler', async () => {
        const req = { params: { id: '5' } }, res = resFalsa(), next = () => {};
        let recibidos;
        await manejarErrores(async (...args) => { recibidos = args; }, { mensaje: MENSAJE })(req, res, next);
        assert.equal(recibidos[0], req);
        assert.equal(recibidos[1], res);
        assert.equal(recibidos[2], next);
    });

    it('con `log` registra igual que console.error(log, err)', async () => {
        const consola = mock.method(console, 'error', () => {});
        const err = new Error('fallo');
        await manejarErrores(async () => { throw err; }, { mensaje: MENSAJE, log: 'Error obteniendo clientes v2:' })({}, resFalsa(), () => {});
        assert.equal(consola.mock.callCount(), 1);
        assert.equal(consola.mock.calls[0].arguments[0], 'Error obteniendo clientes v2:');
        assert.strictEqual(consola.mock.calls[0].arguments[1], err);
    });

    it('sin `log` no escribe nada en consola', async () => {
        const consola = mock.method(console, 'error', () => {});
        await manejarErrores(async () => { throw new Error('x'); }, { mensaje: MENSAJE })({}, resFalsa(), () => {});
        assert.equal(consola.mock.callCount(), 0);
    });

    it('también atrapa errores lanzados de forma síncrona', async () => {
        const res = resFalsa();
        await manejarErrores(() => { throw crearError('Prohibido', 403); }, { mensaje: MENSAJE })({}, res, () => {});
        assert.equal(res.statusCode, 403);
        assert.deepEqual(res.body, { error: 'Prohibido' });
    });
});

describe('crearError', () => {
    it('crea el mismo error que los serviceError() locales (Error + status)', () => {
        // serviceError original de los services
        const serviceError = (message, status) => { const err = new Error(message); err.status = status; return err; };
        const a = serviceError('Medidor no encontrado', 404);
        const b = crearError('Medidor no encontrado', 404);
        assert.ok(b instanceof Error);
        assert.equal(b.message, a.message);
        assert.equal(b.status, a.status);
        assert.deepEqual(Object.keys(b), Object.keys(a));
    });

    it('agrega campos extra para casos especiales', () => {
        const err = crearError('Cliente no tiene medidores asignados', 404, { cliente: { id: 1, nombre: 'Ana' } });
        assert.deepEqual(err.cliente, { id: 1, nombre: 'Ana' });
        assert.equal(err.status, 404);
    });
});
