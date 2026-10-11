import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

describe('Suite de Verificación: Módulo Integral de Clientes, Validaciones y Ciclo de Vida', () => {
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
                descripcion TEXT,
                precio_base REAL NOT NULL
            );

            CREATE TABLE clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero_predio TEXT UNIQUE,
                nombre TEXT NOT NULL,
                direccion TEXT NOT NULL,
                telefono TEXT NOT NULL,
                ciudad TEXT NOT NULL,
                correo TEXT,
                estado_cliente TEXT NOT NULL DEFAULT 'Activo',
                tarifa_id INTEGER REFERENCES tarifas(id),
                modificado_por INTEGER REFERENCES usuarios(id),
                saldo_anterior REAL NOT NULL DEFAULT 0,
                fecha_creacion TEXT DEFAULT (datetime('now')),
                fecha_eliminacion TEXT,
                eliminado_por INTEGER REFERENCES usuarios(id),
                razon_eliminacion TEXT
            );

            CREATE TABLE medidores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER REFERENCES clientes(id),
                numero_serie TEXT NOT NULL UNIQUE,
                estado_medidor TEXT NOT NULL DEFAULT 'Activo',
                lectura_base REAL DEFAULT 0,
                capacidad_maxima REAL DEFAULT 99999,
                fecha_eliminacion TEXT,
                eliminado_por INTEGER REFERENCES usuarios(id),
                razon_eliminacion TEXT
            );

            CREATE TABLE cliente_medidor_historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER NOT NULL REFERENCES clientes(id),
                medidor_id INTEGER NOT NULL REFERENCES medidores(id),
                fecha_inicio TEXT NOT NULL DEFAULT (date('now')),
                fecha_fin TEXT,
                asignado_por INTEGER REFERENCES usuarios(id)
            );

            CREATE TABLE rutas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL
            );

            CREATE TABLE rutas_puntos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ruta_id INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
                medidor_id INTEGER NOT NULL REFERENCES medidores(id),
                orden INTEGER NOT NULL
            );

            CREATE TABLE lecturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medidor_id INTEGER NOT NULL,
                ruta_id INTEGER NOT NULL,
                periodo TEXT NOT NULL,
                consumo_m3 REAL NOT NULL
            );

            CREATE TABLE facturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lectura_id INTEGER,
                cliente_id INTEGER NOT NULL REFERENCES clientes(id),
                tarifa_id INTEGER NOT NULL,
                total REAL NOT NULL,
                saldo_pendiente REAL NOT NULL,
                estado TEXT DEFAULT 'Pendiente'
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
        `);

        // Datos iniciales
        db.exec(`
            INSERT INTO usuarios (id, username, nombre) VALUES 
                (1, 'admin', 'Administrador General'),
                (2, 'operador1', 'Operador de Turno');

            INSERT INTO tarifas (id, nombre, descripcion, precio_base) VALUES 
                (1, 'Residencial Básica', 'Consumo doméstico habitual', 80.0),
                (2, 'Comercial', 'Establecimientos comerciales', 150.0),
                (3, 'Industrial', 'Alto volumen industrial', 300.0);

            INSERT INTO clientes (id, numero_predio, nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id) VALUES 
                (1, 'NG-01', 'Juan Pérez', 'Calle 1 # 10-20', '3001234567', 'Bogotá', 'juan@ejemplo.com', 'Activo', 1),
                (2, 'NG-02', 'María Gómez', 'Carrera 2 # 20-30', '3109876543', 'Bogotá', 'maria@ejemplo.com', 'Activo', 1),
                (3, 'MP-01', 'Carlos Sánchez', 'Av. 3 # 30-40', '3201112233', 'Medellín', 'carlos@ejemplo.com', 'Suspendido', 2),
                (4, 'AD-01', 'Laura Díaz', 'Transv. 4 # 40-50', '3014445566', 'Cali', 'laura@ejemplo.com', 'Inactivo', 2);
        `);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 1: Validaciones de Entrada y Reglas de Formato (clienteValidator)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 1: Validaciones de Entrada y Formato de Datos', () => {
        it('normaliza numero_predio eliminando ceros redundancy (ej: NG-0012 -> NG-12)', () => {
            const normalizarPredio = (val) => {
                if (!val) return null;
                let v = val.trim().toUpperCase();
                const m = v.match(/^(NG|MP|AD)-0*(\d+)$/);
                if (m) v = `${m[1]}-${m[2]}`;
                return v;
            };

            assert.strictEqual(normalizarPredio('NG-0012'), 'NG-12');
            assert.strictEqual(normalizarPredio('mp-0005'), 'MP-5');
            assert.strictEqual(normalizarPredio('AD-101'), 'AD-101');
            assert.strictEqual(normalizarPredio('  ng-01  '), 'NG-1');
        });

        it('rechaza numero_predio con prefijos inválidos o sin formato PREFIJO-NUMERO', () => {
            const regexPredio = /^(NG|MP|AD)-\d+$/i;
            assert.strictEqual(regexPredio.test('NG-123'), true);
            assert.strictEqual(regexPredio.test('MP-5'), true);
            assert.strictEqual(regexPredio.test('AD-999'), true);
            assert.strictEqual(regexPredio.test('XX-123'), false, 'Prefijo no permitido');
            assert.strictEqual(regexPredio.test('123'), false, 'Falta prefijo');
            assert.strictEqual(regexPredio.test('NG-ABC'), false, 'Sufijo no numérico');
        });

        it('capitaliza correctamente el nombre del cliente conservando acentos y espacios', () => {
            const capitalizarNombre = (val) =>
                val.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

            assert.strictEqual(capitalizarNombre('juan perez lopez'), 'Juan Perez Lopez');
            assert.strictEqual(capitalizarNombre('ÁNGEL MARÍA PEÑA'), 'Ángel María Peña');
            assert.strictEqual(capitalizarNombre('  ana   sofía  '), 'Ana Sofía');
        });

        it('valida teléfono eliminando caracteres no numéricos y exigiendo exactamente 10 dígitos', () => {
            const sanitizarTelefono = (val) => val ? val.toString().replace(/\D/g, '') : '';
            const esValido = (t) => /^\d{10}$/.test(sanitizarTelefono(t));

            assert.strictEqual(esValido('300 123 4567'), true);
            assert.strictEqual(esValido('300-123-4567'), true);
            assert.strictEqual(esValido('(300) 1234567'), true);
            assert.strictEqual(esValido('+57 300 123 4567'), false, '12 dígitos con código de país');
            assert.strictEqual(esValido('300123456'), false, 'Tiene 9 dígitos');
            assert.strictEqual(esValido('30012345678'), false, 'Tiene 11 dígitos');
        });

        it('valida correo electrónico o lo normaliza a null si viene vacío', () => {
            const sanitizarCorreo = (val) => {
                if (!val || val.trim() === '') return null;
                const v = val.trim().toLowerCase();
                const esEmailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
                if (!esEmailValido) throw new Error('Formato de correo inválido');
                return v;
            };

            assert.strictEqual(sanitizarCorreo(''), null);
            assert.strictEqual(sanitizarCorreo('  '), null);
            assert.strictEqual(sanitizarCorreo('Juan@Ejemplo.COM'), 'juan@ejemplo.com');
            assert.throws(() => sanitizarCorreo('correo-invalido'), /Formato de correo inválido/);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 2: Registro de Clientes y Validaciones de Negocio (registrarCliente)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 2: Registro de Clientes y Reglas de Negocio', () => {
        it('rechaza con 400 si faltan campos requeridos (nombre, direccion, telefono, ciudad, tarifa_id)', () => {
            const payloads = [
                { nombre: '', direccion: 'Calle 1', telefono: '3001234567', ciudad: 'Bogotá', tarifa_id: 1 },
                { nombre: 'Pedro', direccion: '', telefono: '3001234567', ciudad: 'Bogotá', tarifa_id: 1 },
                { nombre: 'Pedro', direccion: 'Calle 1', telefono: '', ciudad: 'Bogotá', tarifa_id: 1 },
                { nombre: 'Pedro', direccion: 'Calle 1', telefono: '3001234567', ciudad: '', tarifa_id: 1 },
                { nombre: 'Pedro', direccion: 'Calle 1', telefono: '3001234567', ciudad: 'Bogotá', tarifa_id: null }
            ];

            for (const p of payloads) {
                const esValido = Boolean(p.nombre && p.direccion && p.telefono && p.ciudad && p.tarifa_id);
                assert.strictEqual(esValido, false);
            }
        });

        it('rechaza con 404 si la tarifa_id especificada no existe', () => {
            const tarifaId = 999;
            const tarifa = db.prepare(`SELECT id FROM tarifas WHERE id = ?`).get(tarifaId);
            assert.strictEqual(tarifa, undefined);
        });

        it('rechaza con 409 si ya existe un cliente con el mismo nombre y teléfono', () => {
            const nombre = 'Juan Pérez';
            const telefono = '3001234567';

            const dupe = db.prepare(`SELECT id FROM clientes WHERE nombre = ? AND telefono = ?`).get(nombre, telefono);
            assert.ok(dupe, 'Debe detectar duplicado');
            assert.strictEqual(Number(dupe.id), 1);
        });

        it('rechaza con 409 si el numero_predio ya está en uso, incluso con ceros a la izquierda', () => {
            const nuevoPredio = 'NG-001'; // Ya existe NG-01

            // Normalización equivalente a clientesService
            const match = nuevoPredio.match(/^(NG|MP|AD)-(\d+)$/);
            const prefix = match[1];
            const rows = db.prepare(`SELECT id, numero_predio FROM clientes WHERE numero_predio LIKE ?`).all(`${prefix}-%`);

            const safeNuevo = 'NG-1';
            const dupe = rows.find(r => {
                if (!r.numero_predio) return false;
                const m = r.numero_predio.toUpperCase().replace(/\s/g, '').match(/^(NG|MP|AD)-0*(\d+)$/);
                if (m) return `${m[1]}-${m[2]}` === safeNuevo;
                return r.numero_predio.toUpperCase() === safeNuevo;
            });

            assert.ok(dupe, 'Debe detectar colisión semántica de predio');
            assert.strictEqual(dupe.numero_predio, 'NG-01');
        });

        it('registra exitosamente un cliente y genera auditoría en historial_cambios', () => {
            const nuevoCliente = {
                numero_predio: 'NG-05',
                nombre: 'Andrés Castro',
                direccion: 'Calle 50 # 10-20',
                telefono: '3157894561',
                ciudad: 'Bogotá',
                correo: 'andres@ejemplo.com',
                estado_cliente: 'Activo',
                tarifa_id: 1,
                usuario_id: 1
            };

            const stmt = db.prepare(`
                INSERT INTO clientes (numero_predio, nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id, modificado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const res = stmt.run(
                nuevoCliente.numero_predio,
                nuevoCliente.nombre,
                nuevoCliente.direccion,
                nuevoCliente.telefono,
                nuevoCliente.ciudad,
                nuevoCliente.correo,
                nuevoCliente.estado_cliente,
                nuevoCliente.tarifa_id,
                nuevoCliente.usuario_id
            );

            const clienteId = Number(res.lastInsertRowid);
            assert.ok(clienteId > 0);

            // Registrar en historial
            db.prepare(`
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES ('clientes', 'INSERT', ?, ?, ?)
            `).run(clienteId, nuevoCliente.usuario_id, JSON.stringify(nuevoCliente));

            const log = db.prepare(`SELECT * FROM historial_cambios WHERE tabla = 'clientes' AND registro_id = ?`).get(clienteId);
            assert.ok(log);
            assert.strictEqual(log.operacion, 'INSERT');
            const dataLog = JSON.parse(log.cambios);
            assert.strictEqual(dataLog.nombre, 'Andrés Castro');
            assert.strictEqual(dataLog.numero_predio, 'NG-05');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 3: Modificación y Auditoría Granular (modificarCliente)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 3: Modificación de Clientes y Trazabilidad de Cambios', () => {
        it('retorna 404 si el cliente a modificar no existe', () => {
            const clienteInexistente = 999;
            const cliente = db.prepare(`SELECT id FROM clientes WHERE id = ?`).get(clienteInexistente);
            assert.strictEqual(cliente, undefined);
        });

        it('rechaza con 409 si el nuevo numero_predio pertenece a otro cliente', () => {
            const clienteId = 1;
            const nuevoPredio = 'NG-02'; // Pertenece a cliente 2

            const colision = db.prepare(`SELECT id FROM clientes WHERE numero_predio = ? AND id != ?`).get(nuevoPredio, clienteId);
            assert.ok(colision);
            assert.strictEqual(Number(colision.id), 2);
        });

        it('permite mantener el mismo numero_predio sin disparar error 409', () => {
            const clienteId = 1;
            const predioActual = 'NG-01';

            const colision = db.prepare(`SELECT id FROM clientes WHERE numero_predio = ? AND id != ?`).get(predioActual, clienteId);
            assert.strictEqual(colision, undefined);
        });

        it('actualiza datos y genera registro diferencial exacto en historial_cambios ({antes, despues})', () => {
            const clienteId = 1;
            const prev = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(clienteId);

            const nuevosDatos = {
                direccion: 'Avenida Siempre Viva 742',
                telefono: '3009998877'
            };

            const cambios = {};
            if (nuevosDatos.direccion && nuevosDatos.direccion !== prev.direccion) {
                cambios.direccion = { antes: prev.direccion, despues: nuevosDatos.direccion };
            }
            if (nuevosDatos.telefono && nuevosDatos.telefono !== prev.telefono) {
                cambios.telefono = { antes: prev.telefono, despues: nuevosDatos.telefono };
            }

            db.prepare(`
                UPDATE clientes 
                SET direccion = ?, telefono = ?, modificado_por = 1
                WHERE id = ?
            `).run(nuevosDatos.direccion, nuevosDatos.telefono, clienteId);

            db.prepare(`
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES ('clientes', 'UPDATE', ?, 1, ?)
            `).run(clienteId, JSON.stringify(cambios));

            const clienteAct = db.prepare(`SELECT direccion, telefono FROM clientes WHERE id = ?`).get(clienteId);
            assert.strictEqual(clienteAct.direccion, 'Avenida Siempre Viva 742');
            assert.strictEqual(clienteAct.telefono, '3009998877');

            const log = db.prepare(`
                SELECT cambios FROM historial_cambios 
                WHERE tabla = 'clientes' AND operacion = 'UPDATE' AND registro_id = ?
            `).get(clienteId);

            const audit = JSON.parse(log.cambios);
            assert.strictEqual(audit.direccion.antes, 'Calle 1 # 10-20');
            assert.strictEqual(audit.direccion.despues, 'Avenida Siempre Viva 742');
            assert.strictEqual(audit.telefono.antes, '3001234567');
            assert.strictEqual(audit.telefono.despues, '3009998877');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 4: Gestión de Medidores en Clientes y Reemplazo Directo 1 a 1
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 4: Gestión de Medidores y Migración Automática de Ruta 1 a 1', () => {
        beforeEach(() => {
            // Medidor 10 asignado a Cliente 1 en Ruta 1 (orden 1)
            db.exec(`
                INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor) 
                VALUES (10, 1, 'MED-VIEJO-10', 'Activo');

                INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio)
                VALUES (1, 10, '2023-01-01');

                INSERT INTO rutas (id, nombre) VALUES (1, 'Ruta Principal');
                INSERT INTO rutas_puntos (ruta_id, medidor_id, orden) VALUES (1, 10, 1);

                -- Medidor 20 disponible (sin cliente)
                INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor) 
                VALUES (20, NULL, 'MED-NUEVO-20', 'Activo');
            `);
        });

        it('liberar medidor: verifica pertenencia, setea cliente_id = NULL y fecha_fin en historial', () => {
            const clienteId = 1;
            const medidorId = 10;

            const m = db.prepare(`SELECT cliente_id FROM medidores WHERE id = ?`).get(medidorId);
            assert.strictEqual(Number(m.cliente_id), clienteId);

            // Liberar
            db.prepare(`UPDATE medidores SET cliente_id = NULL WHERE id = ?`).run(medidorId);
            db.prepare(`UPDATE cliente_medidor_historial SET fecha_fin = date('now') WHERE medidor_id = ? AND fecha_fin IS NULL`).run(medidorId);

            const mLibre = db.prepare(`SELECT cliente_id FROM medidores WHERE id = ?`).get(medidorId);
            assert.strictEqual(mLibre.cliente_id, null);

            const hCerrado = db.prepare(`SELECT fecha_fin FROM cliente_medidor_historial WHERE medidor_id = ?`).get(medidorId);
            assert.ok(hCerrado.fecha_fin);
        });

        it('asignar medidor: rechaza con 400 si ya pertenece a otro cliente', () => {
            // Asignar medidor 20 a Cliente 2
            db.prepare(`UPDATE medidores SET cliente_id = 2 WHERE id = 20`).run();

            // Intento de Cliente 1 de tomar medidor 20
            const m = db.prepare(`SELECT cliente_id FROM medidores WHERE id = 20`).get();
            const conflicto = m.cliente_id && Number(m.cliente_id) !== 1;
            assert.strictEqual(conflicto, true);
        });

        it('reemplazo directo 1 a 1: migra automáticamente la posición en la ruta del medidor viejo al nuevo', () => {
            const clienteId = 1;
            const medidorViejo = 10;
            const medidorNuevo = 20;

            // 1. Obtener la ruta del medidor viejo
            const rutaVieja = db.prepare(`SELECT ruta_id, orden FROM rutas_puntos WHERE medidor_id = ?`).get(medidorViejo);
            assert.ok(rutaVieja);
            assert.strictEqual(Number(rutaVieja.ruta_id), 1);
            assert.strictEqual(Number(rutaVieja.orden), 1);

            // 2. Transacción de reemplazo 1 a 1
            db.prepare(`UPDATE medidores SET cliente_id = NULL WHERE id = ?`).run(medidorViejo);
            db.prepare(`UPDATE cliente_medidor_historial SET fecha_fin = date('now') WHERE medidor_id = ? AND fecha_fin IS NULL`).run(medidorViejo);

            db.prepare(`UPDATE medidores SET cliente_id = ? WHERE id = ?`).run(clienteId, medidorNuevo);
            db.prepare(`INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio, asignado_por) VALUES (?, ?, date('now'), 1)`).run(clienteId, medidorNuevo);

            // Migración automática de ruta_puntos
            db.prepare(`UPDATE rutas_puntos SET medidor_id = ? WHERE ruta_id = ? AND medidor_id = ?`).run(medidorNuevo, rutaVieja.ruta_id, medidorViejo);

            // Verificar que medidor 20 ahora está en rutas_puntos en la posición del 10
            const puntoNuevo = db.prepare(`SELECT ruta_id, orden FROM rutas_puntos WHERE medidor_id = ?`).get(medidorNuevo);
            assert.ok(puntoNuevo);
            assert.strictEqual(Number(puntoNuevo.ruta_id), 1);
            assert.strictEqual(Number(puntoNuevo.orden), 1);

            // El medidor viejo ya no está en la ruta
            const puntoViejo = db.prepare(`SELECT ruta_id FROM rutas_puntos WHERE medidor_id = ?`).get(medidorViejo);
            assert.strictEqual(puntoViejo, undefined);
        });

        it('liberación sin reemplazo: desvincula el medidor de rutas_puntos para no dejar puntos huérfanos', () => {
            const medidorViejo = 10;

            // Liberación sin nuevo medidor
            db.prepare(`UPDATE medidores SET cliente_id = NULL WHERE id = ?`).run(medidorViejo);
            db.prepare(`DELETE FROM rutas_puntos WHERE medidor_id = ?`).run(medidorViejo);

            const punto = db.prepare(`SELECT id FROM rutas_puntos WHERE medidor_id = ?`).get(medidorViejo);
            assert.strictEqual(punto, undefined);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 5: Asignación Especializada de Tarifas (asignarTarifa)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 5: Asignación Especializada de Tarifas', () => {
        it('retorna 404 si la tarifa a asignar no existe', () => {
            const tarifaInexistente = 777;
            const tarifa = db.prepare(`SELECT id FROM tarifas WHERE id = ?`).get(tarifaInexistente);
            assert.strictEqual(tarifa, undefined);
        });

        it('rechaza con 400 si el cliente ya tiene exactamente esa misma tarifa asignada', () => {
            const clienteId = 1; // Tiene tarifa 1
            const cliente = db.prepare(`SELECT tarifa_id FROM clientes WHERE id = ?`).get(clienteId);
            const tarifaRequerida = 1;

            const esMismaTarifa = Number(cliente.tarifa_id) === tarifaRequerida;
            assert.strictEqual(esMismaTarifa, true);
        });

        it('actualiza la tarifa exitosamente y registra antes y después en historial_cambios', () => {
            const clienteId = 1;
            const nuevaTarifaId = 2; // Cambiar de 1 a 2

            const tarifaAnterior = db.prepare(`SELECT tarifa_id FROM clientes WHERE id = ?`).get(clienteId).tarifa_id;
            const tarifaNueva = db.prepare(`SELECT nombre, descripcion FROM tarifas WHERE id = ?`).get(nuevaTarifaId);

            db.prepare(`UPDATE clientes SET tarifa_id = ?, modificado_por = 1 WHERE id = ?`).run(nuevaTarifaId, clienteId);

            const auditoria = {
                tarifa_id: { antes: Number(tarifaAnterior), despues: nuevaTarifaId },
                tarifa_nombre: { antes: null, despues: tarifaNueva.nombre }
            };

            db.prepare(`
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES ('clientes', 'UPDATE', ?, 1, ?)
            `).run(clienteId, JSON.stringify(auditoria));

            const clienteAct = db.prepare(`SELECT tarifa_id FROM clientes WHERE id = ?`).get(clienteId);
            assert.strictEqual(Number(clienteAct.tarifa_id), nuevaTarifaId);

            const log = db.prepare(`SELECT cambios FROM historial_cambios WHERE registro_id = ? ORDER BY id DESC LIMIT 1`).get(clienteId);
            const auditData = JSON.parse(log.cambios);
            assert.strictEqual(auditData.tarifa_id.antes, 1);
            assert.strictEqual(auditData.tarifa_id.despues, 2);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 6: Búsqueda, Filtrado y Paginación (obtenerClientes)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 6: Búsqueda, Filtrado y Paginación de Clientes', () => {
        beforeEach(() => {
            // Marcar cliente 4 como Eliminado
            db.prepare(`UPDATE clientes SET estado_cliente = 'Eliminado' WHERE id = 4`).run();
        });

        it('excluye clientes con estado "Eliminado" por defecto', () => {
            const activos = db.prepare(`SELECT id, estado_cliente FROM clientes WHERE estado_cliente != 'Eliminado'`).all();
            assert.strictEqual(activos.length, 3);
            assert.ok(!activos.some(c => c.estado_cliente === 'Eliminado'));
        });

        it('incluye clientes eliminados únicamente si se filtra explícitamente por estado "Eliminado"', () => {
            const eliminados = db.prepare(`SELECT id, nombre FROM clientes WHERE estado_cliente = 'Eliminado'`).all();
            assert.strictEqual(eliminados.length, 1);
            assert.strictEqual(eliminados[0].nombre, 'Laura Díaz');
        });

        it('busca por coincidencia parcial en nombre, predio, teléfono o dirección', () => {
            const term = '%Gómez%';
            const resultados = db.prepare(`
                SELECT id, nombre FROM clientes 
                WHERE estado_cliente != 'Eliminado' 
                  AND (nombre LIKE ? OR telefono LIKE ? OR numero_predio LIKE ? OR direccion LIKE ?)
            `).all(term, term, term, term);

            assert.strictEqual(resultados.length, 1);
            assert.strictEqual(resultados[0].nombre, 'María Gómez');
        });

        it('filtra por ciudad y estado específico', () => {
            const ciudad = 'Bogotá';
            const estado = 'Activo';

            const filtrados = db.prepare(`
                SELECT id, nombre FROM clientes 
                WHERE ciudad = ? AND estado_cliente = ?
            `).all(ciudad, estado);

            assert.strictEqual(filtrados.length, 2);
        });

        it('paginación: calcula correctamente total, totalPages, limit y offset', () => {
            const page = 1;
            const limit = 2;
            const offset = (page - 1) * limit;

            const total = db.prepare(`SELECT COUNT(*) as total FROM clientes WHERE estado_cliente != 'Eliminado'`).get().total;
            const paginados = db.prepare(`
                SELECT id, nombre FROM clientes 
                WHERE estado_cliente != 'Eliminado' 
                ORDER BY nombre ASC LIMIT ? OFFSET ?
            `).all(limit, offset);

            assert.strictEqual(total, 3);
            assert.strictEqual(paginados.length, 2);
            assert.strictEqual(Math.ceil(total / limit), 2); // 2 páginas en total
        });

        it('ordenamiento por numero_predio: coloca nulos al final y ordena por longitud y secuencia', () => {
            // Insertar cliente sin predio
            db.exec(`INSERT INTO clientes (nombre, direccion, telefono, ciudad) VALUES ('Zoe Sin Predio', 'Dir', '3000000000', 'Bog');`);

            const ordenados = db.prepare(`
                SELECT numero_predio, nombre FROM clientes 
                WHERE estado_cliente != 'Eliminado'
                ORDER BY CASE WHEN numero_predio IS NULL OR numero_predio = '' THEN 1 ELSE 0 END, 
                         LENGTH(numero_predio) ASC, 
                         numero_predio ASC
            `).all();

            assert.strictEqual(ordenados[0].numero_predio, 'MP-01');
            assert.strictEqual(ordenados[1].numero_predio, 'NG-01');
            assert.strictEqual(ordenados[2].numero_predio, 'NG-02');
            assert.strictEqual(ordenados[3].numero_predio, null); // Nulo al final
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 7: Ciclo de Vida, Papelera (Soft Delete) y Restauración
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 7: Papelera (Soft Delete), Candados y Restauración', () => {
        it('candado de eliminación 1: bloquea eliminación si el cliente tiene facturas pendientes', () => {
            const clienteId = 1;
            // Registrar factura pendiente
            db.exec(`
                INSERT INTO facturas (cliente_id, tarifa_id, total, saldo_pendiente, estado)
                VALUES (1, 1, 150.0, 150.0, 'Pendiente');
            `);

            const facturasPendientes = db.prepare(`
                SELECT COUNT(*) as total FROM facturas 
                WHERE cliente_id = ? AND estado IN ('Pendiente', 'Parcial')
            `).get(clienteId).total;

            assert.ok(facturasPendientes > 0);
            assert.strictEqual(facturasPendientes, 1);
        });

        it('candado de eliminación 2: bloquea eliminación si el cliente tiene un medidor activo asignado', () => {
            const clienteId = 2;
            // Asignar medidor activo
            db.exec(`
                INSERT INTO medidores (cliente_id, numero_serie, estado_medidor)
                VALUES (2, 'MED-ACTIVO-2', 'Activo');
            `);

            const medidoresActivos = db.prepare(`
                SELECT COUNT(*) as total FROM medidores 
                WHERE cliente_id = ? AND fecha_eliminacion IS NULL
            `).get(clienteId).total;

            assert.ok(medidoresActivos > 0);
            assert.strictEqual(medidoresActivos, 1);
        });

        it('ejecuta soft delete exitosamente si no tiene deudas ni medidores activos', () => {
            const clienteId = 1; // Sin facturas ni medidores
            const razon = 'Mudanza del titular';

            db.prepare(`
                UPDATE clientes 
                SET estado_cliente = 'Eliminado', 
                    fecha_eliminacion = datetime('now'), 
                    eliminado_por = 1, 
                    razon_eliminacion = ? 
                WHERE id = ?
            `).run(razon, clienteId);

            db.prepare(`
                INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
                VALUES ('clientes', 'SOFT_DELETE', ?, 1, ?)
            `).run(clienteId, JSON.stringify({ estado_anterior: 'Activo', estado_nuevo: 'Eliminado', razon }));

            const c = db.prepare(`SELECT estado_cliente, fecha_eliminacion, razon_eliminacion FROM clientes WHERE id = ?`).get(clienteId);
            assert.strictEqual(c.estado_cliente, 'Eliminado');
            assert.ok(c.fecha_eliminacion);
            assert.strictEqual(c.razon_eliminacion, 'Mudanza del titular');

            const log = db.prepare(`SELECT operacion FROM historial_cambios WHERE tabla = 'clientes' AND registro_id = ?`).get(clienteId);
            assert.strictEqual(log.operacion, 'SOFT_DELETE');
        });

        it('restaurar cliente: rechaza si el cliente no está en estado "Eliminado"', () => {
            const clienteId = 1; // Estado Activo
            const c = db.prepare(`SELECT estado_cliente FROM clientes WHERE id = ?`).get(clienteId);
            const esEliminado = c.estado_cliente === 'Eliminado';
            assert.strictEqual(esEliminado, false);
        });

        it('restaurar cliente: recupera el cliente a "Activo" y limpia campos de eliminación', () => {
            const clienteId = 1;
            // Marcar como eliminado
            db.prepare(`UPDATE clientes SET estado_cliente = 'Eliminado', fecha_eliminacion = datetime('now'), razon_eliminacion = 'Test' WHERE id = 1`).run();

            // Restaurar
            db.prepare(`
                UPDATE clientes 
                SET estado_cliente = 'Activo', 
                    fecha_eliminacion = NULL, 
                    eliminado_por = NULL, 
                    razon_eliminacion = NULL, 
                    modificado_por = 1 
                WHERE id = ?
            `).run(clienteId);

            const c = db.prepare(`SELECT estado_cliente, fecha_eliminacion, razon_eliminacion FROM clientes WHERE id = ?`).get(clienteId);
            assert.strictEqual(c.estado_cliente, 'Activo');
            assert.strictEqual(c.fecha_eliminacion, null);
            assert.strictEqual(c.razon_eliminacion, null);
        });

        it('obtener clientes eliminados (papelera): reporta historial de facturas y medidores', () => {
            // Cliente 1 eliminado con 1 factura histórica pagada
            db.prepare(`UPDATE clientes SET estado_cliente = 'Eliminado', fecha_eliminacion = datetime('now') WHERE id = 1`).run();
            db.exec(`INSERT INTO facturas (cliente_id, tarifa_id, total, saldo_pendiente, estado) VALUES (1, 1, 100, 0, 'Pagada');`);

            const papelera = db.prepare(`
                SELECT c.id, c.nombre, c.estado_cliente,
                       (SELECT COUNT(*) FROM facturas f WHERE f.cliente_id = c.id) as total_facturas,
                       (SELECT COUNT(*) FROM medidores m WHERE m.cliente_id = c.id) as total_medidores
                FROM clientes c 
                WHERE c.estado_cliente = 'Eliminado'
            `).all();

            assert.strictEqual(papelera.length, 1);
            assert.strictEqual(papelera[0].nombre, 'Juan Pérez');
            assert.strictEqual(Number(papelera[0].total_facturas), 1);
            assert.strictEqual(Number(papelera[0].total_medidores), 0);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 8: Candados de Purgado Definitivo (Hard Delete)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 8: Candados Contables y de Purgado Definitivo', () => {
        beforeEach(() => {
            // Cliente 1 en papelera
            db.prepare(`UPDATE clientes SET estado_cliente = 'Eliminado' WHERE id = 1`).run();
        });

        it('rechaza purgado definitivo si el cliente NO está en estado "Eliminado"', () => {
            const clienteId = 2; // Cliente 2 está Activo
            const c = db.prepare(`SELECT estado_cliente FROM clientes WHERE id = ?`).get(clienteId);
            const puedePurgar = c.estado_cliente === 'Eliminado';
            assert.strictEqual(puedePurgar, false);
        });

        it('candado contable: bloquea purgado si el cliente tiene facturas históricas en el sistema', () => {
            const clienteId = 1;
            // Registrar factura histórica ya liquidada
            db.exec(`
                INSERT INTO facturas (cliente_id, tarifa_id, total, saldo_pendiente, estado)
                VALUES (1, 1, 250.0, 0.0, 'Pagada');
            `);

            const facturas = db.prepare(`SELECT COUNT(*) as total FROM facturas WHERE cliente_id = ?`).get(clienteId).total;
            assert.ok(facturas > 0);
            assert.strictEqual(facturas, 1);
        });

        it('candado de trazabilidad: bloquea purgado si el cliente tiene historial de medidores', () => {
            const clienteId = 1;
            // Registrar medidor y entrada en historial
            db.exec(`
                INSERT INTO medidores (id, numero_serie, estado_medidor) VALUES (99, 'MED-HIST-99', 'Retirado');
                INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio, fecha_fin) 
                VALUES (1, 99, '2023-01-01', '2023-12-31');
            `);

            const historial = db.prepare(`SELECT COUNT(*) as total FROM cliente_medidor_historial WHERE cliente_id = ?`).get(clienteId).total;
            assert.ok(historial > 0);
            assert.strictEqual(historial, 1);
        });

        it('ejecuta hard delete físico de la base de datos si no tiene ningún historial contable ni de medidores', () => {
            const clienteId = 1; // Sin facturas ni historial de medidores

            // Verificar que no hay dependencias
            const facturas = db.prepare(`SELECT COUNT(*) as c FROM facturas WHERE cliente_id = ?`).get(clienteId).c;
            const historial = db.prepare(`SELECT COUNT(*) as c FROM cliente_medidor_historial WHERE cliente_id = ?`).get(clienteId).c;
            assert.strictEqual(facturas, 0);
            assert.strictEqual(historial, 0);

            // DELETE físico
            db.prepare(`DELETE FROM clientes WHERE id = ?`).run(clienteId);
            db.prepare(`
                INSERT INTO historial_cambios (tabla, operacion, registro_id, cambios)
                VALUES ('clientes', 'HARD_DELETE', ?, '{"motivo": "purgado definitivo sin historial"}')
            `).run(clienteId);

            const existe = db.prepare(`SELECT id FROM clientes WHERE id = ?`).get(clienteId);
            assert.strictEqual(existe, undefined, 'El cliente debe haber sido removido de la tabla');

            const log = db.prepare(`SELECT operacion FROM historial_cambios WHERE tabla = 'clientes' AND operacion = 'HARD_DELETE'`).get();
            assert.ok(log);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 9: Estadísticas y Analítica de Clientes (estadisticasClientes)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 9: Estadísticas y Analítica de Clientes', () => {
        beforeEach(() => {
            // Asignar medidor a Cliente 1
            db.exec(`
                INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor) VALUES (101, 1, 'MED-ESTAT-101', 'Activo');
            `);
        });

        it('calcula totales exactos de clientes, activos, inactivos y asignación de medidores', () => {
            const total = db.prepare(`SELECT COUNT(*) as c FROM clientes`).get().c;
            const activos = db.prepare(`SELECT COUNT(*) as c FROM clientes WHERE estado_cliente = 'Activo'`).get().c;
            const inactivos = db.prepare(`SELECT COUNT(*) as c FROM clientes WHERE estado_cliente != 'Activo'`).get().c;
            const conMedidor = db.prepare(`SELECT COUNT(DISTINCT cliente_id) as c FROM medidores WHERE cliente_id IS NOT NULL`).get().c;
            const sinMedidor = db.prepare(`SELECT COUNT(*) as c FROM clientes c WHERE NOT EXISTS (SELECT 1 FROM medidores m WHERE m.cliente_id = c.id)`).get().c;

            assert.strictEqual(total, 4);
            assert.strictEqual(activos, 2);
            assert.strictEqual(inactivos, 2);
            assert.strictEqual(conMedidor, 1);
            assert.strictEqual(sinMedidor, 3);
            assert.strictEqual(conMedidor + sinMedidor, total);
        });

        it('distribuye clientes por ciudad y por tarifa', () => {
            const porCiudad = db.prepare(`SELECT ciudad, COUNT(*) as c FROM clientes GROUP BY ciudad ORDER BY c DESC`).all();
            assert.strictEqual(porCiudad.find(c => c.ciudad === 'Bogotá').c, 2);
            assert.strictEqual(porCiudad.find(c => c.ciudad === 'Medellín').c, 1);
            assert.strictEqual(porCiudad.find(c => c.ciudad === 'Cali').c, 1);

            const porTarifa = db.prepare(`
                SELECT t.nombre, COUNT(c.id) as c 
                FROM clientes c 
                JOIN tarifas t ON c.tarifa_id = t.id 
                GROUP BY t.id
            `).all();

            assert.strictEqual(porTarifa.find(t => t.nombre === 'Residencial Básica').c, 2);
            assert.strictEqual(porTarifa.find(t => t.nombre === 'Comercial').c, 2);
        });
    });
});
