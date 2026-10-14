/**
 * Tests HTTP de /api/v2/reports (caracterización)
 *
 * Usan los datos de test/helpers/datos-prueba.js. Fijan el comportamiento ACTUAL de
 * los reportes: validación de parámetros, totales y estructura principal.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidorPrueba } from '../helpers/servidor-prueba.js';
import { cargarDatosPrueba } from '../helpers/datos-prueba.js';

let srv, S, ids;
const pedir = (ruta) => srv.pedir('GET', `/api/v2/reports${ruta}`, { appKey: srv.appKey, token: S.token });

before(async () => {
    console.log = console.error = console.warn = () => {};
    srv = await crearServidorPrueba();
    S = await srv.crearUsuarioYLogin({ rol: 'superadmin' });
    ids = cargarDatosPrueba(srv.db, { usuarioId: S.id });
});

after(async () => { await srv.cerrar(); });

describe('GET /reports/recibos', () => {
    it('exige el mes (400)', async () => {
        assert.deepEqual(await pedir('/recibos'), { status: 400, body: { error: "El parámetro 'mes' (YYYY-MM) es obligatorio" } });
    });

    it('genera un recibo por factura del periodo con deuda anterior e historial de consumo', async () => {
        const r = await pedir(`/recibos?mes=${ids.periodos.P3}`);
        assert.equal(r.status, 200);
        assert.equal(r.body.periodo, ids.periodos.P3);
        assert.equal(r.body.total_recibos, 5);

        const beto = r.body.recibos.find(x => x.datos_cliente.nombre === 'Beto Moroso');
        assert.deepEqual(beto.datos_cliente, { nombre: 'Beto Moroso', direccion: 'Calle C2 #1', pueblo: 'Villa Pesqueira', numero_predio: 'PR-C2' });
        assert.equal(beto.informacion_servicio.ruta_nombre, 'Ruta Centro');
        assert.equal(beto.detalle_facturacion.total_mes, 470);
        assert.equal(beto.detalle_facturacion.saldo_pendiente_mes, 470);
        assert.equal(beto.detalle_facturacion.deuda_acumulada_anterior, 555);
        assert.equal(beto.detalle_facturacion.total_a_pagar, 1025);

        // Ana tiene dos medidores: el consumo del recibo suma ambos (9 + 4)
        const ana = r.body.recibos.find(x => x.datos_cliente.nombre === 'Ana Pagos');
        assert.deepEqual(
            { actual: ana.informacion_consumo.consumo_actual, anterior: ana.informacion_consumo.consumo_anterior, variacion: ana.informacion_consumo.variacion_porcentaje },
            { actual: 13, anterior: 18, variacion: -27.8 }
        );
        assert.deepEqual(ana.informacion_consumo.historial_ano_actual.map(h => h.consumo), [13, 18, 13]);
    });

    it('filtra por ruta y por estado de la factura', async () => {
        const porRuta = await pedir(`/recibos?mes=${ids.periodos.P3}&ruta_id=${ids.rutas.R2}`);
        assert.deepEqual(porRuta.body.recibos.map(x => x.datos_cliente.nombre).sort(), ['Elena Convenio']);
        const vencidas = await pedir(`/recibos?mes=${ids.periodos.P2}&estado_pago=Vencida`);
        assert.deepEqual(vencidas.body.recibos.map(x => x.datos_cliente.nombre).sort(), ['Beto Moroso', 'Dario Cortado']);
        const sinDatos = await pedir('/recibos?mes=2020-01');
        assert.deepEqual(sinDatos.body, { periodo: '2020-01', total_recibos: 0, recibos: [] });
    });
});

describe('GET /reports/financiero', () => {
    it('valida el tipo de filtro y sus parámetros (400)', async () => {
        assert.deepEqual(await pedir('/financiero'), { status: 400, body: { error: "Para tipo=periodo, el parámetro 'periodo' (YYYY-MM) es obligatorio" } });
        assert.deepEqual(await pedir('/financiero?tipo=ultimos_meses&meses=5'), { status: 400, body: { error: "Para tipo=ultimos_meses, 'meses' debe ser 3, 6 o 12" } });
        assert.deepEqual(await pedir('/financiero?tipo=otro'), { status: 400, body: { error: 'Tipo de filtro inválido. Use: periodo, ultimos_meses, anio o rango' } });
        assert.deepEqual(await pedir('/financiero?tipo=rango&fecha_inicio=2026-05-01&fecha_fin=2026-01-01'), { status: 400, body: { error: 'La fecha de inicio no puede ser mayor a la fecha fin' } });
    });

    it('resume esperado, recaudado y estados del periodo', async () => {
        const r = await pedir(`/financiero?tipo=periodo&periodo=${ids.periodos.P2}`);
        assert.equal(r.status, 200);
        assert.equal(r.body.filtro_aplicado.tipo, 'periodo');
        assert.equal(r.body.filtro_aplicado.periodo, ids.periodos.P2);
        const { total_esperado, total_recaudado, por_cobrar_estimado, eficiencia_recaudo_porcentaje, total_facturas, facturas_pagadas, facturas_vencidas, total_pagos } = r.body.resumen;
        assert.deepEqual(
            { total_esperado, total_recaudado, por_cobrar_estimado, eficiencia_recaudo_porcentaje, total_facturas, facturas_pagadas, facturas_vencidas, total_pagos },
            { total_esperado: 1165, total_recaudado: 350, por_cobrar_estimado: 815, eficiencia_recaudo_porcentaje: 30.04, total_facturas: 6, facturas_pagadas: 2, facturas_vencidas: 2, total_pagos: 3 }
        );
        assert.deepEqual(r.body.series.metodos_pago, [{ metodo: 'Efectivo', total: 260, transacciones: 2 }, { metodo: 'Transferencia', total: 90, transacciones: 1 }]);
    });
});

describe('GET /reports/deudores', () => {
    it('resume la cartera vencida y los principales deudores', async () => {
        const r = await pedir('/deudores');
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.resumen, { deuda_vencida: 1245, clientes_morosos: 2, cortes_activos: 1, convenios_activos: 1 });
        assert.deepEqual(r.body.top_deudores.map(d => [d.nombre, d.deuda_total, d.facturas_vencidas]), [['Beto Moroso', 1025, 3], ['Dario Cortado', 220, 2]]);
        assert.ok(!Number.isNaN(Date.parse(r.body.generated_at)));
    });
});

describe('GET /reports/lecturas', () => {
    it('exige el mes (400) y agrupa por localidad con la lectura anterior', async () => {
        assert.deepEqual(await pedir('/lecturas'), { status: 400, body: { error: "El parámetro 'mes' (YYYY-MM) es obligatorio" } });

        const r = await pedir(`/lecturas?mes=${ids.periodos.P3}&localidad=Mazocahui`);
        assert.equal(r.status, 200);
        assert.equal(r.body.periodo_solicitado, ids.periodos.P3);
        assert.equal(r.body.periodo_lectura_anterior, ids.periodos.P2);
        assert.equal(r.body.total_general, 3);
        assert.deepEqual(r.body.datos.map(d => d.localidad), ['Mazocahui']);
        const dario = r.body.datos[0].clientes.find(c => c.cliente === 'Dario Cortado');
        assert.equal(dario.medidor.serie, 'SER-M4');
        assert.equal(dario.lectura_anterior.valor, 116);
        assert.equal(dario.lectura_anterior.consumo_registrado, 7);
    });
});

describe('GET /reports/consumo-agua', () => {
    it('valida el tipo de filtro (400) y resume el consumo del periodo', async () => {
        assert.deepEqual(await pedir('/consumo-agua?tipo=otro'), { status: 400, body: { error: 'Tipo de filtro inválido. Use: periodo, ultimos_meses o anio' } });

        const r = await pedir(`/consumo-agua?tipo=periodo&periodo=${ids.periodos.P2}`);
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.resumen, { total_recibos: 6, consumo_total_m3: 70, consumo_promedio_m3: 11.67, total_clientes: 5, promedio_consumo_por_cliente_m3: 14 });
        assert.equal(r.body.listados.top_consumidores[0].cliente_nombre, 'Beto Moroso');
    });
});

// Al final: base rota a propósito para fijar las respuestas de error interno
describe('errores internos (500)', () => {
    it('cada reporte responde su mensaje fijo si falla la base', async () => {
        srv.db.exec('ALTER TABLE facturas RENAME TO facturas_x');
        try {
            assert.deepEqual(await pedir(`/recibos?mes=${ids.periodos.P3}`), { status: 500, body: { error: 'Error interno generando recibos' } });
            assert.deepEqual(await pedir('/financiero?tipo=ultimos_meses&meses=3'), { status: 500, body: { error: 'Error generando reporte financiero' } });
            assert.deepEqual(await pedir('/consumo-agua'), { status: 500, body: { error: 'Error interno generando reporte de consumo' } });
        } finally {
            srv.db.exec('ALTER TABLE facturas_x RENAME TO facturas');
        }
    });
});
