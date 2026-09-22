import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

describe('Suite de Verificación: Módulo de Rutas de Distribución y Asignación de Puntos', () => {
    let db;

    beforeEach(() => {
        db = new DatabaseSync(':memory:');

        // Esquema idéntico al de producción de AguaVP
        db.exec(`
            CREATE TABLE usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                usuario TEXT NOT NULL UNIQUE
            );

            CREATE TABLE clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                numero_predio TEXT,
                direccion TEXT,
                telefono TEXT,
                estado_cliente TEXT DEFAULT 'Activo'
            );

            CREATE TABLE medidores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER REFERENCES clientes(id),
                numero_serie TEXT NOT NULL UNIQUE,
                ubicacion TEXT,
                latitud REAL,
                longitud REAL,
                estado_medidor TEXT NOT NULL DEFAULT 'Activo',
                lectura_base REAL DEFAULT 0,
                capacidad_maxima REAL DEFAULT 99999
            );

            CREATE TABLE cliente_medidor_historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER NOT NULL,
                medidor_id INTEGER NOT NULL,
                fecha_asignacion TEXT,
                fecha_desvinculacion TEXT,
                motivo TEXT
            );

            CREATE TABLE rutas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                descripcion TEXT,
                fecha_creacion TEXT DEFAULT (DATE('now')),
                creado_por INTEGER REFERENCES usuarios(id),
                distancia_km REAL,
                ruta_json TEXT,
                instrucciones_json TEXT
            );

            CREATE TABLE rutas_puntos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ruta_id INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
                medidor_id INTEGER NOT NULL REFERENCES medidores(id),
                orden INTEGER NOT NULL
            );

            CREATE TABLE lecturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medidor_id INTEGER NOT NULL REFERENCES medidores(id),
                ruta_id INTEGER NOT NULL REFERENCES rutas(id),
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
                lectura_id INTEGER NOT NULL REFERENCES lecturas(id),
                cliente_id INTEGER NOT NULL REFERENCES clientes(id),
                tarifa_id INTEGER NOT NULL,
                total REAL NOT NULL,
                saldo_pendiente REAL NOT NULL,
                estado TEXT DEFAULT 'Pendiente'
            );
        `);

        // Datos base iniciales
        db.exec(`
            INSERT INTO usuarios (id, nombre, usuario) VALUES (1, 'Admin Sistema', 'admin');

            INSERT INTO clientes (id, nombre, numero_predio, direccion, telefono) VALUES 
                (1, 'Carlos Slim', 'PRED-101', 'Av. Reforma 100', '555-1111'),
                (2, 'Ana Torres', 'PRED-102', 'Av. Reforma 102', '555-2222'),
                (3, 'Luis Morales', 'PRED-103', 'Av. Reforma 104', '555-3333'),
                (4, 'Elena Vega', 'PRED-104', 'Av. Reforma 106', '555-4444');

            INSERT INTO medidores (id, cliente_id, numero_serie, lectura_base, capacidad_maxima) VALUES 
                (10, 1, 'MED-001', 0, 99999),
                (20, 2, 'MED-002', 10, 99999),
                (30, 3, 'MED-003', 5, 99999),
                (40, 4, 'MED-004', 0, 99999);
        `);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 1: Creación de Rutas y Validaciones
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 1: Creación de Rutas y Validaciones de Asignación', () => {
        it('rechaza con 400 si faltan campos obligatorios (nombre, creado_por, puntos)', () => {
            const payloads = [
                { nombre: '', creado_por: 1, puntos: [{ id: 10 }] },
                { nombre: 'Ruta Centro', creado_por: null, puntos: [{ id: 10 }] },
                { nombre: 'Ruta Centro', creado_por: 1, puntos: 'no-array' },
                { nombre: 'Ruta Centro', creado_por: 1, puntos: [{ sin_id: 10 }] }
            ];

            for (const payload of payloads) {
                const isValid = Boolean(
                    payload.nombre &&
                    payload.creado_por &&
                    Array.isArray(payload.puntos) &&
                    !payload.puntos.some(p => !p.id)
                );
                assert.strictEqual(isValid, false, `Payload inválido debería ser rechazado: ${JSON.stringify(payload)}`);
            }
        });

        it('rechaza con 400 si algún medidor especificado no existe en la base de datos', () => {
            const medidorIds = [10, 999]; // 999 no existe
            const placeholders = medidorIds.map(() => '?').join(',');
            const encontrados = db.prepare(`SELECT id FROM medidores WHERE id IN (${placeholders})`)
                .all(...medidorIds)
                .map(r => Number(r.id));

            const faltantes = medidorIds.filter(id => !encontrados.includes(id));

            assert.strictEqual(faltantes.length, 1);
            assert.strictEqual(faltantes[0], 999);
        });

        it('rechaza con 409 si algún medidor ya está asignado a otra ruta existente', () => {
            // Asignar medidor 10 a la ruta 1 previamente
            db.exec(`
                INSERT INTO rutas (id, nombre, creado_por) VALUES (1, 'Ruta Existente', 1);
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, 10, 1);
            `);

            // Intento de crear nueva ruta que incluye medidor 10 y medidor 20
            const nuevosMedidores = [10, 20];
            const placeholders = nuevosMedidores.map(() => '?').join(',');
            const duplicados = db.prepare(`
                SELECT medidor_id, ruta_id 
                FROM rutas_puntos 
                WHERE medidor_id IN (${placeholders})
            `).all(...nuevosMedidores);

            assert.strictEqual(duplicados.length, 1);
            assert.strictEqual(Number(duplicados[0].medidor_id), 10);
            assert.strictEqual(Number(duplicados[0].ruta_id), 1);
        });

        it('crea exitosamente una nueva ruta con puntos secuenciales ordenados (1..N)', () => {
            const nombre = 'Ruta Norte';
            const descripcion = 'Cobertura sector norte';
            const creado_por = 1;
            const distancia_km = 4.25;
            const ruta_calculada = [{ lat: 19.43, lng: -99.13 }];
            const instrucciones = [{ paso: 1, accion: 'Inicio en Reforma' }];
            const puntos = [{ id: 10 }, { id: 20 }, { id: 30 }];

            // 1. Insertar ruta
            const insertRuta = db.prepare(`
                INSERT INTO rutas (nombre, descripcion, creado_por, distancia_km, ruta_json, instrucciones_json)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                nombre,
                descripcion,
                creado_por,
                distancia_km,
                JSON.stringify(ruta_calculada),
                JSON.stringify(instrucciones)
            );

            const rutaId = Number(insertRuta.lastInsertRowid);
            assert.ok(rutaId > 0);

            // 2. Insertar puntos
            const insertPunto = db.prepare(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (?, ?, ?)`);
            puntos.forEach((p, idx) => {
                insertPunto.run(rutaId, p.id, idx + 1);
            });

            // Verificar inserción y orden
            const puntosGuardados = db.prepare(`
                SELECT medidor_id, orden FROM rutas_puntos WHERE ruta_id = ? ORDER BY orden ASC
            `).all(rutaId);

            assert.strictEqual(puntosGuardados.length, 3);
            assert.strictEqual(Number(puntosGuardados[0].medidor_id), 10);
            assert.strictEqual(Number(puntosGuardados[0].orden), 1);
            assert.strictEqual(Number(puntosGuardados[1].medidor_id), 20);
            assert.strictEqual(Number(puntosGuardados[1].orden), 2);
            assert.strictEqual(Number(puntosGuardados[2].medidor_id), 30);
            assert.strictEqual(Number(puntosGuardados[2].orden), 3);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 2: Adición de Medidores a Rutas Existentes
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 2: Adición de Medidores a Ruta Existente', () => {
        beforeEach(() => {
            db.exec(`
                INSERT INTO rutas (id, nombre, creado_por) VALUES (1, 'Ruta Alfa', 1);
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, 10, 1);
                INSERT INTO rutas (id, nombre, creado_por) VALUES (2, 'Ruta Beta', 1);
            `);
        });

        it('rechaza con 400 si faltan parámetros (ruta_id, medidor_id, orden)', () => {
            const bodyInvalido = { ruta_id: 1, medidor_id: null, orden: 2 };
            const isValid = Boolean(bodyInvalido.ruta_id && bodyInvalido.medidor_id && bodyInvalido.orden != null);
            assert.strictEqual(isValid, false);
        });

        it('rechaza con 409 si el medidor ya está asignado a otra ruta', () => {
            const medidorId = 10; // ya está en ruta 1
            const rutaDestino = 2;

            const existente = db.prepare(`SELECT ruta_id FROM rutas_puntos WHERE medidor_id = ?`).get(medidorId);
            assert.ok(existente, 'El medidor ya debe estar registrado');
            assert.strictEqual(Number(existente.ruta_id), 1);
            assert.notStrictEqual(Number(existente.ruta_id), rutaDestino);
        });

        it('agrega el medidor a la ruta con el orden especificado cuando está libre', () => {
            const medidorId = 20; // libre
            const rutaId = 1;
            const orden = 2;

            // Verificar si ya está en otra ruta
            const ocupado = db.prepare(`SELECT ruta_id FROM rutas_puntos WHERE medidor_id = ?`).get(medidorId);
            assert.strictEqual(ocupado, undefined);

            db.prepare(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (?, ?, ?)`).run(rutaId, medidorId, orden);

            const asignado = db.prepare(`SELECT * FROM rutas_puntos WHERE ruta_id = ? AND medidor_id = ?`).get(rutaId, medidorId);
            assert.ok(asignado);
            assert.strictEqual(Number(asignado.orden), 2);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 3: Reordenamiento y Eliminación de Puntos de Ruta
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 3: Reordenamiento Dinámico y Eliminación de Puntos', () => {
        beforeEach(() => {
            db.exec(`
                INSERT INTO rutas (id, nombre, creado_por) VALUES (1, 'Ruta Principal', 1);
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES 
                    (1, 10, 1),
                    (1, 20, 2),
                    (1, 30, 3),
                    (1, 40, 4);
            `);
        });

        it('reordena atómicamente todos los medidores de una ruta', () => {
            // Invertir orden: 40 -> 1, 30 -> 2, 20 -> 3, 10 -> 4
            const nuevoOrden = [
                { medidor_id: 40, orden: 1 },
                { medidor_id: 30, orden: 2 },
                { medidor_id: 20, orden: 3 },
                { medidor_id: 10, orden: 4 }
            ];

            // Validar que todos pertenecen a la ruta
            const medidorIds = nuevoOrden.map(o => o.medidor_id);
            const placeholders = medidorIds.map(() => '?').join(',');
            const pertenecientes = db.prepare(`
                SELECT medidor_id FROM rutas_puntos WHERE ruta_id = ? AND medidor_id IN (${placeholders})
            `).all(1, ...medidorIds);

            assert.strictEqual(pertenecientes.length, 4);

            // Actualizar orden
            const updateStmt = db.prepare(`UPDATE rutas_puntos SET orden = ? WHERE ruta_id = ? AND medidor_id = ?`);
            for (const item of nuevoOrden) {
                updateStmt.run(item.orden, 1, item.medidor_id);
            }

            const resultado = db.prepare(`SELECT medidor_id, orden FROM rutas_puntos WHERE ruta_id = 1 ORDER BY orden ASC`).all();
            assert.deepStrictEqual(
                resultado.map(r => ({ medidor_id: Number(r.medidor_id), orden: Number(r.orden) })),
                nuevoOrden
            );
        });

        it('rechaza reordenamiento si algún medidor no pertenece a la ruta', () => {
            const nuevoOrden = [
                { medidor_id: 10, orden: 1 },
                { medidor_id: 99, orden: 2 } // 99 no pertenece
            ];

            const medidorIds = nuevoOrden.map(o => o.medidor_id);
            const placeholders = medidorIds.map(() => '?').join(',');
            const pertenecientes = db.prepare(`
                SELECT medidor_id FROM rutas_puntos WHERE ruta_id = ? AND medidor_id IN (${placeholders})
            `).all(1, ...medidorIds);

            assert.notStrictEqual(pertenecientes.length, nuevoOrden.length);
        });

        it('elimina un punto de la ruta y reordena automáticamente los medidores posteriores (orden - 1)', () => {
            // Eliminar medidor 20 (orden 2)
            const rutaId = 1;
            const medidorAEliminar = 20;

            const punto = db.prepare(`SELECT orden FROM rutas_puntos WHERE ruta_id = ? AND medidor_id = ?`).get(rutaId, medidorAEliminar);
            assert.strictEqual(Number(punto.orden), 2);
            const ordenEliminado = punto.orden;

            // 1. Eliminar
            db.prepare(`DELETE FROM rutas_puntos WHERE ruta_id = ? AND medidor_id = ?`).run(rutaId, medidorAEliminar);

            // 2. Reordenar restantes
            db.prepare(`UPDATE rutas_puntos SET orden = orden - 1 WHERE ruta_id = ? AND orden > ?`).run(rutaId, ordenEliminado);

            const restantes = db.prepare(`SELECT medidor_id, orden FROM rutas_puntos WHERE ruta_id = ? ORDER BY orden ASC`).all(rutaId);
            assert.strictEqual(restantes.length, 3);
            assert.deepStrictEqual(
                restantes.map(r => ({ medidor_id: Number(r.medidor_id), orden: Number(r.orden) })),
                [
                    { medidor_id: 10, orden: 1 },
                    { medidor_id: 30, orden: 2 }, // antes era 3, ahora 2
                    { medidor_id: 40, orden: 3 }  // antes era 4, ahora 3
                ]
            );
        });

        it('retorna 404 al intentar eliminar un medidor que no está en la ruta', () => {
            const medidorFuera = 99;
            const existe = db.prepare(`SELECT orden FROM rutas_puntos WHERE ruta_id = 1 AND medidor_id = ?`).get(medidorFuera);
            assert.strictEqual(existe, undefined);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 4: Modificación de Ruta (PUT /api/v2/rutas/:ruta_id)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 4: Actualización y Modificación de Rutas', () => {
        beforeEach(() => {
            db.exec(`
                INSERT INTO rutas (id, nombre, descripcion, creado_por, distancia_km) 
                VALUES (1, 'Ruta Original', 'Desc Original', 1, 5.0);

                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES 
                    (1, 10, 1),
                    (1, 20, 2);

                INSERT INTO rutas (id, nombre, creado_por) VALUES (2, 'Otra Ruta', 1);
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (2, 30, 1);
            `);
        });

        it('retorna 404 si la ruta a modificar no existe', () => {
            const rutaInexistente = 999;
            const r = db.prepare(`SELECT id, nombre FROM rutas WHERE id = ?`).get(rutaInexistente);
            assert.strictEqual(r, undefined);
        });

        it('actualiza metadatos de la ruta (nombre, descripción, distancia_km) sin tocar puntos', () => {
            const rutaId = 1;
            const updates = {
                nombre: 'Ruta Modificada Norte',
                descripcion: 'Nueva descripción detallada',
                distancia_km: 7.8
            };

            db.prepare(`
                UPDATE rutas 
                SET nombre = ?, descripcion = ?, distancia_km = ?
                WHERE id = ?
            `).run(updates.nombre, updates.descripcion, updates.distancia_km, rutaId);

            const rutaActualizada = db.prepare(`SELECT * FROM rutas WHERE id = ?`).get(rutaId);
            assert.strictEqual(rutaActualizada.nombre, 'Ruta Modificada Norte');
            assert.strictEqual(rutaActualizada.descripcion, 'Nueva descripción detallada');
            assert.strictEqual(rutaActualizada.distancia_km, 7.8);

            // Puntos siguen intactos
            const puntos = db.prepare(`SELECT COUNT(*) as c FROM rutas_puntos WHERE ruta_id = ?`).get(rutaId);
            assert.strictEqual(Number(puntos.c), 2);
        });

        it('rechaza con 409 si los nuevos puntos colisionan con otra ruta', () => {
            const rutaId = 1;
            const nuevosPuntos = [{ id: 10 }, { id: 30 }]; // 30 ya está en ruta 2

            const medidorIds = nuevosPuntos.map(p => p.id);
            const placeholders = medidorIds.map(() => '?').join(',');

            const conflictos = db.prepare(`
                SELECT m.id, m.numero_serie, r.id as ruta_id, r.nombre as ruta_nombre
                FROM medidores m
                LEFT JOIN rutas_puntos rp ON m.id = rp.medidor_id
                LEFT JOIN rutas r ON rp.ruta_id = r.id
                WHERE m.id IN (${placeholders})
                AND rp.ruta_id IS NOT NULL
                AND rp.ruta_id != ?
            `).all(...medidorIds, rutaId);

            assert.strictEqual(conflictos.length, 1);
            assert.strictEqual(Number(conflictos[0].id), 30);
            assert.strictEqual(Number(conflictos[0].ruta_id), 2);
        });

        it('reemplaza correctamente el set de puntos de la ruta si no hay conflictos', () => {
            const rutaId = 1;
            const nuevosPuntos = [{ id: 40 }, { id: 20 }]; // 40 está libre, 20 ya era de ruta 1

            // 1. Borrar puntos actuales de la ruta
            db.prepare(`DELETE FROM rutas_puntos WHERE ruta_id = ?`).run(rutaId);

            // 2. Insertar nuevos puntos
            const insertStmt = db.prepare(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (?, ?, ?)`);
            nuevosPuntos.forEach((p, idx) => {
                insertStmt.run(rutaId, p.id, idx + 1);
            });

            const puntosFinales = db.prepare(`
                SELECT medidor_id, orden FROM rutas_puntos WHERE ruta_id = ? ORDER BY orden ASC
            `).all(rutaId);

            assert.strictEqual(puntosFinales.length, 2);
            assert.strictEqual(Number(puntosFinales[0].medidor_id), 40);
            assert.strictEqual(Number(puntosFinales[0].orden), 1);
            assert.strictEqual(Number(puntosFinales[1].medidor_id), 20);
            assert.strictEqual(Number(puntosFinales[1].orden), 2);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 5: Consulta de Ruta con Medidores (CTE Unificada y Trazabilidad)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 5: Consulta de Ruta con Medidores (CTE Unificada y Trazabilidad)', () => {
        beforeEach(() => {
            db.exec(`
                INSERT INTO rutas (id, nombre, descripcion, creado_por) VALUES (1, 'Ruta Centro', 'Zona Comercial', 1);
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES 
                    (1, 10, 1),
                    (1, 20, 2),
                    (1, 30, 3);
            `);
        });

        it('obtiene puntos con información completa de medidor, cliente y orden', () => {
            const rutaId = 1;
            const periodo = '2024-01';

            const query = `
                WITH puntos_ruta AS (
                    SELECT rp.ruta_id, rp.medidor_id, rp.orden 
                    FROM rutas_puntos rp 
                    WHERE rp.ruta_id = ?
                )
                SELECT 
                    r.id AS ruta_id,
                    r.nombre AS ruta_nombre,
                    pr.orden,
                    m.id AS medidor_id,
                    m.numero_serie,
                    c.id AS cliente_id,
                    c.nombre AS cliente_nombre,
                    c.numero_predio AS cliente_numero_predio,
                    c.direccion AS cliente_direccion,
                    m.lectura_base,
                    lp.id AS lectura_id_periodo,
                    lp.lectura_actual AS lectura_actual_periodo
                FROM rutas r
                JOIN puntos_ruta pr ON r.id = pr.ruta_id
                JOIN medidores m ON pr.medidor_id = m.id
                LEFT JOIN clientes c ON m.cliente_id = c.id
                LEFT JOIN lecturas lp ON lp.medidor_id = m.id AND lp.periodo = ? AND lp.ruta_id = r.id
                WHERE r.id = ?
                ORDER BY pr.orden ASC
            `;

            const rows = db.prepare(query).all(rutaId, periodo, rutaId);
            assert.strictEqual(rows.length, 3);
            assert.strictEqual(rows[0].numero_serie, 'MED-001');
            assert.strictEqual(rows[0].cliente_nombre, 'Carlos Slim');
            assert.strictEqual(rows[0].cliente_numero_predio, 'PRED-101');
            assert.strictEqual(rows[0].lectura_actual_periodo, null); // Sin lectura aún
        });

        it('calcula lectura_anterior_referencia: usa lectura previa si existe o lectura_base de respaldo', () => {
            // Lectura registrada en diciembre 2023 para medidor 10
            db.exec(`
                INSERT INTO lecturas (medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3, fecha_lectura)
                VALUES (10, 1, '2023-12', 0, 45, 45, '2023-12-15');
            `);

            const periodo = '2024-01';
            const medidor10Prev = db.prepare(`
                SELECT l_ant.lectura_actual
                FROM lecturas l_ant
                WHERE l_ant.medidor_id = 10
                  AND (l_ant.periodo < ? OR (l_ant.periodo IS NULL AND l_ant.fecha_lectura < ?))
                  AND l_ant.lectura_actual IS NOT NULL
                ORDER BY l_ant.periodo DESC, l_ant.fecha_lectura DESC
                LIMIT 1
            `).get(periodo, `${periodo}-01`);

            assert.strictEqual(Number(medidor10Prev.lectura_actual), 45);

            // Medidor 20 sin lecturas previas: fallback a lectura_base (10)
            const medidor20Prev = db.prepare(`
                SELECT l_ant.lectura_actual
                FROM lecturas l_ant
                WHERE l_ant.medidor_id = 20
                  AND (l_ant.periodo < ? OR (l_ant.periodo IS NULL AND l_ant.fecha_lectura < ?))
                  AND l_ant.lectura_actual IS NOT NULL
                ORDER BY l_ant.periodo DESC, l_ant.fecha_lectura DESC
                LIMIT 1
            `).get(periodo, `${periodo}-01`);

            assert.strictEqual(medidor20Prev, undefined);
            const base20 = db.prepare(`SELECT lectura_base FROM medidores WHERE id = 20`).get();
            assert.strictEqual(Number(base20.lectura_base), 10);
        });

        it('preserva trazabilidad con medidor retirado y reporta medidor_actual_reemplazo en período histórico', () => {
            // Escenario de sustitución de medidor:
            // 1. En '2024-01', medidor 10 tomó lectura en ruta 1 para el cliente 1
            db.exec(`
                INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, lectura_anterior, lectura_actual, consumo_m3, fecha_lectura)
                VALUES (101, 10, 1, '2024-01', 0, 50, 50, '2024-01-15');
            `);

            // 2. Más adelante, el medidor 10 se averió y fue retirado; se desvinculó de rutas_puntos
            // y se instaló el medidor 90 como reemplazo activo para el cliente 1
            db.exec(`
                UPDATE medidores SET estado_medidor = 'Retirado', cliente_id = NULL WHERE id = 10;
                DELETE FROM rutas_puntos WHERE medidor_id = 10;

                INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor) 
                VALUES (90, 1, 'MED-001-NUEVO', 'Activo');

                INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_asignacion, fecha_desvinculacion, motivo)
                VALUES (1, 10, '2023-01-01', '2024-02-01', 'Averiado');

                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, 90, 1);
            `);

            // 3. Al consultar el período histórico '2024-01', la CTE UNIÓN debe:
            // - Encontrar medidor 10 gracias a lecturas históricas
            // - Determinar que pertenece a cliente 1 vía cliente_medidor_historial
            // - Reportar medidor 90 como medidor_actual_reemplazo
            // - Indicar estado_medidor = 'Retirado'
            const periodoHistorico = '2024-01';
            const rutaId = 1;

            const cteQuery = `
                WITH puntos_ruta AS (
                    SELECT rp.ruta_id, rp.medidor_id, rp.orden FROM rutas_puntos rp WHERE rp.ruta_id = ?
                    UNION
                    SELECT 
                        l.ruta_id, 
                        l.medidor_id, 
                        COALESCE(
                            rp.orden,
                            (
                                SELECT rp2.orden 
                                FROM rutas_puntos rp2 
                                JOIN medidores m2 ON rp2.medidor_id = m2.id 
                                WHERE m2.cliente_id = COALESCE(
                                    m_hist.cliente_id,
                                    (SELECT cmh.cliente_id FROM cliente_medidor_historial cmh WHERE cmh.medidor_id = l.medidor_id ORDER BY cmh.id DESC LIMIT 1),
                                    (SELECT f.cliente_id FROM facturas f WHERE f.lectura_id = l.id LIMIT 1)
                                )
                                AND rp2.ruta_id = l.ruta_id 
                                LIMIT 1
                            ),
                            9999
                        ) AS orden 
                    FROM lecturas l 
                    JOIN medidores m_hist ON l.medidor_id = m_hist.id
                    LEFT JOIN rutas_puntos rp ON rp.medidor_id = l.medidor_id AND rp.ruta_id = l.ruta_id 
                    WHERE l.ruta_id = ? AND l.periodo = ?
                )
                SELECT 
                    pr.orden,
                    m.id AS medidor_id,
                    m.numero_serie,
                    m.estado_medidor,
                    COALESCE(c.id, c_hist.id) AS cliente_id,
                    COALESCE(c.nombre, c_hist.nombre) AS cliente_nombre,
                    (
                        SELECT m_act.numero_serie 
                        FROM medidores m_act 
                        WHERE m_act.cliente_id = COALESCE(c.id, c_hist.id)
                          AND m_act.id != m.id
                          AND m_act.estado_medidor = 'Activo'
                        ORDER BY m_act.id DESC 
                        LIMIT 1
                    ) AS medidor_actual_reemplazo,
                    lp.lectura_actual AS lectura_actual_periodo
                FROM puntos_ruta pr
                JOIN medidores m ON pr.medidor_id = m.id
                LEFT JOIN clientes c ON m.cliente_id = c.id
                LEFT JOIN cliente_medidor_historial cmh ON cmh.medidor_id = m.id AND cmh.id = (
                    SELECT id FROM cliente_medidor_historial WHERE medidor_id = m.id ORDER BY id DESC LIMIT 1
                )
                LEFT JOIN clientes c_hist ON cmh.cliente_id = c_hist.id
                LEFT JOIN lecturas lp ON lp.medidor_id = m.id AND lp.periodo = ? AND lp.ruta_id = ?
                WHERE pr.medidor_id = 10
            `;

            const resultado = db.prepare(cteQuery).get(rutaId, rutaId, periodoHistorico, periodoHistorico, rutaId);
            assert.ok(resultado);
            assert.strictEqual(Number(resultado.medidor_id), 10);
            assert.strictEqual(resultado.estado_medidor, 'Retirado');
            assert.strictEqual(resultado.cliente_nombre, 'Carlos Slim');
            assert.strictEqual(resultado.medidor_actual_reemplazo, 'MED-001-NUEVO');
            assert.strictEqual(Number(resultado.lectura_actual_periodo), 50);
            assert.strictEqual(Number(resultado.orden), 1); // Heredó el orden del reemplazo en la ruta
        });

        it('detecta período cerrado si existen facturas generadas para el período y ruta', () => {
            const rutaId = 1;
            const periodo = '2024-01';

            // Sin facturas: periodo no cerrado
            const facturasAntes = db.prepare(`
                SELECT COUNT(f.id) AS count
                FROM facturas f
                JOIN lecturas l ON f.lectura_id = l.id
                WHERE l.periodo = ? AND l.ruta_id = ?
            `).get(periodo, rutaId);
            assert.strictEqual(Number(facturasAntes.count), 0);

            // Se genera lectura y factura
            db.exec(`
                INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, lectura_actual, consumo_m3)
                VALUES (500, 10, 1, '2024-01', 20, 20);
                INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, total, saldo_pendiente)
                VALUES (600, 500, 1, 1, 150.0, 150.0);
            `);

            const facturasDespues = db.prepare(`
                SELECT COUNT(f.id) AS count
                FROM facturas f
                JOIN lecturas l ON f.lectura_id = l.id
                WHERE l.periodo = ? AND l.ruta_id = ?
            `).get(periodo, rutaId);

            assert.strictEqual(Number(facturasDespues.count), 1);
            const periodoCerrado = Number(facturasDespues.count) > 0;
            assert.strictEqual(periodoCerrado, true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 6: Listado de Rutas y Métricas de Progreso (listarRutas)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 6: Listado de Rutas y Métricas de Progreso', () => {
        beforeEach(() => {
            db.exec(`
                INSERT INTO rutas (id, nombre, descripcion, creado_por, fecha_creacion) VALUES 
                    (1, 'Ruta Poniente', 'Sector Poniente', 1, '2024-01-01'),
                    (2, 'Ruta Oriente', 'Sector Oriente', 1, '2024-01-02');

                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES 
                    (1, 10, 1),
                    (1, 20, 2),
                    (2, 30, 1);
            `);
        });

        it('filtra rutas por búsqueda de texto (nombre o descripción)', () => {
            const search = '%Poniente%';
            const filtradas = db.prepare(`
                SELECT id, nombre FROM rutas WHERE nombre LIKE ? OR descripcion LIKE ?
            `).all(search, search);

            assert.strictEqual(filtradas.length, 1);
            assert.strictEqual(filtradas[0].nombre, 'Ruta Poniente');
        });

        it('calcula métricas en período abierto: total_puntos, completadas, faltantes y porcentaje', () => {
            const periodo = '2024-01';
            // Solo medidor 10 tiene lectura tomada en Ruta 1 (1 de 2 completadas)
            db.exec(`
                INSERT INTO lecturas (medidor_id, ruta_id, periodo, consumo_m3)
                VALUES (10, 1, '2024-01', 15);
            `);

            // Consulta medidores y estado de lectura
            const puntosRuta1 = db.prepare(`
                SELECT rp.medidor_id, CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END AS tiene_lectura
                FROM rutas_puntos rp
                LEFT JOIN lecturas l ON l.medidor_id = rp.medidor_id AND l.ruta_id = rp.ruta_id AND l.periodo = ?
                WHERE rp.ruta_id = 1
            `).all(periodo);

            const total_puntos = puntosRuta1.length;
            const completadas = puntosRuta1.filter(p => p.tiene_lectura === 1).length;
            const faltantes = puntosRuta1.filter(p => p.tiene_lectura === 0).length;
            const porcentaje = Math.round((completadas / total_puntos) * 100);

            assert.strictEqual(total_puntos, 2);
            assert.strictEqual(completadas, 1);
            assert.strictEqual(faltantes, 1);
            assert.strictEqual(porcentaje, 50);
        });

        it('preserva inmutabilidad en período cerrado: medidores agregados después no se cuentan como faltantes', () => {
            // En '2024-01', Ruta 2 tenía solo medidor 30, se tomó lectura y se facturó (100% completado)
            db.exec(`
                INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, consumo_m3)
                VALUES (701, 30, 2, '2024-01', 25);
                INSERT INTO facturas (id, lectura_id, cliente_id, tarifa_id, total, saldo_pendiente)
                VALUES (801, 701, 3, 1, 200, 200);
            `);

            // Meses después se agregó medidor 40 a la Ruta 2
            db.exec(`
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (2, 40, 2);
            `);

            // Al listar período '2024-01':
            const periodo = '2024-01';
            const facturasGeneradas = db.prepare(`
                SELECT COUNT(f.id) AS c
                FROM facturas f
                JOIN lecturas l ON f.lectura_id = l.id
                WHERE l.periodo = ? AND l.ruta_id = 2
            `).get(periodo).c;

            assert.ok(facturasGeneradas > 0, 'El período está cerrado por facturación');

            const medidoresEnRuta = db.prepare(`
                SELECT rp.medidor_id, CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END AS tiene_lectura
                FROM rutas_puntos rp
                LEFT JOIN lecturas l ON l.medidor_id = rp.medidor_id AND l.ruta_id = rp.ruta_id AND l.periodo = ?
                WHERE rp.ruta_id = 2
            `).all(periodo);

            // Regla de negocio de rutasController: si facturas_generadas_periodo > 0, filtrar solo tiene_lectura === 1
            const medidoresBase = facturasGeneradas > 0
                ? medidoresEnRuta.filter(m => m.tiene_lectura === 1)
                : medidoresEnRuta;

            const completadas = medidoresBase.filter(m => m.tiene_lectura === 1).length;
            const faltantes = medidoresBase.filter(m => m.tiene_lectura === 0).length;
            const total = medidoresBase.length;
            const porcentaje = Math.round((completadas / total) * 100);

            // No debe mostrar medidor 40 como faltante en un período cerrado de hace meses
            assert.strictEqual(total, 1);
            assert.strictEqual(completadas, 1);
            assert.strictEqual(faltantes, 0);
            assert.strictEqual(porcentaje, 100);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 7: Progreso Analítico de Captura (obtenerProgresoCapturaRuta)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 7: Progreso Analítico de Captura de Ruta', () => {
        beforeEach(() => {
            db.exec(`
                INSERT INTO rutas (id, nombre, creado_por) VALUES (1, 'Ruta Analytics', 1);
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES 
                    (1, 10, 1),
                    (1, 20, 2),
                    (1, 30, 3);
            `);
        });

        it('retorna 404 si la ruta solicitada no existe', () => {
            const rutaId = 888;
            const ruta = db.prepare(`SELECT id, nombre FROM rutas WHERE id = ?`).get(rutaId);
            assert.strictEqual(ruta, undefined);
        });

        it('período abierto con captura parcial: calcula leídos, pendientes y porcentajes exactos', () => {
            const periodo = '2024-03';
            // 2 de 3 medidores leídos (medidor 10 y 20)
            db.exec(`
                INSERT INTO lecturas (medidor_id, ruta_id, periodo, consumo_m3, fecha_lectura) VALUES 
                    (10, 1, '2024-03', 10, '2024-03-10'),
                    (20, 1, '2024-03', 12, '2024-03-11');
            `);

            const stats = db.prepare(`
                SELECT 
                    COUNT(DISTINCT rp.medidor_id) as total_medidores,
                    COUNT(DISTINCT CASE WHEN l.id IS NOT NULL THEN rp.medidor_id END) as medidores_leidos,
                    COUNT(DISTINCT CASE WHEN l.id IS NULL THEN rp.medidor_id END) as medidores_pendientes
                FROM rutas_puntos rp
                LEFT JOIN lecturas l ON l.medidor_id = rp.medidor_id 
                    AND l.ruta_id = rp.ruta_id 
                    AND l.periodo = ?
                WHERE rp.ruta_id = 1
            `).get(periodo);

            const total = Number(stats.total_medidores);
            const leidos = Number(stats.medidores_leidos);
            const pendientes = Number(stats.medidores_pendientes);
            const porcentaje = Math.round((leidos / total) * 100);

            assert.strictEqual(total, 3);
            assert.strictEqual(leidos, 2);
            assert.strictEqual(pendientes, 1);
            assert.strictEqual(porcentaje, 67);
            assert.strictEqual(100 - porcentaje, 33);
        });

        it('período cerrado con facturación: medidores_pendientes es 0 y porcentaje es 100%', () => {
            const periodo = '2024-02';
            // Lecturas y facturas tomadas para medidor 10 y 20 en febrero
            db.exec(`
                INSERT INTO lecturas (id, medidor_id, ruta_id, periodo, consumo_m3) VALUES 
                    (1001, 10, 1, '2024-02', 15),
                    (1002, 20, 1, '2024-02', 20);
                INSERT INTO facturas (lectura_id, cliente_id, tarifa_id, total, saldo_pendiente) VALUES 
                    (1001, 1, 1, 150, 150),
                    (1002, 2, 1, 180, 180);
            `);

            const totalFacturas = db.prepare(`
                SELECT COUNT(*) AS total_facturas
                FROM facturas f
                JOIN lecturas l ON l.id = f.lectura_id
                WHERE l.ruta_id = 1 AND l.periodo = ?
            `).get(periodo).total_facturas;

            const periodoCerrado = Number(totalFacturas) > 0;
            assert.strictEqual(periodoCerrado, true);

            // Obtener medidores con lectura
            const medidoresQuery = `
                SELECT 
                    m.id as medidor_id,
                    CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END as tiene_lectura
                FROM rutas_puntos rp
                JOIN medidores m ON rp.medidor_id = m.id
                LEFT JOIN lecturas l ON l.medidor_id = m.id 
                    AND l.ruta_id = rp.ruta_id 
                    AND l.periodo = ?
                WHERE rp.ruta_id = 1
            `;
            const medidoresRaw = db.prepare(medidoresQuery).all(periodo).map(r => ({
                medidor_id: Number(r.medidor_id),
                estado: r.tiene_lectura === 1 ? 'Leído' : 'Pendiente'
            }));

            // En periodo cerrado, solo se cuentan medidores Leídos
            const medidores = periodoCerrado ? medidoresRaw.filter(m => m.estado === 'Leído') : medidoresRaw;
            const total = medidores.length;
            const leidos = medidores.length;
            const pendientes = periodoCerrado ? 0 : medidoresRaw.filter(m => m.estado === 'Pendiente').length;
            const porcentaje = total > 0 ? Math.round((leidos / total) * 100) : 0;

            assert.strictEqual(total, 2);
            assert.strictEqual(leidos, 2);
            assert.strictEqual(pendientes, 0);
            assert.strictEqual(porcentaje, 100);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 8: Integridad Referencial y Eliminación de Rutas
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 8: Integridad Referencial y Cascada de Eliminación', () => {
        it('ON DELETE CASCADE en rutas_puntos limpia las asignaciones al eliminar una ruta', () => {
            db.exec(`
                INSERT INTO rutas (id, nombre, creado_por) VALUES (1, 'Ruta Temporal', 1);
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES 
                    (1, 10, 1),
                    (1, 20, 2);
            `);

            assert.strictEqual(db.prepare(`SELECT COUNT(*) as c FROM rutas_puntos WHERE ruta_id = 1`).get().c, 2);

            // Activar foreign keys en SQLite
            db.exec(`PRAGMA foreign_keys = ON;`);
            db.prepare(`DELETE FROM rutas WHERE id = 1`).run();

            const puntosHuerfanos = db.prepare(`SELECT COUNT(*) as c FROM rutas_puntos WHERE ruta_id = 1`).get().c;
            assert.strictEqual(puntosHuerfanos, 0);

            // Los medidores mismos no fueron eliminados
            const medidoresIntactos = db.prepare(`SELECT COUNT(*) as c FROM medidores WHERE id IN (10, 20)`).get().c;
            assert.strictEqual(medidoresIntactos, 2);
        });

        it('eliminar asignación de un punto libera el medidor para ser asignado a otra ruta', () => {
            db.exec(`
                INSERT INTO rutas (id, nombre, creado_por) VALUES 
                    (1, 'Ruta Origen', 1),
                    (2, 'Ruta Destino', 1);
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, 10, 1);
            `);

            // Desvincular de ruta 1
            db.prepare(`DELETE FROM rutas_puntos WHERE ruta_id = 1 AND medidor_id = 10`).run();

            // Asignar a ruta 2 sin conflictos
            db.prepare(`INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (2, 10, 1)`).run();

            const nuevaAsignacion = db.prepare(`SELECT ruta_id FROM rutas_puntos WHERE medidor_id = 10`).get();
            assert.strictEqual(Number(nuevaAsignacion.ruta_id), 2);
        });
    });
});
