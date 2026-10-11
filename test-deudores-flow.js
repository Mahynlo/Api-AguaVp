/**
 * test-deudores-flow.js
 *
 * Script de prueba del flujo completo de deudores:
 *   1. Login → obtener token
 *   2. Crear cliente de prueba
 *   3. Crear medidor y asignarlo al cliente
 *   4. Crear tarifa con rangos
 *   5. Insertar lecturas + facturas con fecha_vencimiento PASADA (simula deuda real)
 *   6. Llamar marcarFacturasVencidas (lo que hace el cron diario)
 *   7. GET /deudores/candidatos → debe aparecer el cliente
 *   8. POST /deudores/cortar → cortar el servicio
 *   9. GET /deudores/candidatos → debe aparecer como "Reconexión"
 *  10. Limpiar datos de prueba
 *
 * ── PRE-REQUISITOS ──────────────────────────────────────────────────────────
 *
 *  1. El servidor debe estar corriendo:  node src/index.js
 *
 *  2. APP_KEY: necesitas pasar el token de tu aplicación registrada.
 *     Puedes obtenerlo de dos formas:
 *       a) Desde el Electron app después de hacer login como admin
 *          (se muestra en la consola del servidor como "AppKey: ...")
 *       b) Consultando directo en la BD:
 *          sqlite3 src/database/agua-vp-local.db "SELECT token FROM apps LIMIT 1;"
 *     Pásalo como variable de entorno:
 *          APP_KEY=<tu-token> node test-deudores-flow.js
 *
 *  3. Ajusta TEST_USER / TEST_PASS con credenciales válidas de tu sistema.
 *
 * USO:
 *   APP_KEY=<token> node test-deudores-flow.js
 *
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'src/database/agua-vp-local.db');
const API = 'http://localhost:3000/api/v2';

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const TEST_USER     = 'admin';    // Cambia por un usuario válido
const TEST_PASS     = 'admin123'; // Cambia por la contraseña correcta
const APP_KEY       = process.env.APP_KEY || ''; // APP_KEY si la tienes configurada
// facturas a insertar — debe ser >= facturas_para_corte en tu configuración (default: 4)
const FACTURAS_PARA_CORTE = 4;
// ─────────────────────────────────────────────────────────────────────────────

let token = '';
let headers = {};
const creados = { cliente_id: null, medidor_id: null, tarifa_id: null, lectura_ids: [], factura_ids: [] };

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const log = (msg) => console.log(`\n${'─'.repeat(60)}\n${msg}`);
const ok  = (msg) => console.log(`  ✅ ${msg}`);
const err = (msg) => console.log(`  ❌ ${msg}`);
const info = (label, obj) => {
    console.log(`  📋 ${label}:`);
    console.log(JSON.stringify(obj, null, 2).split('\n').map(l => `     ${l}`).join('\n'));
};

async function post(endpoint, body) {
    const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

async function get(endpoint) {
    const res = await fetch(`${API}${endpoint}`, { headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

// ─── PASO 1: LOGIN ────────────────────────────────────────────────────────────
async function login() {
    log('PASO 1: Login');

    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(APP_KEY ? { 'x-app-key': `AppKey ${APP_KEY}` } : {}) },
        body: JSON.stringify({ username: TEST_USER, password: TEST_PASS })
    });

    const data = await res.json().catch(() => ({}));

    if (res.status !== 200 || !data.accessToken) {
        err(`Login fallido (HTTP ${res.status})`);
        info('Respuesta', data);
        throw new Error('No se pudo autenticar. Verifica TEST_USER y TEST_PASS al inicio del script.');
    }

    token = data.accessToken;  // La API devuelve accessToken, no token
    headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(APP_KEY ? { 'x-app-key': `AppKey ${APP_KEY}` } : {})
    };
    ok(`Token obtenido para usuario "${TEST_USER}"`);
}

// ─── PASO 2: CREAR CLIENTE ───────────────────────────────────────────────────
async function crearCliente() {
    log('PASO 2: Crear cliente de prueba');

    const { status, data } = await post('/clientes/registrar', {
        nombre: 'Cliente Test Deudores',
        direccion: 'Calle Test 123, Col. Prueba',
        telefono: '5512345678',
        ciudad: 'Ciudad Test',
        estado_cliente: 'Activo'
    });

    if (status !== 201 && status !== 200) {
        err(`HTTP ${status}`);
        info('Respuesta', data);
        throw new Error('No se pudo crear el cliente');
    }

    creados.cliente_id = data.clienteID;  // Campo real: clienteID
    ok(`Cliente creado con ID: ${creados.cliente_id}`);
}

// ─── PASO 3: CREAR TARIFA CON RANGOS ─────────────────────────────────────────
async function crearTarifa() {
    log('PASO 3: Crear tarifa de prueba');

    const { status, data } = await post('/tarifas/registrar', {
        nombre: 'Tarifa Test',
        descripcion: 'Tarifa de prueba para test de deudores',
        fecha_inicio: '2024-01-01'
    });

    if (status !== 201 && status !== 200) {
        err(`HTTP ${status}`);
        info('Respuesta', data);
        throw new Error('No se pudo crear la tarifa');
    }

    creados.tarifa_id = data.tarifa_id;  // Campo real: tarifa_id
    ok(`Tarifa creada con ID: ${creados.tarifa_id}`);

    // Registrar rangos — endpoint separado con body { tarifa_id, rangos }
    // IMPORTANTE: el campo de precio es precio_por_m3, no precio_m3
    const { status: rs, data: rd } = await post('/tarifas/registrar-rangos', {
        tarifa_id: creados.tarifa_id,
        rangos: [
            { consumo_min: 0,  consumo_max: 10,   precio_por_m3: 50.00 },  // Base fija $50
            { consumo_min: 11, consumo_max: 20,   precio_por_m3: 8.00  },  // $8 por m³
            { consumo_min: 21, consumo_max: null, precio_por_m3: 12.00 }   // $12 excedente
        ]
    });

    if (rs !== 201 && rs !== 200) {
        err(`Rangos HTTP ${rs}`);
        info('Respuesta', rd);
        throw new Error('No se pudieron crear rangos de tarifa');
    }
    ok('Rangos de tarifa registrados');
}

// ─── PASO 4: CREAR MEDIDOR ───────────────────────────────────────────────────
async function crearMedidor() {
    log('PASO 4: Crear medidor y asignar al cliente');

    const { status, data } = await post('/medidores/registrar', {
        cliente_id: creados.cliente_id,
        numero_serie: `TEST-${Date.now()}`,
        ubicacion:    'Frente de la casa prueba',
        fecha_instalacion: '2024-01-01'
    });

    if (status !== 201 && status !== 200) {
        err(`HTTP ${status}`);
        info('Respuesta', data);
        throw new Error('No se pudo crear el medidor');
    }

    creados.medidor_id = data.data?.medidorID || data.medidorID;  // Campo real: data.medidorID
    ok(`Medidor creado con ID: ${creados.medidor_id}`);
}

// ─── PASO 5: INSERTAR LECTURAS+FACTURAS CON FECHAS PASADAS (vía SQLite directo)
//            Esto evita tener que esperar 30+ días.
async function insertarFacturasVencidas() {
    log(`PASO 5: Insertar ${FACTURAS_PARA_CORTE} facturas con fecha vencida (vía SQLite directo)`);

    // Buscar ruta disponible
    const db = new Database(DB_PATH);
    const ruta = db.prepare('SELECT id FROM rutas LIMIT 1').get();
    if (!ruta) {
        db.close();
        throw new Error('No hay rutas en la BD. Crea al menos una ruta antes de ejecutar este test.');
    }

    // Obtener usuario actual (para modificado_por)
    const usuario = db.prepare("SELECT id FROM usuarios LIMIT 1").get();
    const userId = usuario?.id || 1;

    console.log(`  ℹ️  Usando ruta_id=${ruta.id}, usuario_id=${userId}`);

    for (let i = 0; i < FACTURAS_PARA_CORTE; i++) {
        // Mes ficticio en el pasado: hace 2, 3, 4... meses
        const mesesAtras = i + 2;
        const fechaEmision = new Date();
        fechaEmision.setMonth(fechaEmision.getMonth() - mesesAtras);
        const emision = fechaEmision.toISOString().split('T')[0];

        // Vencimiento = 30 días después de la emisión → ya venció
        const fechaVenc = new Date(fechaEmision);
        fechaVenc.setDate(fechaVenc.getDate() + 30);
        const vencimiento = fechaVenc.toISOString().split('T')[0];

        const periodo = `${fechaEmision.getFullYear()}-${String(fechaEmision.getMonth() + 1).padStart(2, '0')}`;
        const consumo = 15 + i; // 15, 16, 17 m³
        const total = 50 + (consumo - 10) * 8; // $50 base + excedente

        // 1. Insertar lectura
        const lecResult = db.prepare(`
            INSERT INTO lecturas (medidor_id, ruta_id, consumo_m3, fecha_lectura, periodo, modificado_por, estado)
            VALUES (?, ?, ?, ?, ?, ?, 'facturada')
        `).run(creados.medidor_id, ruta.id, consumo, emision, periodo, userId);

        const lectura_id = lecResult.lastInsertRowid;
        creados.lectura_ids.push(Number(lectura_id));

        // 2. Insertar factura con fecha_vencimiento pasada y estado 'Pendiente'
        const facResult = db.prepare(`
            INSERT INTO facturas (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, estado, total, saldo_pendiente, modificado_por)
            VALUES (?, ?, ?, ?, ?, 'Pendiente', ?, ?, ?)
        `).run(lectura_id, creados.cliente_id, creados.tarifa_id, emision, vencimiento, total, total, userId);

        creados.factura_ids.push(Number(facResult.lastInsertRowid));
        ok(`Factura ${i + 1}/${FACTURAS_PARA_CORTE}: periodo=${periodo}, vence=${vencimiento}, total=$${total} — estado=Pendiente`);
    }

    db.close();
}

// ─── PASO 6: SIMULAR CRON — marcarFacturasVencidas ──────────────────────────
async function simularCron() {
    log('PASO 6: Simular cron diario — marcarFacturasVencidas()');

    const db = new Database(DB_PATH);
    const result = db.prepare(`
        UPDATE facturas
        SET estado = 'Vencida'
        WHERE fecha_vencimiento < date('now')
          AND estado IN ('Pendiente', 'Parcial')
          AND saldo_pendiente > 0
    `).run();
    db.close();

    ok(`${result.changes} factura(s) marcadas como 'Vencida'`);

    // Verificar estado de nuestras facturas
    const db2 = new Database(DB_PATH);
    const facturas = db2.prepare(
        `SELECT id, estado, fecha_vencimiento, saldo_pendiente FROM facturas WHERE id IN (${creados.factura_ids.join(',')})`
    ).all();
    db2.close();

    info('Estado de facturas de prueba', facturas);
}

// ─── PASO 7: DETECTAR CANDIDATOS ─────────────────────────────────────────────
async function detectarCandidatos() {
    log('PASO 7: GET /cortes/candidatos');

    const { status, data } = await get('/deudores/candidatos');

    if (status !== 200) {
        err(`HTTP ${status}`);
        info('Respuesta', data);
        throw new Error('Error al obtener candidatos');
    }

    ok(`Total candidatos: ${data.total_candidatos}`);
    info('Config aplicada', { umbral_corte: data.umbral_corte, dias_gracia: data.dias_gracia });

    const nuestro = data.candidatos?.find(c => c.cliente?.id === creados.cliente_id);
    if (nuestro) {
        ok(`"Cliente Test Deudores" ENCONTRADO como candidato`);
        info('Detalle', {
            cliente: nuestro.cliente?.nombre,
            facturas_vencidas: nuestro.deuda?.facturas_vencidas,
            deuda_total: `$${nuestro.deuda?.total}`,
            accion_sugerida: nuestro.accion_sugerida
        });
    } else {
        err('"Cliente Test Deudores" NO aparece en candidatos');
        console.log('   ⚠️  Puede ser que el umbral de config sea > FACTURAS_PARA_CORTE del script');
        console.log(`   ⚠️  Umbral BD: ${data.umbral_corte}, facturas insertadas: ${FACTURAS_PARA_CORTE}`);
    }

    return data;
}

// ─── PASO 8: EJECUTAR CORTE ──────────────────────────────────────────────────
async function ejecutarCorte() {
    log('PASO 8: POST /cortes/ejecutar');

    const { status, data } = await post('/deudores/cortar', {
        medidor_id: creados.medidor_id,
        motivo: 'Falta de pago (test automatizado)',
        observaciones: 'Corte generado por script de prueba'
    });

    if (status !== 200) {
        err(`HTTP ${status}`);
        info('Respuesta', data);
        throw new Error('Error al ejecutar corte');
    }

    ok(`Corte ejecutado: ${data.message}`);

    // Verificar estado del medidor en BD
    const db = new Database(DB_PATH);
    const med = db.prepare('SELECT estado_servicio, fecha_corte FROM medidores WHERE id = ?').get(creados.medidor_id);
    db.close();
    info('Medidor después del corte', med);
}

// ─── PASO 9: VERIFICAR CANDIDATOS TRAS CORTE ────────────────────────────────
async function verificarTrasCorte() {
    log('PASO 9: GET /cortes/candidatos — verificar estado tras corte');

    const { status, data } = await get('/deudores/candidatos');
    const nuestro = data.candidatos?.find(c => c.cliente?.id === creados.cliente_id);

    if (nuestro) {
        ok(`Cliente sigue en candidatos con accion_sugerida: "${nuestro.accion_sugerida}"`);
        if (nuestro.accion_sugerida === 'Reconexión') {
            ok('Estado correcto: medidor cortado, sugiere reconexión');
        }
    } else {
        info('Todos los candidatos', data.candidatos?.map(c => c.cliente?.nombre));
    }
}

// ─── PASO 10: LIMPIAR DATOS ──────────────────────────────────────────────────
async function limpiar() {
    log('PASO 10: Limpiar datos de prueba');

    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = OFF');

    let eliminados = 0;

    if (creados.factura_ids.length) {
        const r = db.prepare(`DELETE FROM facturas WHERE id IN (${creados.factura_ids.join(',')})`).run();
        eliminados += r.changes;
    }
    if (creados.lectura_ids.length) {
        const r = db.prepare(`DELETE FROM lecturas WHERE id IN (${creados.lectura_ids.join(',')})`).run();
        eliminados += r.changes;
    }
    if (creados.medidor_id) {
        db.prepare(`DELETE FROM cortes_servicio WHERE medidor_id = ?`).run(creados.medidor_id);
        db.prepare(`DELETE FROM medidores WHERE id = ?`).run(creados.medidor_id);
        eliminados++;
    }
    if (creados.tarifa_id) {
        db.prepare(`DELETE FROM rangos_tarifas WHERE tarifa_id = ?`).run(creados.tarifa_id);
        db.prepare(`DELETE FROM tarifas WHERE id = ?`).run(creados.tarifa_id);
        eliminados++;
    }
    if (creados.cliente_id) {
        db.prepare(`DELETE FROM clientes WHERE id = ?`).run(creados.cliente_id);
        eliminados++;
    }

    db.pragma('foreign_keys = ON');
    db.close();

    ok(`${eliminados} registros de prueba eliminados`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  TEST FLUJO COMPLETO: Cliente → Medidor → Facturas → Deudor');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  API: ${API}`);
    console.log(`  DB:  ${DB_PATH}`);
    console.log(`  Umbral configurado en script: ${FACTURAS_PARA_CORTE} facturas`);

    let exitCode = 0;

    try {
        await login();
        await crearCliente();
        await crearTarifa();
        await crearMedidor();
        await insertarFacturasVencidas();
        await simularCron();
        await detectarCandidatos();
        await ejecutarCorte();
        await verificarTrasCorte();
    } catch (e) {
        err(`FALLO: ${e.message}`);
        exitCode = 1;
    } finally {
        // Limpiar siempre, aunque falle
        try {
            await limpiar();
        } catch (cleanErr) {
            err(`Error en limpieza: ${cleanErr.message}`);
        }
    }

    log(exitCode === 0 ? '✅  TEST COMPLETADO EXITOSAMENTE' : '❌  TEST TERMINÓ CON ERRORES');
    process.exit(exitCode);
}

main();
