/**
 * Tests HTTP de /api/v2/rutas (caracterización)
 *
 * Usan los datos de test/helpers/datos-prueba.js: R1 = M1, M2, M3, M7 y R2 = M4, M5, M6.
 * Fijan el comportamiento ACTUAL: listados, progreso de captura y cambios en rutas_puntos.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidorPrueba } from '../helpers/servidor-prueba.js';
import { cargarDatosPrueba } from '../helpers/datos-prueba.js';

let srv, S, O, ids;
const pedir = (metodo, ruta, { como = S, body } = {}) => srv.pedir(metodo, `/api/v2/rutas${ruta}`, { appKey: srv.appKey, token: como.token, body });
const ordenDe = (rutaId) => srv.db.prepare('SELECT medidor_id, orden FROM rutas_puntos WHERE ruta_id = ? ORDER BY orden').all(rutaId).map(p => [p.medidor_id, p.orden]);

before(async () => {
    console.log = console.error = console.warn = () => {};
    srv = await crearServidorPrueba();
    S = await srv.crearUsuarioYLogin({ rol: 'superadmin' });
    O = await srv.crearUsuarioYLogin({ rol: 'operador' });
    ids = cargarDatosPrueba(srv.db, { usuarioId: S.id });
});

after(async () => { await srv.cerrar(); });

describe('GET /rutas/listar', () => {
    it('lista rutas con avance de captura del periodo y paginación', async () => {
        const r = await pedir('GET', `/listar/?periodo=${ids.periodos.P3}`, { como: O });
        assert.equal(r.status, 200);
        assert.equal(r.body.periodo, ids.periodos.P3);
        assert.deepEqual(r.body.pagination, { total: 2, page: 1, limit: 10, totalPages: 1 });
        const centro = r.body.rutas.find(x => x.nombre === 'Ruta Centro');
        assert.deepEqual(
            { total: centro.total_puntos, completadas: centro.completadas, porcentaje: centro.porcentaje_completado, series: centro.numeros_serie, facturas: centro.facturas_generadas_periodo, cerrado: centro.periodo_cerrado },
            { total: 4, completadas: 4, porcentaje: 100, series: ['SER-M1', 'SER-M2', 'SER-M3', 'SER-M7'], facturas: 4, cerrado: true }
        );
    });

    it('en el mes actual muestra lo pendiente de captura', async () => {
        const r = await pedir('GET', `/listar/?periodo=${ids.periodos.P4}`, { como: O });
        const centro = r.body.rutas.find(x => x.nombre === 'Ruta Centro');
        assert.deepEqual(centro.medidores_completados, ['SER-M1', 'SER-M2']);
        assert.deepEqual(centro.medidores_faltantes, ['SER-M3', 'SER-M7']);
        assert.equal(centro.periodo_cerrado, false);
    });

    it('busca y pagina', async () => {
        const r = await pedir('GET', '/listar/?page=1&limit=1&search=Centro', { como: O });
        assert.deepEqual(r.body.rutas.map(x => x.nombre), ['Ruta Centro']);
        assert.deepEqual(r.body.pagination, { total: 1, page: 1, limit: 1, totalPages: 1 });
        const vacia = await pedir('GET', '/listar/?search=NoExiste', { como: O });
        assert.deepEqual(vacia.body.rutas, []);
        assert.equal(vacia.body.pagination.total, 0);
    });
});

describe('GET /rutas/:id/medidores y /progreso', () => {
    it('devuelve los puntos en orden con la lectura del periodo y datos del cliente', async () => {
        const r = await pedir('GET', `/${ids.rutas.R1}/medidores?periodo=${ids.periodos.P3}`, { como: O });
        assert.equal(r.status, 200);
        assert.equal(r.body.ruta.nombre, 'Ruta Centro');
        assert.equal(r.body.ruta.periodo_cerrado, true);
        assert.deepEqual(r.body.ruta.puntos.map(p => [p.orden, p.numero_serie, p.cliente_nombre]), [
            [1, 'SER-M1', 'Ana Pagos'], [2, 'SER-M2', 'Beto Moroso'], [3, 'SER-M3', 'Carla Parcial'], [4, 'SER-M7', 'Ana Pagos']
        ]);
        const m1 = r.body.ruta.puntos[0];
        assert.deepEqual(
            { tiene: m1.tiene_lectura, actual: m1.lectura_actual, anterior: m1.lectura_anterior, consumo: m1.consumo_m3, estado: m1.estado_lectura, reemplazo: m1.medidor_actual_reemplazo },
            { tiene: 1, actual: 129, anterior: 120, consumo: 9, estado: 'facturada', reemplazo: 'SER-M7' }
        );
        assert.deepEqual(await pedir('GET', '/9999/medidores', { como: O }), { status: 404, body: { error: 'Ruta no encontrada o sin medidores' } });
    });

    it('progreso de captura del mes actual', async () => {
        const r = await pedir('GET', `/${ids.rutas.R1}/progreso?periodo=${ids.periodos.P4}`, { como: O });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.resumen, { total_medidores: 4, medidores_leidos: 2, medidores_pendientes: 2, porcentaje_completado: 50, porcentaje_pendiente: 50, periodo_cerrado: false, total_facturas_periodo: 0 });
        assert.deepEqual(r.body.detalle.medidores_pendientes.map(m => m.numero_serie), ['SER-M3', 'SER-M7']);
        assert.deepEqual(await pedir('GET', '/9999/progreso', { como: O }), { status: 404, body: { error: 'Ruta no encontrada' } });
    });
});

describe('POST /rutas/crear y /agregar-medidor', () => {
    it('valida datos, permiso, medidores inexistentes y ya asignados', async () => {
        assert.deepEqual(await pedir('POST', '/crear', { body: {} }), { status: 400, body: { error: 'Faltan campos requeridos o puntos inválidos' } });
        assert.deepEqual(await pedir('POST', '/crear', { como: O, body: { nombre: 'X', creado_por: O.id, puntos: [{ id: ids.medidores.M8 }] } }), {
            status: 403, body: { error: 'Permiso insuficiente para esta operación', required_permission: 'rutas.crear' }
        });
        assert.deepEqual(await pedir('POST', '/crear', { body: { nombre: 'X', creado_por: S.id, puntos: [{ id: 9999 }] } }), {
            status: 400, body: { error: 'Algunos medidores no existen en la base de datos', faltantes: [9999] }
        });
        assert.deepEqual(await pedir('POST', '/crear', { body: { nombre: 'X', creado_por: S.id, puntos: [{ id: ids.medidores.M6 }] } }), {
            status: 409, body: { error: 'Algunos medidores ya están asignados a otras rutas', medidores_duplicados: [{ medidor_id: ids.medidores.M6, ruta_id: ids.rutas.R2 }] }
        });
    });

    it('crea la ruta con sus puntos en orden', async () => {
        const r = await pedir('POST', '/crear', { body: { nombre: 'Ruta Nueva', descripcion: 'prueba', creado_por: S.id, distancia_km: 1.2, ruta_calculada: { tipo: 'LineString' }, instrucciones: [{ texto: 'girar' }], puntos: [{ id: ids.medidores.M8 }] } });
        assert.equal(r.status, 201);
        assert.equal(r.body.mensaje, '✅ Ruta creada correctamente');
        assert.deepEqual(r.body.detalles.puntos, [{ medidor_id: ids.medidores.M8, orden: 1 }]);
        ids.rutaNueva = r.body.ruta_id;
        const ruta = srv.db.prepare('SELECT nombre, ruta_json, instrucciones_json FROM rutas WHERE id = ?').get(ids.rutaNueva);
        assert.deepEqual({ ...ruta }, { nombre: 'Ruta Nueva', ruta_json: '{"tipo":"LineString"}', instrucciones_json: '[{"texto":"girar"}]' });
        assert.deepEqual(ordenDe(ids.rutaNueva), [[ids.medidores.M8, 1]]);
    });

    it('agregar medidor: valida y rechaza si ya está en una ruta (409)', async () => {
        assert.deepEqual(await pedir('POST', '/agregar-medidor', { body: {} }), { status: 400, body: { error: 'Faltan campos requeridos' } });
        assert.deepEqual(await pedir('POST', '/agregar-medidor', { body: { ruta_id: ids.rutas.R2, medidor_id: ids.medidores.M8, orden: 4 } }), {
            status: 409, body: { error: `El medidor ya está asignado a la ruta ${ids.rutaNueva}`, ruta_existente: ids.rutaNueva }
        });
    });
});

describe('PUT/DELETE de rutas', () => {
    it('modificar: 404 si no existe; cambia datos y reemplaza puntos', async () => {
        assert.deepEqual(await pedir('PUT', '/9999', { body: { nombre: 'x' } }), { status: 404, body: { error: 'Ruta no encontrada' } });

        assert.deepEqual(await pedir('PUT', `/${ids.rutas.R2}`, { body: { nombre: 'Ruta Mazocahui Norte' } }), {
            status: 200, body: { success: true, mensaje: 'Ruta actualizada correctamente', ruta_id: ids.rutas.R2 }
        });
        const puntos = await pedir('PUT', `/${ids.rutas.R2}`, { body: { puntos: [{ id: ids.medidores.M6 }, { id: ids.medidores.M5 }, { id: ids.medidores.M4 }] } });
        assert.deepEqual(puntos.body, { success: true, mensaje: 'Ruta actualizada correctamente', ruta_id: ids.rutas.R2, medidores_actualizados: 3 });
        assert.deepEqual(ordenDe(ids.rutas.R2), [[ids.medidores.M6, 1], [ids.medidores.M5, 2], [ids.medidores.M4, 3]]);
    });

    it('modificar con medidores de otra ruta: 409 con conflictos', async () => {
        const r = await pedir('PUT', `/${ids.rutas.R2}`, { body: { puntos: [{ id: ids.medidores.M1 }] } });
        assert.equal(r.status, 409);
        assert.deepEqual(r.body, { error: 'Algunos medidores ya están asignados a otra ruta', conflictos: [{ medidor_id: ids.medidores.M1, numero_serie: 'SER-M1', ruta_actual: 'Ruta Centro' }] });
    });

    it('reordenar: valida y aplica el nuevo orden', async () => {
        const sinOrden = await pedir('PUT', `/${ids.rutas.R1}/reordenar`, { body: {} });
        assert.equal(sinOrden.status, 400);
        assert.equal(sinOrden.body.error, 'ID de ruta y array de orden requeridos');
        assert.deepEqual(await pedir('PUT', `/${ids.rutas.R1}/reordenar`, { body: { orden: [{ medidor_id: ids.medidores.M5, orden: 1 }] } }), {
            status: 400, body: { error: 'Algunos medidores no pertenecen a esta ruta' }
        });
        const { M1, M2, M3, M7 } = ids.medidores;
        const r = await pedir('PUT', `/${ids.rutas.R1}/reordenar`, { body: { orden: [{ medidor_id: M7, orden: 1 }, { medidor_id: M3, orden: 2 }, { medidor_id: M2, orden: 3 }, { medidor_id: M1, orden: 4 }] } });
        assert.deepEqual(r.body, { success: true, mensaje: 'Orden de medidores actualizado correctamente', ruta_id: ids.rutas.R1, medidores_actualizados: 4 });
        assert.deepEqual(ordenDe(ids.rutas.R1), [[M7, 1], [M3, 2], [M2, 3], [M1, 4]]);
    });

    it('quitar medidor: 404 si no está; si está, lo quita y recorre el orden', async () => {
        assert.deepEqual(await pedir('DELETE', `/${ids.rutas.R1}/medidores/${ids.medidores.M5}`), { status: 404, body: { error: 'El medidor no está en esta ruta' } });
        const r = await pedir('DELETE', `/${ids.rutas.R1}/medidores/${ids.medidores.M7}`);
        assert.deepEqual(r.body, { success: true, mensaje: 'Medidor eliminado de la ruta y orden actualizado', ruta_id: ids.rutas.R1, medidor_id: ids.medidores.M7 });
        const { M1, M2, M3 } = ids.medidores;
        assert.deepEqual(ordenDe(ids.rutas.R1), [[M3, 1], [M2, 2], [M1, 3]]);
    });
});

// Al final: base rota a propósito para fijar las respuestas de error interno
describe('errores internos (500)', () => {
    it('listar y progreso responden su mensaje fijo si falla la base', async () => {
        srv.db.exec('ALTER TABLE rutas_puntos RENAME TO rutas_puntos_x');
        try {
            assert.deepEqual(await pedir('GET', '/listar/', { como: O }), { status: 500, body: { error: 'Error interno del servidor' } });
            assert.deepEqual(await pedir('GET', `/${ids.rutas.R1}/progreso`, { como: O }), { status: 500, body: { error: 'Error interno del servidor' } });
        } finally {
            srv.db.exec('ALTER TABLE rutas_puntos_x RENAME TO rutas_puntos');
        }
    });
});
