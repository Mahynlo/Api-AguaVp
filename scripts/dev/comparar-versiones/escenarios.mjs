/**
 * Escenarios que se ejecutan contra ambas versiones (en este orden, sobre los mismos datos).
 *
 * Cada paso es una petición:
 *   { nombre, metodo, ruta, como: 'S'|'A'|'O' (usuario), body?, sinAppKey?, guardar?(body, ids) }
 * o una modificación directa de la base:
 *   { nombre, sql: (ids) => '...' }
 * `ruta` y `body` pueden ser funciones que reciben los ids de test/helpers/datos-prueba.js.
 *
 * Los pasos de lectura van primero; después los que modifican datos, encadenados.
 */

const v2 = (r) => `/api/v2${r}`;
const anio = () => new Date().getFullYear();

export const escenarios = [
    // ───────────── Reportes (solo lectura) ─────────────
    { nombre: 'recibos sin mes', metodo: 'GET', ruta: v2('/reports/recibos'), como: 'S' },
    { nombre: 'recibos P3', metodo: 'GET', ruta: (i) => v2(`/reports/recibos?mes=${i.periodos.P3}`), como: 'S' },
    { nombre: 'recibos P3 ruta R1', metodo: 'GET', ruta: (i) => v2(`/reports/recibos?mes=${i.periodos.P3}&ruta_id=${i.rutas.R1}`), como: 'S' },
    { nombre: 'recibos P2 pagados', metodo: 'GET', ruta: (i) => v2(`/reports/recibos?mes=${i.periodos.P2}&estado_pago=pagado`), como: 'S' },
    { nombre: 'recibos P2 pendientes', metodo: 'GET', ruta: (i) => v2(`/reports/recibos?mes=${i.periodos.P2}&estado_pago=pendiente`), como: 'S' },
    { nombre: 'recibos mes sin datos', metodo: 'GET', ruta: v2('/reports/recibos?mes=2020-01'), como: 'S' },
    { nombre: 'financiero por defecto', metodo: 'GET', ruta: v2('/reports/financiero'), como: 'S' },
    { nombre: 'financiero periodo P2', metodo: 'GET', ruta: (i) => v2(`/reports/financiero?tipo=periodo&periodo=${i.periodos.P2}`), como: 'S' },
    { nombre: 'financiero últimos 3 meses', metodo: 'GET', ruta: v2('/reports/financiero?tipo=ultimos_meses&meses=3'), como: 'S' },
    { nombre: 'financiero anual', metodo: 'GET', ruta: () => v2(`/reports/financiero?tipo=anual&anio=${anio()}`), como: 'S' },
    { nombre: 'financiero rango', metodo: 'GET', ruta: (i) => v2(`/reports/financiero?tipo=rango&fecha_inicio=${i.periodos.P1}-01&fecha_fin=${i.periodos.P3}-28`), como: 'S' },
    { nombre: 'financiero tipo inválido', metodo: 'GET', ruta: v2('/reports/financiero?tipo=otro'), como: 'S' },
    { nombre: 'deudores', metodo: 'GET', ruta: v2('/reports/deudores'), como: 'S' },
    { nombre: 'lecturas sin mes', metodo: 'GET', ruta: v2('/reports/lecturas'), como: 'S' },
    { nombre: 'lecturas P3', metodo: 'GET', ruta: (i) => v2(`/reports/lecturas?mes=${i.periodos.P3}`), como: 'S' },
    { nombre: 'lecturas P3 Mazocahui', metodo: 'GET', ruta: (i) => v2(`/reports/lecturas?mes=${i.periodos.P3}&localidad=Mazocahui`), como: 'S' },
    { nombre: 'consumo por defecto', metodo: 'GET', ruta: v2('/reports/consumo-agua'), como: 'S' },
    { nombre: 'consumo periodo P2', metodo: 'GET', ruta: (i) => v2(`/reports/consumo-agua?tipo=periodo&periodo=${i.periodos.P2}`), como: 'S' },
    { nombre: 'consumo últimos 6 meses', metodo: 'GET', ruta: v2('/reports/consumo-agua?tipo=ultimos_meses&meses=6'), como: 'S' },
    { nombre: 'consumo anual', metodo: 'GET', ruta: () => v2(`/reports/consumo-agua?tipo=anual&anio=${anio()}`), como: 'S' },
    { nombre: 'reportes sin app key', metodo: 'GET', ruta: v2('/reports/deudores'), como: 'S', sinAppKey: true },

    // ───────────── Rutas (lectura) ─────────────
    { nombre: 'listar rutas', metodo: 'GET', ruta: v2('/rutas/listar/'), como: 'O' },
    { nombre: 'listar rutas P3', metodo: 'GET', ruta: (i) => v2(`/rutas/listar/?periodo=${i.periodos.P3}`), como: 'O' },
    { nombre: 'listar rutas P4', metodo: 'GET', ruta: (i) => v2(`/rutas/listar/?periodo=${i.periodos.P4}`), como: 'O' },
    { nombre: 'listar rutas paginado y búsqueda', metodo: 'GET', ruta: v2('/rutas/listar/?page=1&limit=1&search=Centro'), como: 'O' },
    { nombre: 'ruta R1 con medidores', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutas.R1}/medidores`), como: 'O' },
    { nombre: 'ruta R1 con medidores P3', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutas.R1}/medidores?periodo=${i.periodos.P3}`), como: 'O' },
    { nombre: 'ruta R2 con medidores P4', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutas.R2}/medidores?periodo=${i.periodos.P4}`), como: 'O' },
    { nombre: 'ruta inexistente', metodo: 'GET', ruta: v2('/rutas/9999/medidores'), como: 'O' },
    { nombre: 'progreso R1', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutas.R1}/progreso`), como: 'O' },
    { nombre: 'progreso R1 P4', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutas.R1}/progreso?periodo=${i.periodos.P4}`), como: 'O' },
    { nombre: 'progreso inexistente', metodo: 'GET', ruta: v2('/rutas/9999/progreso'), como: 'O' },

    // ───────────── Convenios (lectura) ─────────────
    { nombre: 'convenio C5', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/${i.convenios.C5}`), como: 'S' },
    { nombre: 'convenio inexistente', metodo: 'GET', ruta: v2('/deudores/convenios/9999'), como: 'S' },
    { nombre: 'resumen cobro M5 (convenio)', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/resumen-cobro/${i.medidores.M5}`), como: 'S' },
    { nombre: 'resumen cobro M2 (moroso)', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/resumen-cobro/${i.medidores.M2}`), como: 'S' },
    { nombre: 'resumen cobro M1 (al corriente)', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/resumen-cobro/${i.medidores.M1}`), como: 'S' },
    { nombre: 'resumen cobro inexistente', metodo: 'GET', ruta: v2('/deudores/convenios/resumen-cobro/9999'), como: 'S' },

    // ───────────── Cortes ─────────────
    { nombre: 'candidatos a corte', metodo: 'GET', ruta: v2('/deudores/candidatos'), como: 'S' },
    { nombre: 'cortar sin datos', metodo: 'POST', ruta: v2('/deudores/cortar'), como: 'S', body: {} },
    { nombre: 'cortar medidor inexistente', metodo: 'POST', ruta: v2('/deudores/cortar'), como: 'S', body: { medidor_id: 9999, motivo: 'x' } },
    { nombre: 'cortar M4 (ya cortado)', metodo: 'POST', ruta: v2('/deudores/cortar'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M4, motivo: 'Falta de pago' }) },
    { nombre: 'cortar M2', metodo: 'POST', ruta: v2('/deudores/cortar'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M2, motivo: 'Falta de pago', observaciones: '3 vencidas' }) },
    { nombre: 'candidatos tras cortar M2', metodo: 'GET', ruta: v2('/deudores/candidatos'), como: 'S' },
    { nombre: 'reconectar sin medidor', metodo: 'POST', ruta: v2('/deudores/reconectar'), como: 'S', body: {} },
    { nombre: 'reconectar inexistente', metodo: 'POST', ruta: v2('/deudores/reconectar'), como: 'S', body: { medidor_id: 9999 } },
    { nombre: 'reconectar M1 (no cortado)', metodo: 'POST', ruta: v2('/deudores/reconectar'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M1 }) },
    { nombre: 'reconectar M4 (deuda sin convenio)', metodo: 'POST', ruta: v2('/deudores/reconectar'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M4 }) },

    // ───────────── Convenios (escritura) ─────────────
    { nombre: 'crear convenio sin datos', metodo: 'POST', ruta: v2('/deudores/convenios'), como: 'S', body: {} },
    { nombre: 'crear convenio M5 (ya tiene uno)', metodo: 'POST', ruta: v2('/deudores/convenios'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M5, monto_inicial: 0, numero_parcialidades: 2 }) },
    { nombre: 'crear convenio M1 (sin deuda)', metodo: 'POST', ruta: v2('/deudores/convenios'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M1, monto_inicial: 0, numero_parcialidades: 2 }) },
    { nombre: 'crear convenio M2', metodo: 'POST', ruta: v2('/deudores/convenios'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M2, monto_inicial: 125, numero_parcialidades: 3, periodicidad: 'quincenal', observaciones: 'acuerdo' }), guardar: (b, i) => { i.convenioM2 = b?.convenio?.id ?? b?.convenio_id ?? b?.id; } },
    { nombre: 'convenio M2 creado', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/${i.convenioM2}`), como: 'S' },
    { nombre: 'resumen cobro M2 con convenio', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/resumen-cobro/${i.medidores.M2}`), como: 'S' },
    { nombre: 'pagar integrado sin datos', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-integrado'), como: 'S', body: {} },
    { nombre: 'pagar integrado convenio inexistente', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-integrado'), como: 'S', body: { convenio_id: 9999, monto_convenio: 300, cantidad_entregada: 300, metodo_pago: 'Efectivo' } },
    { nombre: 'pagar integrado monto no múltiplo', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-integrado'), como: 'S', body: (i) => ({ convenio_id: i.convenioM2, monto_convenio: 50, cantidad_entregada: 50, metodo_pago: 'Efectivo' }) },
    { nombre: 'pagar integrado C5 + factura M6', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-integrado'), como: 'S', body: (i) => ({ convenio_id: i.convenios.C5, factura_id: i.facturas['M6-1'], monto_factura: 100, monto_convenio: 300, cantidad_entregada: 450, metodo_pago: 'Transferencia', comentario: 'integrado' }) },
    { nombre: 'factura pendiente de M2 (mes actual)', sql: (i) => `INSERT INTO facturas (id, cliente_id, lectura_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado) VALUES (900, ${i.clientes.C2}, ${i.lecturas['M2-4']}, ${i.tarifas.domestica}, '${i.periodos.P4}-01', '2099-12-31', 100, 100, 'Pendiente')` },
    { nombre: 'pagar integrado M2 + factura', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-integrado'), como: 'S', body: (i) => ({ convenio_id: i.convenioM2, factura_id: 900, monto_factura: 100, monto_convenio: 300, cantidad_entregada: 500, metodo_pago: 'Efectivo', comentario: 'integrado' }) },
    { nombre: 'pagar integrado solo convenio M2', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-integrado'), como: 'S', body: (i) => ({ convenio_id: i.convenioM2, monto_convenio: 300, cantidad_entregada: 300, metodo_pago: 'Efectivo' }) },
    { nombre: 'pagar parcialidad sin datos', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-parcialidad'), como: 'S', body: {} },
    { nombre: 'pagar parcialidad ya pagada', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-parcialidad'), como: 'S', body: (i) => ({ parcialidad_id: i.parcialidades['C5-1'], cantidad_entregada: 300, metodo_pago: 'Efectivo' }) },
    { nombre: 'pagar parcialidad insuficiente', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-parcialidad'), como: 'S', body: (i) => ({ parcialidad_id: i.parcialidades['C5-2'], cantidad_entregada: 10, metodo_pago: 'Efectivo' }) },
    { nombre: 'pagar parcialidad C5-2', metodo: 'POST', ruta: v2('/deudores/convenios/pagar-parcialidad'), como: 'S', body: (i) => ({ parcialidad_id: i.parcialidades['C5-2'], cantidad_entregada: 500, metodo_pago: 'Efectivo', comentario: 'segunda' }) },
    { nombre: 'convenio C5 tras pagos', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/${i.convenios.C5}`), como: 'S' },
    { nombre: 'reconectar M2 (con convenio)', metodo: 'POST', ruta: v2('/deudores/reconectar'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M2, observaciones: 'convenio firmado' }) },
    { nombre: 'saldar facturas de M4', sql: (i) => `UPDATE facturas SET saldo_pendiente = 0 WHERE lectura_id IN (SELECT id FROM lecturas WHERE medidor_id = ${i.medidores.M4})` },
    { nombre: 'reconectar M4 (sin deuda)', metodo: 'POST', ruta: v2('/deudores/reconectar'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M4, observaciones: 'pagó todo' }) },
    { nombre: 'candidatos final', metodo: 'GET', ruta: v2('/deudores/candidatos'), como: 'S' },
    { nombre: 'reporte deudores final', metodo: 'GET', ruta: v2('/reports/deudores'), como: 'S' },
    { nombre: 'financiero P3 final', metodo: 'GET', ruta: (i) => v2(`/reports/financiero?tipo=periodo&periodo=${i.periodos.P3}`), como: 'S' },

    // ───────────── Rutas (escritura) ─────────────
    { nombre: 'crear ruta sin datos', metodo: 'POST', ruta: v2('/rutas/crear'), como: 'S', body: {} },
    { nombre: 'crear ruta como operador', metodo: 'POST', ruta: v2('/rutas/crear'), como: 'O', body: (i) => ({ nombre: 'X', creado_por: i.usuarios.O, puntos: [{ id: i.medidores.M8 }] }) },
    { nombre: 'crear ruta con medidor inexistente', metodo: 'POST', ruta: v2('/rutas/crear'), como: 'S', body: (i) => ({ nombre: 'X', creado_por: i.usuarios.S, puntos: [{ id: 9999 }] }) },
    { nombre: 'crear ruta con medidor ya asignado', metodo: 'POST', ruta: v2('/rutas/crear'), como: 'S', body: (i) => ({ nombre: 'Dup', creado_por: i.usuarios.S, puntos: [{ id: i.medidores.M6 }] }) },
    { nombre: 'crear ruta R3', metodo: 'POST', ruta: v2('/rutas/crear'), como: 'S', body: (i) => ({ nombre: 'Ruta Nueva', descripcion: 'prueba', creado_por: i.usuarios.S, distancia_km: 1.2, ruta_calculada: { tipo: 'LineString', coordinates: [[1, 2], [3, 4]] }, instrucciones: [{ texto: 'girar' }], puntos: [{ id: i.medidores.M8 }] }), guardar: (b, i) => { i.rutaR3 = b?.ruta?.id ?? b?.id ?? b?.ruta_id; } },
    { nombre: 'listar rutas tras crear', metodo: 'GET', ruta: v2('/rutas/listar/'), como: 'O' },
    { nombre: 'agregar medidor sin datos', metodo: 'POST', ruta: v2('/rutas/agregar-medidor'), como: 'S', body: {} },
    { nombre: 'agregar M8 a R2', metodo: 'POST', ruta: v2('/rutas/agregar-medidor'), como: 'S', body: (i) => ({ ruta_id: i.rutas.R2, medidor_id: i.medidores.M8, orden: 4 }) },
    { nombre: 'modificar ruta inexistente', metodo: 'PUT', ruta: v2('/rutas/9999'), como: 'S', body: { nombre: 'x' } },
    { nombre: 'modificar R2 nombre', metodo: 'PUT', ruta: (i) => v2(`/rutas/${i.rutas.R2}`), como: 'S', body: { nombre: 'Ruta Mazocahui Norte', distancia_km: 8 } },
    { nombre: 'modificar R2 puntos', metodo: 'PUT', ruta: (i) => v2(`/rutas/${i.rutas.R2}`), como: 'S', body: (i) => ({ puntos: [{ id: i.medidores.M6 }, { id: i.medidores.M5 }, { id: i.medidores.M4 }] }) },
    { nombre: 'modificar R2 vacío', metodo: 'PUT', ruta: (i) => v2(`/rutas/${i.rutas.R2}`), como: 'S', body: {} },
    { nombre: 'reordenar sin orden', metodo: 'PUT', ruta: (i) => v2(`/rutas/${i.rutas.R1}/reordenar`), como: 'S', body: {} },
    { nombre: 'reordenar con medidor ajeno', metodo: 'PUT', ruta: (i) => v2(`/rutas/${i.rutas.R1}/reordenar`), como: 'S', body: (i) => ({ orden: [{ medidor_id: i.medidores.M5, orden: 1 }] }) },
    { nombre: 'reordenar R1', metodo: 'PUT', ruta: (i) => v2(`/rutas/${i.rutas.R1}/reordenar`), como: 'S', body: (i) => ({ orden: [{ medidor_id: i.medidores.M7, orden: 1 }, { medidor_id: i.medidores.M3, orden: 2 }, { medidor_id: i.medidores.M2, orden: 3 }, { medidor_id: i.medidores.M1, orden: 4 }] }) },
    { nombre: 'quitar medidor ajeno de R1', metodo: 'DELETE', ruta: (i) => v2(`/rutas/${i.rutas.R1}/medidores/${i.medidores.M5}`), como: 'S' },
    { nombre: 'quitar M7 de R1', metodo: 'DELETE', ruta: (i) => v2(`/rutas/${i.rutas.R1}/medidores/${i.medidores.M7}`), como: 'S' },
    { nombre: 'agregar M7 a R3', metodo: 'POST', ruta: v2('/rutas/agregar-medidor'), como: 'S', body: (i) => ({ ruta_id: i.rutaR3, medidor_id: i.medidores.M7, orden: 2 }) },
    { nombre: 'R3 final', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutaR3}/medidores`), como: 'O' },
    { nombre: 'R1 final', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutas.R1}/medidores?periodo=${i.periodos.P4}`), como: 'O' },
    { nombre: 'progreso R2 final', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutas.R2}/progreso?periodo=${i.periodos.P3}`), como: 'O' },

    // ───────────── OAuth ─────────────
    { nombre: 'oauth sin grant_type', metodo: 'POST', ruta: v2('/oauth/token'), body: {} },
    { nombre: 'oauth grant desconocido', metodo: 'POST', ruta: v2('/oauth/token'), body: { grant_type: 'otro' } },
    { nombre: 'oauth sin credenciales', metodo: 'POST', ruta: v2('/oauth/token'), body: { grant_type: 'password' } },
    { nombre: 'oauth refresh sin token', metodo: 'POST', ruta: v2('/oauth/token'), body: { grant_type: 'refresh_token' } },
    { nombre: 'oauth password incorrecta', metodo: 'POST', ruta: v2('/oauth/token'), body: { grant_type: 'password', username: 'superadmin@comparar.com', password: 'mal' } },
    { nombre: 'oauth usuario inexistente', metodo: 'POST', ruta: v2('/oauth/token'), body: { grant_type: 'password', username: 'nadie@comparar.com', password: 'Clave123!' } },
    { nombre: 'oauth password', metodo: 'POST', ruta: v2('/oauth/token'), body: { grant_type: 'password', username: 'administrador@comparar.com', password: 'Clave123!', scope: 'read:reports' }, guardar: (b, i) => { i.refresh = b?.refresh_token; } },
    { nombre: 'oauth refresh', metodo: 'POST', ruta: v2('/oauth/token'), body: (i) => ({ grant_type: 'refresh_token', refresh_token: i.refresh }) },
    { nombre: 'oauth refresh reutilizado', metodo: 'POST', ruta: v2('/oauth/token'), body: (i) => ({ grant_type: 'refresh_token', refresh_token: i.refresh }) },
    { nombre: 'oauth refresh inválido', metodo: 'POST', ruta: v2('/oauth/token'), body: { grant_type: 'refresh_token', refresh_token: 'no-existe' } },
    { nombre: 'oauth sin app key', metodo: 'POST', ruta: v2('/oauth/token'), body: { grant_type: 'password', username: 'administrador@comparar.com', password: 'Clave123!' }, sinAppKey: true },

    // ───────────── Errores internos (al final: rompen tablas) ─────────────
    { nombre: 'romper configuracion_servicio', sql: () => 'ALTER TABLE configuracion_servicio RENAME TO configuracion_servicio_x' },
    { nombre: 'candidatos con base rota', metodo: 'GET', ruta: v2('/deudores/candidatos'), como: 'S' },
    { nombre: 'restaurar configuracion_servicio', sql: () => 'ALTER TABLE configuracion_servicio_x RENAME TO configuracion_servicio' },
    { nombre: 'romper rutas_puntos', sql: () => 'ALTER TABLE rutas_puntos RENAME TO rutas_puntos_x' },
    { nombre: 'listar rutas con base rota', metodo: 'GET', ruta: v2('/rutas/listar/'), como: 'O' },
    { nombre: 'progreso con base rota', metodo: 'GET', ruta: (i) => v2(`/rutas/${i.rutas.R1}/progreso`), como: 'O' },
    { nombre: 'restaurar rutas_puntos', sql: () => 'ALTER TABLE rutas_puntos_x RENAME TO rutas_puntos' },
    { nombre: 'romper parcialidades_convenio', sql: () => 'ALTER TABLE parcialidades_convenio RENAME TO parcialidades_convenio_x' },
    { nombre: 'convenio con base rota', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/${i.convenios.C5}`), como: 'S' },
    { nombre: 'resumen cobro con base rota', metodo: 'GET', ruta: (i) => v2(`/deudores/convenios/resumen-cobro/${i.medidores.M5}`), como: 'S' },
    { nombre: 'reporte deudores con base rota', metodo: 'GET', ruta: v2('/reports/deudores'), como: 'S' },
    { nombre: 'restaurar parcialidades_convenio', sql: () => 'ALTER TABLE parcialidades_convenio_x RENAME TO parcialidades_convenio' },
    { nombre: 'romper facturas', sql: () => 'ALTER TABLE facturas RENAME TO facturas_x' },
    { nombre: 'recibos con base rota', metodo: 'GET', ruta: (i) => v2(`/reports/recibos?mes=${i.periodos.P3}`), como: 'S' },
    { nombre: 'financiero con base rota', metodo: 'GET', ruta: v2('/reports/financiero?tipo=ultimos_meses&meses=3'), como: 'S' },
    { nombre: 'consumo con base rota', metodo: 'GET', ruta: v2('/reports/consumo-agua'), como: 'S' },
    { nombre: 'lecturas reporte con base rota', metodo: 'GET', ruta: (i) => v2(`/reports/lecturas?mes=${i.periodos.P3}`), como: 'S' },
    { nombre: 'reconectar con base rota', metodo: 'POST', ruta: v2('/deudores/reconectar'), como: 'S', body: (i) => ({ medidor_id: i.medidores.M4 }) },
    { nombre: 'restaurar facturas', sql: () => 'ALTER TABLE facturas_x RENAME TO facturas' },
];
