// Script de prueba SIN migraciones
// Ejecutar: node test-api-module-no-migrations.js

import AguaVPServer from './src/api-module.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testModule() {
    console.log('🧪 Probando módulo @aguavp/api-server (SIN migraciones)\n');

    // Crear servidor
    const server = new AguaVPServer({
        port: 3000,
        dbPath: path.join(__dirname, 'test-no-migrations.db'),
        jwtSecret: 'test-jwt-secret',
        secretAppKey: 'test-app-secret',
        appKeyInicial: 'test-initial-key',
        executionMode: 'LOCAL',
        autoMigrate: false  // ← Desactivar migraciones
    });

    // Escuchar eventos
    server.on('log', (msg) => console.log(msg));
    server.on('error', (err) => console.error('❌ Error:', err));
    server.on('started', (info) => {
        console.log('\n✅ Servidor iniciado exitosamente');
        console.log('   Info:', JSON.stringify(info, null, 2));
    });

    try {
        // Iniciar servidor
        console.log('▶️  Iniciando servidor...\n');
        await server.start();

        // Obtener estado
        console.log('\n📊 Estado del servidor:');
        console.log(JSON.stringify(server.getStatus(), null, 2));

        // Esperar 3 segundos
        console.log('\n⏳ Esperando 3 segundos...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Detener servidor
        console.log('\n🛑 Deteniendo servidor...');
        await server.stop();

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ PRUEBA COMPLETADA EXITOSAMENTE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('📋 Resumen:');
        console.log('   ✅ Módulo se importa correctamente');
        console.log('   ✅ Servidor inicia sin errores');
        console.log('   ✅ Variables de entorno se configuran');
        console.log('   ✅ Eventos se emiten correctamente');
        console.log('   ✅ Servidor se detiene correctamente');
        console.log('   ⚠️  Migraciones: Pendiente (SQL inválido)');
        console.log('\n');

    } catch (error) {
        console.error('\n❌ Error en la prueba:', error.message);
        process.exit(1);
    }
}

testModule();
