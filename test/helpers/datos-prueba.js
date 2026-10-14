/**
 * Datos de prueba realistas para tests de cortes, convenios, reportes y rutas.
 *
 * Inserta directamente en SQLite (los triggers reales ajustan saldos y estados).
 * Las fechas son relativas al día de hoy, así los tests no caducan.
 *
 * Escenario (umbral de corte = 2 facturas vencidas, 0 días de gracia):
 *   C1 "Ana Pagos"       M1 y M7 · ruta R1 · todas sus facturas pagadas
 *   C2 "Beto Moroso"     M2      · ruta R1 · 3 facturas vencidas        → candidato a corte
 *   C3 "Carla Parcial"   M3      · ruta R1 · pagada, parcial, pendiente · saldo_anterior 50
 *   C4 "Dario Cortado"   M4      · ruta R2 · servicio cortado, 2 vencidas → reconexión rechazada
 *   C5 "Elena Convenio"  M5      · ruta R2 · facturas en convenio activo (1 de 3 parcialidades pagada)
 *   C6 "Fito Comercio"   M6      · ruta R2 · tarifa comercial, 1 factura pendiente
 *   M8 sin cliente ni ruta
 * Periodos: P1..P3 (los 3 meses anteriores, facturados) y P4 (mes actual: lecturas de M1 y M2 sin facturar).
 */

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM' desplazado `meses` respecto al mes actual. */
export function periodo(meses) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + meses);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 'YYYY-MM-DD' desplazado `dias` respecto a hoy. */
export function fecha(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * @param {import('better-sqlite3').Database} db Conexión con el esquema migrado
 * @param {{ usuarioId: number }} opciones Usuario que figura como autor de los registros
 * @returns ids de todo lo creado
 */
export function cargarDatosPrueba(db, { usuarioId }) {
    const ins = (sql, ...args) => Number(db.prepare(sql).run(...args).lastInsertRowid);
    const P = { P1: periodo(-3), P2: periodo(-2), P3: periodo(-1), P4: periodo(0) };

    const ids = { periodos: P, clientes: {}, medidores: {}, rutas: {}, tarifas: {}, facturas: {}, lecturas: {}, convenios: {}, parcialidades: {} };

    // Configuración: corte con 2 facturas vencidas, sin días de gracia
    db.prepare(`INSERT INTO configuracion_servicio (facturas_para_corte, dias_gracia, dias_vencimiento_factura, modificado_por) VALUES (2, 0, 15, ?)`).run(usuarioId);

    // Tarifas
    ids.tarifas.domestica = ins(`INSERT INTO tarifas (nombre, descripcion, fecha_inicio, modificado_por) VALUES ('Doméstica', 'Uso doméstico', '2025-01-01', ?)`, usuarioId);
    ins(`INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, 0, 10, 10)`, ids.tarifas.domestica);
    ins(`INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, 11, 20, 15)`, ids.tarifas.domestica);
    ins(`INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, 21, NULL, 20)`, ids.tarifas.domestica);
    ids.tarifas.comercial = ins(`INSERT INTO tarifas (nombre, descripcion, fecha_inicio, modificado_por) VALUES ('Comercial', 'Uso comercial', '2025-01-01', ?)`, usuarioId);
    ins(`INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, 0, NULL, 25)`, ids.tarifas.comercial);

    // Clientes
    const cliente = (clave, nombre, ciudad, tarifa, saldoAnterior = 0) => {
        ids.clientes[clave] = ins(
            `INSERT INTO clientes (nombre, direccion, telefono, ciudad, tarifa_id, modificado_por, numero_predio, saldo_anterior) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            nombre, `Calle ${clave} #1`, `662000000${clave.slice(1)}`, ciudad, tarifa, usuarioId, `PR-${clave}`, saldoAnterior
        );
    };
    cliente('C1', 'Ana Pagos', 'Villa Pesqueira', ids.tarifas.domestica);
    cliente('C2', 'Beto Moroso', 'Villa Pesqueira', ids.tarifas.domestica);
    cliente('C3', 'Carla Parcial', 'Villa Pesqueira', ids.tarifas.domestica, 50);
    cliente('C4', 'Dario Cortado', 'Mazocahui', ids.tarifas.domestica);
    cliente('C5', 'Elena Convenio', 'Mazocahui', ids.tarifas.domestica);
    cliente('C6', 'Fito Comercio', 'Mazocahui', ids.tarifas.comercial);

    // Medidores (el trigger registrar_historial_asignacion crea su historial cliente↔medidor)
    const medidor = (clave, clienteClave, extra = {}) => {
        ids.medidores[clave] = ins(
            `INSERT INTO medidores (cliente_id, numero_serie, ubicacion, fecha_instalacion, latitud, longitud, estado_medidor, estado_servicio, fecha_corte, lectura_base)
             VALUES (?, ?, ?, '2025-01-15', ?, ?, 'Activo', ?, ?, 0)`,
            clienteClave ? ids.clientes[clienteClave] : null, `SER-${clave}`, `Frente ${clave}`,
            29.1 + Number(clave.slice(1)) / 100, -110.9 - Number(clave.slice(1)) / 100,
            extra.estadoServicio || 'Activo', extra.fechaCorte || null
        );
    };
    medidor('M1', 'C1'); medidor('M2', 'C2'); medidor('M3', 'C3');
    medidor('M4', 'C4', { estadoServicio: 'Cortado', fechaCorte: fecha(-20) });
    medidor('M5', 'C5'); medidor('M6', 'C6'); medidor('M7', 'C1'); medidor('M8', null);

    // Historial cliente↔medidor (en producción lo crea el trigger al asignar). M7 fue de C6 antes de pasar a C1.
    const historial = (m, c, inicio, fin = null) => ins(
        `INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio, fecha_fin, asignado_por) VALUES (?, ?, ?, ?, ?)`,
        ids.clientes[c], ids.medidores[m], inicio, fin, usuarioId
    );
    for (const [m, c] of [['M1', 'C1'], ['M2', 'C2'], ['M3', 'C3'], ['M4', 'C4'], ['M5', 'C5'], ['M6', 'C6']]) historial(m, c, '2025-01-15');
    historial('M7', 'C6', '2025-01-15', fecha(-200));
    historial('M7', 'C1', fecha(-199));
    ins(`INSERT INTO cortes_servicio (cliente_id, medidor_id, fecha_corte, motivo, autorizado_por) VALUES (?, ?, ?, 'Falta de pago', ?)`, ids.clientes.C4, ids.medidores.M4, `${fecha(-20)} 10:00:00`, usuarioId);

    // Rutas
    ids.rutas.R1 = ins(`INSERT INTO rutas (nombre, descripcion, creado_por, distancia_km) VALUES ('Ruta Centro', 'Centro del pueblo', ?, 2.5)`, usuarioId);
    ids.rutas.R2 = ins(`INSERT INTO rutas (nombre, descripcion, creado_por, distancia_km) VALUES ('Ruta Mazocahui', 'Comunidad', ?, 7.25)`, usuarioId);
    ['M1', 'M2', 'M3', 'M7'].forEach((m, i) => ins(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (?, ?, ?)`, ids.rutas.R1, ids.medidores[m], i + 1));
    ['M4', 'M5', 'M6'].forEach((m, i) => ins(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (?, ?, ?)`, ids.rutas.R2, ids.medidores[m], i + 1));

    // Lecturas + facturas de P1..P3. consumo por medidor y periodo
    const consumos = { M1: [8, 12, 9], M2: [15, 18, 22], M3: [10, 11, 14], M4: [9, 7, 0], M5: [20, 16, 18], M6: [30, 0, 0], M7: [5, 6, 4] };
    const tarifaDe = { C1: 'domestica', C2: 'domestica', C3: 'domestica', C4: 'domestica', C5: 'domestica', C6: 'comercial' };
    const clienteDe = { M1: 'C1', M2: 'C2', M3: 'C3', M4: 'C4', M5: 'C5', M6: 'C6', M7: 'C1' };
    const rutaDe = { M1: 'R1', M2: 'R1', M3: 'R1', M7: 'R1', M4: 'R2', M5: 'R2', M6: 'R2' };
    const periodos = [P.P1, P.P2, P.P3];

    // Estado de cada factura (después se aplican pagos que la llevan a ese estado)
    const plan = {
        M1: ['Pagado', 'Pagado', 'Pagado'], M7: ['Pagado', 'Pagado', 'Pagado'],
        M2: ['Vencida', 'Vencida', 'Vencida'],
        M3: ['Pagado', 'Parcial', 'Pendiente'],
        M4: ['Vencida', 'Vencida', null],
        M5: ['En Convenio', 'En Convenio', 'En Convenio'],
        M6: ['Pendiente', null, null],
    };

    let acumulado = {};
    for (const [m, lista] of Object.entries(consumos)) {
        acumulado[m] = 100;
        lista.forEach((consumo, i) => {
            const per = periodos[i];
            const [y, mo] = per.split('-');
            const anterior = acumulado[m];
            acumulado[m] += consumo;
            const lecturaId = ins(
                `INSERT INTO lecturas (medidor_id, ruta_id, fecha_lectura, consumo_m3, periodo, modificado_por, estado, lectura_anterior, lectura_actual)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ids.medidores[m], ids.rutas[rutaDe[m]], `${y}-${mo}-25`, consumo, per, usuarioId,
                plan[m][i] ? 'facturada' : 'pendiente', anterior, acumulado[m]
            );
            ids.lecturas[`${m}-${i + 1}`] = lecturaId;

            const estado = plan[m][i];
            if (!estado) return;
            const precio = tarifaDe[clienteDe[m]] === 'comercial' ? 25 : (consumo <= 10 ? 10 : consumo <= 20 ? 15 : 20);
            const total = consumo * precio + 30; // + cuota fija
            // Vencidas: vencieron hace más de un mes; pendientes/parciales: vencen en el futuro
            const vencimiento = (estado === 'Vencida' || estado === 'En Convenio') ? fecha(-60 + i * 15) : fecha(10 + i);
            ids.facturas[`${m}-${i + 1}`] = ins(
                `INSERT INTO facturas (cliente_id, lectura_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado, modificado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ids.clientes[clienteDe[m]], lecturaId, ids.tarifas[tarifaDe[clienteDe[m]]], `${y}-${mo}-28`, vencimiento,
                total, total, estado === 'Pagado' || estado === 'Parcial' ? 'Pendiente' : estado, usuarioId
            );
        });
    }

    // Pagos (los triggers actualizan saldo_pendiente y estado)
    const pagar = (claveFactura, monto, metodo, fechaPago) => ins(
        `INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, comentario, modificado_por) VALUES (?, ?, ?, ?, 0, ?, 'pago de prueba', ?)`,
        ids.facturas[claveFactura], fechaPago, monto, monto, metodo, usuarioId
    );
    const totalDe = (clave) => db.prepare('SELECT total FROM facturas WHERE id = ?').get(ids.facturas[clave]).total;
    for (const clave of ['M1-1', 'M1-2', 'M1-3', 'M7-1', 'M7-2', 'M7-3', 'M3-1']) {
        const [y, mo] = periodos[Number(clave.slice(-1)) - 1].split('-');
        pagar(clave, totalDe(clave), clave.startsWith('M7') ? 'Transferencia' : 'Efectivo', `${y}-${mo}-28 12:00:00`);
    }
    pagar('M3-2', 50, 'Efectivo', `${periodos[1]}-28 13:00:00`); // parcial

    // Convenio de C5 sobre sus 3 facturas: 3 parcialidades mensuales, la primera pagada
    const deudaC5 = ['M5-1', 'M5-2', 'M5-3'].reduce((s, k) => s + totalDe(k), 0);
    const parcial = Math.round((deudaC5 / 3) * 100) / 100;
    ids.convenios.C5 = ins(
        `INSERT INTO convenios_pago (cliente_id, medidor_id, monto_total, monto_inicial, saldo_restante, numero_parcialidades, periodicidad, estado, fecha_inicio, autorizado_por, observaciones)
         VALUES (?, ?, ?, 0, ?, 3, 'mensual', 'Activo', ?, ?, 'Convenio de prueba')`,
        ids.clientes.C5, ids.medidores.M5, deudaC5, Math.round((deudaC5 - parcial) * 100) / 100, fecha(-40), usuarioId
    );
    db.prepare(`UPDATE facturas SET convenio_id = ? WHERE id IN (?, ?, ?)`).run(ids.convenios.C5, ids.facturas['M5-1'], ids.facturas['M5-2'], ids.facturas['M5-3']);
    [fecha(-30), fecha(-1), fecha(29)].forEach((venc, i) => {
        ids.parcialidades[`C5-${i + 1}`] = ins(
            `INSERT INTO parcialidades_convenio (convenio_id, numero_parcialidad, monto_esperado, fecha_vencimiento, estado) VALUES (?, ?, ?, ?, 'Pendiente')`,
            ids.convenios.C5, i + 1, i === 2 ? Math.round((deudaC5 - parcial * 2) * 100) / 100 : parcial, venc
        );
    });
    const pagoParcialidad = ins(
        `INSERT INTO pagos (parcialidad_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, comentario, modificado_por) VALUES (?, ?, ?, ?, 0, 'Efectivo', 'parcialidad 1', ?)`,
        ids.parcialidades['C5-1'], `${fecha(-30)} 09:00:00`, parcial, parcial, usuarioId
    );
    db.prepare(`UPDATE parcialidades_convenio SET estado = 'Pagada', monto_pagado = ?, fecha_pago = ?, pago_id = ? WHERE id = ?`)
        .run(parcial, `${fecha(-30)} 09:00:00`, pagoParcialidad, ids.parcialidades['C5-1']);

    // Mes actual: lecturas tomadas de M1 y M2, todavía sin facturar
    for (const m of ['M1', 'M2']) {
        const anterior = acumulado[m];
        ids.lecturas[`${m}-4`] = ins(
            `INSERT INTO lecturas (medidor_id, ruta_id, fecha_lectura, consumo_m3, periodo, modificado_por, estado, lectura_anterior, lectura_actual)
             VALUES (?, ?, ?, 7, ?, ?, 'pendiente', ?, ?)`,
            ids.medidores[m], ids.rutas.R1, `${P.P4}-05`, P.P4, usuarioId, anterior, anterior + 7
        );
    }

    return ids;
}
