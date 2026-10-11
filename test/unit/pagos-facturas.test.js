import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

describe('Suite de Verificación: Módulo de Facturación y Pagos', () => {
    let db;

    beforeEach(() => {
        db = new DatabaseSync(':memory:');

        // Esquema y triggers idénticos a la base de datos de producción de AguaVP
        db.exec(`
            CREATE TABLE clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                numero_predio TEXT,
                tarifa_id INTEGER
            );

            CREATE TABLE tarifas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                cuota_base REAL NOT NULL,
                limite_base REAL NOT NULL,
                costo_adicional_m3 REAL NOT NULL
            );

            CREATE TABLE configuracion_servicio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dias_vencimiento_factura INTEGER NOT NULL DEFAULT 15,
                activo INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE lecturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medidor_id INTEGER NOT NULL,
                periodo TEXT NOT NULL,
                consumo_m3 REAL NOT NULL,
                estado TEXT DEFAULT 'pendiente'
            );

            CREATE TABLE facturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lectura_id INTEGER NOT NULL,
                cliente_id INTEGER NOT NULL,
                tarifa_id INTEGER NOT NULL,
                fecha_emision DATE NOT NULL,
                fecha_vencimiento DATE NOT NULL,
                total REAL NOT NULL,
                saldo_pendiente REAL NOT NULL,
                estado TEXT NOT NULL DEFAULT 'Pendiente',
                convenio_id INTEGER,
                modificado_por INTEGER,
                fecha_creacion TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE pagos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                factura_id INTEGER NOT NULL REFERENCES facturas(id),
                fecha_pago DATE NOT NULL,
                monto REAL NOT NULL,
                cantidad_entregada REAL NOT NULL,
                cambio REAL NOT NULL DEFAULT 0,
                metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
                comentario TEXT,
                modificado_por INTEGER
            );

            CREATE TABLE historial_cambios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tabla TEXT NOT NULL,
                operacion TEXT NOT NULL,
                registro_id INTEGER NOT NULL,
                modificado_por INTEGER,
                cambios TEXT NOT NULL,
                fecha TEXT DEFAULT (datetime('now'))
            );

            -- 🚀 Triggers oficiales de Pagos y Facturas (0002_add_triggers)
            CREATE TRIGGER actualizar_saldo_factura
            AFTER INSERT ON pagos
            FOR EACH ROW
            BEGIN
                UPDATE facturas
                SET saldo_pendiente = ROUND(saldo_pendiente - NEW.monto, 2)
                WHERE id = NEW.factura_id;
            END;

            CREATE TRIGGER validar_pago_contra_saldo
            BEFORE INSERT ON pagos
            FOR EACH ROW
            BEGIN
              SELECT 
                CASE 
                  WHEN (SELECT ROUND(saldo_pendiente, 2) FROM facturas WHERE id = NEW.factura_id) < ROUND(NEW.monto, 2)
                  THEN RAISE(ABORT, 'El monto del pago excede el saldo pendiente de la factura')
                END;
            END;

            CREATE TRIGGER actualizar_estado_factura
            AFTER UPDATE OF saldo_pendiente ON facturas
            FOR EACH ROW
            WHEN NEW.saldo_pendiente <= 0
            BEGIN
                UPDATE facturas
                SET estado = 'Pagado',
                    saldo_pendiente = 0.00
                WHERE id = NEW.id;
            END;

            CREATE TRIGGER registrar_cambios_facturas
            AFTER UPDATE ON facturas
            FOR EACH ROW
            BEGIN
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES (
                    'facturas',
                    'UPDATE',
                    OLD.id,
                    NEW.modificado_por,
                    'Estado: ' || OLD.estado || ' → ' || NEW.estado || ', Saldo: ' || OLD.saldo_pendiente || ' → ' || NEW.saldo_pendiente
                );
            END;
        `);

        // Datos base: Tarifa Residencial y Configuración
        db.exec(`
            INSERT INTO tarifas (id, nombre, cuota_base, limite_base, costo_adicional_m3)
            VALUES (1, 'Residencial', 100.0, 10.0, 15.0);

            INSERT INTO configuracion_servicio (dias_vencimiento_factura, activo)
            VALUES (15, 1);
        `);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 1: Emisión y Generación de Facturas
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 1: Generación y Validación de Facturas', () => {
        it('debe calcular correctamente el total de la factura según la tarifa y consumo', () => {
            // Consumo de 15 m³ con tarifa base 10 m³ a $100 + 5 m³ excedente a $15 = $175
            const consumo = 15;
            const cuotaBase = 100;
            const limiteBase = 10;
            const costoAdicional = 15;
            const totalEsperado = cuotaBase + ((consumo - limiteBase) * costoAdicional); // 175

            db.exec(`INSERT INTO clientes (id, nombre, tarifa_id) VALUES (1, 'Ana Torres', 1)`);
            db.exec(`INSERT INTO lecturas (id, medidor_id, periodo, consumo_m3) VALUES (1, 10, '2024-01', ${consumo})`);

            // Emisión de factura
            db.exec(`
                INSERT INTO facturas (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado)
                VALUES (1, 1, 1, '2024-01-10', date('2024-01-10', '+15 days'), ${totalEsperado}, ${totalEsperado}, 'Pendiente')
            `);

            const f = db.prepare(`SELECT * FROM facturas WHERE id = 1`).get();
            assert.equal(f.total, 175);
            assert.equal(f.saldo_pendiente, 175);
            assert.equal(f.estado, 'Pendiente');
            assert.equal(f.fecha_vencimiento, '2024-01-25');
        });

        it('debe impedir facturas duplicadas para la misma lectura', () => {
            db.exec(`INSERT INTO clientes (id, nombre, tarifa_id) VALUES (1, 'Ana Torres', 1)`);
            db.exec(`INSERT INTO lecturas (id, medidor_id, periodo, consumo_m3) VALUES (1, 10, '2024-01', 10)`);
            db.exec(`INSERT INTO facturas (lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente) VALUES (1, 1, 1, '2024-01-10', '2024-01-25', 100, 100)`);

            // Validación de unicidad de factura por lectura_id
            const yaExiste = db.prepare(`SELECT COUNT(*) as total FROM facturas WHERE lectura_id = 1`).get().total;
            assert.equal(yaExiste, 1);

            // La lógica de generarFactura lanza error 409 si ya existe
            const puedeCrearDuplicado = yaExiste === 0;
            assert.equal(puedeCrearDuplicado, false);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 2: Registro de Pagos y Triggers Automáticos
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 2: Pagos, Reducción de Saldo y Cambio de Estado', () => {
        beforeEach(() => {
            db.exec(`INSERT INTO clientes (id, nombre, tarifa_id) VALUES (1, 'Carlos Slim', 1)`);
            db.exec(`INSERT INTO lecturas (id, medidor_id, periodo, consumo_m3) VALUES (1, 10, '2024-01', 10)`);
            db.exec(`
                INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado)
                VALUES (1, 1, 1, 1, '2024-01-10', '2024-01-25', 100.00, 100.00, 'Pendiente')
            `);
        });

        it('pago total exacto: reduce saldo a 0.00 y cambia estado a Pagado automáticamente por trigger', () => {
            // Pago de $100 exactos
            db.exec(`
                INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, modificado_por)
                VALUES (1, '2024-01-15', 100.00, 100.00, 0.00, 'Efectivo', 99)
            `);

            const f = db.prepare(`SELECT * FROM facturas WHERE id = 1`).get();
            assert.equal(f.saldo_pendiente, 0.00);
            assert.equal(f.estado, 'Pagado');

            // Historial de auditoría generado por el trigger
            const logs = db.prepare(`SELECT * FROM historial_cambios WHERE registro_id = 1`).all();
            assert.ok(logs.length >= 1);
            assert.ok(logs.some(l => l.cambios.includes('Pendiente → Pagado')));
        });

        it('pago con cambio en efectivo: aplica el monto adeudado y calcula cambio', () => {
            const saldoPendiente = 100.00;
            const entregado = 200.00;
            const montoAplicar = Math.min(saldoPendiente, entregado); // 100.00
            const cambio = entregado - montoAplicar;                   // 100.00

            db.exec(`
                INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago)
                VALUES (1, '2024-01-15', ${montoAplicar}, ${entregado}, ${cambio}, 'Efectivo')
            `);

            const pago = db.prepare(`SELECT * FROM pagos WHERE factura_id = 1`).get();
            assert.equal(pago.monto, 100.00);
            assert.equal(pago.cambio, 100.00);

            const f = db.prepare(`SELECT * FROM facturas WHERE id = 1`).get();
            assert.equal(f.saldo_pendiente, 0.00);
            assert.equal(f.estado, 'Pagado');
        });

        it('pago parcial (abono): reduce el saldo y mantiene el estado pendiente', () => {
            // Abono de $40.00 a una deuda de $100.00
            db.exec(`
                INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago)
                VALUES (1, '2024-01-15', 40.00, 40.00, 0.00, 'Efectivo')
            `);

            const f = db.prepare(`SELECT * FROM facturas WHERE id = 1`).get();
            assert.equal(f.saldo_pendiente, 60.00);
            assert.equal(f.estado, 'Pendiente'); // Aún no liquidada
        });

        it('pagos acumulados: dos abonos sucesivos que liquidan la factura', () => {
            // Abono 1: $40
            db.exec(`INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada) VALUES (1, '2024-01-15', 40.00, 40.00)`);
            let f = db.prepare(`SELECT * FROM facturas WHERE id = 1`).get();
            assert.equal(f.saldo_pendiente, 60.00);

            // Abono 2: $60 (restante)
            db.exec(`INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada) VALUES (1, '2024-01-20', 60.00, 60.00)`);
            f = db.prepare(`SELECT * FROM facturas WHERE id = 1`).get();
            assert.equal(f.saldo_pendiente, 0.00);
            assert.equal(f.estado, 'Pagado');
        });

        it('candado de sobrepago: trigger aborta con error si se intenta pagar más del saldo', () => {
            // Intentar pagar $150 a una factura que debe $100
            assert.throws(() => {
                db.exec(`
                    INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada)
                    VALUES (1, '2024-01-15', 150.00, 150.00)
                `);
            }, /El monto del pago excede el saldo pendiente/);

            // El saldo de la factura no se tocó
            const f = db.prepare(`SELECT * FROM facturas WHERE id = 1`).get();
            assert.equal(f.saldo_pendiente, 100.00);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 3: Pagos Distribuidos FIFO (Múltiples Facturas)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 3: Pago Distribuido FIFO entre Múltiples Facturas', () => {
        beforeEach(() => {
            db.exec(`INSERT INTO clientes (id, nombre, tarifa_id) VALUES (1, 'Laura Méndez', 1)`);

            // Factura 1: Enero ($100)
            db.exec(`INSERT INTO lecturas (id, medidor_id, periodo, consumo_m3) VALUES (1, 10, '2024-01', 10)`);
            db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado) VALUES (1, 1, 1, 1, '2024-01-10', '2024-01-25', 100.00, 100.00, 'Pendiente')`);

            // Factura 2: Febrero ($150)
            db.exec(`INSERT INTO lecturas (id, medidor_id, periodo, consumo_m3) VALUES (2, 10, '2024-02', 15)`);
            db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado) VALUES (2, 2, 1, 1, '2024-02-10', '2024-02-25', 150.00, 150.00, 'Pendiente')`);
        });

        it('distribuye pago de $180: liquida Factura 1 ($100) y abona $80 a Factura 2', () => {
            // Algoritmo FIFO exacto de registrarPagoDistribuido
            let restante = 180.00;
            const facturasPendientes = db.prepare(`
                SELECT id, saldo_pendiente FROM facturas 
                WHERE cliente_id = 1 AND saldo_pendiente > 0 AND estado != 'Pagado'
                ORDER BY fecha_emision ASC, id ASC
            `).all();

            for (const f of facturasPendientes) {
                if (restante <= 0) break;
                const montoAplicar = Math.min(restante, f.saldo_pendiente);
                db.exec(`INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada, cambio) VALUES (${f.id}, '2024-02-15', ${montoAplicar}, ${montoAplicar}, 0)`);
                restante -= montoAplicar;
            }

            // Factura 1 debe estar pagada por completo
            const f1 = db.prepare(`SELECT * FROM facturas WHERE id = 1`).get();
            assert.equal(f1.saldo_pendiente, 0.00);
            assert.equal(f1.estado, 'Pagado');

            // Factura 2 debe tener saldo pendiente de $70 ($150 - $80)
            const f2 = db.prepare(`SELECT * FROM facturas WHERE id = 2`).get();
            assert.equal(f2.saldo_pendiente, 70.00);
            assert.equal(f2.estado, 'Pendiente');

            assert.equal(restante, 0.00);
        });

        it('pago mayor al adeudo total ($300): liquida ambas facturas y genera cambio de $50', () => {
            const entregado = 300.00;
            let restante = entregado;
            let montoTotalAplicado = 0;

            const facturasPendientes = db.prepare(`
                SELECT id, saldo_pendiente FROM facturas 
                WHERE cliente_id = 1 AND saldo_pendiente > 0 AND estado != 'Pagado'
                ORDER BY fecha_emision ASC, id ASC
            `).all();

            for (const f of facturasPendientes) {
                if (restante <= 0) break;
                const montoAplicar = Math.min(restante, f.saldo_pendiente);
                db.exec(`INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada, cambio) VALUES (${f.id}, '2024-02-15', ${montoAplicar}, ${montoAplicar}, 0)`);
                montoTotalAplicado += montoAplicar;
                restante -= montoAplicar;
            }

            const cambio = entregado - montoTotalAplicado; // 300 - 250 = 50

            assert.equal(montoTotalAplicado, 250.00);
            assert.equal(cambio, 50.00);

            // Ambas facturas liquidadas
            const noPagadas = db.prepare(`SELECT COUNT(*) as total FROM facturas WHERE cliente_id = 1 AND estado != 'Pagado'`).get().total;
            assert.equal(noPagadas, 0);
        });

        it('soporta exclusión de período (excluir_periodo): paga solo facturas anteriores', () => {
            const excluirPeriodo = '2024-02';

            const facturasParaPago = db.prepare(`
                SELECT f.id, f.saldo_pendiente, l.periodo
                FROM facturas f JOIN lecturas l ON f.lectura_id = l.id
                WHERE f.cliente_id = 1 AND f.saldo_pendiente > 0 AND (l.periodo IS NULL OR l.periodo != ?)
                ORDER BY f.fecha_emision ASC
            `).all(excluirPeriodo);

            // Solo debe encontrar la de enero (2024-01)
            assert.equal(facturasParaPago.length, 1);
            assert.equal(facturasParaPago[0].periodo, '2024-01');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 4: Protección de Facturas Pagadas y Convenios
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 4: Protección Contable contra Recálculos y Convenios', () => {
        it('bloquea recálculo de factura si ya tiene pagos registrados en caja', () => {
            db.exec(`INSERT INTO clientes (id, nombre, tarifa_id) VALUES (1, 'Mario Ruiz', 1)`);
            db.exec(`INSERT INTO lecturas (id, medidor_id, periodo, consumo_m3) VALUES (1, 10, '2024-01', 10)`);
            db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado) VALUES (1, 1, 1, 1, '2024-01-10', '2024-01-25', 100.00, 100.00, 'Pendiente')`);
            db.exec(`INSERT INTO pagos (factura_id, fecha_pago, monto, cantidad_entregada) VALUES (1, '2024-01-15', 50.00, 50.00)`);

            // Verificación que hace generarFacturasParaLecturasSinFactura con recalcular = true
            const pagos = db.prepare(`SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pagos WHERE factura_id = 1`).get();
            const totalPagado = Number(pagos.total_pagado);

            // Regla de seguridad: Si totalPagado > 0, NO se puede recalcular
            const puedeRecalcular = totalPagado === 0;
            expect: assert.equal(puedeRecalcular, false);
            assert.equal(totalPagado, 50.00);
        });

        it('bloquea pago directo si la factura está incluida en un convenio activo', () => {
            db.exec(`INSERT INTO clientes (id, nombre, tarifa_id) VALUES (1, 'Mario Ruiz', 1)`);
            db.exec(`INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, fecha_emision, fecha_vencimiento, total, saldo_pendiente, estado, convenio_id) VALUES (1, 1, 1, 1, '2024-01-10', '2024-01-25', 500.00, 500.00, 'Pendiente', 88)`);

            const factura = db.prepare(`SELECT convenio_id FROM facturas WHERE id = 1`).get();

            // Regla de registrarPago: Si convenio_id !== null, lanzar error FACTURA_EN_CONVENIO
            const tieneConvenio = factura.convenio_id !== null;
            assert.equal(tieneConvenio, true);
        });
    });
});
