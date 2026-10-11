// Script de pruebas completo para endpoints de medidores
// Ejecutar: node src/v2/test/mediores/test-medidores-completo.js

import fetch from 'node-fetch';
import readline from 'readline';

const BASE_URL = 'http://localhost:3000/api/v2/medidores';
let APP_TOKEN = 'AppKey eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBfaWQiOiJhYmY4ZjFiNS00ZmFkLTQ1NjctYWIxOC02MWM0NmVjYWEyYjYiLCJpYXQiOjE3NjUzNTQ4NjMsImV4cCI6MTc5Njg5MDg2M30.EW1_A2s_gzF1gGovV0PrmRcSpqUB6mcNoueq2MXybGc';
let AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywidHlwZSI6InVzZXIiLCJ1c2VybmFtZSI6Ikp1YW5QcnVlYmEiLCJub21icmUiOiJKdWFuIHBydWViYSBnYXJjaWEgY2FsYXIiLCJjb3JyZW8iOiJkb25wcnVlYmFzQGFndWF2cC5jb20iLCJyb2wiOiJvcGVyYWRvciIsImZlY2hhX2NyZWFjaW9uIjoiMjAyNS0xMi0xMCAwODozMjoxMiIsImlhdCI6MTc2NTM1NTcxNiwiZXhwIjoxNzY1MzU2NjE2fQ.XQlmJ7nDyso1a_dX-rtaT4HbG2tu405Ly4E2dwUg9mc';
let TEST_MEDIDOR_ID = null;
let TEST_CLIENTE_ID = null; // Para asignar medidores

// Configuración de readline para menú interactivo
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Utilidad para hacer preguntas
function pregunta(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Utilidad para mostrar respuestas HTTP detalladas
function mostrarRespuesta(titulo, response, data) {
    console.log('\n' + '─'.repeat(60));
    console.log(`📡 ${titulo}`);
    console.log('─'.repeat(60));
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    console.log('\n📦 Body:');
    console.log(JSON.stringify(data, null, 2));
    console.log('─'.repeat(60));
}

// Utilidad para generar coordenadas aleatorias (Colombia)
function generarCoordenadas() {
    // Coordenadas aproximadas de Colombia
    const latitud = (4.5 + Math.random() * 6).toFixed(6);  // Entre 4.5 y 10.5
    const longitud = (-77 + Math.random() * 4).toFixed(6); // Entre -77 y -73
    return { latitud, longitud };
}

// ====================================
// TESTS INDIVIDUALES
// ====================================

// 1. Registrar Medidor
async function test_registrarMedidor() {
    console.log('\n🧪 TEST: Registrar Medidor');
    console.log('Endpoint: POST /api/v2/medidores/registrar\n');
    
    const coords = generarCoordenadas();
    const numero_serie = `MED-${Date.now()}`;
    
    const body = {
        cliente_id: TEST_CLIENTE_ID || null,
        numero_serie: numero_serie,
        ubicacion: 'Calle Principal #123, Sector Norte',
        fecha_instalacion: new Date().toISOString().split('T')[0],
        latitud: coords.latitud,
        longitud: coords.longitud,
        estado_medidor: 'Activo'
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify(body, null, 2));
    
    const response = await fetch(`${BASE_URL}/registrar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Registrar Medidor', response, data);
    
    if (data.medidorID) {
        TEST_MEDIDOR_ID = data.medidorID;
        console.log(`\n✅ Medidor creado con ID: ${TEST_MEDIDOR_ID}`);
        console.log(`   Número de serie: ${numero_serie}`);
        console.log(`   Coordenadas: ${coords.latitud}, ${coords.longitud}`);
    }
    
    return data;
}

// 2. Listar Medidores
async function test_listarMedidores() {
    console.log('\n🧪 TEST: Listar Medidores');
    console.log('Endpoint: GET /api/v2/medidores/listar\n');
    
    const response = await fetch(`${BASE_URL}/listar`, {
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    
    // Mostrar resumen si hay muchos medidores
    const medidores = Array.isArray(data) ? data : [];
    const resumen = {
        total: medidores.length,
        activos: medidores.filter(m => m.estado_medidor === 'Activo').length,
        inactivos: medidores.filter(m => m.estado_medidor === 'Inactivo').length,
        con_cliente: medidores.filter(m => m.cliente_id !== null).length,
        sin_cliente: medidores.filter(m => m.cliente_id === null).length,
        primeros_3: medidores.slice(0, 3)
    };
    
    mostrarRespuesta('Listar Medidores', response, resumen);
    
    console.log('\n📊 Estadísticas:');
    console.log(`   Total de medidores: ${resumen.total}`);
    console.log(`   Activos: ${resumen.activos}`);
    console.log(`   Inactivos: ${resumen.inactivos}`);
    console.log(`   Con cliente asignado: ${resumen.con_cliente}`);
    console.log(`   Sin cliente asignado: ${resumen.sin_cliente}`);
    
    return data;
}

// 3. Modificar Medidor
async function test_modificarMedidor() {
    if (!TEST_MEDIDOR_ID) {
        console.log('❌ No hay un medidor de prueba creado. Ejecuta primero "Registrar Medidor"');
        return;
    }
    
    console.log('\n🧪 TEST: Modificar Medidor');
    console.log(`Endpoint: PUT /api/v2/medidores/modificar/${TEST_MEDIDOR_ID}\n`);
    
    const coords = generarCoordenadas();
    
    const body = {
        ubicacion: 'Av. Modificada #456, Sector Sur',
        latitud: coords.latitud,
        longitud: coords.longitud,
        estado_medidor: 'Activo'
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify(body, null, 2));
    
    const response = await fetch(`${BASE_URL}/modificar/${TEST_MEDIDOR_ID}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Modificar Medidor', response, data);
    
    console.log('\n✅ Cambios aplicados:');
    console.log(`   Nueva ubicación: ${body.ubicacion}`);
    console.log(`   Nuevas coordenadas: ${coords.latitud}, ${coords.longitud}`);
    
    return data;
}

// 4. Asignar Cliente a Medidor
async function test_asignarCliente() {
    if (!TEST_MEDIDOR_ID) {
        console.log('❌ No hay un medidor de prueba. Ejecuta primero "Registrar Medidor"');
        return;
    }
    
    if (!TEST_CLIENTE_ID) {
        const cliente_id = await pregunta('Ingresa el ID del cliente a asignar: ');
        TEST_CLIENTE_ID = parseInt(cliente_id);
    }
    
    console.log('\n🧪 TEST: Asignar Cliente a Medidor');
    console.log(`Endpoint: PUT /api/v2/medidores/modificar/${TEST_MEDIDOR_ID}\n`);
    
    const body = {
        cliente_id: TEST_CLIENTE_ID
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify(body, null, 2));
    
    const response = await fetch(`${BASE_URL}/modificar/${TEST_MEDIDOR_ID}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Asignar Cliente', response, data);
    
    if (response.ok) {
        console.log(`\n✅ Cliente ${TEST_CLIENTE_ID} asignado al medidor ${TEST_MEDIDOR_ID}`);
    }
    
    return data;
}

// 5. Liberar Medidor (quitar cliente)
async function test_liberarMedidor() {
    if (!TEST_MEDIDOR_ID) {
        console.log('❌ No hay un medidor de prueba. Ejecuta primero "Registrar Medidor"');
        return;
    }
    
    console.log('\n🧪 TEST: Liberar Medidor (Quitar Cliente)');
    console.log(`Endpoint: PUT /api/v2/medidores/modificar/${TEST_MEDIDOR_ID}\n`);
    
    const body = {
        cliente_id: null
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify(body, null, 2));
    
    const response = await fetch(`${BASE_URL}/modificar/${TEST_MEDIDOR_ID}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Liberar Medidor', response, data);
    
    if (response.ok) {
        console.log(`\n✅ Medidor ${TEST_MEDIDOR_ID} liberado (sin cliente asignado)`);
    }
    
    return data;
}

// 6. Cambiar Estado del Medidor
async function test_cambiarEstado() {
    if (!TEST_MEDIDOR_ID) {
        console.log('❌ No hay un medidor de prueba. Ejecuta primero "Registrar Medidor"');
        return;
    }
    
    console.log('\n🧪 TEST: Cambiar Estado del Medidor');
    console.log(`Endpoint: PUT /api/v2/medidores/modificar/${TEST_MEDIDOR_ID}\n`);
    
    console.log('Estados disponibles: Activo, Inactivo, Mantenimiento, Dañado');
    const estado = await pregunta('Ingresa el nuevo estado (o presiona Enter para "Inactivo"): ');
    
    const body = {
        estado_medidor: estado || 'Inactivo'
    };
    
    console.log('\n📤 Request Body:');
    console.log(JSON.stringify(body, null, 2));
    
    const response = await fetch(`${BASE_URL}/modificar/${TEST_MEDIDOR_ID}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Cambiar Estado', response, data);
    
    if (response.ok) {
        console.log(`\n✅ Estado del medidor cambiado a: ${body.estado_medidor}`);
    }
    
    return data;
}

// 7. Buscar Medidor por ID
async function test_buscarMedidor() {
    let medidor_id = TEST_MEDIDOR_ID;
    
    if (!medidor_id) {
        medidor_id = parseInt(await pregunta('Ingresa el ID del medidor a buscar: '));
    }
    
    console.log('\n🧪 TEST: Buscar Medidor por ID');
    console.log(`Buscando medidor ID: ${medidor_id}\n`);
    
    const response = await fetch(`${BASE_URL}/listar`, {
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const medidores = await response.json();
    const medidor = Array.isArray(medidores) 
        ? medidores.find(m => m.id === medidor_id)
        : null;
    
    if (medidor) {
        mostrarRespuesta('Medidor Encontrado', response, medidor);
        
        console.log('\n📋 Detalles del Medidor:');
        console.log(`   ID: ${medidor.id}`);
        console.log(`   Número de Serie: ${medidor.numero_serie}`);
        console.log(`   Ubicación: ${medidor.ubicacion}`);
        console.log(`   Estado: ${medidor.estado_medidor}`);
        console.log(`   Cliente ID: ${medidor.cliente_id || 'Sin asignar'}`);
        console.log(`   Coordenadas: ${medidor.latitud}, ${medidor.longitud}`);
        console.log(`   Fecha Instalación: ${medidor.fecha_instalacion}`);
    } else {
        console.log(`\n❌ Medidor con ID ${medidor_id} no encontrado`);
    }
    
    return medidor;
}

// ====================================
// FLUJOS COMPLETOS
// ====================================

// Flujo 1: Ciclo completo de medidor
async function test_flujoCompleto() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 FLUJO COMPLETO: Ciclo de Vida del Medidor');
    console.log('='.repeat(60));
    
    try {
        // 1. Crear medidor
        console.log('\n1️⃣  Creando medidor de prueba...');
        await test_registrarMedidor();
        await esperar(1000);
        
        // 2. Listar medidores
        console.log('\n2️⃣  Listando medidores...');
        await test_listarMedidores();
        await esperar(1000);
        
        // 3. Modificar ubicación
        console.log('\n3️⃣  Modificando ubicación del medidor...');
        await test_modificarMedidor();
        await esperar(1000);
        
        // 4. Buscar medidor
        console.log('\n4️⃣  Verificando cambios...');
        await test_buscarMedidor();
        
        console.log('\n✅ FLUJO COMPLETADO - Medidor gestionado correctamente');
        
    } catch (error) {
        console.error('\n❌ ERROR en flujo completo:', error.message);
    }
}

// Flujo 2: Gestión de asignación de cliente
async function test_flujoAsignacion() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 FLUJO COMPLETO: Asignación de Cliente');
    console.log('='.repeat(60));
    
    try {
        // 1. Verificar o crear medidor
        if (!TEST_MEDIDOR_ID) {
            console.log('\n1️⃣  Creando medidor de prueba...');
            await test_registrarMedidor();
            await esperar(1000);
        }
        
        // 2. Asignar cliente
        console.log('\n2️⃣  Asignando cliente al medidor...');
        await test_asignarCliente();
        await esperar(1000);
        
        // 3. Verificar asignación
        console.log('\n3️⃣  Verificando asignación...');
        await test_buscarMedidor();
        await esperar(1000);
        
        // 4. Liberar medidor
        console.log('\n4️⃣  Liberando medidor...');
        await test_liberarMedidor();
        await esperar(1000);
        
        // 5. Verificar liberación
        console.log('\n5️⃣  Verificando liberación...');
        await test_buscarMedidor();
        
        console.log('\n✅ FLUJO COMPLETADO - Asignación/Liberación exitosa');
        
    } catch (error) {
        console.error('\n❌ ERROR en flujo de asignación:', error.message);
    }
}

// ====================================
// MENÚ PRINCIPAL
// ====================================
async function mostrarMenu() {
    console.clear();
    console.log('\n' + '='.repeat(60));
    console.log('🧪 SUITE DE PRUEBAS - MEDIDORES V2');
    console.log('='.repeat(60));
    console.log('\n📋 ENDPOINTS DISPONIBLES:\n');
    console.log('1.  POST   /registrar          - Registrar nuevo medidor');
    console.log('2.  GET    /listar             - Listar todos los medidores');
    console.log('3.  PUT    /modificar/:id      - Modificar medidor');
    console.log('\n🔧 OPERACIONES ESPECIALES:\n');
    console.log('4.  Asignar Cliente            - Asignar cliente a medidor');
    console.log('5.  Liberar Medidor            - Quitar cliente del medidor');
    console.log('6.  Cambiar Estado             - Cambiar estado del medidor');
    console.log('7.  Buscar Medidor             - Buscar medidor por ID');
    console.log('\n🔄 FLUJOS COMPLETOS:\n');
    console.log('8.  Flujo Ciclo de Vida        - Crear → Modificar → Verificar');
    console.log('9.  Flujo Asignación           - Asignar → Verificar → Liberar');
    console.log('\n⚙️  CONFIGURACIÓN:\n');
    console.log('10. Establecer APP_TOKEN');
    console.log('11. Establecer AUTH_TOKEN');
    console.log('12. Establecer TEST_MEDIDOR_ID');
    console.log('13. Establecer TEST_CLIENTE_ID');
    console.log('\n0.  Salir\n');
    console.log('─'.repeat(60));
    console.log(`App Token: ${APP_TOKEN ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`Auth Token: ${AUTH_TOKEN ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`Test Medidor ID: ${TEST_MEDIDOR_ID || 'No establecido'}`);
    console.log(`Test Cliente ID: ${TEST_CLIENTE_ID || 'No establecido'}`);
    console.log('─'.repeat(60));
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ejecutarOpcion(opcion) {
    switch(opcion) {
        case '1': await test_registrarMedidor(); break;
        case '2': await test_listarMedidores(); break;
        case '3': await test_modificarMedidor(); break;
        case '4': await test_asignarCliente(); break;
        case '5': await test_liberarMedidor(); break;
        case '6': await test_cambiarEstado(); break;
        case '7': await test_buscarMedidor(); break;
        case '8': await test_flujoCompleto(); break;
        case '9': await test_flujoAsignacion(); break;
        case '10': 
            APP_TOKEN = await pregunta('Ingresa APP_TOKEN (AppKey ey...): ');
            console.log('✅ APP_TOKEN configurado');
            break;
        case '11': 
            AUTH_TOKEN = await pregunta('Ingresa AUTH_TOKEN (ey...): ');
            console.log('✅ AUTH_TOKEN configurado');
            break;
        case '12': 
            TEST_MEDIDOR_ID = parseInt(await pregunta('Ingresa TEST_MEDIDOR_ID: '));
            console.log('✅ TEST_MEDIDOR_ID configurado');
            break;
        case '13': 
            TEST_CLIENTE_ID = parseInt(await pregunta('Ingresa TEST_CLIENTE_ID: '));
            console.log('✅ TEST_CLIENTE_ID configurado');
            break;
        case '0':
            console.log('\n👋 Saliendo...\n');
            rl.close();
            process.exit(0);
        default:
            console.log('❌ Opción no válida');
    }
}

// ====================================
// INICIO
// ====================================
async function main() {
    console.log('\n🚀 Iniciando suite de pruebas de medidores...\n');
    
    while (true) {
        await mostrarMenu();
        const opcion = await pregunta('Selecciona una opción: ');
        
        await ejecutarOpcion(opcion);
        
        if (opcion !== '0') {
            await pregunta('\n⏎ Presiona ENTER para continuar...');
        }
    }
}

main();
