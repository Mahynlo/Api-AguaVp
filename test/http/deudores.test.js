/**
 * Tests HTTP de /api/v2/deudores: cortes, reconexiones y convenios (caracterización)
 *
 * Usan los datos de test/helpers/datos-prueba.js (umbral de corte = 2 vencidas).
 * Fijan el comportamiento ACTUAL: status, cuerpos y cambios en la base.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidorPrueba } from '../helpers/servidor-prueba.js';
import { cargarDatosPrueba } from '../helpers/datos-prueba.js';

let srv, S, ids;
const pedir = (metodo, ruta, body) => srv.pedir(metodo, `/api/v2/deudores${ruta}`, { appKey: srv.appKey, token: S.token, body });
const fila = (sql, ...args) => srv.db.prepare(sql).get(...args);

before(async () => {
    console.log = console.error = console.warn = () => {};
    srv = await crearServidorPrueba();
    S = await srv.crearUsuarioYLogin({ rol: 'superadmin' });
    ids = cargarDatosPrueba(srv.db, { usuarioId: S.id });
});

after(async () => { await srv.cerrar(); });

describe('GET /deudores/candidatos', () => {
    it('lista convenios primero, luego cortados y luego activos, con su deuda', async () => {
        const r = await pedir('GET', '/candidatos');
        assert.equal(r.status, 200);
        assert.equal(r.body.umbral_corte, 2);
        assert.equal(r.body.dias_gracia, 0);
        assert.equal(r.body.total_candidatos, 3);
        assert.deepEqual(r.body.candidatos.map(c => [c.cliente.nombre, c.accion_sugerida, c.deuda.facturas_vencidas, c.deuda.total]), [
            ['Elena Convenio', 'En Convenio', 0, 900],
            ['Dario Cortado', 'Reconexión', 2, 220],
            ['Beto Moroso', 'Corte de Servicio', 3, 1025],
        ]);
        const elena = r.body.candidatos[0];
        assert.deepEqual(elena.convenio, { id: ids.convenios.C5, saldo_restante: 600, parcialidades: 3, parcialidades_pendientes: 2, total_parcialidades: 3 });
        assert.equal(elena.saldo_pendiente, 900);
    });
});

describe('POST /deudores/cortar', () => {
    it('valida datos, medidor inexistente y servicio ya cortado', async () => {
        assert.deepEqual(await pedir('POST', '/cortar', {}), { status: 400, body: { error: 'Faltan datos requeridos (medidor_id, motivo)' } });
        assert.deepEqual(await pedir('POST', '/cortar', { medidor_id: 9999, motivo: 'x' }), { status: 404, body: { error: 'Medidor no encontrado' } });
        assert.deepEqual(await pedir('POST', '/cortar', { medidor_id: ids.medidores.M4, motivo: 'x' }), { status: 400, body: { error: 'El servicio ya se encuentra cortado' } });
    });

    it('corta el servicio: registra el corte y marca el medidor', async () => {
        const r = await pedir('POST', '/cortar', { medidor_id: ids.medidores.M2, motivo: 'Falta de pago', observaciones: '3 vencidas' });
        assert.deepEqual(r, { status: 200, body: { success: true, message: 'Corte ejecutado correctamente', medidor_id: ids.medidores.M2 } });
        assert.equal(fila('SELECT estado_servicio FROM medidores WHERE id = ?', ids.medidores.M2).estado_servicio, 'Cortado');
        const corte = fila('SELECT cliente_id, motivo, autorizado_por, observaciones, fecha_reconexion FROM cortes_servicio WHERE medidor_id = ? ORDER BY id DESC', ids.medidores.M2);
        assert.deepEqual({ ...corte }, { cliente_id: ids.clientes.C2, motivo: 'Falta de pago', autorizado_por: S.id, observaciones: '3 vencidas', fecha_reconexion: null });
    });
});

describe('POST /deudores/reconectar', () => {
    it('valida medidor y estado', async () => {
        assert.deepEqual(await pedir('POST', '/reconectar', {}), { status: 400, body: { error: 'Falta medidor_id' } });
        assert.deepEqual(await pedir('POST', '/reconectar', { medidor_id: 9999 }), { status: 404, body: { error: 'Medidor no encontrado' } });
        assert.deepEqual(await pedir('POST', '/reconectar', { medidor_id: ids.medidores.M1 }), { status: 400, body: { error: 'El servicio no está reportado como Cortado' } });
    });

    it('rechaza (403) si hay deuda y no hay convenio', async () => {
        const r = await pedir('POST', '/reconectar', { medidor_id: ids.medidores.M4 });
        assert.equal(r.status, 403);
        assert.deepEqual(r.body, {
            error: 'No es posible reconectar. Existe deuda pendiente y no hay convenio activo.',
            deuda_pendiente: 220,
            requiere: 'Pagar deuda completa o crear convenio de pago'
        });
    });

    it('reconecta si ya no hay deuda y cierra el corte', async () => {
        srv.db.prepare('UPDATE facturas SET saldo_pendiente = 0 WHERE lectura_id IN (SELECT id FROM lecturas WHERE medidor_id = ?)').run(ids.medidores.M4);
        const r = await pedir('POST', '/reconectar', { medidor_id: ids.medidores.M4, observaciones: 'pagó todo' });
        assert.deepEqual(r, { status: 200, body: { success: true, message: 'Servicio reconectado exitosamente. Estado: Activo', nuevo_estado: 'Activo' } });
        assert.equal(fila('SELECT estado_servicio FROM medidores WHERE id = ?', ids.medidores.M4).estado_servicio, 'Activo');
        const corte = fila('SELECT reconectado_por, observaciones, fecha_reconexion FROM cortes_servicio WHERE medidor_id = ?', ids.medidores.M4);
        assert.equal(corte.reconectado_por, S.id);
        assert.equal(corte.observaciones, 'pagó todo');
        assert.ok(corte.fecha_reconexion);
    });
});

describe('Convenios: consulta', () => {
    it('GET /convenios/:id devuelve convenio, parcialidades y progreso; 404 si no existe', async () => {
        const r = await pedir('GET', `/convenios/${ids.convenios.C5}`);
        assert.equal(r.status, 200);
        assert.equal(r.body.convenio.cliente_nombre, 'Elena Convenio');
        assert.equal(r.body.convenio.numero_serie, 'SER-M5');
        assert.deepEqual(r.body.parcialidades.map(p => [p.numero_parcialidad, p.monto_esperado, p.estado]), [[1, 300, 'Pagada'], [2, 300, 'Pendiente'], [3, 300, 'Pendiente']]);
        assert.deepEqual(r.body.progreso, { total: 900, pagado: 300, pendiente: 600, porcentaje: 33.33 });

        assert.deepEqual(await pedir('GET', '/convenios/9999'), { status: 404, body: { error: 'Convenio no encontrado' } });
    });

    it('GET /convenios/resumen-cobro/:medidor_id sugiere la siguiente parcialidad', async () => {
        const r = await pedir('GET', `/convenios/resumen-cobro/${ids.medidores.M5}`);
        assert.equal(r.status, 200);
        assert.equal(r.body.factura_actual, null);
        assert.equal(r.body.convenio.siguiente_parcialidad.numero_parcialidad, 2);
        assert.deepEqual(r.body.sugerencia_cobro, { monto_factura: 0, monto_convenio: 300, total: 300 });
        assert.deepEqual(r.body.resumen, { saldo_facturas_pendientes_no_convenio: 0, saldo_convenio_pendiente: 600 });

        const pendiente = await pedir('GET', `/convenios/resumen-cobro/${ids.medidores.M3}`);
        assert.equal(pendiente.body.factura_actual.estado, 'Parcial');
        assert.deepEqual(pendiente.body.sugerencia_cobro, { monto_factura: 145, monto_convenio: 0, total: 145 });

        assert.deepEqual(await pedir('GET', '/convenios/resumen-cobro/9999'), { status: 404, body: { error: 'Medidor no encontrado' } });
        assert.deepEqual(await pedir('GET', '/convenios/resumen-cobro/abc'), { status: 400, body: { error: 'medidor_id inválido' } });
    });
});

describe('Convenios: crear', () => {
    it('valida datos, convenio existente (409) y deuda', async () => {
        assert.deepEqual(await pedir('POST', '/convenios', {}), { status: 400, body: { error: 'Faltan datos requeridos' } });
        assert.deepEqual(await pedir('POST', '/convenios', { medidor_id: ids.medidores.M5, monto_inicial: 0, numero_parcialidades: 2 }), {
            status: 409, body: { error: 'Ya existe un convenio activo para este medidor', convenio_id: ids.convenios.C5, estado: 'Activo' }
        });
        assert.deepEqual(await pedir('POST', '/convenios', { medidor_id: ids.medidores.M1, monto_inicial: 0, numero_parcialidades: 2 }), {
            status: 400, body: { error: 'El cliente no tiene deuda pendiente para generar convenio' }
        });
        assert.deepEqual(await pedir('POST', '/convenios', { medidor_id: ids.medidores.M3, monto_inicial: 0, numero_parcialidades: 2, periodicidad: 'anual' }), {
            status: 400, body: { error: 'periodicidad inválida. Valores permitidos: mensual, quincenal' }
        });
    });

    it('crea el convenio: difiere la deuda, marca facturas y reconecta el medidor', async () => {
        const r = await pedir('POST', '/convenios', { medidor_id: ids.medidores.M2, monto_inicial: 125, numero_parcialidades: 3, periodicidad: 'quincenal', observaciones: 'acuerdo' });
        assert.equal(r.status, 201);
        assert.equal(r.body.success, true);
        assert.equal(r.body.message, 'Convenio creado exitosamente');
        assert.deepEqual(r.body.detalle, { deuda_original: 1025, pago_inicial: 125, saldo_diferido: 900, cuotas: 3, monto_por_cuota: 300 });
        assert.deepEqual(r.body.parcialidades.map(p => [p.numero, p.monto]), [[1, 300], [2, 300], [3, 300]]);

        ids.convenioM2 = r.body.convenio_id;
        const facturas = srv.db.prepare('SELECT f.estado, f.convenio_id FROM facturas f JOIN lecturas l ON l.id = f.lectura_id WHERE l.medidor_id = ?').all(ids.medidores.M2);
        assert.ok(facturas.every(f => f.estado === 'En Convenio' && f.convenio_id === ids.convenioM2));
        assert.equal(fila('SELECT estado_servicio FROM medidores WHERE id = ?', ids.medidores.M2).estado_servicio, 'Activo');
        assert.match(fila('SELECT observaciones FROM cortes_servicio WHERE medidor_id = ? ORDER BY id DESC', ids.medidores.M2).observaciones, /Reconexión por creación de convenio$/);
    });
});

describe('Convenios: pagos', () => {
    it('pagar parcialidad: valida datos, ya pagada e insuficiente', async () => {
        assert.deepEqual(await pedir('POST', '/convenios/pagar-parcialidad', {}), { status: 400, body: { error: 'Faltan datos requeridos' } });

        const yaPagada = await pedir('POST', '/convenios/pagar-parcialidad', { parcialidad_id: ids.parcialidades['C5-1'], cantidad_entregada: 300, metodo_pago: 'Efectivo' });
        assert.equal(yaPagada.status, 400);
        assert.equal(yaPagada.body.error, 'Esta parcialidad ya fue pagada');
        assert.ok(yaPagada.body.fecha_pago);

        assert.deepEqual(await pedir('POST', '/convenios/pagar-parcialidad', { parcialidad_id: ids.parcialidades['C5-2'], cantidad_entregada: 10, metodo_pago: 'Efectivo' }), {
            status: 400, body: { error: 'La cantidad entregada es menor al monto esperado de la parcialidad', monto_esperado: 300, cantidad_entregada: 10 }
        });
    });

    it('pagar parcialidad: registra el pago, da cambio y descuenta del convenio', async () => {
        const r = await pedir('POST', '/convenios/pagar-parcialidad', { parcialidad_id: ids.parcialidades['C5-2'], cantidad_entregada: 500, metodo_pago: 'Efectivo', comentario: 'segunda' });
        assert.equal(r.status, 201);
        assert.equal(r.body.mensaje, 'Parcialidad pagada exitosamente');
        assert.equal(r.body.monto_aplicado, 300);
        assert.equal(r.body.cambio, 200);
        assert.equal(r.body.saldo_restante_convenio, 300);
        assert.equal(r.body.convenio_completado, false);
        assert.equal(fila('SELECT estado FROM parcialidades_convenio WHERE id = ?', ids.parcialidades['C5-2']).estado, 'Pagada');
    });

    it('pagar la última parcialidad finaliza el convenio y salda sus facturas', async () => {
        const r = await pedir('POST', '/convenios/pagar-parcialidad', { parcialidad_id: ids.parcialidades['C5-3'], cantidad_entregada: 300, metodo_pago: 'Efectivo' });
        assert.equal(r.status, 201);
        assert.equal(r.body.saldo_restante_convenio, 0);
        assert.equal(r.body.convenio_completado, true);
        assert.equal(fila('SELECT estado FROM convenios_pago WHERE id = ?', ids.convenios.C5).estado, 'Finalizado');
        const facturas = srv.db.prepare('SELECT estado, saldo_pendiente FROM facturas WHERE convenio_id = ?').all(ids.convenios.C5);
        assert.ok(facturas.length === 3 && facturas.every(f => f.estado === 'Pagado' && f.saldo_pendiente === 0));
    });

    it('pago integrado: validaciones con su formato propio ({ statusCode, error, ... })', async () => {
        assert.deepEqual(await pedir('POST', '/convenios/pagar-integrado', {}), { status: 400, body: { error: 'convenio_id es requerido y debe ser válido' } });
        assert.deepEqual(await pedir('POST', '/convenios/pagar-integrado', { convenio_id: 9999, monto_convenio: 300, cantidad_entregada: 300, metodo_pago: 'Efectivo' }), {
            status: 404, body: { statusCode: 404, error: 'Convenio no encontrado' }
        });
        assert.deepEqual(await pedir('POST', '/convenios/pagar-integrado', { convenio_id: ids.convenios.C5, monto_convenio: 300, cantidad_entregada: 300, metodo_pago: 'Efectivo' }), {
            status: 400, body: { statusCode: 400, error: 'El convenio no está en estado cobrable', estado_convenio: 'Finalizado' }
        });
        assert.deepEqual(await pedir('POST', '/convenios/pagar-integrado', { convenio_id: ids.convenioM2, monto_convenio: 50, cantidad_entregada: 50, metodo_pago: 'Efectivo' }), {
            status: 400, body: { statusCode: 400, error: 'El monto para convenio debe cubrir parcialidades completas. Ajuste el monto al múltiplo de cuota pendiente.', sobrante_no_aplicable: 50 }
        });
    });

    it('pago integrado: factura del periodo + parcialidad en una sola operación', async () => {
        const facturaId = Number(srv.db.prepare(
            `INSERT INTO facturas (cliente_id, lectura_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado) VALUES (?, ?, ?, ?, '2099-12-31', 100, 100, 'Pendiente')`
        ).run(ids.clientes.C2, ids.lecturas['M2-4'], ids.tarifas.domestica, `${ids.periodos.P4}-01`).lastInsertRowid);

        const r = await pedir('POST', '/convenios/pagar-integrado', { convenio_id: ids.convenioM2, factura_id: facturaId, monto_factura: 100, monto_convenio: 300, cantidad_entregada: 500, metodo_pago: 'Efectivo' });
        assert.equal(r.status, 201);
        assert.equal(r.body.mensaje, 'Pago integrado aplicado exitosamente');
        assert.equal(r.body.total_aplicado, 400);
        assert.equal(r.body.cambio, 100);
        assert.equal(r.body.desglose.factura.total_aplicado, 100);
        assert.equal(r.body.desglose.convenio.parcialidades_pagadas, 1);
        assert.deepEqual(r.body.convenio_estado, { estado: 'Activo', saldo_restante: 600 });
        assert.deepEqual({ ...fila('SELECT estado, saldo_pendiente FROM facturas WHERE id = ?', facturaId) }, { estado: 'Pagado', saldo_pendiente: 0 });
    });
});

// Al final: base rota a propósito para fijar las respuestas de error interno
describe('errores internos (500)', () => {
    it('candidatos responde su mensaje fijo si falla la base', async () => {
        srv.db.exec('ALTER TABLE configuracion_servicio RENAME TO configuracion_servicio_x');
        try {
            assert.deepEqual(await pedir('GET', '/candidatos'), { status: 500, body: { error: 'Error interno al detectar candidatos' } });
        } finally {
            srv.db.exec('ALTER TABLE configuracion_servicio_x RENAME TO configuracion_servicio');
        }
    });

    it('convenio y reconexión responden su mensaje fijo si falla la base', async () => {
        srv.db.exec('ALTER TABLE parcialidades_convenio RENAME TO parcialidades_convenio_x');
        try {
            assert.deepEqual(await pedir('GET', `/convenios/${ids.convenios.C5}`), { status: 500, body: { error: 'Error interno del servidor' } });
        } finally {
            srv.db.exec('ALTER TABLE parcialidades_convenio_x RENAME TO parcialidades_convenio');
        }
        srv.db.prepare("UPDATE medidores SET estado_servicio = 'Cortado' WHERE id = ?").run(ids.medidores.M6);
        srv.db.exec('ALTER TABLE facturas RENAME TO facturas_x');
        try {
            assert.deepEqual(await pedir('POST', '/reconectar', { medidor_id: ids.medidores.M6 }), { status: 500, body: { error: 'Error procesando reconexión' } });
        } finally {
            srv.db.exec('ALTER TABLE facturas_x RENAME TO facturas');
        }
    });
});
