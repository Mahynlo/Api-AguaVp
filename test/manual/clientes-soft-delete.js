// Script de prueba para soft delete de clientes
// Ejecutar después de iniciar el servidor con: npm run dev

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api/v2/clientes';
let APP_TOKEN = 'AppKey eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBfaWQiOiJhYmY4ZjFiNS00ZmFkLTQ1NjctYWIxOC02MWM0NmVjYWEyYjYiLCJpYXQiOjE3NjUzNTQ4NjMsImV4cCI6MTc5Njg5MDg2M30.EW1_A2s_gzF1gGovV0PrmRcSpqUB6mcNoueq2MXybGc'; // Poner aquí: AppKey ey...
let AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywidHlwZSI6InVzZXIiLCJ1c2VybmFtZSI6Ikp1YW5QcnVlYmEiLCJub21icmUiOiJKdWFuIHBydWViYSBnYXJjaWEgY2FsYXIiLCJjb3JyZW8iOiJkb25wcnVlYmFzQGFndWF2cC5jb20iLCJyb2wiOiJvcGVyYWRvciIsImZlY2hhX2NyZWFjaW9uIjoiMjAyNS0xMi0xMCAwODozMjoxMiIsImlhdCI6MTc2NTM1NTcxNiwiZXhwIjoxNzY1MzU2NjE2fQ.XQlmJ7nDyso1a_dX-rtaT4HbG2tu405Ly4E2dwUg9mc'; // Se obtiene del login
let TEST_CLIENT_ID = 19;



// ====================================
// 2. CREAR CLIENTE DE PRUEBA
// ====================================
async function crearClientePrueba() {
    console.log('\n📝 2. CREAR CLIENTE DE PRUEBA...');
    const response = await fetch(`${BASE_URL}/registrar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify({
            nombre: 'Cliente Test Soft Delete',
            direccion: 'Calle Test 123',
            telefono: '555-TEST',
            ciudad: 'Ciudad Test',
            correo: 'test@softdelete.com',
            estado_cliente: 'Activo',
            tarifa_id: 3
        })
    });
    
    const data = await response.json();
    if (data.cliente_id) {
        TEST_CLIENT_ID = data.cliente_id;
        console.log(`✅ Cliente creado con ID: ${TEST_CLIENT_ID}`);
        return true;
    } else {
        console.log('❌ Error al crear cliente:', data);
        return false;
    }
}

// ====================================
// 3. ELIMINAR CLIENTE (SOFT DELETE)
// ====================================
async function eliminarCliente() {
    console.log('\n🗑️  3. ELIMINAR CLIENTE (SOFT DELETE)...');
    const response = await fetch(`${BASE_URL}/${TEST_CLIENT_ID}/eliminar`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify({
            razon: 'Prueba de soft delete'
        })
    });
    
    const data = await response.json();
    console.log('Respuesta:', data);
    
    if (response.ok) {
        console.log('✅ Cliente eliminado correctamente');
        return true;
    } else {
        console.log('❌ Error:', data.error);
        return false;
    }
}

// ====================================
// 4. OBTENER CLIENTES ELIMINADOS
// ====================================
async function obtenerEliminados() {
    console.log('\n📋 4. OBTENER CLIENTES ELIMINADOS...');
    const response = await fetch(`${BASE_URL}/eliminados`, {
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    console.log(`Total eliminados: ${data.total}`);
    
    if (data.clientes_eliminados && data.clientes_eliminados.length > 0) {
        console.log('\nClientes eliminados:');
        data.clientes_eliminados.forEach(c => {
            console.log(`  - ID: ${c.id} | ${c.nombre} | Razón: ${c.razon_eliminacion}`);
        });
        console.log('✅ Lista obtenida correctamente');
        return true;
    } else {
        console.log('⚠️  No hay clientes eliminados');
        return true;
    }
}

// ====================================
// 5. RESTAURAR CLIENTE
// ====================================
async function restaurarCliente() {
    console.log('\n♻️  5. RESTAURAR CLIENTE...');
    const response = await fetch(`${BASE_URL}/${TEST_CLIENT_ID}/restaurar`, {
        method: 'PUT',
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    console.log('Respuesta:', data);
    
    if (response.ok) {
        console.log('✅ Cliente restaurado correctamente');
        return true;
    } else {
        console.log('❌ Error:', data.error);
        return false;
    }
}

// ====================================
// 6. VERIFICAR RESTAURACIÓN
// ====================================
async function verificarRestauracion() {
    console.log('\n🔍 6. VERIFICAR RESTAURACIÓN...');
    const response = await fetch(`${BASE_URL}/listar`, {
        headers: {
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    const cliente = data.clientes.find(c => c.id === TEST_CLIENT_ID);
    
    if (cliente) {
        console.log(`Cliente encontrado: ${cliente.nombre}`);
        console.log(`Estado: ${cliente.estado_cliente}`);
        
        if (cliente.estado_cliente === 'Activo') {
            console.log('✅ Cliente restaurado a estado Activo');
            return true;
        } else {
            console.log(`⚠️  Estado incorrecto: ${cliente.estado_cliente}`);
            return false;
        }
    } else {
        console.log('❌ Cliente no encontrado');
        return false;
    }
}

// ====================================
// 7. LIMPIEZA (Eliminar cliente de prueba)
// ====================================
async function limpiar() {
    console.log('\n🧹 7. LIMPIEZA - Eliminando cliente de prueba...');
    await fetch(`${BASE_URL}/${TEST_CLIENT_ID}/eliminar`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify({
            razon: 'Limpieza después de pruebas'
        })
    });
    console.log('✅ Limpieza completada');
}

// ====================================
// EJECUTAR TODAS LAS PRUEBAS
// ====================================
async function ejecutarPruebas() {
    console.log('='.repeat(60));
    console.log('🧪 PRUEBAS DE SOFT DELETE PARA CLIENTES');
    console.log('='.repeat(60));
    
    try {
        
        //if (!await crearClientePrueba()) return;
        //if (!await eliminarCliente()) return;
        if (!await obtenerEliminados()) return;
        //if (!await restaurarCliente()) return;
        //if (!await verificarRestauracion()) return;
        await limpiar();
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE');
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        console.error('\n❌ ERROR EN PRUEBAS:', error.message);
    }
}

// Ejecutar
ejecutarPruebas();
