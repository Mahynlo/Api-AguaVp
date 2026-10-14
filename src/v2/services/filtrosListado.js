/**
 * Condiciones WHERE de los listados paginados de medidores y clientes.
 * Sin dependencia de la conexión, para poder probarlas con una base en memoria.
 *
 * Valores especiales de los filtros: 'All' (o vacío) = sin filtro; '__vacio' = campo sin dato;
 * 'sin_ruta', 'sin_tarifa', 'sin_fecha' = sin relación.
 */

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mismo criterio en SQL y en la pantalla: sin espacios/saltos al inicio y al final y en minúsculas
// (LOWER de SQLite solo cambia letras ASCII; la pantalla usa normalizarValorFiltro, equivalente)
const ESPACIOS = "' ' || char(9) || char(10) || char(13)";
const colNormalizada = (col) => `LOWER(TRIM(COALESCE(${col}, ''), ${ESPACIOS}))`;
export const normalizarValorFiltro = (v) => String(v ?? '').trim().replace(/[A-Z]/g, (c) => c.toLowerCase());

const activo = (v) => v !== undefined && v !== null && v !== '' && v !== 'All';

/** Filtro de texto agrupado (ubicación, marca): ignora mayúsculas y espacios sobrantes. */
function filtroTextoAgrupado(conditions, args, col, valor) {
    if (!activo(valor)) return;
    if (valor === '__vacio') {
        conditions.push(`${colNormalizada(col)} = ''`);
        return;
    }
    conditions.push(`${colNormalizada(col)} = ?`);
    args.push(normalizarValorFiltro(valor));
}

/**
 * @param {Object} query - parámetros del listado de medidores
 * @returns {{ conditions: string[], args: any[] }} (alias: m = medidores, c = cliente actual)
 */
export function condicionesMedidores(query = {}) {
    const { search, estado, ubicacion, cliente_id, cliente_nombre, numero_predio, asignacion, incluirEliminados, ciudad,
        marca, ruta_id, gps, anio_instalacion } = query;
    const conditions = [];
    const args = [];

    if (!(incluirEliminados === 'true' || incluirEliminados === true)) conditions.push('m.fecha_eliminacion IS NULL');

    if (search) {
        const t = `%${sinAcentos(search)}%`;
        conditions.push('(unaccent(m.numero_serie) LIKE ? OR unaccent(m.marca) LIKE ? OR unaccent(m.modelo) LIKE ? OR unaccent(m.ubicacion) LIKE ? OR unaccent(c.nombre) LIKE ? OR unaccent(c.numero_predio) LIKE ?)');
        args.push(t, t, t, t, t, t);
    }
    if (activo(estado)) {
        if (estado === 'Cortado') { conditions.push('m.estado_servicio = ?'); args.push(estado); }
        else if (estado === 'Activo') { conditions.push("(m.estado_medidor = ? AND m.estado_servicio = 'Activo')"); args.push('Activo'); }
        else { conditions.push('m.estado_medidor = ?'); args.push(estado); }
    }
    filtroTextoAgrupado(conditions, args, 'm.ubicacion', ubicacion);
    filtroTextoAgrupado(conditions, args, 'm.marca', marca);
    if (activo(cliente_id)) { conditions.push('m.cliente_id = ?'); args.push(cliente_id); }
    if (cliente_nombre) { conditions.push('c.nombre LIKE ?'); args.push(`%${cliente_nombre}%`); }
    if (numero_predio) { conditions.push('c.numero_predio LIKE ?'); args.push(`%${numero_predio}%`); }
    if (activo(ciudad)) { conditions.push('c.ciudad = ?'); args.push(ciudad); }
    if (activo(asignacion)) {
        if (asignacion === 'asignados') conditions.push('m.cliente_id IS NOT NULL');
        else if (asignacion === 'sin_asignar' || asignacion === 'no_asignados') conditions.push('m.cliente_id IS NULL');
    }
    if (activo(ruta_id)) {
        if (ruta_id === 'sin_ruta') conditions.push('NOT EXISTS (SELECT 1 FROM rutas_puntos rpf WHERE rpf.medidor_id = m.id)');
        else { conditions.push('EXISTS (SELECT 1 FROM rutas_puntos rpf WHERE rpf.medidor_id = m.id AND rpf.ruta_id = ?)'); args.push(Number(ruta_id)); }
    }
    if (gps === 'con') conditions.push('(m.latitud IS NOT NULL AND m.longitud IS NOT NULL)');
    else if (gps === 'sin') conditions.push('(m.latitud IS NULL OR m.longitud IS NULL)');
    if (activo(anio_instalacion)) {
        if (anio_instalacion === 'sin_fecha') conditions.push("(m.fecha_instalacion IS NULL OR m.fecha_instalacion = '')");
        else { conditions.push('substr(m.fecha_instalacion, 1, 4) = ?'); args.push(String(anio_instalacion)); }
    }
    return { conditions, args };
}

/** Factura con saldo cuya fecha de vencimiento ya pasó (o que el sistema ya marcó como Vencida). */
const FACTURA_VENCIDA = "f.saldo_pendiente > 0 AND (f.estado = 'Vencida' OR f.fecha_vencimiento < ?)";
const MEDIDOR_ACTIVO = 'SELECT 1 FROM medidores mf WHERE mf.cliente_id = c.id AND mf.fecha_eliminacion IS NULL';

/** Columnas calculadas de cada cliente para la tabla: adeudo total y facturas vencidas (usa 1 argumento: hoy). */
export const COLUMNAS_ADEUDO_CLIENTE =
    '(SELECT COALESCE(SUM(f.saldo_pendiente), 0) FROM facturas f WHERE f.cliente_id = c.id AND f.saldo_pendiente > 0) AS adeudo_total, ' +
    `(SELECT COUNT(*) FROM facturas f WHERE f.cliente_id = c.id AND ${FACTURA_VENCIDA}) AS facturas_vencidas`;

/**
 * @param {Object} query - parámetros del listado de clientes
 * @param {string} hoy - fecha local YYYY-MM-DD (para decidir qué facturas están vencidas)
 * @returns {{ conditions: string[], args: any[] }} (alias: c = clientes)
 */
export function condicionesClientes(query = {}, hoy) {
    const { search, ciudad, estado, estado_cliente, numero_predio, tarifa_id, medidor, ruta_id, pago } = query;
    const estadoFiltro = estado || estado_cliente;
    const incluirEliminados = estadoFiltro === 'All' || estadoFiltro === 'Eliminado';
    const conditions = [];
    const args = [];

    if (search) {
        const t = `%${sinAcentos(search)}%`;
        conditions.push('(unaccent(c.nombre) LIKE ? OR unaccent(c.telefono) LIKE ? OR unaccent(c.correo) LIKE ? OR unaccent(c.ciudad) LIKE ? OR unaccent(c.numero_predio) LIKE ? OR unaccent(c.direccion) LIKE ?)');
        args.push(t, t, t, t, t, t);
    }
    if (numero_predio) { conditions.push('c.numero_predio = ?'); args.push(numero_predio.toString().toUpperCase()); }
    if (activo(ciudad)) { conditions.push('c.ciudad = ?'); args.push(ciudad); }
    if (estadoFiltro && estadoFiltro !== 'All') { conditions.push('c.estado_cliente = ?'); args.push(estadoFiltro); }
    else if (!incluirEliminados) conditions.push("c.estado_cliente != 'Eliminado'");

    if (activo(tarifa_id)) {
        if (tarifa_id === 'sin_tarifa') conditions.push('c.tarifa_id IS NULL');
        else { conditions.push('c.tarifa_id = ?'); args.push(Number(tarifa_id)); }
    }
    if (medidor === 'con') conditions.push(`EXISTS (${MEDIDOR_ACTIVO})`);
    else if (medidor === 'sin') conditions.push(`NOT EXISTS (${MEDIDOR_ACTIVO})`);
    if (activo(ruta_id)) {
        const enRuta = 'SELECT 1 FROM medidores mf JOIN rutas_puntos rpf ON rpf.medidor_id = mf.id WHERE mf.cliente_id = c.id AND mf.fecha_eliminacion IS NULL';
        if (ruta_id === 'sin_ruta') conditions.push(`NOT EXISTS (${enRuta})`);
        else { conditions.push(`EXISTS (${enRuta} AND rpf.ruta_id = ?)`); args.push(Number(ruta_id)); }
    }
    if (pago === 'al_corriente') conditions.push('NOT EXISTS (SELECT 1 FROM facturas f WHERE f.cliente_id = c.id AND f.saldo_pendiente > 0)');
    else if (pago === 'con_saldo') conditions.push('EXISTS (SELECT 1 FROM facturas f WHERE f.cliente_id = c.id AND f.saldo_pendiente > 0)');
    else if (/^vencidas_[1-9]$/.test(pago || '')) {
        conditions.push(`(SELECT COUNT(*) FROM facturas f WHERE f.cliente_id = c.id AND ${FACTURA_VENCIDA}) >= ?`);
        args.push(hoy, Number(pago.split('_')[1]));
    }
    return { conditions, args };
}

// ── Facturas ──────────────────────────────────────────────────────────────────

// Estados equivalentes (el filtro acepta cualquiera de las formas guardadas)
const ESTADOS_FACTURA = {
    Vencida: ['Vencida', 'Vencido'],
    Vencido: ['Vencida', 'Vencido'],
    Pagado: ['Pagado', 'Pagada'],
    Pagada: ['Pagado', 'Pagada'],
    Pendiente: ['Pendiente']
};
const RANGOS_CONSUMO = { '0-15': [0, 15], '16-30': [16, 30], '31-60': [31, 60], '61+': [61, null] };

/**
 * @param {Object} query - parámetros del listado de facturas
 * @param {string} hoy - fecha local YYYY-MM-DD (antigüedad del vencimiento)
 * @returns {{ conditions: string[], args: any[] }} (alias: f = facturas, c = clientes, l = lecturas, m = medidores)
 */
export function condicionesFacturas(query = {}, hoy) {
    const { periodo, estado, ciudad, search, antiguedad, consumo, ruta_id, tarifa_id } = query;
    const conditions = [];
    const args = [];

    if (periodo) { conditions.push('l.periodo = ?'); args.push(periodo); }
    if (estado?.trim() && estado !== 'All') {
        const valores = ESTADOS_FACTURA[estado] || [estado];
        conditions.push(`f.estado IN (${valores.map(() => '?').join(', ')})`);
        args.push(...valores);
    }
    if (ciudad?.trim() && ciudad !== 'All') { conditions.push('c.ciudad = ?'); args.push(ciudad); }
    if (search) {
        const searchTerm = `%${search.toLowerCase()}%`;
        const t = `%${sinAcentos(search)}%`;
        conditions.push(`(unaccent(c.nombre) LIKE ? OR unaccent(c.direccion) LIKE ? OR unaccent(COALESCE(c.telefono,'')) LIKE ? OR unaccent(COALESCE(c.correo,'')) LIKE ? OR CAST(f.id AS TEXT) LIKE ? OR unaccent(m.numero_serie) LIKE ? OR unaccent(COALESCE(m.ubicacion,'')) LIKE ? OR CAST(COALESCE(c.numero_predio,'') AS TEXT) LIKE ?)`);
        args.push(t, t, t, t, searchTerm, t, t, searchTerm);
    }
    // Con saldo y vencida hace al menos N días
    const dias = /^vencida_(\d{1,3})$/.exec(antiguedad || '');
    if (dias) {
        conditions.push("f.saldo_pendiente > 0 AND f.fecha_vencimiento <= date(?, '-' || ? || ' days')");
        args.push(hoy, Number(dias[1]));
    }
    const rango = RANGOS_CONSUMO[consumo];
    if (rango) {
        conditions.push(rango[1] === null ? 'CAST(l.consumo_m3 AS INTEGER) >= ?' : 'CAST(l.consumo_m3 AS INTEGER) BETWEEN ? AND ?');
        args.push(...rango.filter(v => v !== null));
    }
    if (activo(ruta_id)) {
        if (ruta_id === 'sin_ruta') conditions.push('l.ruta_id IS NULL');
        else { conditions.push('l.ruta_id = ?'); args.push(Number(ruta_id)); }
    }
    if (activo(tarifa_id)) { conditions.push('f.tarifa_id = ?'); args.push(Number(tarifa_id)); }
    return { conditions, args };
}

// ── Pagos ─────────────────────────────────────────────────────────────────────

/**
 * @param {Object} query - parámetros del listado de pagos
 * @returns {{ conditions: string[], args: any[] }} (alias: p = pagos, f = facturas, c = clientes, l = lecturas)
 */
export function condicionesPagos(query = {}) {
    const { periodo, metodo_pago, ciudad, search, fecha_desde, fecha_hasta, cobrado_por, tipo } = query;
    const conditions = [];
    const args = [];

    if (periodo) { conditions.push('l.periodo = ?'); args.push(periodo); }
    if (metodo_pago?.trim() && metodo_pago !== 'All') { conditions.push('p.metodo_pago = ?'); args.push(metodo_pago); }
    if (ciudad?.trim() && ciudad !== 'All') { conditions.push('c.ciudad = ?'); args.push(ciudad); }
    if (search) {
        const searchTerm = `%${search.toLowerCase()}%`;
        const t = `%${sinAcentos(search)}%`;
        conditions.push('(unaccent(c.nombre) LIKE ? OR CAST(p.id AS TEXT) LIKE ? OR CAST(f.id AS TEXT) LIKE ? OR unaccent(p.metodo_pago) LIKE ?)');
        args.push(t, searchTerm, searchTerm, t);
    }
    // Fecha de cobro (YYYY-MM-DD, inclusive)
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha_desde || '')) { conditions.push('substr(p.fecha_pago, 1, 10) >= ?'); args.push(fecha_desde); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha_hasta || '')) { conditions.push('substr(p.fecha_pago, 1, 10) <= ?'); args.push(fecha_hasta); }
    if (activo(cobrado_por)) { conditions.push('p.modificado_por = ?'); args.push(Number(cobrado_por)); }
    // Completo: cubrió el total de la factura; abono: cubrió solo una parte; parcialidad: pago de un convenio
    if (tipo === 'completo') conditions.push('(p.parcialidad_id IS NULL AND p.monto >= f.total - 0.005)');
    else if (tipo === 'abono') conditions.push('(p.parcialidad_id IS NULL AND p.monto < f.total - 0.005)');
    else if (tipo === 'parcialidad') conditions.push('p.parcialidad_id IS NOT NULL');
    return { conditions, args };
}
