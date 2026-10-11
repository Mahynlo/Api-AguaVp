const Database = require('better-sqlite3');
const db = new Database('C:\\Users\\malco\\AppData\\Roaming\\aguavp\\agua-vp.db', { readonly: true });

const tables = ['clientes','medidores','lecturas','facturas','pagos','tarifas','configuracion_servicio','cortes_servicio','convenios_pago','parcialidades_convenio'];
tables.forEach(t => {
  try {
    const r = db.prepare('SELECT COUNT(*) as c FROM ' + t).get();
    console.log(t + ': ' + r.c + ' rows');
  } catch(e) { console.log(t + ': TABLE NOT FOUND'); }
});

console.log('\n--- Facturas por estado ---');
try {
  const estados = db.prepare('SELECT estado, COUNT(*) as c, SUM(saldo_pendiente) as saldo FROM facturas GROUP BY estado').all();
  estados.forEach(e => console.log(`  ${e.estado}: ${e.c} facturas, saldo: $${e.saldo}`));
} catch(e) { console.log('ERROR:', e.message); }

console.log('\n--- Facturas vencidas con saldo > 0 ---');
try {
  const v = db.prepare("SELECT COUNT(*) as c FROM facturas WHERE estado = 'Vencida' AND saldo_pendiente > 0").get();
  console.log('  Total:', v.c);
} catch(e) { console.log('ERROR:', e.message); }

console.log('\n--- Configuracion servicio ---');
try {
  const config = db.prepare('SELECT * FROM configuracion_servicio ORDER BY id DESC LIMIT 1').get();
  if (config) {
    console.log('  facturas_para_corte:', config.facturas_para_corte);
    console.log('  dias_gracia:', config.dias_gracia);
    console.log('  dias_vencimiento_factura:', config.dias_vencimiento_factura);
  } else {
    console.log('  NO HAY CONFIG - tabla vacía');
  }
} catch(e) { console.log('ERROR:', e.message); }

console.log('\n--- Medidores por estado_servicio ---');
try {
  const est = db.prepare('SELECT estado_servicio, COUNT(*) as c FROM medidores GROUP BY estado_servicio').all();
  est.forEach(e => console.log(`  ${e.estado_servicio}: ${e.c}`));
} catch(e) { console.log('ERROR:', e.message); }

console.log('\n--- Convenios ---');
try {
  const conv = db.prepare('SELECT estado, COUNT(*) as c FROM convenios_pago GROUP BY estado').all();
  if (conv.length === 0) console.log('  No hay convenios');
  else conv.forEach(e => console.log(`  ${e.estado}: ${e.c}`));
} catch(e) { console.log('ERROR:', e.message); }

console.log('\n--- Sample: Facturas pendientes/vencidas (top 5) ---');
try {
  const samples = db.prepare(`
    SELECT f.id, f.estado, f.saldo_pendiente, f.fecha_vencimiento, f.cliente_id, c.nombre
    FROM facturas f JOIN clientes c ON f.cliente_id = c.id
    WHERE f.estado IN ('Pendiente','Vencida','Parcial') AND f.saldo_pendiente > 0
    ORDER BY f.fecha_vencimiento ASC LIMIT 5
  `).all();
  samples.forEach(s => console.log(`  Factura #${s.id}: ${s.nombre} | ${s.estado} | $${s.saldo_pendiente} | vence: ${s.fecha_vencimiento}`));
  if (samples.length === 0) console.log('  No hay facturas pendientes/vencidas');
} catch(e) { console.log('ERROR:', e.message); }

db.close();
