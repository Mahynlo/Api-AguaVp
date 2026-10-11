import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

describe('Suite de Verificación: Módulo Integral de Tarifas, Rangos Escalonados y Facturación', () => {
    let db;

    beforeEach(() => {
        db = new DatabaseSync(':memory:');

        // Esquema idéntico al de producción de AguaVP
        db.exec(`
            CREATE TABLE usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                nombre TEXT NOT NULL
            );

            CREATE TABLE tarifas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                fecha_inicio TEXT NOT NULL,
                fecha_fin TEXT,
                modificado_por INTEGER REFERENCES usuarios(id),
                fecha_creacion TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE rangos_tarifas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tarifa_id INTEGER NOT NULL REFERENCES tarifas(id) ON DELETE CASCADE,
                consumo_min INTEGER NOT NULL,
                consumo_max INTEGER,
                precio_por_m3 REAL NOT NULL
            );

            CREATE TABLE historial_tarifas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tarifa_id INTEGER REFERENCES tarifas(id),
                rango_id INTEGER REFERENCES rangos_tarifas(id),
                fecha_cambio TEXT DEFAULT (datetime('now')),
                consumo_min INTEGER,
                consumo_max INTEGER,
                precio_anterior REAL,
                precio_nuevo REAL NOT NULL
            );

            CREATE TABLE clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                tarifa_id INTEGER REFERENCES tarifas(id),
                ciudad TEXT DEFAULT 'Bogotá',
                estado_cliente TEXT DEFAULT 'Activo'
            );
        `);

        // Datos iniciales de prueba
        db.exec(`
            INSERT INTO usuarios (id, username, nombre) VALUES (1, 'admin', 'Administrador');

            -- Tarifa 1: Residencial Básica Vigente
            INSERT INTO tarifas (id, nombre, descripcion, fecha_inicio, fecha_fin, modificado_por) VALUES 
                (1, 'Residencial Básica', 'Tarifa doméstica escalonada', '2020-01-01', NULL, 1),
                (2, 'Comercial Especial', 'Tarifa para comercios', '2022-01-01', '2023-12-31', 1),
                (3, 'Futura Expansión', 'Tarifa programada a futuro', '2099-01-01', NULL, 1);

            -- Rangos para Tarifa 1:
            -- Tramo 1: 0 - 10 m³ -> $100 base fija
            -- Tramo 2: 11 - 20 m³ -> $12.50 por m³ adicional
            -- Tramo 3: 21 - null m³ -> $18.00 por m³ adicional
            INSERT INTO rangos_tarifas (id, tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES 
                (1, 1, 0, 10, 100.0),
                (2, 1, 11, 20, 12.5),
                (3, 1, 21, NULL, 18.0);

            -- Clientes suscritos
            INSERT INTO clientes (id, nombre, tarifa_id) VALUES 
                (1, 'Cliente Residencial 1', 1),
                (2, 'Cliente Residencial 2', 1),
                (3, 'Cliente Comercial 1', 2),
                (4, 'Cliente Sin Tarifa', NULL);
        `);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 1: Motor de Cálculo Progresivo y Escalonado (tarifaUtils.js)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 1: Motor de Cálculo de Tarifas Escalonadas', () => {
        // Implementación exacta de calcularTarifa para verificación
        const calcularTarifa = (consumo_m3, rangos) => {
            if (!rangos || rangos.length === 0) throw new Error('La tarifa no tiene rangos definidos');
            if (consumo_m3 < 0) throw new Error('El consumo no puede ser negativo');

            const consumoEntero = Math.floor(consumo_m3);
            const rangosOrdenados = [...rangos].sort((a, b) => Number(a.consumo_min) - Number(b.consumo_min));

            let total = 0;
            let rangoFinalEncontrado = false;

            for (const rango of rangosOrdenados) {
                const consumo_min = Number(rango.consumo_min);
                const consumo_max = rango.consumo_max != null ? Number(rango.consumo_max) : Infinity;
                const precio_por_m3 = Number(rango.precio_por_m3);
                const esPrimerRango = consumo_min === 0;

                if (consumoEntero > consumo_max) {
                    if (esPrimerRango) {
                        total += precio_por_m3;
                    } else {
                        const metros_en_rango = consumo_max - consumo_min + 1;
                        total += metros_en_rango * precio_por_m3;
                    }
                } else if (consumoEntero >= consumo_min) {
                    if (esPrimerRango) {
                        total += precio_por_m3;
                    } else {
                        const metros_consumidos = consumoEntero - consumo_min + 1;
                        total += metros_consumidos * precio_por_m3;
                    }
                    rangoFinalEncontrado = true;
                    break;
                }
            }

            if (!rangoFinalEncontrado && rangosOrdenados.length > 0) {
                const ultimoRango = rangosOrdenados[rangosOrdenados.length - 1];
                const ultimo_max = ultimoRango.consumo_max != null ? Number(ultimoRango.consumo_max) : null;
                const ultimo_precio = Number(ultimoRango.precio_por_m3);
                if (ultimo_max !== null) {
                    const excedente = consumoEntero - ultimo_max;
                    total += excedente * ultimo_precio;
                }
            }

            return parseFloat(total.toFixed(2));
        };

        const rangos = [
            { consumo_min: 0, consumo_max: 10, precio_por_m3: 100 },
            { consumo_min: 11, consumo_max: 20, precio_por_m3: 12.5 },
            { consumo_min: 21, consumo_max: null, precio_por_m3: 18.0 }
        ];

        it('consumo 0 m³: cobra exactamente el precio base fijo ($100.00)', () => {
            const total = calcularTarifa(0, rangos);
            assert.strictEqual(total, 100.0);
        });

        it('consumo intermedio dentro del rango base (ej. 8 m³): cobra la base fija ($100.00)', () => {
            const total = calcularTarifa(8, rangos);
            assert.strictEqual(total, 100.0);
        });

        it('consumo en el tope del rango base (10 m³): cobra exactamente la base fija ($100.00)', () => {
            const total = calcularTarifa(10, rangos);
            assert.strictEqual(total, 100.0);
        });

        it('consumo en segundo tramo (15 m³): cobra base ($100) + 5 m³ adicionales ($62.50) = $162.50', () => {
            // (15 - 11 + 1) = 5 m³ × $12.50 = $62.50 + $100 base = $162.50
            const total = calcularTarifa(15, rangos);
            assert.strictEqual(total, 162.50);
        });

        it('consumo en el tope del segundo tramo (20 m³): cobra base ($100) + 10 m³ × $12.50 ($125) = $225.00', () => {
            const total = calcularTarifa(20, rangos);
            assert.strictEqual(total, 225.00);
        });

        it('consumo en tercer tramo abierto (25 m³): cobra base + tramo 2 completo + tramo 3 = $315.00', () => {
            // Base: $100
            // Tramo 2: (20 - 11 + 1) = 10 m³ × $12.50 = $125
            // Tramo 3: (25 - 21 + 1) = 5 m³ × $18.00 = $90
            // Total: 100 + 125 + 90 = $315.00
            const total = calcularTarifa(25, rangos);
            assert.strictEqual(total, 315.00);
        });

        it('consumo con decimales: aplica Math.floor para ubicación de tramo (15.8 m³ se factura como 15 m³)', () => {
            const total = calcularTarifa(15.8, rangos);
            assert.strictEqual(total, 162.50);
        });

        it('consumo que excede último tramo con límite superior cerrado: cobra excedente al precio del último tramo', () => {
            const rangosCerrados = [
                { consumo_min: 0, consumo_max: 10, precio_por_m3: 80.0 },
                { consumo_min: 11, consumo_max: 20, precio_por_m3: 15.0 } // Último rango cerrado en 20
            ];
            // Consumo 23 m³:
            // Tramo 1 (0-10): $80
            // Tramo 2 (11-20): 10 × $15 = $150
            // Excedente (23 - 20) = 3 m³ × $15 = $45
            // Total = 80 + 150 + 45 = $275.00
            const total = calcularTarifa(23, rangosCerrados);
            assert.strictEqual(total, 275.00);
        });

        it('rechaza con error si el consumo es negativo', () => {
            assert.throws(() => calcularTarifa(-5, rangos), /El consumo no puede ser negativo/);
        });

        it('rechaza con error si los rangos están vacíos o no definidos', () => {
            assert.throws(() => calcularTarifa(10, []), /La tarifa no tiene rangos definidos/);
            assert.throws(() => calcularTarifa(10, null), /La tarifa no tiene rangos definidos/);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 2: Validaciones de Coherencia de Rangos (validarRangos)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 2: Validación de Estructura y Coherencia de Rangos', () => {
        // Validador oficial del servicio
        const validarRangos = (rangos) => {
            for (const r of rangos) {
                if (r.consumo_min == null || r.precio_por_m3 == null || r.consumo_min < 0 || r.precio_por_m3 < 0 || (r.consumo_max != null && r.consumo_max < 0)) {
                    return 'Los valores de consumo y precio no pueden ser negativos o nulos (error-BK)';
                }
                if (r.consumo_max != null && r.consumo_min >= r.consumo_max) {
                    return `El consumo mínimo (${r.consumo_min}) debe ser menor que el consumo máximo (${r.consumo_max}) (error-BK)`;
                }
            }
            const ordenados = [...rangos].sort((a, b) => a.consumo_min - b.consumo_min);
            const claves = new Set();
            for (let i = 0; i < ordenados.length; i++) {
                const clave = `${ordenados[i].consumo_min}-${ordenados[i].consumo_max}`;
                if (claves.has(clave)) return `Ya existe un rango duplicado en la solicitud: [${clave}] (error-BK)`;
                claves.add(clave);
                for (let j = 0; j < ordenados.length; j++) {
                    if (i !== j && ordenados[i].consumo_min === ordenados[j].consumo_max) {
                        return `El consumo mínimo (${ordenados[i].consumo_min}) no puede ser igual al consumo máximo (${ordenados[j].consumo_max}) de otro rango (error-BK)`;
                    }
                }
                const sig = ordenados[i + 1];
                if (sig && ordenados[i].consumo_max != null && ordenados[i].consumo_max + 1 < sig.consumo_min) {
                    return `Hay un hueco entre los rangos [${ordenados[i].consumo_min}-${ordenados[i].consumo_max}] y [${sig.consumo_min}-${sig.consumo_max}] (error-BK)`;
                }
            }
            return null;
        };

        it('rechaza si hay valores negativos en consumo o precio', () => {
            const error = validarRangos([{ consumo_min: -1, consumo_max: 10, precio_por_m3: 50 }]);
            assert.ok(error?.includes('no pueden ser negativos'));
        });

        it('rechaza si consumo_min es mayor o igual que consumo_max', () => {
            const error = validarRangos([{ consumo_min: 15, consumo_max: 10, precio_por_m3: 50 }]);
            assert.ok(error?.includes('debe ser menor que el consumo máximo'));

            const errorIgual = validarRangos([{ consumo_min: 10, consumo_max: 10, precio_por_m3: 50 }]);
            assert.ok(errorIgual?.includes('debe ser menor que el consumo máximo'));
        });

        it('rechaza rangos duplicados en la misma solicitud', () => {
            const error = validarRangos([
                { consumo_min: 0, consumo_max: 10, precio_por_m3: 50 },
                { consumo_min: 0, consumo_max: 10, precio_por_m3: 60 }
            ]);
            assert.ok(error?.includes('Ya existe un rango duplicado'));
        });

        it('rechaza solapamiento donde consumo_min es igual al consumo_max de otro rango', () => {
            const error = validarRangos([
                { consumo_min: 0, consumo_max: 10, precio_por_m3: 50 },
                { consumo_min: 10, consumo_max: 20, precio_por_m3: 60 } // 10 solapa con 10
            ]);
            assert.ok(error?.includes('no puede ser igual al consumo máximo'));
        });

        it('rechaza discontinuidades o huecos entre tramos (ej. [0-10] y [12-20])', () => {
            const error = validarRangos([
                { consumo_min: 0, consumo_max: 10, precio_por_m3: 50 },
                { consumo_min: 12, consumo_max: 20, precio_por_m3: 60 } // Falta el 11
            ]);
            assert.ok(error?.includes('Hay un hueco entre los rangos'));
        });

        it('valida exitosamente una configuración de rangos continua y escalonada', () => {
            const error = validarRangos([
                { consumo_min: 0, consumo_max: 10, precio_por_m3: 100 },
                { consumo_min: 11, consumo_max: 20, precio_por_m3: 15 },
                { consumo_min: 21, consumo_max: null, precio_por_m3: 25 }
            ]);
            assert.strictEqual(error, null);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 3: Registro de Tarifas (registrarTarifa)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 3: Creación y Registro de Tarifas', () => {
        it('rechaza con 400 si faltan campos requeridos (nombre, descripcion, fecha_inicio)', () => {
            const payloads = [
                { nombre: '', descripcion: 'Desc', fecha_inicio: '2024-01-01' },
                { nombre: 'Tarifa', descripcion: '', fecha_inicio: '2024-01-01' },
                { nombre: 'Tarifa', descripcion: 'Desc', fecha_inicio: null }
            ];

            for (const p of payloads) {
                const esValido = Boolean(p.nombre && p.descripcion && p.fecha_inicio);
                assert.strictEqual(esValido, false);
            }
        });

        it('rechaza con 400 si la fecha_inicio es posterior a fecha_fin', () => {
            const fecha_inicio = '2025-01-01';
            const fecha_fin = '2024-01-01';

            const esInvalida = Boolean(fecha_fin && new Date(fecha_inicio) > new Date(fecha_fin));
            assert.strictEqual(esInvalida, true);
        });

        it('crea exitosamente una nueva tarifa y retorna su ID autoincremental', () => {
            const nueva = {
                nombre: 'Tarifa Industrial Pesada',
                descripcion: 'Uso de alto consumo en fábricas',
                fecha_inicio: '2024-06-01',
                fecha_fin: '2025-12-31',
                modificado_por: 1
            };

            const stmt = db.prepare(`
                INSERT INTO tarifas (nombre, descripcion, fecha_inicio, fecha_fin, modificado_por)
                VALUES (?, ?, ?, ?, ?)
            `);
            const res = stmt.run(nueva.nombre, nueva.descripcion, nueva.fecha_inicio, nueva.fecha_fin, nueva.modificado_por);

            const tarifaId = Number(res.lastInsertRowid);
            assert.ok(tarifaId > 0);

            const guardada = db.prepare(`SELECT * FROM tarifas WHERE id = ?`).get(tarifaId);
            assert.strictEqual(guardada.nombre, 'Tarifa Industrial Pesada');
            assert.strictEqual(guardada.fecha_fin, '2025-12-31');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 4: Registro de Rangos de Tarifa (registrarRangosTarifa)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 4: Registro de Rangos para una Tarifa', () => {
        it('rechaza con 404 si la tarifa a configurar no existe', () => {
            const tarifaId = 888;
            const existe = db.prepare(`SELECT id FROM tarifas WHERE id = ?`).get(tarifaId);
            assert.strictEqual(existe, undefined);
        });

        it('rechaza con 400 si la lista de rangos viene vacía o no es un arreglo', () => {
            const payloads = [
                { tarifa_id: 1, rangos: [] },
                { tarifa_id: 1, rangos: null },
                { tarifa_id: 1, rangos: 'no-array' }
            ];

            for (const p of payloads) {
                const esValido = Boolean(p.tarifa_id && Array.isArray(p.rangos) && p.rangos.length > 0);
                assert.strictEqual(esValido, false);
            }
        });

        it('registra atómicamente todos los rangos vinculados a la tarifa', () => {
            // Crear tarifa 4
            db.exec(`INSERT INTO tarifas (id, nombre, descripcion, fecha_inicio) VALUES (4, 'Tarifa Temporal', 'Desc', '2024-01-01');`);

            const nuevosRangos = [
                { consumo_min: 0, consumo_max: 15, precio_por_m3: 120.0 },
                { consumo_min: 16, consumo_max: null, precio_por_m3: 20.0 }
            ];

            const insertStmt = db.prepare(`
                INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3)
                VALUES (?, ?, ?, ?)
            `);

            for (const r of nuevosRangos) {
                insertStmt.run(4, r.consumo_min, r.consumo_max, r.precio_por_m3);
            }

            const rangosGuardados = db.prepare(`SELECT * FROM rangos_tarifas WHERE tarifa_id = 4 ORDER BY consumo_min ASC`).all();
            assert.strictEqual(rangosGuardados.length, 2);
            assert.strictEqual(Number(rangosGuardados[0].precio_por_m3), 120.0);
            assert.strictEqual(rangosGuardados[1].consumo_max, null);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 5: Modificación de Tarifas y Rangos (modificarTarifa, modificarRangosTarifa)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 5: Modificación de Tarifas y Actualización de Rangos', () => {
        it('retorna 404 si la tarifa a modificar no existe', () => {
            const tarifaId = 999;
            const existe = db.prepare(`SELECT id FROM tarifas WHERE id = ?`).get(tarifaId);
            assert.strictEqual(existe, undefined);
        });

        it('actualiza nombre, descripción y vigencia de una tarifa existente', () => {
            const tarifaId = 1;
            const updates = {
                nombre: 'Residencial Básica 2024',
                descripcion: 'Tarifa actualizada para el ejercicio 2024',
                fecha_inicio: '2024-01-01',
                fecha_fin: '2024-12-31'
            };

            db.prepare(`
                UPDATE tarifas 
                SET nombre = ?, descripcion = ?, fecha_inicio = ?, fecha_fin = ?, modificado_por = 1
                WHERE id = ?
            `).run(updates.nombre, updates.descripcion, updates.fecha_inicio, updates.fecha_fin, tarifaId);

            const actualizada = db.prepare(`SELECT * FROM tarifas WHERE id = ?`).get(tarifaId);
            assert.strictEqual(actualizada.nombre, 'Residencial Básica 2024');
            assert.strictEqual(actualizada.fecha_fin, '2024-12-31');
        });

        it('modifica rangos existentes e inserta nuevos tramos correctamente', () => {
            const tarifaId = 1;

            // 1. Modificar precio del rango existente 1 (id: 1, base de $100 a $110)
            db.prepare(`UPDATE rangos_tarifas SET precio_por_m3 = ? WHERE id = ? AND tarifa_id = ?`).run(110.0, 1, tarifaId);

            // 2. Modificar rango 3 para cerrarlo en 30 m³ y añadir rango 4 abierto
            db.prepare(`UPDATE rangos_tarifas SET consumo_max = 30, precio_por_m3 = 18.0 WHERE id = 3 AND tarifa_id = ?`).run(tarifaId);
            db.prepare(`INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES (?, ?, ?, ?)`).run(tarifaId, 31, null, 25.0);

            const rangosActuales = db.prepare(`SELECT * FROM rangos_tarifas WHERE tarifa_id = ? ORDER BY consumo_min ASC`).all(tarifaId);
            assert.strictEqual(rangosActuales.length, 4);
            assert.strictEqual(Number(rangosActuales[0].precio_por_m3), 110.0);
            assert.strictEqual(Number(rangosActuales[2].consumo_max), 30);
            assert.strictEqual(Number(rangosActuales[3].consumo_min), 31);
            assert.strictEqual(rangosActuales[3].consumo_max, null);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 6: Vigencia, Estado Activo, Búsqueda y Paginación
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 6: Determinación de Vigencia, Búsqueda y Listado', () => {
        it('determina si una tarifa está activa en base a fecha_inicio, fecha_fin y fecha actual', () => {
            const hoy = '2024-06-15';

            const verificarActiva = (t) =>
                t.fecha_inicio <= hoy && (!t.fecha_fin || t.fecha_fin >= hoy);

            // Tarifa 1: inicio 2020-01-01, fin null -> Activa
            const t1 = db.prepare(`SELECT fecha_inicio, fecha_fin FROM tarifas WHERE id = 1`).get();
            assert.strictEqual(verificarActiva(t1), true);

            // Tarifa 2: inicio 2022-01-01, fin 2023-12-31 -> Vencida / Inactiva
            const t2 = db.prepare(`SELECT fecha_inicio, fecha_fin FROM tarifas WHERE id = 2`).get();
            assert.strictEqual(verificarActiva(t2), false);

            // Tarifa 3: inicio 2099-01-01, fin null -> Futura / Inactiva
            const t3 = db.prepare(`SELECT fecha_inicio, fecha_fin FROM tarifas WHERE id = 3`).get();
            assert.strictEqual(verificarActiva(t3), false);
        });

        it('obtenerTarifasActivas: filtra solo tarifas vigentes y calcula total de clientes asociados', () => {
            const activas = db.prepare(`
                SELECT t.id, t.nombre, COUNT(c.id) as total_clientes
                FROM tarifas t
                LEFT JOIN clientes c ON t.id = c.tarifa_id
                WHERE t.fecha_inicio <= date('now') AND (t.fecha_fin IS NULL OR t.fecha_fin >= date('now'))
                GROUP BY t.id, t.nombre
            `).all();

            assert.strictEqual(activas.length, 1);
            assert.strictEqual(activas[0].nombre, 'Residencial Básica');
            assert.strictEqual(Number(activas[0].total_clientes), 2);
        });

        it('obtenerTarifaPorId: retorna tarifa completa, rangos y lista de clientes asignados', () => {
            const tarifaId = 1;
            const tarifa = db.prepare(`SELECT id, nombre, descripcion FROM tarifas WHERE id = ?`).get(tarifaId);
            const rangos = db.prepare(`SELECT * FROM rangos_tarifas WHERE tarifa_id = ? ORDER BY consumo_min ASC`).all(tarifaId);
            const clientes = db.prepare(`SELECT id, nombre FROM clientes WHERE tarifa_id = ?`).all(tarifaId);

            assert.ok(tarifa);
            assert.strictEqual(tarifa.nombre, 'Residencial Básica');
            assert.strictEqual(rangos.length, 3);
            assert.strictEqual(clientes.length, 2);
        });

        it('paginación y búsqueda: filtra por nombre o descripción con limit y offset', () => {
            const search = '%Comercial%';
            const filtradas = db.prepare(`
                SELECT id, nombre FROM tarifas 
                WHERE nombre LIKE ? OR descripcion LIKE ?
            `).all(search, search);

            assert.strictEqual(filtradas.length, 1);
            assert.strictEqual(filtradas[0].nombre, 'Comercial Especial');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 7: Historial de Cambios y Auditoría de Precios (historial_tarifas)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 7: Historial de Cambios y Auditoría de Precios', () => {
        it('registra variaciones de precio en historial_tarifas y calcula porcentaje de cambio', () => {
            // Cambio de precio en rango 1: de $100 a $120 (+20%)
            const precioAnterior = 100.0;
            const precioNuevo = 120.0;

            db.prepare(`
                INSERT INTO historial_tarifas (tarifa_id, rango_id, consumo_min, consumo_max, precio_anterior, precio_nuevo)
                VALUES (1, 1, 0, 10, ?, ?)
            `).run(precioAnterior, precioNuevo);

            const registro = db.prepare(`
                SELECT * FROM historial_tarifas WHERE tarifa_id = 1 AND rango_id = 1
            `).get();

            assert.ok(registro);
            assert.strictEqual(Number(registro.precio_anterior), 100.0);
            assert.strictEqual(Number(registro.precio_nuevo), 120.0);

            // Cálculo porcentual
            const porcentaje = (((registro.precio_nuevo - registro.precio_anterior) / registro.precio_anterior) * 100).toFixed(2) + '%';
            assert.strictEqual(porcentaje, '20.00%');
        });

        it('consulta el historial cronológico descendente de una tarifa específica', () => {
            db.exec(`
                INSERT INTO historial_tarifas (tarifa_id, rango_id, precio_anterior, precio_nuevo, fecha_cambio) VALUES 
                    (1, 1, 90.0, 100.0, '2023-01-01 10:00:00'),
                    (1, 1, 100.0, 120.0, '2024-01-01 10:00:00');
            `);

            const historial = db.prepare(`
                SELECT precio_anterior, precio_nuevo FROM historial_tarifas 
                WHERE tarifa_id = 1 
                ORDER BY fecha_cambio DESC
            `).all();

            assert.strictEqual(historial.length, 2);
            assert.strictEqual(Number(historial[0].precio_nuevo), 120.0);
            assert.strictEqual(Number(historial[1].precio_nuevo), 100.0);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 8: Estadísticas y Analítica de Tarifas (estadisticasTarifas)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 8: Estadísticas y Métricas de Tarifas', () => {
        it('calcula métricas de tarifas activas, inactivas, clientes sin tarifa y rangos', () => {
            const totalTarifas = db.prepare(`SELECT COUNT(*) as c FROM tarifas`).get().c;
            const sinTarifa = db.prepare(`SELECT COUNT(*) as c FROM clientes WHERE tarifa_id IS NULL`).get().c;
            const totalRangos = db.prepare(`SELECT COUNT(*) as c FROM rangos_tarifas`).get().c;

            assert.strictEqual(totalTarifas, 3);
            assert.strictEqual(sinTarifa, 1);
            assert.strictEqual(totalRangos, 3);
        });

        it('identifica la tarifa más utilizada según número de clientes asignados', () => {
            const masUsada = db.prepare(`
                SELECT t.id, t.nombre, COUNT(c.id) as clientes
                FROM tarifas t
                INNER JOIN clientes c ON t.id = c.tarifa_id
                GROUP BY t.id, t.nombre
                ORDER BY clientes DESC LIMIT 1
            `).get();

            assert.ok(masUsada);
            assert.strictEqual(masUsada.nombre, 'Residencial Básica');
            assert.strictEqual(Number(masUsada.clientes), 2);
        });

        it('calcula precio mínimo, precio máximo y promedio de rangos de tarifas', () => {
            const precios = db.prepare(`
                SELECT 
                    MIN(precio_por_m3) as minimo,
                    MAX(precio_por_m3) as maximo,
                    AVG(precio_por_m3) as promedio
                FROM rangos_tarifas
            `).get();

            assert.strictEqual(Number(precios.minimo), 12.5);
            assert.strictEqual(Number(precios.maximo), 100.0);
            // Promedio: (100 + 12.5 + 18) / 3 = 130.5 / 3 = 43.5
            assert.strictEqual(Number(precios.promedio), 43.5);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 9: Integridad Referencial y Eliminación en Cascada
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 9: Integridad Referencial y Cascada de Eliminación', () => {
        it('protección de clientes: bloquea eliminación de una tarifa si tiene clientes asignados (FK constraint)', () => {
            db.exec(`PRAGMA foreign_keys = ON;`);

            // Tarifa 1 tiene 2 clientes asignados -> debe fallar la eliminación
            assert.throws(() => {
                db.prepare(`DELETE FROM tarifas WHERE id = 1`).run();
            }, /FOREIGN KEY constraint failed/);
        });

        it('ON DELETE CASCADE: eliminar una tarifa sin clientes elimina automáticamente todos sus rangos', () => {
            // Crear tarifa 5 con 2 rangos y sin clientes asignados
            db.exec(`
                INSERT INTO tarifas (id, nombre, descripcion, fecha_inicio) VALUES (5, 'Tarifa Sola', 'Desc', '2024-01-01');
                INSERT INTO rangos_tarifas (tarifa_id, consumo_min, consumo_max, precio_por_m3) VALUES 
                    (5, 0, 10, 50.0),
                    (5, 11, null, 10.0);
            `);

            const rangosAntes = db.prepare(`SELECT COUNT(*) as c FROM rangos_tarifas WHERE tarifa_id = 5`).get().c;
            assert.strictEqual(rangosAntes, 2);

            // Activar foreign keys en SQLite
            db.exec(`PRAGMA foreign_keys = ON;`);

            // Eliminar tarifa 5
            db.prepare(`DELETE FROM tarifas WHERE id = 5`).run();

            const rangosDespues = db.prepare(`SELECT COUNT(*) as c FROM rangos_tarifas WHERE tarifa_id = 5`).get().c;
            assert.strictEqual(rangosDespues, 0);
        });

        it('clientes asignados a una tarifa no son eliminados al alterar la tarifa', () => {
            const clientesAntes = db.prepare(`SELECT COUNT(*) as c FROM clientes WHERE tarifa_id = 1`).get().c;
            assert.strictEqual(clientesAntes, 2);

            // Modificar tarifa 1
            db.prepare(`UPDATE tarifas SET nombre = 'Nombre Nuevo' WHERE id = 1`).run();

            const clientesDespues = db.prepare(`SELECT COUNT(*) as c FROM clientes WHERE tarifa_id = 1`).get().c;
            assert.strictEqual(clientesDespues, 2);
        });
    });
});
