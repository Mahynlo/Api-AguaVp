import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

describe('Suite de Verificación: Trazabilidad, Reemplazo y Ciclo de Vida de Medidores', () => {
    let db;

    beforeEach(() => {
        // Base de datos SQLite en memoria con el esquema exacto de AguaVP
        db = new DatabaseSync(':memory:');

        db.exec(`
            CREATE TABLE clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero_predio TEXT,
                nombre TEXT NOT NULL,
                tarifa_id INTEGER,
                estado_cliente TEXT DEFAULT 'Activo'
            );

            CREATE TABLE medidores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER REFERENCES clientes(id),
                numero_serie TEXT NOT NULL UNIQUE,
                estado_medidor TEXT NOT NULL DEFAULT 'Activo',
                lectura_base REAL DEFAULT 0,
                capacidad_maxima REAL DEFAULT 99999,
                fecha_eliminacion TEXT,
                eliminado_por INTEGER,
                razon_eliminacion TEXT
            );

            CREATE TABLE cliente_medidor_historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER NOT NULL,
                medidor_id INTEGER NOT NULL,
                fecha_inicio DATE NOT NULL DEFAULT (date('now')),
                fecha_fin DATE
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
                consumo_m3 REAL,
                fecha_lectura TEXT,
                estado TEXT DEFAULT 'pendiente'
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

            -- Triggers Drizzle 0022 con soporte para NULL
            CREATE TRIGGER cerrar_historial_asignacion_anterior
            BEFORE UPDATE OF cliente_id ON medidores
            FOR EACH ROW
            WHEN OLD.cliente_id IS NOT NULL AND (NEW.cliente_id IS NULL OR NEW.cliente_id != OLD.cliente_id)
            BEGIN
              UPDATE cliente_medidor_historial
              SET fecha_fin = date('now')
              WHERE medidor_id = OLD.id AND fecha_fin IS NULL;
            END;

            CREATE TRIGGER registrar_historial_asignacion
            AFTER UPDATE OF cliente_id ON medidores
            FOR EACH ROW
            WHEN NEW.cliente_id IS NOT NULL AND (OLD.cliente_id IS NULL OR NEW.cliente_id != OLD.cliente_id)
            BEGIN
              INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio)
              VALUES (NEW.cliente_id, NEW.id, date('now'));
            END;
        `);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 1: Triggers de Base de Datos y Transiciones con NULL
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 1: Triggers de Asignación y Soporte de NULL (Drizzle 0022)', () => {
        it('debe cerrar historial con fecha_fin cuando un medidor se libera a NULL', () => {
            db.exec(`INSERT INTO clientes (id, nombre) VALUES (1, 'Juan Pérez')`);
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie) VALUES (10, 1, 'MED-10')`);
            db.exec(`INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio) VALUES (1, 10, '2025-01-01')`);

            // Liberar medidor
            db.exec(`UPDATE medidores SET cliente_id = NULL WHERE id = 10`);

            const historial = db.prepare(`SELECT * FROM cliente_medidor_historial WHERE medidor_id = 10`).all();
            assert.equal(historial.length, 1);
            assert.notEqual(historial[0].fecha_fin, null);
            assert.equal(historial[0].cliente_id, 1);
        });

        it('debe abrir nuevo historial cuando un medidor libre (NULL) se asigna a otro cliente', () => {
            db.exec(`INSERT INTO clientes (id, nombre) VALUES (1, 'Juan'), (2, 'Pedro')`);
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie) VALUES (10, NULL, 'MED-10')`);

            // Asignar medidor libre al cliente 2
            db.exec(`UPDATE medidores SET cliente_id = 2 WHERE id = 10`);

            const historial = db.prepare(`SELECT * FROM cliente_medidor_historial WHERE medidor_id = 10`).all();
            assert.equal(historial.length, 1);
            assert.equal(historial[0].cliente_id, 2);
            assert.equal(historial[0].fecha_fin, null);
        });

        it('debe cerrar historial anterior y abrir el nuevo en reasignación directa de A a B', () => {
            db.exec(`INSERT INTO clientes (id, nombre) VALUES (1, 'Juan'), (2, 'Pedro')`);
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie) VALUES (10, 1, 'MED-10')`);
            db.exec(`INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio) VALUES (1, 10, '2025-01-01')`);

            // Reasignar directamente de 1 a 2
            db.exec(`UPDATE medidores SET cliente_id = 2 WHERE id = 10`);

            const historial = db.prepare(`SELECT * FROM cliente_medidor_historial WHERE medidor_id = 10 ORDER BY id ASC`).all();
            assert.equal(historial.length, 2);
            assert.equal(historial[0].cliente_id, 1);
            assert.notEqual(historial[0].fecha_fin, null); // Cerrado
            assert.equal(historial[1].cliente_id, 2);
            assert.equal(historial[1].fecha_fin, null);     // Activo
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 2: Eliminación Suave, Preservación y Candados de Purgado
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 2: Retiro de Medidores y Candados de Purgado Definitivo', () => {
        it('Soft Delete: conserva cliente_id y retira de rutas_puntos activas', () => {
            db.exec(`INSERT INTO clientes (id, nombre, numero_predio) VALUES (1, 'Don Carlos', 'NG-135')`);
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor) VALUES (10, 1, 'SERIE-VIEJA', 'Activo')`);
            db.exec(`INSERT INTO rutas (id, nombre) VALUES (1, 'Ruta Principal')`);
            db.exec(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, 10, 5)`);

            // Simular lógica de eliminarMedidor (soft delete)
            db.exec(`
                UPDATE medidores SET 
                    estado_medidor = 'Retirado',
                    fecha_eliminacion = datetime('now'),
                    razon_eliminacion = 'Medidor roto'
                WHERE id = 10;
                DELETE FROM rutas_puntos WHERE medidor_id = 10;
            `);

            const m = db.prepare(`SELECT * FROM medidores WHERE id = 10`).get();
            assert.equal(m.estado_medidor, 'Retirado');
            assert.equal(m.cliente_id, 1); // ¡CONSERVA cliente_id!
            assert.notEqual(m.fecha_eliminacion, null);

            const puntos = db.prepare(`SELECT * FROM rutas_puntos WHERE medidor_id = 10`).all();
            assert.equal(puntos.length, 0); // Limpio de ruta activa
        });

        it('Candado de Purgado: Bloquea si el medidor tiene lecturas registradas', () => {
            db.exec(`INSERT INTO medidores (id, numero_serie, fecha_eliminacion) VALUES (10, 'SERIE-01', datetime('now'))`);
            db.exec(`INSERT INTO lecturas (medidor_id, ruta_id, periodo, consumo_m3) VALUES (10, 1, '2024-01', 15)`);

            const totalLecturas = Number(db.prepare(`SELECT COUNT(*) as total FROM lecturas WHERE medidor_id = 10`).get().total);
            assert.ok(totalLecturas > 0);

            // Regla de purgado: Si tiene lecturas, NO se puede hacer DELETE
            const puedePurgar = totalLecturas === 0;
            assert.equal(puedePurgar, false);
        });

        it('Candado de Purgado: Bloquea si el medidor tiene historial de asignación', () => {
            db.exec(`INSERT INTO medidores (id, numero_serie, fecha_eliminacion) VALUES (10, 'SERIE-01', datetime('now'))`);
            db.exec(`INSERT INTO cliente_medidor_historial (cliente_id, medidor_id) VALUES (1, 10)`);

            const totalHistorial = Number(db.prepare(`SELECT COUNT(*) as total FROM cliente_medidor_historial WHERE medidor_id = 10`).get().total);
            assert.ok(totalHistorial > 0);

            const puedePurgar = totalHistorial === 0;
            assert.equal(puedePurgar, false);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 3: Preservación del Conteo (161/161) y Orden Físico en Rutas
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 3: Conteo en Períodos Cerrados y Preservación de Orden en Ruta', () => {
        it('un período cerrado con facturación muestra exactamente el total histórico (161)', () => {
            db.exec(`INSERT INTO rutas (id, nombre) VALUES (1, 'Ruta Casco')`);

            // Insertar 161 clientes, 161 medidores y 161 lecturas facturadas para 2024-01
            for (let i = 1; i <= 161; i++) {
                db.exec(`INSERT INTO clientes (id, nombre, numero_predio) VALUES (${i}, 'Cliente ${i}', 'NG-${i}')`);
                db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor) VALUES (${i}, ${i}, 'MED-${i}', 'Activo')`);
                db.exec(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, ${i}, ${i})`);
                db.exec(`INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, consumo_m3) VALUES (${i}, ${i}, 1, '2024-01', 10)`);
                db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, total, saldo_pendiente) VALUES (${i}, ${i}, ${i}, 1, 100, 100)`);
            }

            // En febrero, se retiraron 2 medidores (el 10 y el 20) y se les colocaron 2 medidores nuevos (301 y 302)
            db.exec(`UPDATE medidores SET estado_medidor = 'Retirado', fecha_eliminacion = datetime('now') WHERE id IN (10, 20)`);
            db.exec(`DELETE FROM rutas_puntos WHERE medidor_id IN (10, 20)`);
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor) VALUES (301, 10, 'MED-NUEVO-10', 'Activo'), (302, 20, 'MED-NUEVO-20', 'Activo')`);
            db.exec(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, 301, 10), (1, 302, 20)`);

            // Consulta de período cerrado (idéntica al CTE de rutasController)
            const queryCerrado = `
                WITH puntos_ruta AS (
                    SELECT rp.ruta_id, rp.medidor_id, rp.orden FROM rutas_puntos rp WHERE rp.ruta_id = 1
                    UNION
                    SELECT l.ruta_id, l.medidor_id, 
                           COALESCE(rp.orden, rp2.orden, 9999) AS orden
                    FROM lecturas l
                    JOIN medidores m_hist ON l.medidor_id = m_hist.id
                    LEFT JOIN rutas_puntos rp ON rp.medidor_id = l.medidor_id AND rp.ruta_id = l.ruta_id
                    LEFT JOIN medidores m2 ON m2.cliente_id = m_hist.cliente_id AND m2.id != l.medidor_id
                    LEFT JOIN rutas_puntos rp2 ON rp2.medidor_id = m2.id AND rp2.ruta_id = l.ruta_id
                    WHERE l.ruta_id = 1 AND l.periodo = '2024-01'
                )
                SELECT pr.medidor_id, l.id as lectura_id, m.numero_serie, m.estado_medidor, pr.orden
                FROM puntos_ruta pr
                JOIN medidores m ON pr.medidor_id = m.id
                LEFT JOIN lecturas l ON l.medidor_id = m.id AND l.periodo = '2024-01'
                WHERE l.id IS NOT NULL -- Período cerrado: solo los que tuvieron lectura en 2024-01
                ORDER BY pr.orden ASC
            `;

            const resultados = db.prepare(queryCerrado).all();

            // Debe mostrar EXACTAMENTE los 161 medidores reales
            assert.equal(resultados.length, 161);

            // Los medidores retirados 10 y 20 están presentes
            const medidor10 = resultados.find(r => r.medidor_id === 10);
            const medidor20 = resultados.find(r => r.medidor_id === 20);
            assert.ok(medidor10);
            assert.ok(medidor20);
            assert.equal(medidor10.estado_medidor, 'Retirado');

            // Los medidores nuevos instalados después (301, 302) NO se colaron en el conteo de 2024-01
            assert.equal(resultados.find(r => r.medidor_id === 301), undefined);
            assert.equal(resultados.find(r => r.medidor_id === 302), undefined);

            // Y el orden en ruta del medidor retirado heredó la posición del predio/reemplazo (10), ¡no 9999!
            assert.equal(medidor10.orden, 10);
            assert.equal(medidor20.orden, 20);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 4: Recálculo Seguro de Facturas sin Afectar Metros Cúbicos
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 4: Recálculo de Facturas con Medidores Retirados y entre Meses', () => {
        it('recalcular facturas encuentra al cliente y tarifa vía COALESCE aun con medidor retirado', () => {
            db.exec(`INSERT INTO clientes (id, nombre, tarifa_id) VALUES (5, 'Doña Elena', 2)`);
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor, fecha_eliminacion) VALUES (50, 5, 'SERIE-RETIRADA', 'Retirado', datetime('now'))`);
            db.exec(`INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, consumo_m3) VALUES (100, 50, 1, '2024-01', 18)`);
            db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, total, saldo_pendiente) VALUES (500, 100, 5, 2, 180, 180)`);

            // Consulta exacta de generarFacturasParaLecturasSinFactura
            const sqlRecalculo = `
                SELECT 
                    l.id as lectura_id, 
                    l.consumo_m3, 
                    COALESCE(m.cliente_id, f.cliente_id) as cliente_id, 
                    c.tarifa_id, 
                    c.nombre as cliente_nombre,
                    f.id as factura_existente_id
                FROM lecturas l
                LEFT JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN facturas f ON l.id = f.lectura_id
                LEFT JOIN clientes c ON c.id = COALESCE(m.cliente_id, f.cliente_id)
                WHERE l.periodo = '2024-01' 
                  AND c.tarifa_id IS NOT NULL
                  AND COALESCE(m.cliente_id, f.cliente_id) IS NOT NULL
            `;

            const row = db.prepare(sqlRecalculo).get();
            assert.ok(row);
            assert.equal(row.cliente_id, 5);
            assert.equal(row.tarifa_id, 2);
            assert.equal(row.consumo_m3, 18); // Metros cúbicos preservados intactos
            assert.equal(row.factura_existente_id, 500);
        });

        it('consumo del nuevo medidor parte de su base 0 y no hereda la lectura acumulada del medidor viejo', () => {
            // Mes 1: Medidor Viejo terminó en 1,500 m³
            db.exec(`INSERT INTO clientes (id, nombre) VALUES (1, 'Cliente Test')`);
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, lectura_base) VALUES (1, 1, 'MED-VIEJO', 0)`);
            db.exec(`INSERT INTO lecturas (medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3) VALUES (1, 1, '2024-01', 1480, 1500, 20)`);

            // Mes 2: Se instala Medidor Nuevo (id: 2) con lectura base 0
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, lectura_base) VALUES (2, 1, 'MED-NUEVO', 0)`);

            // Consulta de lectura anterior que hace registrarLectura para Medidor 2
            const prevQuery = `
                SELECT lectura_actual FROM lecturas 
                WHERE medidor_id = ? AND periodo < '2024-02' 
                ORDER BY periodo DESC LIMIT 1
            `;
            const prevRow = db.prepare(prevQuery).get(2);
            
            // Para el medidor 2 no hay lecturas anteriores
            assert.equal(prevRow, undefined);

            // Toma lectura_base (0)
            const medidorNuevo = db.prepare(`SELECT lectura_base FROM medidores WHERE id = 2`).get();
            const lecturaAnteriorCalculo = prevRow?.lectura_actual ?? medidorNuevo.lectura_base;
            assert.equal(lecturaAnteriorCalculo, 0);

            // Si marca 10 m³, el consumo es 10 - 0 = 10 (¡No resta 10 - 1500!)
            const lecturaActual = 10;
            const consumo = lecturaActual - lecturaAnteriorCalculo;
            assert.equal(consumo, 10);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 5: Aislamiento de Historial por Cliente (Medidores Reutilizados)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 5: Aislamiento de Consumo entre Clientes (Medidor Reutilizado)', () => {
        it('Cliente B no ve en su estado de cuenta las lecturas que tuvo el medidor con Cliente A', () => {
            db.exec(`INSERT INTO clientes (id, nombre) VALUES (1, 'Juan'), (2, 'Pedro')`);
            db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie) VALUES (10, 2, 'MED-COMPARTIDO')`);

            // En 2024 perteneció a Juan (Cliente 1)
            db.exec(`INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio, fecha_fin) VALUES (1, 10, '2024-01-01', '2024-12-31')`);
            db.exec(`INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, fecha_lectura, consumo_m3) VALUES (1, 10, 1, '2024-06', '2024-06-15', 25)`);
            db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, total, saldo_pendiente) VALUES (1, 1, 1, 1, 250, 0)`);

            // En 2025 se asignó a Pedro (Cliente 2)
            db.exec(`INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio, fecha_fin) VALUES (2, 10, '2025-01-01', NULL)`);
            db.exec(`INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, fecha_lectura, consumo_m3) VALUES (2, 10, 1, '2025-02', '2025-02-15', 12)`);
            db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, total, saldo_pendiente) VALUES (2, 2, 2, 1, 120, 0)`);

            // Consulta exacta de obtenerLecturasPorCliente para Pedro (Cliente 2)
            const queryPedro = `
                SELECT l.id, l.periodo, l.consumo_m3, f.cliente_id
                FROM lecturas l
                JOIN medidores m ON l.medidor_id = m.id
                LEFT JOIN facturas f ON l.id = f.lectura_id
                WHERE l.medidor_id IN (10)
                  AND (
                      f.cliente_id = 2
                      OR (
                          f.id IS NULL 
                          AND (
                              m.cliente_id = 2 
                              OR EXISTS (
                                  SELECT 1 FROM cliente_medidor_historial cmh 
                                  WHERE cmh.medidor_id = l.medidor_id 
                                    AND cmh.cliente_id = 2 
                                    AND (date(l.fecha_lectura) >= cmh.fecha_inicio) 
                                    AND (cmh.fecha_fin IS NULL OR date(l.fecha_lectura) <= cmh.fecha_fin)
                              )
                          )
                      )
                  )
            `;

            const lecturasPedro = db.prepare(queryPedro).all();
            assert.equal(lecturasPedro.length, 1);
            assert.equal(lecturasPedro[0].periodo, '2025-02');
            assert.equal(lecturasPedro[0].consumo_m3, 12);

            // Juan (Cliente 1) solo ve la suya de 2024
            const queryJuan = queryPedro.replaceAll('= 2', '= 1');
            const lecturasJuan = db.prepare(queryJuan).all();
            assert.equal(lecturasJuan.length, 1);
            assert.equal(lecturasJuan[0].periodo, '2024-06');
            assert.equal(lecturasJuan[0].consumo_m3, 25);
        });
    });
});
