/**
 * Script para crear datos de prueba del módulo de Deudores
 * 
 * Crea lecturas y facturas vencidas para 2 clientes (medidores 1 y 2)
 * de modo que aparezcan como candidatos a corte en el sistema.
 * 
 * Uso: node seed-deudores-test.cjs
 * Revertir: node seed-deudores-test.cjs --revert
 */

const Database = require('better-sqlite3');
const DB_PATH = 'C:\\Users\\malco\\AppData\\Roaming\\aguavp\\agua-vp.db';

const REVERT = process.argv.includes('--revert');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Marcador: usamos periodos con prefijo 'TEST-' para identificar datos de prueba
const SEED_PERIODOS = ['TEST-2025-08','TEST-2025-09','TEST-2025-10','TEST-2025-11','TEST-2025-12'];

if (REVERT) {
    console.log('🔄 Revertiendo datos de prueba de deudores...');
    
    const revert = db.transaction(() => {
        // IDs de lecturas seed
        const seedLecturas = db.prepare("SELECT id FROM lecturas WHERE periodo LIKE 'TEST-%'").all().map(r => r.id);
        
        if (seedLecturas.length > 0) {
            const placeholders = seedLecturas.map(() => '?').join(',');
            // Eliminar pagos asociados a facturas seed
            db.prepare(`DELETE FROM pagos WHERE factura_id IN (SELECT id FROM facturas WHERE lectura_id IN (${placeholders}))`).run(...seedLecturas);
            // Eliminar parcialidades de convenios seed
            db.prepare(`DELETE FROM parcialidades_convenio WHERE convenio_id IN (SELECT DISTINCT convenio_id FROM facturas WHERE lectura_id IN (${placeholders}) AND convenio_id IS NOT NULL)`).run(...seedLecturas);
            // Eliminar convenios seed
            db.prepare(`DELETE FROM convenios_pago WHERE id IN (SELECT DISTINCT convenio_id FROM facturas WHERE lectura_id IN (${placeholders}) AND convenio_id IS NOT NULL)`).run(...seedLecturas);
            // Eliminar facturas seed
            db.prepare(`DELETE FROM facturas WHERE lectura_id IN (${placeholders})`).run(...seedLecturas);
            // Eliminar cortes seed para medidores 1 y 2
            db.prepare("DELETE FROM cortes_servicio WHERE medidor_id IN (1, 2)").run();
            // Eliminar lecturas seed
            db.prepare("DELETE FROM lecturas WHERE periodo LIKE 'TEST-%'").run();
        }
        
        // Restaurar medidores a estado Activo
        db.prepare("UPDATE medidores SET estado_servicio = 'Activo' WHERE id IN (1, 2)").run();
        
        // Restaurar configuración original (facturas_para_corte = 4)
        db.prepare('UPDATE configuracion_servicio SET facturas_para_corte = 4').run();
    });
    
    revert();
    console.log('✅ Datos de prueba eliminados');
    
    // Mostrar estado final
    const facturas = db.prepare('SELECT COUNT(*) as c FROM facturas').get();
    const lecturas = db.prepare('SELECT COUNT(*) as c FROM lecturas').get();
    console.log(`   Facturas restantes: ${facturas.c}`);
    console.log(`   Lecturas restantes: ${lecturas.c}`);
    
    db.close();
    process.exit(0);
}

console.log('🌱 Creando datos de prueba para módulo de Deudores...\n');

// Verificar que los medidores/clientes existen
const medidores = db.prepare('SELECT m.id, m.numero_serie, m.cliente_id, c.nombre FROM medidores m JOIN clientes c ON m.cliente_id = c.id WHERE m.id IN (1, 2)').all();
if (medidores.length < 2) {
    console.error('❌ Se necesitan al menos los medidores con id 1 y 2');
    db.close();
    process.exit(1);
}

medidores.forEach(m => console.log(`  Medidor #${m.id} (${m.numero_serie}) → Cliente: ${m.nombre}`));
console.log('');

// Obtener tarifa Domestica
const tarifa = db.prepare("SELECT id FROM tarifas WHERE nombre = 'Domestica' LIMIT 1").get();
if (!tarifa) {
    console.error('❌ No se encontró tarifa Domestica');
    db.close();
    process.exit(1);
}

const seed = db.transaction(() => {
    // ============================================================
    // CLIENTE 1 (medidor_id=1): 5 facturas vencidas = CANDIDATO A CORTE
    // Generamos lecturas mensuales con facturas vencidas en meses pasados
    // ============================================================
    const meses1 = [
        { periodo: 'TEST-2025-08', fecha_lectura: '2025-08-15', fecha_emision: '2025-08-16', fecha_vencimiento: '2025-09-16', consumo: 12, total: 150 },
        { periodo: 'TEST-2025-09', fecha_lectura: '2025-09-15', fecha_emision: '2025-09-16', fecha_vencimiento: '2025-10-16', consumo: 15, total: 180 },
        { periodo: 'TEST-2025-10', fecha_lectura: '2025-10-15', fecha_emision: '2025-10-16', fecha_vencimiento: '2025-11-16', consumo: 10, total: 130 },
        { periodo: 'TEST-2025-11', fecha_lectura: '2025-11-15', fecha_emision: '2025-11-16', fecha_vencimiento: '2025-12-16', consumo: 18, total: 210 },
        { periodo: 'TEST-2025-12', fecha_lectura: '2025-12-15', fecha_emision: '2025-12-16', fecha_vencimiento: '2026-01-16', consumo: 14, total: 165 },
    ];

    console.log(`📋 Medidor #1 (${medidores[0].nombre}): ${meses1.length} facturas vencidas`);
    
    for (const mes of meses1) {
        const lec = db.prepare(`
            INSERT INTO lecturas (medidor_id, ruta_id, fecha_lectura, consumo_m3, periodo, modificado_por, estado)
            VALUES (1, NULL, ?, ?, ?, 1, 'facturada')
        `).run(mes.fecha_lectura, mes.consumo, mes.periodo);

        db.prepare(`
            INSERT INTO facturas (cliente_id, lectura_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado, modificado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Vencida', 1)
        `).run(medidores[0].cliente_id, lec.lastInsertRowid, tarifa.id, mes.fecha_emision, mes.fecha_vencimiento, mes.total, mes.total);
        
        console.log(`  ✅ ${mes.periodo}: $${mes.total} (vence: ${mes.fecha_vencimiento})`);
    }

    const deuda1 = meses1.reduce((s, m) => s + m.total, 0);
    console.log(`  💰 Deuda total: $${deuda1}\n`);

    // ============================================================
    // CLIENTE 2 (medidor_id=2): 3 facturas vencidas = caso borderline
    // ============================================================
    const meses2 = [
        { periodo: 'TEST-2025-10', fecha_lectura: '2025-10-20', fecha_emision: '2025-10-21', fecha_vencimiento: '2025-11-21', consumo: 8, total: 100 },
        { periodo: 'TEST-2025-11', fecha_lectura: '2025-11-20', fecha_emision: '2025-11-21', fecha_vencimiento: '2025-12-21', consumo: 11, total: 140 },
        { periodo: 'TEST-2025-12', fecha_lectura: '2025-12-20', fecha_emision: '2025-12-21', fecha_vencimiento: '2026-01-21', consumo: 9, total: 120 },
    ];

    console.log(`📋 Medidor #2 (${medidores[1].nombre}): ${meses2.length} facturas vencidas`);
    
    for (const mes of meses2) {
        const lec = db.prepare(`
            INSERT INTO lecturas (medidor_id, ruta_id, fecha_lectura, consumo_m3, periodo, modificado_por, estado)
            VALUES (2, NULL, ?, ?, ?, 1, 'facturada')
        `).run(mes.fecha_lectura, mes.consumo, mes.periodo);

        db.prepare(`
            INSERT INTO facturas (cliente_id, lectura_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado, modificado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Vencida', 1)
        `).run(medidores[1].cliente_id, lec.lastInsertRowid, tarifa.id, mes.fecha_emision, mes.fecha_vencimiento, mes.total, mes.total);
        
        console.log(`  ✅ ${mes.periodo}: $${mes.total} (vence: ${mes.fecha_vencimiento})`);
    }

    const deuda2 = meses2.reduce((s, m) => s + m.total, 0);
    console.log(`  💰 Deuda total: $${deuda2}\n`);

    // ============================================================
    // Actualizar configuración: bajar umbral a 3 para pruebas
    // ============================================================
    const config = db.prepare('SELECT * FROM configuracion_servicio ORDER BY id DESC LIMIT 1').get();
    if (config && config.facturas_para_corte > 3) {
        db.prepare('UPDATE configuracion_servicio SET facturas_para_corte = 3 WHERE id = ?').run(config.id);
        console.log(`⚙️  Configuración actualizada: facturas_para_corte: ${config.facturas_para_corte} → 3`);
    } else if (config) {
        console.log(`⚙️  Configuración actual: facturas_para_corte = ${config.facturas_para_corte}`);
    }
});

seed();

// ============================================================
// Verificación final
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('📊 VERIFICACIÓN DE DATOS');
console.log('='.repeat(60));

const facturasPorEstado = db.prepare('SELECT estado, COUNT(*) as c, ROUND(SUM(saldo_pendiente),2) as saldo FROM facturas GROUP BY estado').all();
facturasPorEstado.forEach(e => console.log(`  ${e.estado}: ${e.c} facturas | Saldo: $${e.saldo}`));

const vencidas = db.prepare("SELECT COUNT(*) as c FROM facturas WHERE estado = 'Vencida' AND saldo_pendiente > 0").get();
console.log(`\n  Facturas vencidas con saldo > 0: ${vencidas.c}`);

// Simular la query de candidatos
const configFinal = db.prepare('SELECT * FROM configuracion_servicio ORDER BY id DESC LIMIT 1').get();
console.log(`  Umbral de corte: ${configFinal.facturas_para_corte} facturas`);
console.log(`  Días de gracia: ${configFinal.dias_gracia}`);

const candidatos = db.prepare(`
    SELECT 
        c.nombre, m.numero_serie, m.estado_servicio,
        COUNT(f.id) as facturas_vencidas,
        ROUND(SUM(f.saldo_pendiente), 2) as deuda_total
    FROM medidores m
    JOIN clientes c ON m.cliente_id = c.id
    JOIN lecturas l ON l.medidor_id = m.id
    JOIN facturas f ON f.lectura_id = l.id
    WHERE f.saldo_pendiente > 0 AND f.estado = 'Vencida'
    AND f.fecha_vencimiento <= date('now', '-' || ? || ' days')
    GROUP BY m.id
    HAVING facturas_vencidas >= ?
    ORDER BY facturas_vencidas DESC
`).all(configFinal.dias_gracia, configFinal.facturas_para_corte);

console.log(`\n  🎯 CANDIDATOS A CORTE DETECTADOS: ${candidatos.length}`);
candidatos.forEach(c => {
    console.log(`     ${c.nombre} | ${c.numero_serie} | ${c.estado_servicio} | ${c.facturas_vencidas} vencidas | $${c.deuda_total}`);
});

if (candidatos.length === 0) {
    console.log('\n  ⚠️  No se detectaron candidatos. Posiblemente los días de gracia');
    console.log('     excluyen facturas que vencieron hace poco. Ajusta dias_gracia a 0');
    console.log('     desde el panel de Administrador > Configuración.');
}

console.log('\n' + '='.repeat(60));
console.log('🧪 GUÍA DE PRUEBAS');
console.log('='.repeat(60));
console.log(`
1. Ejecuta:  npm run dev  (desde AguaVP)
2. Inicia sesión como admin
3. Ve a Pagos > pestaña "Deudores"
4. Deberías ver ${candidatos.length > 0 ? candidatos.length + ' candidatos' : 'candidatos (ajusta config primero)'} a corte

FLUJO COMPLETO A PROBAR:
  a) Ver candidatos en la pestaña Deudores
  b) Ejecutar un Corte de Servicio en un candidato
  c) Crear un Convenio de Pago para otro candidato
  d) Verificar que el estado del medidor cambia
  e) Ir a Administrador > Configuración y ajustar reglas
  f) Probar Reconexión (solo funciona si hay convenio o deuda $0)

REVERTIR DATOS DE PRUEBA:
  node seed-deudores-test.cjs --revert
`);

db.close();
