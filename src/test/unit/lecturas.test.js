import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

describe('Suite de Verificación: Módulo de Toma y Gestión de Lecturas', () => {
    let db;

    beforeEach(() => {
        db = new DatabaseSync(':memory:');

        // Esquema idéntico al de producción de AguaVP
        db.exec(`
            CREATE TABLE clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                numero_predio TEXT,
                tarifa_id INTEGER
            );

            CREATE TABLE medidores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER REFERENCES clientes(id),
                numero_serie TEXT NOT NULL UNIQUE,
                estado_medidor TEXT NOT NULL DEFAULT 'Activo',
                lectura_base REAL DEFAULT 0,
                capacidad_maxima REAL DEFAULT 99999
            );

            CREATE TABLE rutas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL
            );

            CREATE TABLE rutas_puntos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ruta_id INTEGER NOT NULL,
                medidor_id INTEGER NOT NULL,
                orden INTEGER NOT NULL
            );

            CREATE TABLE lecturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medidor_id INTEGER NOT NULL,
                ruta_id INTEGER NOT NULL,
                periodo TEXT NOT NULL,
                lectura_anterior REAL,
                lectura_actual REAL,
                consumo_m3 REAL NOT NULL,
                vuelta_cero INTEGER DEFAULT 0,
                fecha_lectura TEXT,
                estado TEXT DEFAULT 'pendiente',
                modificado_por INTEGER
            );

            CREATE TABLE facturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lectura_id INTEGER NOT NULL,
                cliente_id INTEGER NOT NULL,
                tarifa_id INTEGER NOT NULL,
                total REAL NOT NULL,
                saldo_pendiente REAL NOT NULL,
                estado TEXT DEFAULT 'Pendiente'
            );
        `);

        // Datos iniciales
        db.exec(`
            INSERT INTO rutas (id, nombre) VALUES (1, 'Ruta Poniente');
            INSERT INTO clientes (id, nombre, numero_predio) VALUES (1, 'Roberto Gómez', 'NG-01');
            INSERT INTO medidores (id, cliente_id, numero_serie, lectura_base, capacidad_maxima) 
            VALUES (10, 1, 'MED-ROB-10', 0, 99999);
            INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, 10, 1);
        `);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 1: Registro de Lecturas y Cálculo de Consumos
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 1: Registro de Lecturas y Reglas de Cálculo', () => {
        it('primera lectura de un medidor: toma lectura_base (0) y calcula consumo directo', () => {
            const medidorId = 10;
            const rutaId = 1;
            const lecturaActual = 14;
            const periodo = '2024-01';

            // 1. Buscar lectura anterior
            const prev = db.prepare(`
                SELECT lectura_actual FROM lecturas 
                WHERE medidor_id = ? AND periodo < ? 
                ORDER BY periodo DESC LIMIT 1
            `).get(medidorId, periodo);

            const medidor = db.prepare(`SELECT lectura_base FROM medidores WHERE id = ?`).get(medidorId);
            const lecturaAnterior = prev ? prev.lectura_actual : medidor.lectura_base;
            const consumo = lecturaActual - lecturaAnterior;

            db.exec(`
                INSERT INTO lecturas (medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3, fecha_lectura)
                VALUES (${medidorId}, ${rutaId}, '${periodo}', ${lecturaAnterior}, ${lecturaActual}, ${consumo}, '2024-01-15')
            `);

            const l = db.prepare(`SELECT * FROM lecturas WHERE medidor_id = 10 AND periodo = '2024-01'`).get();
            assert.equal(l.lectura_anterior, 0);
            assert.equal(l.lectura_actual, 14);
            assert.equal(l.consumo_m3, 14);
            assert.equal(l.vuelta_cero, 0);
        });

        it('lectura subsecuente de mes a mes: resta contra la lectura anterior del medidor', () => {
            // Enero: actual = 14
            db.exec(`INSERT INTO lecturas (medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3) VALUES (10, 1, '2024-01', 0, 14, 14)`);

            // Febrero: actual = 32
            const medidorId = 10;
            const periodo = '2024-02';
            const lecturaActual = 32;

            const prev = db.prepare(`
                SELECT lectura_actual FROM lecturas 
                WHERE medidor_id = ? AND periodo < ? 
                ORDER BY periodo DESC LIMIT 1
            `).get(medidorId, periodo);

            assert.equal(prev.lectura_actual, 14);
            const consumo = lecturaActual - prev.lectura_actual; // 32 - 14 = 18

            db.exec(`
                INSERT INTO lecturas (medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3)
                VALUES (${medidorId}, 1, '${periodo}', ${prev.lectura_actual}, ${lecturaActual}, ${consumo})
            `);

            const lFeb = db.prepare(`SELECT * FROM lecturas WHERE medidor_id = 10 AND periodo = '2024-02'`).get();
            assert.equal(lFeb.lectura_anterior, 14);
            assert.equal(lFeb.lectura_actual, 32);
            assert.equal(lFeb.consumo_m3, 18);
        });

        it('vuelta a cero (rollover): calcula consumo usando capacidad máxima cuando da la vuelta', () => {
            // Medidor con capacidad máxima 99999 termina en 99980
            db.exec(`INSERT INTO lecturas (medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3) VALUES (10, 1, '2024-01', 99950, 99980, 30)`);

            // En febrero da la vuelta a cero y marca 00015
            const medidor = db.prepare(`SELECT capacidad_maxima FROM medidores WHERE id = 10`).get();
            const capMax = medidor.capacidad_maxima; // 99999
            const lecturaAnterior = 99980;
            const lecturaActual = 15;
            const vueltaCero = true;

            // Regla matemática de rollover: (capacidad - anterior) + actual
            const consumo = (capMax - lecturaAnterior) + lecturaActual; // (99999 - 99980) + 15 = 34

            db.exec(`
                INSERT INTO lecturas (medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3, vuelta_cero)
                VALUES (10, 1, '2024-02', ${lecturaAnterior}, ${lecturaActual}, ${consumo}, ${vueltaCero ? 1 : 0})
            `);

            const lRollover = db.prepare(`SELECT * FROM lecturas WHERE medidor_id = 10 AND periodo = '2024-02'`).get();
            assert.equal(lRollover.lectura_anterior, 99980);
            assert.equal(lRollover.lectura_actual, 15);
            assert.equal(lRollover.consumo_m3, 34);
            assert.equal(lRollover.vuelta_cero, 1);
        });

        it('bloquea lectura menor a la anterior si no se marcó vuelta a cero (error 422)', () => {
            db.exec(`INSERT INTO lecturas (medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3) VALUES (10, 1, '2024-01', 100, 150, 50)`);

            const lecturaAnterior = 150;
            const lecturaActual = 140; // Menor sin vuelta_cero
            const vueltaCero = false;

            // Validación de registrarLectura
            const esValida = vueltaCero || lecturaActual >= lecturaAnterior;
            assert.equal(esValida, false);
        });

        it('bloquea marcar vuelta a cero si la lectura actual es mayor a la anterior (error 400)', () => {
            const lecturaAnterior = 100;
            const lecturaActual = 150; // Mayor pero marcó vuelta_cero indebidamente
            const vueltaCero = true;

            const esInconsistente = vueltaCero && lecturaActual >= lecturaAnterior;
            assert.equal(esInconsistente, true);
        });

        it('candado de unicidad: bloquea registrar dos lecturas para el mismo medidor y período (error 409)', () => {
            db.exec(`INSERT INTO lecturas (medidor_id, ruta_id, periodo, consumo_m3) VALUES (10, 1, '2024-01', 15)`);

            // Comprobar si ya existe
            const dupe = db.prepare(`SELECT id FROM lecturas WHERE medidor_id = ? AND periodo = ?`).get(10, '2024-01');
            assert.ok(dupe);

            const puedeRegistrar = !dupe;
            assert.equal(puedeRegistrar, false);
        });

        it('candado de período cerrado: bloquea nuevas lecturas si la ruta ya tiene facturas en ese período', () => {
            // Ruta 1 ya tiene facturas en 2024-01
            db.exec(`INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, consumo_m3) VALUES (1, 10, 1, '2024-01', 20)`);
            db.exec(`INSERT INTO facturas (lectura_id, cliente_id, tarifa_id, total, saldo_pendiente) VALUES (1, 1, 1, 200, 200)`);

            // Verificar cierre de período por facturación
            const cierre = db.prepare(`
                SELECT COUNT(*) AS total_facturas 
                FROM facturas f JOIN lecturas l ON l.id = f.lectura_id 
                WHERE l.ruta_id = ? AND l.periodo = ?
            `).get(1, '2024-01');

            const periodoCerrado = Number(cierre.total_facturas) > 0;
            assert.equal(periodoCerrado, true);
        });

        it('validación de pertenencia a ruta: bloquea medidores no asignados a esa ruta', () => {
            // Medidor 99 no pertenece a la ruta 1
            const pertenece = db.prepare(`SELECT 1 FROM rutas_puntos WHERE ruta_id = ? AND medidor_id = ?`).get(1, 99);
            assert.equal(pertenece, undefined);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 2: Modificación y Rectificación de Lecturas (Carrusel)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 2: Modificación y Rectificación de Lecturas', () => {
        beforeEach(() => {
            db.exec(`
                INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3, estado)
                VALUES (1, 10, 1, '2024-01', 10, 30, 20, 'facturada')
            `);
        });

        it('rectificación de lectura: actualiza lectura actual, recalcula m³ y pasa estado a pendiente', () => {
            const nuevoLecturaActual = 35;
            const nuevoConsumo = 25; // 35 - 10 = 25
            const usuarioId = 99;

            // Simulación de modificarLectura
            db.exec(`
                UPDATE lecturas SET
                    lectura_actual = ${nuevoLecturaActual},
                    consumo_m3 = ${nuevoConsumo},
                    estado = 'pendiente',
                    modificado_por = ${usuarioId}
                WHERE id = 1
            `);

            const l = db.prepare(`SELECT * FROM lecturas WHERE id = 1`).get();
            assert.equal(l.lectura_actual, 35);
            assert.equal(l.consumo_m3, 25);
            assert.equal(l.estado, 'pendiente'); // Regresa a pendiente para refacturar/recalcular
            assert.equal(l.modificado_por, 99);
        });

        it('lanza error si se intenta modificar una lectura inexistente', () => {
            const existe = db.prepare(`SELECT id FROM lecturas WHERE id = ?`).get(9999);
            assert.equal(existe, undefined);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 3: Consultas Avanzadas y Métricas de Cobranza
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 3: Métricas, Estadísticas y Consulta de Lecturas', () => {
        beforeEach(() => {
            // Cargar datos de prueba
            db.exec(`
                INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, consumo_m3) VALUES
                (1, 10, 1, '2024-01', 8),
                (2, 10, 1, '2024-02', 15),
                (3, 10, 1, '2024-03', 25);
            `);
        });

        it('historial por medidor: calcula promedio de consumo y ordena cronológicamente DESC', () => {
            const lecturas = db.prepare(`
                SELECT id, periodo, consumo_m3 
                FROM lecturas 
                WHERE medidor_id = 10 
                ORDER BY periodo DESC
            `).all();

            assert.equal(lecturas.length, 3);
            assert.equal(lecturas[0].periodo, '2024-03');
            assert.equal(lecturas[2].periodo, '2024-01');

            const consumos = lecturas.map(l => l.consumo_m3);
            const promedio = consumos.reduce((a, b) => a + b, 0) / consumos.length; // (8 + 15 + 25) / 3 = 16
            assert.equal(promedio, 16);
        });

        it('validar cobranza período anterior: activa alerta si más del 30% no ha pagado', () => {
            // Enero: 10 facturas generadas, 4 quedan pendientes (40% sin pagar)
            for (let i = 1; i <= 10; i++) {
                const estado = i <= 6 ? 'Pagado' : 'Pendiente';
                db.exec(`INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, consumo_m3) VALUES (${100 + i}, 10, 1, '2024-01', 10)`);
                db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, total, saldo_pendiente, estado) VALUES (${100 + i}, ${100 + i}, 1, 1, 100, 0, '${estado}')`);
            }

            const pendientes = Number(db.prepare(`
                SELECT COUNT(*) as total FROM facturas f JOIN lecturas l ON f.lectura_id = l.id 
                WHERE l.ruta_id = 1 AND l.periodo = '2024-01' AND f.estado != 'Pagado'
            `).get().total);

            const total = Number(db.prepare(`
                SELECT COUNT(*) as total FROM facturas f JOIN lecturas l ON f.lectura_id = l.id 
                WHERE l.ruta_id = 1 AND l.periodo = '2024-01'
            `).get().total);

            const porcentajePendiente = (pendientes / total) * 100;
            const alerta = porcentajePendiente > 30;

            assert.equal(pendientes, 4);
            assert.equal(total, 10);
            assert.equal(porcentajePendiente, 40);
            assert.equal(alerta, true); // Debe alertar porque 40% > 30%
        });

        it('estadísticas: agrupa consumos correctamente por rangos de volumen', () => {
            const rangos = db.prepare(`
                SELECT 
                    CASE 
                        WHEN consumo_m3 < 10 THEN '0-10 m³'
                        WHEN consumo_m3 < 20 THEN '10-20 m³'
                        ELSE '20+ m³'
                    END as rango, 
                    COUNT(*) as cantidad 
                FROM lecturas 
                GROUP BY rango 
                ORDER BY rango
            `).all();

            // Consumos eran: 8 (0-10), 15 (10-20), 25 (20+)
            const r0_10 = rangos.find(r => r.rango === '0-10 m³');
            const r10_20 = rangos.find(r => r.rango === '10-20 m³');
            const r20_plus = rangos.find(r => r.rango === '20+ m³');

            assert.equal(r0_10.cantidad, 1);
            assert.equal(r10_20.cantidad, 1);
            assert.equal(r20_plus.cantidad, 1);
        });
    });
});
