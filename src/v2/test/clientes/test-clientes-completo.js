// Script de pruebas completo para endpoints de clientes
// Ejecutar: node src/v2/test/clientes/test-clientes-completo.js

import fetch from 'node-fetch';
import readline from 'readline';

const BASE_URL = 'http://localhost:3000/api/v2/clientes';
let APP_TOKEN = 'AppKey eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBfaWQiOiJhYmY4ZjFiNS00ZmFkLTQ1NjctYWIxOC02MWM0NmVjYWEyYjYiLCJpYXQiOjE3NjUzNTQ4NjMsImV4cCI6MTc5Njg5MDg2M30.EW1_A2s_gzF1gGovV0PrmRcSpqUB6mcNoueq2MXybGc'; // Poner aquí: AppKey ey...
let AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywidHlwZSI6InVzZXIiLCJ1c2VybmFtZSI6Ikp1YW5QcnVlYmEiLCJub21icmUiOiJKdWFuIHBydWViYSBnYXJjaWEgY2FsYXIiLCJjb3JyZW8iOiJkb25wcnVlYmFzQGFndWF2cC5jb20iLCJyb2wiOiJvcGVyYWRvciIsImZlY2hhX2NyZWFjaW9uIjoiMjAyNS0xMi0xMCAwODozMjoxMiIsImlhdCI6MTc2NTM1NTcxNiwiZXhwIjoxNzY1MzU2NjE2fQ.XQlmJ7nDyso1a_dX-rtaT4HbG2tu405Ly4E2dwUg9mc'; // Se obtiene del login
let TEST_CLIENT_ID = null;

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

// ====================================
// TESTS INDIVIDUALES
// ====================================

// 1. Registrar Cliente
async function test_registrarCliente() {
    console.log('\n🧪 TEST: Registrar Cliente');
    console.log('Endpoint: POST /api/v2/clientes/registrar\n');
    
    const body = {
        nombre: 'Cliente Prueba ' + Date.now(),
        direccion: 'Av. Principal 123',
        telefono: '555-' + Math.floor(Math.random() * 10000),
        ciudad: 'Bogotá',
        correo: `test${Date.now()}@ejemplo.com`,
        estado_cliente: 'Activo',
        tarifa_id: 3
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
    mostrarRespuesta('Registrar Cliente', response, data);
    
    if (data.cliente_id) {
        TEST_CLIENT_ID = data.cliente_id;
        console.log(`\n✅ Cliente creado con ID: ${TEST_CLIENT_ID}`);
    }
    
    return data;
}

// 2. Listar Clientes
async function test_listarClientes() {
    console.log('\n🧪 TEST: Listar Clientes');
    console.log('Endpoint: GET /api/v2/clientes/listar\n');
    
    const response = await fetch(`${BASE_URL}/listar`, {
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Listar Clientes', response, {
        total: data.clientes?.length || 0,
        primeros_3: data.clientes?.slice(0, 3) || []
    });
    
    console.log(`\n📊 Total de clientes: ${data.clientes?.length || 0}`);
    
    return data;
}

// 3. Modificar Cliente
async function test_modificarCliente() {
    if (!TEST_CLIENT_ID) {
        console.log('❌ No hay un cliente de prueba creado. Ejecuta primero "Registrar Cliente"');
        return;
    }
    
    console.log('\n🧪 TEST: Modificar Cliente');
    console.log(`Endpoint: PUT /api/v2/clientes/modificar/${TEST_CLIENT_ID}\n`);
    
    const body = {
        nombre: 'Cliente Modificado',
        direccion: 'Calle Actualizada 456',
        telefono: '555-9999',
        ciudad: 'Medellín',
        correo: 'modificado@ejemplo.com',
        estado_cliente: 'Activo',
        tarifa_id: 3
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify(body, null, 2));
    
    const response = await fetch(`${BASE_URL}/modificar/${TEST_CLIENT_ID}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Modificar Cliente', response, data);
    
    return data;
}

// 4. Eliminar Cliente (Soft Delete)
async function test_eliminarCliente() {
    if (!TEST_CLIENT_ID) {
        console.log('❌ No hay un cliente de prueba creado. Ejecuta primero "Registrar Cliente"');
        return;
    }
    
    console.log('\n🧪 TEST: Eliminar Cliente (Soft Delete)');
    console.log(`Endpoint: DELETE /api/v2/clientes/${TEST_CLIENT_ID}/eliminar\n`);
    
    const body = {
        razon: 'Prueba de eliminación - Cliente duplicado'
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify(body, null, 2));
    
    const response = await fetch(`${BASE_URL}/${TEST_CLIENT_ID}/eliminar`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Eliminar Cliente', response, data);
    
    return data;
}

// 5. Obtener Clientes Eliminados
async function test_obtenerEliminados() {
    console.log('\n🧪 TEST: Obtener Clientes Eliminados');
    console.log('Endpoint: GET /api/v2/clientes/eliminados\n');
    
    const response = await fetch(`${BASE_URL}/eliminados`, {
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Clientes Eliminados', response, data);
    
    if (data.clientes_eliminados?.length > 0) {
        console.log('\n📋 Clientes Eliminados:');
        data.clientes_eliminados.forEach((c, i) => {
            console.log(`\n${i + 1}. ID: ${c.id} - ${c.nombre}`);
            console.log(`   Razón: ${c.razon_eliminacion || 'N/A'}`);
            console.log(`   Eliminado: ${c.fecha_eliminacion || 'N/A'}`);
            console.log(`   Por: ${c.eliminado_por_nombre || 'N/A'}`);
            console.log(`   Facturas: ${c.total_facturas || 0} | Medidores: ${c.total_medidores || 0}`);
        });
    }
    
    return data;
}

// 6. Restaurar Cliente
async function test_restaurarCliente() {
    if (!TEST_CLIENT_ID) {
        console.log('❌ No hay un cliente de prueba. Ingresa el ID manualmente:');
        TEST_CLIENT_ID = parseInt(await pregunta('ID del cliente a restaurar: '));
    }
    
    console.log('\n🧪 TEST: Restaurar Cliente');
    console.log(`Endpoint: PUT /api/v2/clientes/${TEST_CLIENT_ID}/restaurar\n`);
    
    const response = await fetch(`${BASE_URL}/${TEST_CLIENT_ID}/restaurar`, {
        method: 'PUT',
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Restaurar Cliente', response, data);
    
    return data;
}

// 7. Estadísticas de Clientes
async function test_estadisticas() {
    console.log('\n🧪 TEST: Estadísticas de Clientes');
    console.log('Endpoint: GET /api/v2/clientes/estadisticas\n');
    
    const response = await fetch(`${BASE_URL}/estadisticas`, {
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Estadísticas', response, data);
    
    if (data.resumen) {
        console.log('\n📊 Resumen:');
        console.log(`   Total clientes: ${data.resumen.total_clientes}`);
        console.log(`   Activos: ${data.resumen.clientes_activos}`);
        console.log(`   Inactivos: ${data.resumen.clientes_inactivos}`);
        console.log(`   Con medidores: ${data.resumen.clientes_con_medidores}`);
        console.log(`   Sin medidores: ${data.resumen.clientes_sin_medidores}`);
    }
    
    return data;
}

// ====================================
// FLUJO COMPLETO DE SOFT DELETE
// ====================================
async function test_flujoCompleto() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 FLUJO COMPLETO: Soft Delete');
    console.log('='.repeat(60));
    
    try {
        // 1. Crear cliente
        console.log('\n1️⃣  Creando cliente de prueba...');
        await test_registrarCliente();
        await esperar(1000);
        
        // 2. Eliminar (soft delete)
        console.log('\n2️⃣  Eliminando cliente (soft delete)...');
        await test_eliminarCliente();
        await esperar(1000);
        
        // 3. Verificar en lista de eliminados
        console.log('\n3️⃣  Verificando lista de eliminados...');
        await test_obtenerEliminados();
        await esperar(1000);
        
        // 4. Restaurar
        console.log('\n4️⃣  Restaurando cliente...');
        await test_restaurarCliente();
        await esperar(1000);
        
        // 5. Verificar restauración
        console.log('\n5️⃣  Verificando restauración...');
        const clientes = await test_listarClientes();
        const cliente = clientes.clientes?.find(c => c.id === TEST_CLIENT_ID);
        
        if (cliente?.estado_cliente === 'Activo') {
            console.log('\n✅ FLUJO COMPLETADO - Cliente restaurado correctamente');
        } else {
            console.log('\n⚠️  ADVERTENCIA - Estado del cliente:', cliente?.estado_cliente);
        }
        
    } catch (error) {
        console.error('\n❌ ERROR en flujo completo:', error.message);
    }
}

// ====================================
// MENÚ PRINCIPAL
// ====================================
async function mostrarMenu() {
    console.clear();
    console.log('\n' + '='.repeat(60));
    console.log('🧪 SUITE DE PRUEBAS - CLIENTES V2');
    console.log('='.repeat(60));
    console.log('\n📋 ENDPOINTS DISPONIBLES:\n');
    console.log('1.  POST   /registrar          - Registrar nuevo cliente');
    console.log('2.  GET    /listar             - Listar todos los clientes');
    console.log('3.  PUT    /modificar/:id      - Modificar cliente');
    console.log('4.  DELETE /:id/eliminar       - Eliminar cliente (soft delete)');
    console.log('5.  GET    /eliminados         - Obtener clientes eliminados');
    console.log('6.  PUT    /:id/restaurar      - Restaurar cliente eliminado');
    console.log('7.  GET    /estadisticas       - Obtener estadísticas');
    console.log('\n🔄 FLUJOS COMPLETOS:\n');
    console.log('8.  Flujo completo de Soft Delete');
    console.log('\n⚙️  CONFIGURACIÓN:\n');
    console.log('9.  Establecer APP_TOKEN');
    console.log('10. Establecer AUTH_TOKEN');
    console.log('11. Establecer TEST_CLIENT_ID');
    console.log('\n0.  Salir\n');
    console.log('─'.repeat(60));
    console.log(`App Token: ${APP_TOKEN ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`Auth Token: ${AUTH_TOKEN ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`Test Client ID: ${TEST_CLIENT_ID || 'No establecido'}`);
    console.log('─'.repeat(60));
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ejecutarOpcion(opcion) {
    switch(opcion) {
        case '1': await test_registrarCliente(); break;
        case '2': await test_listarClientes(); break;
        case '3': await test_modificarCliente(); break;
        case '4': await test_eliminarCliente(); break;
        case '5': await test_obtenerEliminados(); break;
        case '6': await test_restaurarCliente(); break;
        case '7': await test_estadisticas(); break;
        case '8': await test_flujoCompleto(); break;
        case '9': 
            APP_TOKEN = await pregunta('Ingresa APP_TOKEN (AppKey ey...): ');
            console.log('✅ APP_TOKEN configurado');
            break;
        case '10': 
            AUTH_TOKEN = await pregunta('Ingresa AUTH_TOKEN (Bearer ey...): ');
            console.log('✅ AUTH_TOKEN configurado');
            break;
        case '11': 
            TEST_CLIENT_ID = parseInt(await pregunta('Ingresa TEST_CLIENT_ID: '));
            console.log('✅ TEST_CLIENT_ID configurado');
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
    console.log('\n🚀 Iniciando suite de pruebas...\n');
    
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
