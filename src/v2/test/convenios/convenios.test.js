/**
 * Tests para Endpoints de Convenios - Fase 2
 * 
 * Ejecutar: npm test src/v2/test/convenios/convenios.test.js
 * 
 * Requisitos:
 * - API corriendo en http://localhost:3000
 * - Token de autenticación válido
 * - Cliente con facturas pendientes
 */

const API_URL = 'http://localhost:3000';
const APP_KEY = process.env.APP_KEY || 'tu-app-key';
const TOKEN = process.env.TEST_TOKEN || 'tu-token';

// Colores para console
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Variables globales para tests
let convenioId = null;
let parcialidadId = null;

// ============================================================================
// TEST 1: Crear Convenio
// ============================================================================
async function test1_crearConvenio() {
    log('\n📝 TEST 1: Crear Convenio', 'cyan');
    log('─'.repeat(50), 'cyan');

    try {
        const response = await fetch(`${API_URL}/api/v2/deudores/convenios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`,
                'x-app-key': APP_KEY
            },
            body: JSON.stringify({
                medidor_id: 1, // Reemplazar con ID de medidor real
                monto_inicial: 100,
                numero_parcialidades: 3,
                periodicidad: 'mensual',
                observaciones: 'Test de convenio'
            })
        });

        const data = await response.json();

        if (response.ok) {
            convenioId = data.convenio_id;
            log(`✅ Convenio creado exitosamente`, 'green');
            log(`   ID: ${convenioId}`, 'green');
            log(`   Deuda original: $${data.detalle.deuda_original}`, 'green');
            log(`   Pago inicial: $${data.detalle.pago_inicial}`, 'green');
            log(`   Saldo diferido: $${data.detalle.saldo_diferido}`, 'green');
            log(`   Cuotas: ${data.detalle.cuotas}`, 'green');
            log(`   Monto por cuota: $${data.detalle.monto_por_cuota}`, 'green');
            return true;
        } else {
            log(`❌ Error: ${data.error}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Error de conexión: ${error.message}`, 'red');
        return false;
    }
}

// ============================================================================
// TEST 2: Obtener Convenio con Parcialidades
// ============================================================================
async function test2_obtenerConvenio() {
    log('\n📋 TEST 2: Obtener Convenio con Parcialidades', 'cyan');
    log('─'.repeat(50), 'cyan');

    if (!convenioId) {
        log('⚠️  Saltando test - No hay convenio creado', 'yellow');
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/api/v2/deudores/convenios/${convenioId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'x-app-key': APP_KEY
            }
        });

        const data = await response.json();

        if (response.ok) {
            log(`✅ Convenio obtenido exitosamente`, 'green');
            log(`   Cliente: ${data.convenio.cliente_nombre}`, 'green');
            log(`   Estado: ${data.convenio.estado}`, 'green');
            log(`   Progreso: ${data.progreso.porcentaje}%`, 'green');
            log(`   Total: $${data.progreso.total}`, 'green');
            log(`   Pagado: $${data.progreso.pagado}`, 'green');
            log(`   Pendiente: $${data.progreso.pendiente}`, 'green');

            log(`\n   Parcialidades:`, 'blue');
            data.parcialidades.forEach(p => {
                const estado = p.estado === 'Pagada' ? '✓' : '○';
                log(`   ${estado} Cuota ${p.numero_parcialidad}: $${p.monto_esperado} - ${p.estado}`, 'blue');

                // Guardar ID de primera parcialidad pendiente
                if (p.estado === 'Pendiente' && !parcialidadId) {
                    parcialidadId = p.id;
                }
            });

            return true;
        } else {
            log(`❌ Error: ${data.error}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Error de conexión: ${error.message}`, 'red');
        return false;
    }
}

// ============================================================================
// TEST 3: Pagar Parcialidad
// ============================================================================
async function test3_pagarParcialidad() {
    log('\n💰 TEST 3: Pagar Parcialidad', 'cyan');
    log('─'.repeat(50), 'cyan');

    if (!parcialidadId) {
        log('⚠️  Saltando test - No hay parcialidad pendiente', 'yellow');
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/api/v2/deudores/convenios/pagar-parcialidad`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`,
                'x-app-key': APP_KEY
            },
            body: JSON.stringify({
                parcialidad_id: parcialidadId,
                cantidad_entregada: 200,
                metodo_pago: 'Efectivo',
                comentario: 'Pago de test'
            })
        });

        const data = await response.json();

        if (response.ok) {
            log(`✅ Parcialidad pagada exitosamente`, 'green');
            log(`   Pago ID: ${data.pago_id}`, 'green');
            log(`   Monto aplicado: $${data.monto_aplicado}`, 'green');
            log(`   Cambio: $${data.cambio}`, 'green');
            log(`   Saldo restante convenio: $${data.saldo_restante_convenio}`, 'green');
            log(`   Convenio completado: ${data.convenio_completado ? 'Sí' : 'No'}`, 'green');
            return true;
        } else {
            log(`❌ Error: ${data.error}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Error de conexión: ${error.message}`, 'red');
        return false;
    }
}

// ============================================================================
// TEST 4: Verificar Convenio Actualizado
// ============================================================================
async function test4_verificarActualizacion() {
    log('\n🔍 TEST 4: Verificar Convenio Actualizado', 'cyan');
    log('─'.repeat(50), 'cyan');

    if (!convenioId) {
        log('⚠️  Saltando test - No hay convenio creado', 'yellow');
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/api/v2/deudores/convenios/${convenioId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'x-app-key': APP_KEY
            }
        });

        const data = await response.json();

        if (response.ok) {
            log(`✅ Convenio verificado`, 'green');
            log(`   Progreso actualizado: ${data.progreso.porcentaje}%`, 'green');
            log(`   Pagado: $${data.progreso.pagado}`, 'green');
            log(`   Pendiente: $${data.progreso.pendiente}`, 'green');

            const parcialidadesPagadas = data.parcialidades.filter(p => p.estado === 'Pagada').length;
            const parcialidadesPendientes = data.parcialidades.filter(p => p.estado === 'Pendiente').length;

            log(`   Parcialidades pagadas: ${parcialidadesPagadas}`, 'green');
            log(`   Parcialidades pendientes: ${parcialidadesPendientes}`, 'green');

            return true;
        } else {
            log(`❌ Error: ${data.error}`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Error de conexión: ${error.message}`, 'red');
        return false;
    }
}

// ============================================================================
// TEST 5: Intentar Pagar Parcialidad Ya Pagada
// ============================================================================
async function test5_pagarParcialidadYaPagada() {
    log('\n🚫 TEST 5: Intentar Pagar Parcialidad Ya Pagada', 'cyan');
    log('─'.repeat(50), 'cyan');

    if (!parcialidadId) {
        log('⚠️  Saltando test - No hay parcialidad', 'yellow');
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/api/v2/deudores/convenios/pagar-parcialidad`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`,
                'x-app-key': APP_KEY
            },
            body: JSON.stringify({
                parcialidad_id: parcialidadId,
                cantidad_entregada: 100,
                metodo_pago: 'Efectivo'
            })
        });

        const data = await response.json();

        if (response.status === 400 && data.error.includes('ya fue pagada')) {
            log(`✅ Validación correcta - Rechaza pago duplicado`, 'green');
            log(`   Error: ${data.error}`, 'green');
            return true;
        } else {
            log(`❌ FALLO - Debería rechazar pago duplicado`, 'red');
            return false;
        }
    } catch (error) {
        log(`❌ Error de conexión: ${error.message}`, 'red');
        return false;
    }
}

// ============================================================================
// Ejecutar todos los tests
// ============================================================================
async function runAllTests() {
    log('\n' + '='.repeat(50), 'blue');
    log('🧪 SUITE DE TESTS - FASE 2: CONVENIOS', 'blue');
    log('='.repeat(50), 'blue');

    const results = {
        total: 0,
        passed: 0,
        failed: 0
    };

    // Ejecutar tests en secuencia
    const tests = [
        { name: 'Crear Convenio', fn: test1_crearConvenio },
        { name: 'Obtener Convenio', fn: test2_obtenerConvenio },
        { name: 'Pagar Parcialidad', fn: test3_pagarParcialidad },
        { name: 'Verificar Actualización', fn: test4_verificarActualizacion },
        { name: 'Validar Pago Duplicado', fn: test5_pagarParcialidadYaPagada }
    ];

    for (const test of tests) {
        results.total++;
        const passed = await test.fn();
        if (passed) {
            results.passed++;
        } else {
            results.failed++;
        }

        // Pausa entre tests
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Resumen
    log('\n' + '='.repeat(50), 'blue');
    log('📊 RESUMEN DE TESTS', 'blue');
    log('='.repeat(50), 'blue');
    log(`Total: ${results.total}`, 'blue');
    log(`✅ Pasados: ${results.passed}`, 'green');
    log(`❌ Fallidos: ${results.failed}`, 'red');
    log(`Tasa de éxito: ${Math.round((results.passed / results.total) * 100)}%`,
        results.failed === 0 ? 'green' : 'yellow');
    log('='.repeat(50) + '\n', 'blue');
}

// Ejecutar
runAllTests().catch(console.error);
