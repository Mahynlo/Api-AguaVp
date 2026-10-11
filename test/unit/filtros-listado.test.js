/**
 * Filtros de los listados de medidores y clientes (src/v2/services/filtrosListado.js), sobre una base en memoria.
 * Ejecutar: node --test test/unit/filtros-listado.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { condicionesMedidores, condicionesClientes, COLUMNAS_ADEUDO_CLIENTE, normalizarValorFiltro } from '../../src/v2/services/filtrosListado.js';

const HOY = '2026-10-11';

function crearBase() {
    const db = new DatabaseSync(':memory:');
    db.function('unaccent', (s) => (s == null ? null : String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()));
    db.exec(`
        CREATE TABLE tarifas (id INTEGER PRIMARY KEY, nombre TEXT);
        CREATE TABLE clientes (id INTEGER PRIMARY KEY, nombre TEXT, direccion TEXT, telefono TEXT, correo TEXT, ciudad TEXT,
            numero_predio TEXT, estado_cliente TEXT DEFAULT 'Activo', tarifa_id INTEGER);
        CREATE TABLE medidores (id INTEGER PRIMARY KEY, cliente_id INTEGER, numero_serie TEXT, marca TEXT, modelo TEXT, ubicacion TEXT,
            latitud REAL, longitud REAL, estado_medidor TEXT DEFAULT 'Activo', estado_servicio TEXT DEFAULT 'Activo',
            fecha_instalacion TEXT, fecha_eliminacion TEXT);
        CREATE TABLE rutas_puntos (id INTEGER PRIMARY KEY, ruta_id INTEGER, medidor_id INTEGER);
        CREATE TABLE facturas (id INTEGER PRIMARY KEY, cliente_id INTEGER, saldo_pendiente NUMERIC, estado TEXT, fecha_vencimiento TEXT);

        INSERT INTO tarifas VALUES (1, 'Domestica'), (2, 'Comercial');
        INSERT INTO clientes (id, nombre, ciudad, numero_predio, tarifa_id, estado_cliente) VALUES
            (1, 'Ana', 'Nacori Grande', 'NG-1', 1, 'Activo'),
            (2, 'Beto', 'Nacori Grande', 'NG-2', 1, 'Activo'),
            (3, 'Carla', 'Nacori Grande', 'NG-3', 2, 'Activo'),
            (4, 'Dora', 'Nacori Grande', 'NG-4', NULL, 'Activo'),
            (5, 'Eva', 'Nacori Grande', 'NG-5', 1, 'Eliminado');
        INSERT INTO medidores (id, cliente_id, numero_serie, marca, ubicacion, latitud, longitud, fecha_instalacion, estado_servicio) VALUES
            (1, 1, 'A1', 'DOROT', 'Medidor nuevo', 29.1, -109.1, '2025-03-01', 'Activo'),
            (2, 2, 'B2', 'Dorot ', 'Medidor Nuevo ', 29.2, -109.2, '2025-05-01', 'Activo'),
            (3, 3, 'C3', 'DORT', 'Medidor viejo' || char(10), NULL, NULL, '2026-01-10', 'Cortado'),
            (4, NULL, 'D4', NULL, NULL, NULL, NULL, NULL, 'Activo');
        INSERT INTO rutas_puntos (ruta_id, medidor_id) VALUES (7, 1), (7, 2), (8, 3);
        -- Ana: al corriente; Beto: 1 vencida + 1 por vencer; Carla: 3 vencidas (una marcada Vencida aunque aún no llega la fecha)
        INSERT INTO facturas (cliente_id, saldo_pendiente, estado, fecha_vencimiento) VALUES
            (1, 0, 'Pagado', '2026-09-01'),
            (2, 150, 'Pendiente', '2026-09-20'), (2, 80, 'Pendiente', '2026-10-30'),
            (3, 100, 'Vencida', '2026-08-01'), (3, 100, 'Pendiente', '2026-09-01'), (3, 50, 'Vencida', '2026-10-20');
    `);
    return db;
}

let db;
const medidores = (query) => {
    const { conditions, args } = condicionesMedidores(query);
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    return db.prepare(`SELECT m.id FROM medidores m LEFT JOIN clientes c ON c.id = m.cliente_id${where} ORDER BY m.id`).all(...args).map(r => r.id);
};
const clientes = (query) => {
    const { conditions, args } = condicionesClientes(query, HOY);
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    return db.prepare(`SELECT c.id FROM clientes c${where} ORDER BY c.id`).all(...args).map(r => r.id);
};

describe('Filtros del inventario de medidores', () => {
    beforeEach(() => { db = crearBase(); });

    it('sin filtros devuelve todos los no eliminados', () => {
        assert.deepEqual(medidores({}), [1, 2, 3, 4]);
    });

    it('ubicación agrupada: ignora mayúsculas, espacios y saltos de línea; "__vacio" = sin ubicación', () => {
        assert.deepEqual(medidores({ ubicacion: 'medidor nuevo' }), [1, 2]);
        assert.deepEqual(medidores({ ubicacion: 'Medidor viejo' }), [3]);
        assert.deepEqual(medidores({ ubicacion: '__vacio' }), [4]);
        assert.equal(normalizarValorFiltro(' Medidor Nuevo \n'), 'medidor nuevo');
    });

    it('marca agrupada (DOROT y "Dorot " son la misma) y sin marca', () => {
        assert.deepEqual(medidores({ marca: 'DOROT' }), [1, 2]);
        assert.deepEqual(medidores({ marca: 'DORT' }), [3]);
        assert.deepEqual(medidores({ marca: '__vacio' }), [4]);
    });

    it('asignado / disponible, ruta, GPS y año de instalación', () => {
        assert.deepEqual(medidores({ asignacion: 'asignados' }), [1, 2, 3]);
        assert.deepEqual(medidores({ asignacion: 'sin_asignar' }), [4]);
        assert.deepEqual(medidores({ ruta_id: '7' }), [1, 2]);
        assert.deepEqual(medidores({ ruta_id: 'sin_ruta' }), [4]);
        assert.deepEqual(medidores({ gps: 'con' }), [1, 2]);
        assert.deepEqual(medidores({ gps: 'sin' }), [3, 4]);
        assert.deepEqual(medidores({ anio_instalacion: '2025' }), [1, 2]);
        assert.deepEqual(medidores({ anio_instalacion: 'sin_fecha' }), [4]);
    });

    it('los filtros se combinan y "All" no filtra', () => {
        assert.deepEqual(medidores({ marca: 'DOROT', anio_instalacion: '2025', ruta_id: '7', estado: 'All', ubicacion: 'All' }), [1, 2]);
        assert.deepEqual(medidores({ estado: 'Cortado' }), [3]);
        assert.deepEqual(medidores({ search: 'beto' }), [2]);
    });
});

describe('Filtros de la tabla de clientes', () => {
    beforeEach(() => { db = crearBase(); });

    it('sin filtros excluye eliminados', () => {
        assert.deepEqual(clientes({}), [1, 2, 3, 4]);
    });

    it('tarifa, sin tarifa, con / sin medidor y ruta', () => {
        assert.deepEqual(clientes({ tarifa_id: '1' }), [1, 2]);
        assert.deepEqual(clientes({ tarifa_id: 'sin_tarifa' }), [4]);
        assert.deepEqual(clientes({ medidor: 'con' }), [1, 2, 3]);
        assert.deepEqual(clientes({ medidor: 'sin' }), [4]);
        assert.deepEqual(clientes({ ruta_id: '8' }), [3]);
        assert.deepEqual(clientes({ ruta_id: 'sin_ruta' }), [4]);
    });

    it('situación de pago: al corriente, con saldo y facturas vencidas (fecha pasada o marcada Vencida)', () => {
        assert.deepEqual(clientes({ pago: 'al_corriente' }), [1, 4]);
        assert.deepEqual(clientes({ pago: 'con_saldo' }), [2, 3]);
        assert.deepEqual(clientes({ pago: 'vencidas_1' }), [2, 3]);
        assert.deepEqual(clientes({ pago: 'vencidas_3' }), [3]);
    });

    it('columnas de adeudo para la tabla', () => {
        const filas = db.prepare(`SELECT c.id, ${COLUMNAS_ADEUDO_CLIENTE} FROM clientes c WHERE c.id IN (1, 2, 3) ORDER BY c.id`).all(HOY);
        assert.deepEqual(filas.map(f => [f.id, Number(f.adeudo_total), Number(f.facturas_vencidas)]), [[1, 0, 0], [2, 230, 1], [3, 250, 3]]);
    });

    it('combinado con búsqueda y estado', () => {
        assert.deepEqual(clientes({ pago: 'con_saldo', tarifa_id: '2', search: 'carla' }), [3]);
        assert.deepEqual(clientes({ estado: 'Eliminado' }), [5]);
    });
});
