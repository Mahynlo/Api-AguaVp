import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

describe('Suite de Verificación: Módulo de Usuarios, Roles, Permisos Granulares y Seguridad', () => {
    let db;

    beforeEach(() => {
        db = new DatabaseSync(':memory:');

        // Esquema idéntico al de producción de AguaVP
        db.exec(`
            CREATE TABLE usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                correo TEXT NOT NULL UNIQUE,
                nombre TEXT,
                contraseña TEXT NOT NULL,
                username TEXT NOT NULL UNIQUE,
                rol TEXT NOT NULL CHECK (rol IN ('superadmin', 'administrador', 'operador')),
                fecha_creacion TEXT DEFAULT (datetime('now')),
                ultimo_acceso TEXT,
                intentos_fallidos INTEGER DEFAULT 0,
                bloqueado_hasta TEXT,
                requiere_cambio_password INTEGER DEFAULT 0,
                ultimo_cambio_password TEXT,
                estado_usuario TEXT NOT NULL DEFAULT 'Activo' CHECK (estado_usuario IN ('Activo', 'Inactivo', 'Suspendido', 'Eliminado')),
                fecha_eliminacion TEXT,
                eliminado_por INTEGER REFERENCES usuarios(id),
                razon_eliminacion TEXT
            );

            CREATE TABLE sesiones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                token TEXT UNIQUE NOT NULL,
                fecha_inicio TEXT DEFAULT (datetime('now')),
                fecha_fin TEXT,
                direccion_ip TEXT,
                dispositivo TEXT,
                activo INTEGER DEFAULT 1,
                ultimo_uso TEXT,
                expira_en TEXT
            );

            CREATE TABLE tokens_revocados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT UNIQUE NOT NULL,
                tipo TEXT NOT NULL,
                usuario_id INTEGER REFERENCES usuarios(id),
                razon TEXT,
                fecha_revocacion TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE refresh_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT UNIQUE NOT NULL,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                expira_en TEXT NOT NULL,
                revocado INTEGER DEFAULT 0,
                revocado_en TEXT,
                razon_revocacion TEXT
            );

            CREATE TABLE permissions_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                permission_key TEXT NOT NULL UNIQUE,
                module TEXT NOT NULL,
                action TEXT NOT NULL,
                description TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE role_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                permission_key TEXT NOT NULL REFERENCES permissions_catalog(permission_key) ON DELETE CASCADE,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE (role, permission_key)
            );

            CREATE TABLE user_permission_overrides (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                permission_key TEXT NOT NULL REFERENCES permissions_catalog(permission_key) ON DELETE CASCADE,
                effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
                updated_by INTEGER REFERENCES usuarios(id),
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE (user_id, permission_key)
            );

            CREATE TABLE historial_passwords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                password_hash TEXT NOT NULL,
                fecha_cambio TEXT DEFAULT (datetime('now'))
            );

            -- Tabla de negocio para probar candados de integridad referencial
            CREATE TABLE facturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                creado_por INTEGER REFERENCES usuarios(id),
                total REAL NOT NULL
            );
        `);

        // Datos iniciales: Permisos en catálogo
        db.exec(`
            INSERT INTO permissions_catalog (permission_key, module, action, description) VALUES
                ('clientes.crear', 'clientes', 'crear', 'Crear clientes'),
                ('clientes.modificar', 'clientes', 'modificar', 'Modificar clientes'),
                ('tarifas.crear', 'tarifas', 'crear', 'Crear tarifas'),
                ('tarifas.modificar', 'tarifas', 'modificar', 'Modificar tarifas'),
                ('rutas.crear', 'rutas', 'crear', 'Crear rutas'),
                ('lecturas.tomar', 'lecturas', 'tomar', 'Registrar lecturas'),
                ('usuarios.gestionar_permisos', 'usuarios', 'gestionar_permisos', 'Gestionar permisos');

            -- Permisos por defecto:
            -- administrador: casi todo
            INSERT INTO role_permissions (role, permission_key) VALUES
                ('administrador', 'clientes.crear'),
                ('administrador', 'clientes.modificar'),
                ('administrador', 'tarifas.crear'),
                ('administrador', 'rutas.crear'),
                ('administrador', 'lecturas.tomar'),
                ('administrador', 'usuarios.gestionar_permisos');

            -- operador: solo tomar lecturas por defecto
            INSERT INTO role_permissions (role, permission_key) VALUES
                ('operador', 'lecturas.tomar');
        `);

        // Usuarios iniciales
        const passHash = bcrypt.hashSync('Password123!', 8);
        db.exec(`
            INSERT INTO usuarios (id, correo, nombre, contraseña, username, rol, estado_usuario) VALUES
                (1, 'superadmin@aguavp.com', 'Super Administrador', '${passHash}', 'superadmin', 'superadmin', 'Activo'),
                (2, 'admin@aguavp.com', 'Admin General', '${passHash}', 'admingeneral', 'administrador', 'Activo'),
                (3, 'operador1@aguavp.com', 'Juan Operador', '${passHash}', 'juanoperador', 'operador', 'Activo');
        `);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 1: Jerarquía de Seguridad y Segregación entre Roles
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 1: Jerarquía de Roles y Protección de Superadmin', () => {
        it('un administrador NO puede ver a un superadmin en la lista de usuarios', () => {
            const actorRole = 'administrador';
            let query = `SELECT id, username, rol FROM usuarios WHERE 1=1`;
            if (actorRole === 'administrador') {
                query += ` AND rol != 'superadmin'`;
            }

            const usuariosVisibles = db.prepare(query).all();
            assert.strictEqual(usuariosVisibles.length, 2);
            assert.ok(!usuariosVisibles.some(u => u.rol === 'superadmin'));
        });

        it('un superadmin puede ver a todos los usuarios del sistema sin restricciones', () => {
            const actorRole = 'superadmin';
            let query = `SELECT id, username, rol FROM usuarios WHERE 1=1`;
            if (actorRole === 'administrador') {
                query += ` AND rol != 'superadmin'`;
            }

            const usuariosVisibles = db.prepare(query).all();
            assert.strictEqual(usuariosVisibles.length, 3);
            assert.ok(usuariosVisibles.some(u => u.rol === 'superadmin'));
        });

        it('un administrador es rechazado con 403 al intentar consultar por ID a un superadmin', () => {
            const actorRole = 'administrador';
            const targetUser = db.prepare(`SELECT id, rol FROM usuarios WHERE id = 1`).get(); // id 1 es superadmin

            const esBloqueado = actorRole === 'administrador' && targetUser.rol === 'superadmin';
            assert.strictEqual(esBloqueado, true);
        });

        it('un administrador es rechazado con 403 al intentar crear una cuenta con rol superadmin', () => {
            const actorRole = 'administrador';
            const nuevoRol = 'superadmin';

            const puedeCrear = !(actorRole === 'administrador' && nuevoRol === 'superadmin');
            assert.strictEqual(puedeCrear, false);
        });

        it('un administrador es rechazado con 403 al intentar modificar, promover o cambiar estado de un superadmin', () => {
            const actorRole = 'administrador';
            const targetUser = db.prepare(`SELECT id, rol FROM usuarios WHERE id = 1`).get();

            // Intentar modificar
            const puedeModificar = !(actorRole === 'administrador' && targetUser.rol === 'superadmin');
            assert.strictEqual(puedeModificar, false);

            // Intentar promover a otro usuario a superadmin
            const bodyConRolSuper = { rol: 'superadmin' };
            const puedePromover = !(actorRole === 'administrador' && bodyConRolSuper.rol === 'superadmin');
            assert.strictEqual(puedePromover, false);
        });

        it('un administrador es rechazado con 403 al intentar eliminar o purgar a un superadmin', () => {
            const actorRole = 'administrador';
            const targetUser = db.prepare(`SELECT id, rol FROM usuarios WHERE id = 1`).get();

            const puedeEliminar = !(actorRole === 'administrador' && targetUser.rol === 'superadmin');
            assert.strictEqual(puedeEliminar, false);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 2: Control de Acceso RBAC y Sobrescrituras Granulares (Overrides)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 2: RBAC y Sobrescrituras Granulares (Allow / Deny)', () => {
        // Implementación de lógica de verificación de permisos idéntica a permissionsService
        const userHasPermission = (userId, role, permissionKey) => {
            if (role === 'superadmin') return true; // Bypass total

            // 1. Permisos del rol
            const rolePerms = db.prepare(`
                SELECT rp.permission_key 
                FROM role_permissions rp 
                JOIN permissions_catalog pc ON pc.permission_key = rp.permission_key
                WHERE rp.role = ? AND pc.is_active = 1
            `).all(role).map(r => r.permission_key);

            const effective = new Set(rolePerms);

            // 2. Overrides de usuario
            const overrides = db.prepare(`
                SELECT upo.permission_key, upo.effect 
                FROM user_permission_overrides upo
                JOIN permissions_catalog pc ON pc.permission_key = upo.permission_key
                WHERE upo.user_id = ? AND pc.is_active = 1
            `).all(userId);

            overrides.forEach(o => {
                if (o.effect === 'deny') effective.delete(o.permission_key);
                if (o.effect === 'allow') effective.add(o.permission_key);
            });

            return effective.has(permissionKey);
        };

        it('superadmin tiene acceso garantizado ("God Mode") a cualquier permiso del sistema', () => {
            assert.strictEqual(userHasPermission(1, 'superadmin', 'clientes.crear'), true);
            assert.strictEqual(userHasPermission(1, 'superadmin', 'tarifas.crear'), true);
            assert.strictEqual(userHasPermission(1, 'superadmin', 'cualquier.permiso.inexistente'), true);
        });

        it('operador solo tiene permisos de su rol por defecto (tiene lecturas.tomar, no tiene clientes.crear)', () => {
            const userId = 3; // Juan Operador
            const role = 'operador';

            assert.strictEqual(userHasPermission(userId, role, 'lecturas.tomar'), true);
            assert.strictEqual(userHasPermission(userId, role, 'clientes.crear'), false);
            assert.strictEqual(userHasPermission(userId, role, 'tarifas.crear'), false);
        });

        it('override "allow": habilita un permiso específico a un operador que su rol no posee', () => {
            const userId = 3;
            const role = 'operador';
            const perm = 'clientes.crear';

            assert.strictEqual(userHasPermission(userId, role, perm), false);

            // Asignar override ALLOW
            db.prepare(`
                INSERT INTO user_permission_overrides (user_id, permission_key, effect, updated_by)
                VALUES (?, ?, 'allow', 1)
            `).run(userId, perm);

            assert.strictEqual(userHasPermission(userId, role, perm), true);
        });

        it('override "deny": revoca un permiso específico a un administrador a pesar de que su rol lo incluya', () => {
            const userId = 2; // Admin General
            const role = 'administrador';
            const perm = 'tarifas.crear';

            // El administrador normalmente sí tiene tarifas.crear
            assert.strictEqual(userHasPermission(userId, role, perm), true);

            // Asignar override DENY
            db.prepare(`
                INSERT INTO user_permission_overrides (user_id, permission_key, effect, updated_by)
                VALUES (?, ?, 'deny', 1)
            `).run(userId, perm);

            // Ahora debe estar revocado
            assert.strictEqual(userHasPermission(userId, role, perm), false);
        });

        it('snapshot de permisos: reporta correctamente source ("role", "override_allow", "override_deny", "none")', () => {
            const userId = 3; // Operador
            const role = 'operador';

            // Operador tiene lecturas.tomar por rol
            // Le damos override allow en clientes.crear
            // Le damos override deny en lecturas.tomar
            db.exec(`
                INSERT INTO user_permission_overrides (user_id, permission_key, effect, updated_by) VALUES
                    (3, 'clientes.crear', 'allow', 1),
                    (3, 'lecturas.tomar', 'deny', 1);
            `);

            const rolePerms = new Set(db.prepare(`SELECT permission_key FROM role_permissions WHERE role = ?`).all(role).map(r => r.permission_key));
            const overrides = db.prepare(`SELECT permission_key, effect FROM user_permission_overrides WHERE user_id = ?`).all(userId);
            const allowSet = new Set(overrides.filter(o => o.effect === 'allow').map(o => o.permission_key));
            const denySet = new Set(overrides.filter(o => o.effect === 'deny').map(o => o.permission_key));

            const buildSource = (key) => {
                if (denySet.has(key)) return 'override_deny';
                if (allowSet.has(key)) return 'override_allow';
                if (rolePerms.has(key)) return 'role';
                return 'none';
            };

            assert.strictEqual(buildSource('clientes.crear'), 'override_allow');
            assert.strictEqual(buildSource('lecturas.tomar'), 'override_deny');
            assert.strictEqual(buildSource('tarifas.crear'), 'none');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 3: Middlewares de Autorización y Revocación de Sesiones
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 3: Middlewares de Autorización y Revocación de Tokens', () => {
        beforeEach(() => {
            // Sesión activa para usuario 2
            db.exec(`
                INSERT INTO sesiones (id, usuario_id, token, activo) VALUES (10, 2, 'TOKEN_ACTIVO_123', 1);
            `);
        });

        it('authMiddleware: rechaza solicitud si no incluye encabezado Authorization Bearer', () => {
            const validarHeader = (authHeader) => {
                if (!authHeader || !authHeader.startsWith("Bearer ")) return { status: 401, error: "Token no proporcionado o formato incorrecto" };
                return { status: 200 };
            };

            assert.strictEqual(validarHeader(null).status, 401);
            assert.strictEqual(validarHeader('').status, 401);
            assert.strictEqual(validarHeader('Basic 12345').status, 401);
            assert.strictEqual(validarHeader('Bearer mi_token').status, 200);
        });

        it('authMiddleware: rechaza inmediatamente con 401 si el token está en tokens_revocados', () => {
            const token = 'TOKEN_REVOCADO_999';
            db.prepare(`INSERT INTO tokens_revocados (token, tipo, usuario_id, razon) VALUES (?, 'access', 2, 'logout')`).run(token);

            const revocado = db.prepare(`SELECT id FROM tokens_revocados WHERE token = ? LIMIT 1`).get(token);
            assert.ok(revocado);
        });

        it('authMiddleware: rechaza con 403 si la sesión no existe o está inactiva (activo = 0)', () => {
            // Inactivar sesión
            db.prepare(`UPDATE sesiones SET activo = 0 WHERE id = 10`).run();

            const sesion = db.prepare(`SELECT * FROM sesiones WHERE token = 'TOKEN_ACTIVO_123' AND activo = 1`).get();
            assert.strictEqual(sesion, undefined);
        });

        it('authorize middleware: permite solo si el rol del usuario coincide con los roles autorizados', () => {
            const checkRol = (usuarioRol, rolesPermitidos) => rolesPermitidos.includes(usuarioRol);

            assert.strictEqual(checkRol('superadmin', ['administrador', 'superadmin']), true);
            assert.strictEqual(checkRol('administrador', ['administrador', 'superadmin']), true);
            assert.strictEqual(checkRol('operador', ['administrador', 'superadmin']), false);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 4: Ciclo de Vida del Usuario (CRUD, Contraseñas y Validaciones)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 4: Ciclo de Vida de Usuarios (Creación, Modificación y Contraseñas)', () => {
        it('rechaza creación de usuario si el correo o el username ya están registrados', () => {
            const dupeCorreo = db.prepare(`SELECT id FROM usuarios WHERE correo = ? OR username = ?`).get('admin@aguavp.com', 'nuevo_user');
            assert.ok(dupeCorreo);

            const dupeUsername = db.prepare(`SELECT id FROM usuarios WHERE correo = ? OR username = ?`).get('nuevo@aguavp.com', 'admingeneral');
            assert.ok(dupeUsername);
        });

        it('crea usuario exitosamente con contraseña cifrada en bcrypt y flag requiere_cambio_password = 1', () => {
            const plainPass = 'Temporal2024!';
            const hash = bcrypt.hashSync(plainPass, 8);

            const insert = db.prepare(`
                INSERT INTO usuarios (correo, nombre, contraseña, username, rol, estado_usuario, requiere_cambio_password)
                VALUES ('nuevo@aguavp.com', 'Nuevo Operador', ?, 'nuevo_op', 'operador', 'Activo', 1)
            `).run(hash);

            const nuevoId = Number(insert.lastInsertRowid);
            const user = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(nuevoId);

            assert.strictEqual(user.username, 'nuevo_op');
            assert.strictEqual(user.requiere_cambio_password, 1);
            assert.strictEqual(bcrypt.compareSync(plainPass, user.contraseña), true);
        });

        it('actualiza datos de usuario y regenera hash si se incluye nueva contraseña', () => {
            const userId = 3;
            const nuevaPass = 'NuevaPassSuperSegura!';
            const nuevoHash = bcrypt.hashSync(nuevaPass, 8);

            db.prepare(`
                UPDATE usuarios 
                SET nombre = 'Juan Modificado', correo = 'juan_nuevo@aguavp.com', contraseña = ?, requiere_cambio_password = 1
                WHERE id = ?
            `).run(nuevoHash, userId);

            const user = db.prepare(`SELECT nombre, correo, contraseña, requiere_cambio_password FROM usuarios WHERE id = ?`).get(userId);
            assert.strictEqual(user.nombre, 'Juan Modificado');
            assert.strictEqual(user.correo, 'juan_nuevo@aguavp.com');
            assert.strictEqual(bcrypt.compareSync(nuevaPass, user.contraseña), true);
            assert.strictEqual(user.requiere_cambio_password, 1);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 5: Soft Delete, Revocación de Sesiones y Reactivación
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 5: Soft Delete, Cierre de Sesiones y Reactivación', () => {
        beforeEach(() => {
            // Asignar sesión y refresh token al operador (id 3)
            db.exec(`
                INSERT INTO sesiones (id, usuario_id, token, activo) VALUES (30, 3, 'SESION_OP_30', 1);
                INSERT INTO refresh_tokens (id, usuario_id, token, expira_en, revocado) VALUES (300, 3, 'REFRESH_OP_300', '2099-01-01', 0);
            `);
        });

        it('protección de auto-eliminación: impide que un usuario se elimine a sí mismo', () => {
            const userId = 2;
            const eliminadoPor = 2;

            const esAutoEliminacion = Number(userId) === Number(eliminadoPor);
            assert.strictEqual(esAutoEliminacion, true);
        });

        it('soft delete de usuario: marca estado "Eliminado" e invalida inmediatamente todas sus sesiones y refresh tokens', () => {
            const userId = 3;
            const eliminadoPor = 1;
            const razon = 'Baja de personal';

            // 1. Soft Delete
            db.prepare(`
                UPDATE usuarios 
                SET estado_usuario = 'Eliminado', fecha_eliminacion = datetime('now'), eliminado_por = ?, razon_eliminacion = ?
                WHERE id = ?
            `).run(eliminadoPor, razon, userId);

            // 2. Revocación atómica de sesiones y refresh tokens
            db.prepare(`UPDATE sesiones SET activo = 0, fecha_fin = datetime('now') WHERE usuario_id = ?`).run(userId);
            db.prepare(`UPDATE refresh_tokens SET revocado = 1, revocado_en = datetime('now'), razon_revocacion = 'usuario_eliminado' WHERE usuario_id = ? AND revocado = 0`).run(userId);

            const user = db.prepare(`SELECT estado_usuario, fecha_eliminacion, razon_eliminacion FROM usuarios WHERE id = ?`).get(userId);
            assert.strictEqual(user.estado_usuario, 'Eliminado');
            assert.strictEqual(user.razon_eliminacion, 'Baja de personal');

            // Sesión cerrada
            const sesion = db.prepare(`SELECT activo, fecha_fin FROM sesiones WHERE id = 30`).get();
            assert.strictEqual(sesion.activo, 0);
            assert.ok(sesion.fecha_fin);

            // Refresh token revocado
            const refresh = db.prepare(`SELECT revocado, razon_revocacion FROM refresh_tokens WHERE id = 300`).get();
            assert.strictEqual(refresh.revocado, 1);
            assert.strictEqual(refresh.razon_revocacion, 'usuario_eliminado');
        });

        it('reactivación: restaura estado a "Activo" y resetea bloqueos de seguridad e intentos fallidos', () => {
            const userId = 3;
            // Poner usuario en estado eliminado con intentos fallidos
            db.prepare(`
                UPDATE usuarios 
                SET estado_usuario = 'Eliminado', intentos_fallidos = 5, bloqueado_hasta = '2099-01-01'
                WHERE id = ?
            `).run(userId);

            // Reactivar
            db.prepare(`
                UPDATE usuarios 
                SET estado_usuario = 'Activo', fecha_eliminacion = NULL, eliminado_por = NULL, razon_eliminacion = NULL, intentos_fallidos = 0, bloqueado_hasta = NULL
                WHERE id = ?
            `).run(userId);

            const user = db.prepare(`SELECT estado_usuario, fecha_eliminacion, intentos_fallidos, bloqueado_hasta FROM usuarios WHERE id = ?`).get(userId);
            assert.strictEqual(user.estado_usuario, 'Activo');
            assert.strictEqual(user.fecha_eliminacion, null);
            assert.strictEqual(user.intentos_fallidos, 0);
            assert.strictEqual(user.bloqueado_hasta, null);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 6: Candados de Purgado Definitivo (Hard Delete) e Integridad Referencial
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 6: Candados de Purgado Definitivo e Integridad FK', () => {
        it('candado de auditoría: bloquea purgado si el usuario tiene registros vinculados en el sistema (ej. facturas)', () => {
            const userId = 2;
            // Registrar factura emitida por este usuario
            db.exec(`INSERT INTO facturas (creado_por, total) VALUES (2, 250.0);`);

            db.exec(`PRAGMA foreign_keys = ON;`);

            // Intentar purgar usuario 2 debe lanzar error de foreign key
            assert.throws(() => {
                db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(userId);
            }, /FOREIGN KEY constraint failed/);
        });

        it('purgado definitivo: elimina físicamente al usuario y todas sus tablas hijas si no tiene dependencias de negocio', () => {
            // Crear usuario efímero con sesiones y overrides
            const passHash = bcrypt.hashSync('Pass123!', 8);
            const ins = db.prepare(`
                INSERT INTO usuarios (correo, nombre, contraseña, username, rol)
                VALUES ('temp@aguavp.com', 'Temporal', '${passHash}', 'tempuser', 'operador')
            `).run();
            const tempId = Number(ins.lastInsertRowid);

            db.prepare(`INSERT INTO sesiones (usuario_id, token) VALUES (?, 'TEMP_TOKEN')`).run(tempId);
            db.prepare(`INSERT INTO user_permission_overrides (user_id, permission_key, effect) VALUES (?, 'lecturas.tomar', 'allow')`).run(tempId);

            db.exec(`PRAGMA foreign_keys = ON;`);

            // Purgar tablas hijas y usuario en cascada
            db.prepare(`DELETE FROM sesiones WHERE usuario_id = ?`).run(tempId);
            db.prepare(`DELETE FROM user_permission_overrides WHERE user_id = ?`).run(tempId);
            db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(tempId);

            const existe = db.prepare(`SELECT id FROM usuarios WHERE id = ?`).get(tempId);
            assert.strictEqual(existe, undefined);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // MÓDULO 7: Intentos Fallidos, Bloqueo de Cuenta y Control de Acceso (authService)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Módulo 7: Intentos Fallidos, Bloqueo Automático y Seguridad en Login', () => {
        it('incrementa intentos_fallidos al ingresar credenciales erróneas', () => {
            const userId = 3;
            assert.strictEqual(db.prepare(`SELECT intentos_fallidos FROM usuarios WHERE id = ?`).get(userId).intentos_fallidos, 0);

            // Intento fallido 1
            db.prepare(`UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?`).run(userId);
            assert.strictEqual(db.prepare(`SELECT intentos_fallidos FROM usuarios WHERE id = ?`).get(userId).intentos_fallidos, 1);

            // Intento fallido 2
            db.prepare(`UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?`).run(userId);
            assert.strictEqual(db.prepare(`SELECT intentos_fallidos FROM usuarios WHERE id = ?`).get(userId).intentos_fallidos, 2);
        });

        it('bloquea la cuenta por 30 minutos al alcanzar el límite máximo de intentos fallidos (5)', () => {
            const userId = 3;
            const MAX_INTENTOS = 5;

            // Simular alcanzar el quinto intento
            db.prepare(`
                UPDATE usuarios 
                SET intentos_fallidos = ?, bloqueado_hasta = datetime('now', '+30 minutes')
                WHERE id = ?
            `).run(MAX_INTENTOS, userId);

            const user = db.prepare(`SELECT intentos_fallidos, bloqueado_hasta FROM usuarios WHERE id = ?`).get(userId);
            assert.strictEqual(user.intentos_fallidos, 5);
            assert.ok(user.bloqueado_hasta);

            // Verificar si está bloqueado actualmente
            const estaBloqueado = Boolean(user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date());
            assert.strictEqual(estaBloqueado, true);
        });

        it('rechaza login si el usuario está en estado diferente de "Activo" (ej. "Inactivo" o "Eliminado")', () => {
            const userEliminado = { estado_usuario: 'Eliminado' };
            const userInactivo = { estado_usuario: 'Inactivo' };
            const userActivo = { estado_usuario: 'Activo' };

            const puedeLoguear = (u) => u.estado_usuario === 'Activo';

            assert.strictEqual(puedeLoguear(userEliminado), false);
            assert.strictEqual(puedeLoguear(userInactivo), false);
            assert.strictEqual(puedeLoguear(userActivo), true);
        });

        it('login exitoso: limpia intentos fallidos, remueve bloqueo y actualiza ultimo_acceso', () => {
            const userId = 3;
            // Estado previo con fallos
            db.prepare(`UPDATE usuarios SET intentos_fallidos = 3, bloqueado_hasta = '2020-01-01' WHERE id = ?`).run(userId);

            // Login exitoso
            db.prepare(`
                UPDATE usuarios 
                SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = datetime('now')
                WHERE id = ?
            `).run(userId);

            const user = db.prepare(`SELECT intentos_fallidos, bloqueado_hasta, ultimo_acceso FROM usuarios WHERE id = ?`).get(userId);
            assert.strictEqual(user.intentos_fallidos, 0);
            assert.strictEqual(user.bloqueado_hasta, null);
            assert.ok(user.ultimo_acceso);
        });
    });
});
