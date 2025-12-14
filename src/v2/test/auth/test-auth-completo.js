// Script de pruebas completo para autenticación (App y Usuarios)
// Ejecutar: node src/v2/test/auth/test-auth-completo.js

import fetch from 'node-fetch';
import readline from 'readline';

const BASE_URL_AUTH = 'http://localhost:3000/api/v2/auth';
const BASE_URL_APP = 'http://localhost:3000/api/v2/app';

// Tokens y credenciales
let APP_TOKEN = 'AppKey eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBfaWQiOiJhYmY4ZjFiNS00ZmFkLTQ1NjctYWIxOC02MWM0NmVjYWEyYjYiLCJpYXQiOjE3NjUzNTQ4NjMsImV4cCI6MTc5Njg5MDg2M30.EW1_A2s_gzF1gGovV0PrmRcSpqUB6mcNoueq2MXybGc';
let AUTH_TOKEN = '';
let REFRESH_TOKEN = '';
let TEST_USER = {
    correo: '',
    username: '',
    contrasena: '',
    nombre: '',
    rol: '',
    id: null
};

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
// TESTS DE APLICACIÓN (App)
// ====================================

// 1. Registrar App (requiere APPKEY_INICIAL)
async function test_registrarApp() {
    console.log('\n🧪 TEST: Registrar Aplicación');
    console.log('Endpoint: POST /api/v2/app/registrarApp\n');
    console.log('⚠️  Este endpoint requiere el AppKey inicial del sistema');
    
    const appkey_inicial = await pregunta('Ingresa el APPKEY_INICIAL del sistema: ');
    const nombre_app = await pregunta('Ingresa el nombre de la aplicación: ');
    
    const body = {
        nombre: nombre_app || 'Aplicación de Prueba'
    };
    
    console.log('\n📤 Request Body:');
    console.log(JSON.stringify(body, null, 2));
    
    const response = await fetch(`${BASE_URL_APP}/registrarApp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': `AppKey ${appkey_inicial}`
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Registrar Aplicación', response, data);
    
    if (data.token) {
        console.log('\n✅ Aplicación registrada exitosamente');
        console.log(`   App ID: ${data.app_id}`);
        console.log(`   Token: ${data.token}`);
        console.log('\n🔐 Puedes usar este token como APP_TOKEN en las pruebas');
        
        const usar = await pregunta('\n¿Usar este token ahora? (s/n): ');
        if (usar.toLowerCase() === 's') {
            APP_TOKEN = `AppKey ${data.token}`;
            console.log('✅ APP_TOKEN actualizado');
        }
    }
    
    return data;
}

// 2. Recuperar Token de App
async function test_recuperarTokenApp() {
    console.log('\n🧪 TEST: Recuperar Token de Aplicación');
    console.log('Endpoint: POST /api/v2/app/recuperarToken\n');
    console.log(`Usando APP_TOKEN actual: ${APP_TOKEN ? 'Configurado' : 'No configurado'}\n`);
    
    if (!APP_TOKEN) {
        console.log('❌ No hay APP_TOKEN configurado');
        return;
    }
    
    const response = await fetch(`${BASE_URL_APP}/recuperarToken`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Recuperar Token App', response, data);
    
    if (data.nuevo_token) {
        console.log('\n✅ Token de aplicación renovado');
        console.log(`   Nuevo Token: ${data.nuevo_token}`);
        
        const usar = await pregunta('\n¿Actualizar APP_TOKEN con el nuevo? (s/n): ');
        if (usar.toLowerCase() === 's') {
            APP_TOKEN = `AppKey ${data.nuevo_token}`;
            console.log('✅ APP_TOKEN actualizado');
        }
    }
    
    return data;
}

// 3. Obtener Versión de la API
async function test_obtenerVersion() {
    console.log('\n🧪 TEST: Obtener Versión de la API');
    console.log('Endpoint: GET /api/v2/app/version\n');
    
    const response = await fetch(`${BASE_URL_APP}/version`, {
        headers: {
            'x-app-key': APP_TOKEN
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Versión de la API', response, data);
    
    if (data.version) {
        console.log('\n📊 Información del Sistema:');
        console.log(`   Versión API: ${data.api_version}`);
        console.log(`   Base de datos: ${data.database}`);
        console.log(`   Sistema en tiempo real: ${data.realtime}`);
        console.log(`   Ambiente: ${data.environment}`);
        
        if (data.features) {
            console.log(`\n🎯 Características disponibles (${data.features.length}):`);
            data.features.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        }
    }
    
    return data;
}

// 4. Verificar Estado de la API
async function test_verificarEstado() {
    console.log('\n🧪 TEST: Verificar Estado de la API');
    console.log('Endpoint: GET /api/v2/app/status\n');
    
    const response = await fetch(`${BASE_URL_APP}/status`, {
        headers: {
            'x-app-key': APP_TOKEN
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Estado de la API', response, data);
    
    if (data.status) {
        console.log('\n📊 Estado del Sistema:');
        console.log(`   Estado general: ${data.status}`);
        
        if (data.services) {
            console.log(`\n🔧 Servicios:`);
            console.log(`   API: ${data.services.api}`);
            console.log(`   Base de datos: ${data.services.database}`);
            console.log(`   SSE: ${data.services.sse}`);
        }
        
        if (data.uptime) {
            const uptime = Math.floor(data.uptime);
            const horas = Math.floor(uptime / 3600);
            const minutos = Math.floor((uptime % 3600) / 60);
            console.log(`\n⏱️  Uptime: ${horas}h ${minutos}m`);
        }
    }
    
    return data;
}

// ====================================
// TESTS DE AUTENTICACIÓN (Usuarios)
// ====================================

// 5. Registrar Usuario
async function test_registrarUsuario() {
    console.log('\n🧪 TEST: Registrar Usuario');
    console.log('Endpoint: POST /api/v2/auth/register\n');
    
    const timestamp = Date.now();
    const body = {
        correo: `test${timestamp}@aguavp.com`,
        nombre: `Usuario Prueba ${timestamp}`,
        contrasena: 'Password123!@#',
        username: `user_test_${timestamp}`,
        rol: 'operador'
    };
    
    // Guardar datos para login posterior
    TEST_USER = body;
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify({...body, contrasena: '***OCULTA***'}, null, 2));
    console.log(`\n🔐 Contraseña: ${body.contrasena}`);
    
    const response = await fetch(`${BASE_URL_AUTH}/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Registrar Usuario', response, data);
    
    if (data.usuario_id) {
        TEST_USER.id = data.usuario_id;
        console.log(`\n✅ Usuario registrado con ID: ${TEST_USER.id}`);
        console.log(`   Correo: ${TEST_USER.correo}`);
        console.log(`   Username: ${TEST_USER.username}`);
        console.log(`   Rol: ${TEST_USER.rol}`);
    }
    
    return data;
}

// 6. Login de Usuario
async function test_loginUsuario() {
    console.log('\n🧪 TEST: Login de Usuario');
    console.log('Endpoint: POST /api/v2/auth/login\n');
    
    // Si no hay usuario de prueba, solicitar credenciales
    if (!TEST_USER.correo) {
        TEST_USER.correo = await pregunta('Correo del usuario: ');
        TEST_USER.contrasena = await pregunta('Contraseña: ');
    }
    
    const body = {
        correo: TEST_USER.correo,
        contraseña: TEST_USER.contrasena,
        dispositivo: 'Test Suite - Node.js'
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify({...body, contraseña: '***OCULTA***'}, null, 2));
    
    const response = await fetch(`${BASE_URL_AUTH}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Login Usuario', response, data);
    
    if (data.accessToken) {
        AUTH_TOKEN = data.accessToken;
        REFRESH_TOKEN = data.refreshToken || '';
        TEST_USER.id = data.user?.id;
        
        console.log('\n✅ Login exitoso');
        console.log(`   Access Token: ${AUTH_TOKEN.substring(0, 20)}...`);
        if (REFRESH_TOKEN) {
            console.log(`   Refresh Token: ${REFRESH_TOKEN.substring(0, 20)}...`);
        }
        console.log(`   Expira en: ${data.expiresIn || '15m'}`);
        console.log(`   Usuario: ${data.user?.nombre} (${data.user?.rol})`);
    }
    
    return data;
}

// 7. Obtener Sesiones Activas
async function test_sesionesActivas() {
    console.log('\n🧪 TEST: Obtener Sesiones Activas');
    
    if (!TEST_USER.id) {
        const user_id = await pregunta('Ingresa el ID del usuario: ');
        TEST_USER.id = parseInt(user_id);
    }
    
    console.log(`Endpoint: GET /api/v2/auth/sesionesActivas/${TEST_USER.id}\n`);
    
    const response = await fetch(`${BASE_URL_AUTH}/sesionesActivas/${TEST_USER.id}`, {
        headers: {
            'x-app-key': APP_TOKEN
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Sesiones Activas', response, data);
    
    if (data.sesiones) {
        console.log(`\n📊 Total de sesiones: ${data.sesiones.length}`);
        data.sesiones.forEach((s, i) => {
            console.log(`\n${i + 1}. Sesión ID: ${s.id}`);
            console.log(`   Dispositivo: ${s.dispositivo}`);
            console.log(`   IP: ${s.direccion_ip}`);
            console.log(`   Inicio: ${s.fecha_inicio}`);
            console.log(`   Estado: ${s.activa ? 'Activa ✅' : 'Cerrada ❌'}`);
        });
    }
    
    return data;
}

// 8. Refresh Token
async function test_refreshToken() {
    console.log('\n🧪 TEST: Refresh Token');
    console.log('Endpoint: POST /api/v2/auth/refresh\n');
    
    if (!REFRESH_TOKEN) {
        console.log('❌ No hay refresh token disponible. Ejecuta primero "Login de Usuario"');
        return;
    }
    
    const body = {
        refreshToken: REFRESH_TOKEN
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify({refreshToken: REFRESH_TOKEN.substring(0, 30) + '...'}, null, 2));
    
    const response = await fetch(`${BASE_URL_AUTH}/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Refresh Token', response, data);
    
    if (data.accessToken) {
        const anterior = AUTH_TOKEN;
        AUTH_TOKEN = data.accessToken;
        
        console.log('\n✅ Access token renovado');
        console.log(`   Anterior: ${anterior.substring(0, 20)}...`);
        console.log(`   Nuevo: ${AUTH_TOKEN.substring(0, 20)}...`);
        console.log(`   Expira en: ${data.expiresIn || '15m'}`);
    }
    
    return data;
}

// 9. Revocar Refresh Token
async function test_revocarRefreshToken() {
    console.log('\n🧪 TEST: Revocar Refresh Token');
    console.log('Endpoint: POST /api/v2/auth/revoke\n');
    
    if (!REFRESH_TOKEN) {
        console.log('❌ No hay refresh token disponible');
        return;
    }
    
    const body = {
        refreshToken: REFRESH_TOKEN
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify({refreshToken: REFRESH_TOKEN.substring(0, 30) + '...'}, null, 2));
    
    const response = await fetch(`${BASE_URL_AUTH}/revoke`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN
        },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    mostrarRespuesta('Revocar Refresh Token', response, data);
    
    if (response.ok) {
        console.log('\n✅ Refresh token revocado exitosamente');
        console.log('   El token ya no podrá ser usado para renovar el access token');
        REFRESH_TOKEN = '';
    }
    
    return data;
}

// 10. Logout
async function test_logout() {
    console.log('\n🧪 TEST: Cerrar Sesión (Logout)');
    console.log('Endpoint: POST /api/v2/auth/logout\n');
    
    if (!AUTH_TOKEN) {
        console.log('❌ No hay sesión activa. Ejecuta primero "Login de Usuario"');
        return;
    }
    
    console.log('📤 Cerrando sesión...');
    
    const response = await fetch(`${BASE_URL_AUTH}/logout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Logout', response, data);
    
    if (response.ok) {
        console.log('\n✅ Sesión cerrada exitosamente');
        const anterior_token = AUTH_TOKEN;
        AUTH_TOKEN = '';
        console.log(`   Token anterior: ${anterior_token.substring(0, 20)}...`);
        console.log('   AUTH_TOKEN limpiado');
    }
    
    return data;
}

// 11. Cerrar Sesión por ID
async function test_cerrarSesionPorId() {
    console.log('\n🧪 TEST: Cerrar Sesión Específica por ID');
    console.log('Endpoint: DELETE /api/v2/auth/sesiones/:sesionId\n');
    
    if (!AUTH_TOKEN) {
        console.log('❌ No hay sesión activa. Ejecuta primero "Login de Usuario"');
        return;
    }
    
    // Primero obtener las sesiones activas
    console.log('📋 Obteniendo sesiones activas...');
    const sesionesResponse = await fetch(`${BASE_URL_AUTH}/sesionesActivas/${TEST_USER.id}`, {
        headers: {
            'x-app-key': APP_TOKEN
        }
    });
    
    const sesionesData = await sesionesResponse.json();
    
    if (!sesionesData.sesiones || sesionesData.sesiones.length === 0) {
        console.log('❌ No hay sesiones activas para cerrar');
        return;
    }
    
    console.log(`\n📊 Sesiones activas encontradas: ${sesionesData.sesiones.length}\n`);
    sesionesData.sesiones.forEach((s, i) => {
        console.log(`${i + 1}. ID: ${s.id} | Dispositivo: ${s.dispositivo} | IP: ${s.direccion_ip}`);
    });
    
    const sesionId = await pregunta('\nIngresa el ID de la sesión a cerrar: ');
    
    if (!sesionId) {
        console.log('❌ ID de sesión no válido');
        return;
    }
    
    console.log(`\n📤 Cerrando sesión ${sesionId}...`);
    
    const response = await fetch(`${BASE_URL_AUTH}/sesiones/${sesionId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Cerrar Sesión por ID', response, data);
    
    if (response.ok) {
        console.log('\n✅ Sesión cerrada exitosamente');
        console.log(`   Sesión ID: ${sesionId}`);
        console.log(`   Mensaje: ${data.mensaje}`);
    }
    
    return data;
}

// 12. Cerrar Todas las Sesiones
async function test_cerrarTodasLasSesiones() {
    console.log('\n🧪 TEST: Cerrar Todas las Sesiones');
    console.log('Endpoint: DELETE /api/v2/auth/sesiones/usuario/:usuarioId/todas\n');
    
    if (!AUTH_TOKEN) {
        console.log('❌ No hay sesión activa. Ejecuta primero "Login de Usuario"');
        return;
    }
    
    if (!TEST_USER.id) {
        console.log('❌ No hay usuario ID disponible');
        return;
    }
    
    // Mostrar sesiones actuales
    console.log('📋 Obteniendo sesiones activas...');
    const sesionesResponse = await fetch(`${BASE_URL_AUTH}/sesionesActivas/${TEST_USER.id}`, {
        headers: {
            'x-app-key': APP_TOKEN
        }
    });
    
    const sesionesData = await sesionesResponse.json();
    
    if (sesionesData.sesiones) {
        console.log(`\n📊 Sesiones activas: ${sesionesData.sesiones.length}`);
    }
    
    const exceptoActual = await pregunta('\n¿Mantener la sesión actual? (s/n): ');
    const queryParam = exceptoActual.toLowerCase() === 's' ? '?excepto_actual=true' : '';
    
    console.log(`\n📤 Cerrando todas las sesiones${exceptoActual.toLowerCase() === 's' ? ' excepto la actual' : ''}...`);
    
    const response = await fetch(`${BASE_URL_AUTH}/sesiones/usuario/${TEST_USER.id}/todas${queryParam}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-app-key': APP_TOKEN,
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    });
    
    const data = await response.json();
    mostrarRespuesta('Cerrar Todas las Sesiones', response, data);
    
    if (response.ok) {
        console.log('\n✅ Sesiones cerradas exitosamente');
        console.log(`   Sesiones cerradas: ${data.sesiones_cerradas || 0}`);
        console.log(`   Usuario ID: ${TEST_USER.id}`);
        
        if (exceptoActual.toLowerCase() !== 's') {
            console.log('\n⚠️  Todas las sesiones fueron cerradas, incluyendo la actual');
            AUTH_TOKEN = '';
        }
    }
    
    return data;
}

// ====================================
// FLUJOS COMPLETOS
// ====================================

// Flujo 1: Ciclo completo de usuario
async function test_flujoUsuarioCompleto() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 FLUJO COMPLETO: Ciclo de Vida del Usuario');
    console.log('='.repeat(60));
    
    try {
        // 1. Registrar usuario
        console.log('\n1️⃣  Registrando usuario...');
        await test_registrarUsuario();
        await esperar(1000);
        
        // 2. Login
        console.log('\n2️⃣  Iniciando sesión...');
        await test_loginUsuario();
        await esperar(1000);
        
        // 3. Ver sesiones activas
        console.log('\n3️⃣  Verificando sesiones activas...');
        await test_sesionesActivas();
        await esperar(1000);
        
        // 4. Refresh token
        if (REFRESH_TOKEN) {
            console.log('\n4️⃣  Renovando access token...');
            await test_refreshToken();
            await esperar(1000);
        }
        
        // 5. Logout
        console.log('\n5️⃣  Cerrando sesión...');
        await test_logout();
        
        console.log('\n✅ FLUJO COMPLETADO - Ciclo de usuario exitoso');
        
    } catch (error) {
        console.error('\n❌ ERROR en flujo completo:', error.message);
    }
}

// Flujo 2: Gestión de tokens
async function test_flujoTokens() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 FLUJO COMPLETO: Gestión de Tokens');
    console.log('='.repeat(60));
    
    try {
        // 1. Login
        console.log('\n1️⃣  Iniciando sesión...');
        await test_loginUsuario();
        await esperar(1000);
        
        // 2. Usar access token (obtener versión)
        console.log('\n2️⃣  Usando access token...');
        await test_obtenerVersion();
        await esperar(1000);
        
        // 3. Renovar con refresh token
        if (REFRESH_TOKEN) {
            console.log('\n3️⃣  Renovando access token...');
            await test_refreshToken();
            await esperar(1000);
        }
        
        // 4. Revocar refresh token
        if (REFRESH_TOKEN) {
            console.log('\n4️⃣  Revocando refresh token...');
            await test_revocarRefreshToken();
            await esperar(1000);
        }
        
        // 5. Logout
        console.log('\n5️⃣  Cerrando sesión...');
        await test_logout();
        
        console.log('\n✅ FLUJO COMPLETADO - Gestión de tokens exitosa');
        
    } catch (error) {
        console.error('\n❌ ERROR en flujo de tokens:', error.message);
    }
}

// ====================================
// MENÚ PRINCIPAL
// ====================================
async function mostrarMenu() {
    console.clear();
    console.log('\n' + '='.repeat(60));
    console.log('🧪 SUITE DE PRUEBAS - AUTENTICACIÓN V2');
    console.log('='.repeat(60));
    console.log('\n📱 AUTENTICACIÓN DE APLICACIÓN:\n');
    console.log('1.  POST   /app/registrarApp      - Registrar nueva app');
    console.log('2.  POST   /app/recuperarToken    - Recuperar token de app');
    console.log('3.  GET    /app/version           - Obtener versión de la API');
    console.log('4.  GET    /app/status            - Verificar estado de la API');
    console.log('\n👤 AUTENTICACIÓN DE USUARIOS:\n');
    console.log('5.  POST   /auth/register         - Registrar nuevo usuario');
    console.log('6.  POST   /auth/login            - Login de usuario');
    console.log('7.  GET    /auth/sesionesActivas  - Obtener sesiones activas');
    console.log('8.  POST   /auth/refresh          - Renovar access token');
    console.log('9.  POST   /auth/revoke           - Revocar refresh token');
    console.log('10. POST   /auth/logout           - Cerrar sesión actual');
    console.log('\n🔐 GESTIÓN DE SESIONES:\n');
    console.log('11. DELETE /auth/sesiones/:id     - Cerrar sesión por ID');
    console.log('12. DELETE /auth/sesiones/todas   - Cerrar todas las sesiones');
    console.log('\n🔄 FLUJOS COMPLETOS:\n');
    console.log('13. Flujo Usuario Completo         - Registro → Login → Sesiones → Logout');
    console.log('14. Flujo Gestión de Tokens        - Login → Usar → Refresh → Revoke');
    console.log('\n⚙️  CONFIGURACIÓN:\n');
    console.log('15. Establecer APP_TOKEN');
    console.log('16. Establecer credenciales de usuario');
    console.log('17. Ver estado de configuración');
    console.log('\n0.  Salir\n');
    console.log('─'.repeat(60));
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function mostrarEstado() {
    console.log('\n' + '═'.repeat(60));
    console.log('⚙️  ESTADO DE CONFIGURACIÓN');
    console.log('═'.repeat(60));
    console.log(`\n🔑 APP_TOKEN: ${APP_TOKEN ? '✅ Configurado' : '❌ No configurado'}`);
    if (APP_TOKEN) {
        console.log(`   ${APP_TOKEN.substring(0, 50)}...`);
    }
    console.log(`\n🎫 AUTH_TOKEN: ${AUTH_TOKEN ? '✅ Configurado' : '❌ No configurado'}`);
    if (AUTH_TOKEN) {
        console.log(`   ${AUTH_TOKEN.substring(0, 50)}...`);
    }
    console.log(`\n🔄 REFRESH_TOKEN: ${REFRESH_TOKEN ? '✅ Configurado' : '❌ No configurado'}`);
    if (REFRESH_TOKEN) {
        console.log(`   ${REFRESH_TOKEN.substring(0, 50)}...`);
    }
    console.log(`\n👤 TEST_USER:`);
    console.log(`   ID: ${TEST_USER.id || 'No establecido'}`);
    console.log(`   Correo: ${TEST_USER.correo || 'No establecido'}`);
    console.log(`   Username: ${TEST_USER.username || 'No establecido'}`);
    console.log(`   Rol: ${TEST_USER.rol || 'No establecido'}`);
    console.log('═'.repeat(60));
}

async function ejecutarOpcion(opcion) {
    switch(opcion) {
        case '1': await test_registrarApp(); break;
        case '2': await test_recuperarTokenApp(); break;
        case '3': await test_obtenerVersion(); break;
        case '4': await test_verificarEstado(); break;
        case '5': await test_registrarUsuario(); break;
        case '6': await test_loginUsuario(); break;
        case '7': await test_sesionesActivas(); break;
        case '8': await test_refreshToken(); break;
        case '9': await test_revocarRefreshToken(); break;
        case '10': await test_logout(); break;
        case '11': await test_cerrarSesionPorId(); break;
        case '12': await test_cerrarTodasLasSesiones(); break;
        case '13': await test_flujoUsuarioCompleto(); break;
        case '14': await test_flujoTokens(); break;
        case '15':
            APP_TOKEN = await pregunta('Ingresa APP_TOKEN (AppKey ey...): ');
            console.log('✅ APP_TOKEN configurado');
            break;
        case '16':
            TEST_USER.correo = await pregunta('Correo: ');
            TEST_USER.contrasena = await pregunta('Contraseña: ');
            TEST_USER.username = await pregunta('Username (opcional): ');
            TEST_USER.nombre = await pregunta('Nombre (opcional): ');
            console.log('✅ Credenciales configuradas');
            break;
        case '17':
            await mostrarEstado();
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
    console.log('\n🚀 Iniciando suite de pruebas de autenticación...\n');
    
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
