/**
 * Núcleo de la sincronización con Turso Cloud (sin estado ni conexiones propias)
 * File: src/v2/services/tursoSyncCore.js
 *
 * Todas las funciones reciben explícitamente:
 *   - local:  conexión SQLite síncrona (better-sqlite3 en producción, node:sqlite en pruebas)
 *             — se usa solo prepare().all/get/run y exec()
 *   - remote: cliente @libsql/client (Turso en producción, archivo libsql en pruebas)
 *
 * Reglas de seguridad de datos:
 *   1. La nube nunca se vacía antes de copiar: primero se insertan/actualizan las filas
 *      y al final se borran SOLO los ids que ya no existen en local.
 *   2. Antes de una carga completa se verifica que la nube no tenga datos de otra base
 *      ni más registros de negocio que la local (base local perdida/vacía/antigua), y que
 *      la base local pase PRAGMA quick_check (una base dañada nunca se sube).
 *   3. Las columnas nuevas de la base local se agregan en la nube antes de copiar.
 *   4. Todo cambio local (alta, edición, borrado) de una tabla sincronizada queda registrado
 *      por triggers locales en `sync_cambios`; el incremental sube el estado actual de esos
 *      registros y avanza un cursor por id (no depende de fechas ni de cada servicio).
 *   5. Tras subir cambios se verifica la nube (COUNT y MAX(id) por tabla) y se reparan
 *      las tablas que no coincidan, sin borrar registros de tablas de negocio protegidas.
 */

import crypto from 'crypto';

// Tabla local con el estado de sincronización (nunca se sube a la nube)
export const LOCAL_STATE_TABLE = 'sync_estado';
// Tabla local con el registro de cambios pendientes de subir (nunca se sube a la nube)
export const CHANGE_LOG_TABLE = 'sync_cambios';
// Tabla remota con la identidad y metadatos de la copia (nunca se copia de la nube a local)
export const REMOTE_META_TABLE = '_aguavp_sync_meta';
export const LOCAL_ONLY_TABLES = new Set([LOCAL_STATE_TABLE, CHANGE_LOG_TABLE, REMOTE_META_TABLE]);

// Tablas que NO se suben a la nube: credenciales de sesión de vida corta, innecesarias para
// restaurar (tras restaurar, los usuarios solo vuelven a iniciar sesión). Además cambian en cada
// renovación de sesión, lo que impediría el "cero red en reposo".
export const EXCLUDED_TABLES = new Set(['refresh_tokens', 'sesiones', 'tokens_revocados', 'password_recovery_tokens']);

// Tablas de negocio cuya cantidad de registros no debería disminuir en local.
// Si la nube tiene MÁS registros que la local, la base local se considera perdida,
// vacía o restaurada desde un respaldo antiguo: la carga completa se bloquea y la
// reparación no borra registros de la nube en estas tablas.
export const GUARD_TABLES = ['clientes', 'medidores', 'lecturas', 'facturas', 'pagos', 'tarifas', 'usuarios'];

// Orden estricto de tablas para respetar dependencias de claves foráneas
export const TABLE_SYNC_ORDER = [
    '__drizzle_migrations',
    'apps',
    'usuarios',
    'historial_passwords',
    'auditoria_seguridad',
    'permissions_catalog',
    'role_permissions',
    'user_permission_overrides',
    'configuracion_servicio',
    'tarifas',
    'rangos_tarifas',
    'historial_tarifas',
    'rutas',
    'clientes',
    'medidores',
    'rutas_puntos',
    'cliente_medidor_historial',
    'lecturas',
    'facturas',
    'pagos',
    'convenios_pago',
    'parcialidades_convenio',
    'cortes_servicio',
    'historial_cambios'
];

const UPSERT_BATCH_SIZE = 100;
const ID_CHUNK_SIZE = 500;
const TRIGGER_PREFIX = '_sync_';

const quoteId = (name) => `"${String(name).replace(/"/g, '""')}"`;
const quoteLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;
const chunks = (list, size) => {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

// ── Estado local (sync_estado) ────────────────────────────────────────────────

export function ensureLocalStateTable(local) {
    local.exec(`CREATE TABLE IF NOT EXISTS ${LOCAL_STATE_TABLE} (clave TEXT PRIMARY KEY, valor TEXT)`);
}

export function getLocalState(local, clave) {
    const row = local.prepare(`SELECT valor FROM ${LOCAL_STATE_TABLE} WHERE clave = ?`).get(clave);
    return row ? row.valor : null;
}

export function setLocalState(local, clave, valor) {
    local.prepare(`
        INSERT INTO ${LOCAL_STATE_TABLE} (clave, valor) VALUES (?, ?)
        ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
    `).run(clave, valor === null || valor === undefined ? null : String(valor));
}

function localTableExists(local, name) {
    return Boolean(local.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

/**
 * Identificador único de esta base de datos local.
 * Si la base fue descargada de la nube (trae la tabla de metadatos remota),
 * hereda el identificador de la copia para continuar la sincronización sin conflicto.
 */
export function getOrCreateInstanciaId(local) {
    ensureLocalStateTable(local);
    let id = getLocalState(local, 'instancia_id');
    if (id) return id;

    if (localTableExists(local, REMOTE_META_TABLE)) {
        const row = local.prepare(`SELECT valor FROM ${REMOTE_META_TABLE} WHERE clave = 'instancia_id'`).get();
        if (row && row.valor) id = row.valor;
    }
    if (!id) id = crypto.randomUUID();

    setLocalState(local, 'instancia_id', id);
    return id;
}

/** Marca de la última migración aplicada en local (versión del esquema). */
export function getLocalSchemaVersion(local) {
    if (!localTableExists(local, '__drizzle_migrations')) return null;
    const row = local.prepare('SELECT MAX(created_at) AS v FROM "__drizzle_migrations"').get();
    return row && row.v !== null && row.v !== undefined ? String(row.v) : null;
}

/**
 * Verifica la integridad física de la base local antes de subirla.
 * @returns {{ ok: boolean, errores: string[], fkViolaciones: number }}
 */
export function checkLocalIntegrity(local) {
    const quick = local.prepare('PRAGMA quick_check').all().map(r => String(Object.values(r)[0]));
    const ok = quick.length === 1 && quick[0] === 'ok';
    const fk = local.prepare('PRAGMA foreign_key_check').all();
    return { ok, errores: ok ? [] : quick.slice(0, 5), fkViolaciones: fk.length };
}

// ── Tablas y conteos ──────────────────────────────────────────────────────────

/** Tablas locales a sincronizar (sin las solo-locales ni las excluidas), ordenadas por dependencias. */
export function getLocalTables(local) {
    const rows = local.prepare(`
        SELECT name, sql FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).all();
    const map = new Map(
        rows.filter(r => !LOCAL_ONLY_TABLES.has(r.name) && !EXCLUDED_TABLES.has(r.name)).map(r => [r.name, r.sql])
    );

    const ordered = TABLE_SYNC_ORDER.filter(t => map.has(t));
    for (const name of [...map.keys()].sort()) {
        if (!ordered.includes(name)) ordered.push(name);
    }
    return ordered.map(name => ({ name, sql: map.get(name) }));
}

function localColumns(local, table) {
    return local.prepare(`PRAGMA table_info(${quoteId(table)})`).all();
}

const hasIdColumn = (local, table) => localColumns(local, table).some(c => c.name === 'id');

async function remoteTableNames(remote) {
    const res = await remote.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`);
    return new Set(res.rows.map(r => r.name));
}

function countLocal(local, table) {
    if (!localTableExists(local, table)) return 0;
    return Number(local.prepare(`SELECT COUNT(*) AS n FROM ${quoteId(table)}`).get().n);
}

async function countRemote(remote, tables, existing) {
    const present = tables.filter(t => existing.has(t));
    const counts = Object.fromEntries(tables.map(t => [t, 0]));
    if (present.length === 0) return counts;
    const results = await remote.batch(
        present.map(t => ({ sql: `SELECT COUNT(*) AS n FROM ${quoteId(t)}` })),
        'read'
    );
    present.forEach((t, i) => { counts[t] = Number(results[i].rows[0].n); });
    return counts;
}

// ── Registro de cambios (sync_cambios + triggers locales) ─────────────────────

const TRACKING_OPS = [
    { suffix: 'ins', event: 'INSERT', body: (t) => `INSERT INTO ${CHANGE_LOG_TABLE} (tabla, registro_id, operacion) VALUES (${t}, NEW.id, 'I');` },
    {
        suffix: 'upd', event: 'UPDATE', body: (t) =>
            `INSERT INTO ${CHANGE_LOG_TABLE} (tabla, registro_id, operacion) VALUES (${t}, NEW.id, 'U');
             INSERT INTO ${CHANGE_LOG_TABLE} (tabla, registro_id, operacion) SELECT ${t}, OLD.id, 'D' WHERE OLD.id IS NOT NEW.id;`
    },
    { suffix: 'del', event: 'DELETE', body: (t) => `INSERT INTO ${CHANGE_LOG_TABLE} (tabla, registro_id, operacion) VALUES (${t}, OLD.id, 'D');` }
];

const trackingTriggerName = (table, suffix) => `${TRIGGER_PREFIX}${table}_${suffix}`;

/**
 * Crea la tabla `sync_cambios` y los triggers AFTER INSERT/UPDATE/DELETE en cada tabla sincronizada.
 * Idempotente. Elimina triggers de tablas que ya no se sincronizan (excluidas o borradas).
 * @returns {{ created: string[] }} nombres de triggers creados en esta llamada
 */
export function ensureChangeTracking(local) {
    ensureLocalStateTable(local);
    local.exec(`CREATE TABLE IF NOT EXISTS ${CHANGE_LOG_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tabla TEXT NOT NULL,
        registro_id INTEGER NOT NULL,
        operacion TEXT NOT NULL
    )`);

    const existing = new Map(
        local.prepare(`SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '${TRIGGER_PREFIX}%'`)
            .all().map(r => [r.name, r.tbl_name])
    );
    const tables = getLocalTables(local).map(t => t.name).filter(t => hasIdColumn(local, t));
    const wanted = new Set();
    const created = [];

    for (const table of tables) {
        for (const op of TRACKING_OPS) {
            const name = trackingTriggerName(table, op.suffix);
            wanted.add(name);
            if (existing.has(name)) continue;
            local.exec(`CREATE TRIGGER IF NOT EXISTS ${quoteId(name)} AFTER ${op.event} ON ${quoteId(table)}
                FOR EACH ROW BEGIN ${op.body(quoteLiteral(table))} END;`);
            created.push(name);
        }
    }

    for (const name of existing.keys()) {
        if (!wanted.has(name)) local.exec(`DROP TRIGGER IF EXISTS ${quoteId(name)}`);
    }

    return { created };
}

/** Quita los triggers de registro y vacía `sync_cambios` (al desvincular la nube). */
export function disableChangeTracking(local) {
    const triggers = local.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '${TRIGGER_PREFIX}%'`).all();
    for (const t of triggers) local.exec(`DROP TRIGGER IF EXISTS ${quoteId(t.name)}`);
    if (localTableExists(local, CHANGE_LOG_TABLE)) local.exec(`DELETE FROM ${CHANGE_LOG_TABLE}`);
}

export function getChangeCursor(local) {
    return Number(getLocalState(local, 'cambios_cursor') || 0);
}

function maxChangeId(local) {
    if (!localTableExists(local, CHANGE_LOG_TABLE)) return 0;
    return Number(local.prepare(`SELECT MAX(id) AS m FROM ${CHANGE_LOG_TABLE}`).get().m || 0);
}

/**
 * Cambios registrados después del cursor.
 * @returns {{ maxId: number, total: number, porTabla: Map<string, Array<number>> }}
 */
export function readPendingChanges(local, cursor = getChangeCursor(local)) {
    const maxId = maxChangeId(local);
    const porTabla = new Map();
    if (maxId <= cursor) return { maxId, total: 0, porTabla };

    const rows = local.prepare(`
        SELECT DISTINCT tabla, registro_id FROM ${CHANGE_LOG_TABLE} WHERE id > ? AND id <= ?
    `).all(cursor, maxId);
    for (const r of rows) {
        if (!porTabla.has(r.tabla)) porTabla.set(r.tabla, []);
        porTabla.get(r.tabla).push(r.registro_id);
    }
    return { maxId, total: rows.length, porTabla };
}

/** Marca como subidos los cambios hasta `maxId` y los elimina del registro. */
export function commitChanges(local, maxId) {
    setLocalState(local, 'cambios_cursor', maxId);
    if (localTableExists(local, CHANGE_LOG_TABLE)) {
        local.prepare(`DELETE FROM ${CHANGE_LOG_TABLE} WHERE id <= ?`).run(maxId);
    }
}

/**
 * Sube el ESTADO ACTUAL de los registros modificados: si existe en local se inserta/reemplaza
 * en la nube; si ya no existe, se borra en la nube. Padres antes que hijos al subir, hijos antes
 * que padres al borrar.
 */
export async function pushChanges(local, remote, porTabla) {
    const tables = getLocalTables(local).map(t => t.name).filter(t => porTabla.has(t));
    const deletesByTable = new Map();
    let upserted = 0;
    let deleted = 0;

    for (const table of tables) {
        const ids = porTabla.get(table);
        const found = new Set();
        for (const chunk of chunks(ids, ID_CHUNK_SIZE)) {
            const rows = local.prepare(
                `SELECT * FROM ${quoteId(table)} WHERE id IN (${chunk.map(() => '?').join(', ')})`
            ).all(...chunk);
            rows.forEach(r => found.add(String(r.id)));
            upserted += await upsertBatch(remote, table, rows);
        }
        const missing = ids.filter(id => !found.has(String(id)));
        if (missing.length) deletesByTable.set(table, missing);
    }

    for (const table of [...tables].reverse()) {
        const ids = deletesByTable.get(table);
        if (!ids) continue;
        for (const chunk of chunks(ids, ID_CHUNK_SIZE)) {
            await remote.execute({
                sql: `DELETE FROM ${quoteId(table)} WHERE id IN (${chunk.map(() => '?').join(', ')})`,
                args: chunk
            });
        }
        deleted += ids.length;
    }

    return { upserted, deleted, tablas: tables };
}

// ── Metadatos remotos (_aguavp_sync_meta) ─────────────────────────────────────

export async function readRemoteMeta(remote) {
    const names = await remoteTableNames(remote);
    if (!names.has(REMOTE_META_TABLE)) return {};
    const res = await remote.execute(`SELECT clave, valor FROM ${REMOTE_META_TABLE}`);
    return Object.fromEntries(res.rows.map(r => [r.clave, r.valor]));
}

export async function writeRemoteMeta(remote, values) {
    const statements = [
        { sql: `CREATE TABLE IF NOT EXISTS ${REMOTE_META_TABLE} (clave TEXT PRIMARY KEY, valor TEXT)` },
        ...Object.entries(values).map(([clave, valor]) => ({
            sql: `INSERT INTO ${REMOTE_META_TABLE} (clave, valor) VALUES (?, ?)
                  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
            args: [clave, valor === null || valor === undefined ? null : String(valor)]
        }))
    ];
    await remote.batch(statements, 'write');
}

/** Metadatos a guardar en la nube tras una sincronización correcta. */
export function buildRemoteMeta(local, instanciaId, lastSync) {
    const conteos = Object.fromEntries(GUARD_TABLES.map(t => [t, countLocal(local, t)]));
    return {
        instancia_id: instanciaId,
        last_sync: lastSync,
        ultima_migracion: getLocalSchemaVersion(local),
        conteos: JSON.stringify(conteos)
    };
}

// ── Guarda anti-sobrescritura ─────────────────────────────────────────────────

/**
 * Determina si es seguro reemplazar el contenido de la nube con la base local.
 * @returns {Promise<{ seguro: boolean, motivos: Array, comparacion: Array, remoteMeta: Object }>}
 */
export async function checkSeedSafety(local, remote, instanciaId) {
    const remoteMeta = await readRemoteMeta(remote);
    const existing = await remoteTableNames(remote);
    const motivos = [];

    if (remoteMeta.instancia_id && remoteMeta.instancia_id !== instanciaId) {
        motivos.push({
            tipo: 'instancia',
            mensaje: 'La copia en la nube pertenece a otra base de datos (otra instalación o una base nueva).'
        });
    }

    const remoteCounts = await countRemote(remote, GUARD_TABLES, existing);
    const comparacion = GUARD_TABLES.map(tabla => ({
        tabla,
        local: countLocal(local, tabla),
        nube: remoteCounts[tabla]
    }));

    const menores = comparacion.filter(c => c.nube > c.local);
    if (menores.length > 0) {
        motivos.push({
            tipo: 'conteo',
            mensaje: 'La nube tiene más registros que la base local en: ' +
                menores.map(c => `${c.tabla} (local ${c.local}, nube ${c.nube})`).join(', ') +
                '. La base local podría estar vacía, dañada o ser un respaldo antiguo.'
        });
    }

    return { seguro: motivos.length === 0, motivos, comparacion, remoteMeta };
}

// ── Esquema remoto ────────────────────────────────────────────────────────────

const ifNotExists = (sql, kind) =>
    sql.replace(new RegExp(`CREATE\\s+(UNIQUE\\s+)?${kind}\\s+(?!IF\\s+NOT\\s+EXISTS)`, 'i'),
        (_m, unique) => `CREATE ${unique || ''}${kind} IF NOT EXISTS `);

/**
 * Crea en la nube las tablas que falten y agrega las columnas nuevas de la base local.
 * Índices y vistas se crean en modo best-effort (no afectan la integridad de los datos).
 * @returns {Promise<{ tablasCreadas: string[], columnasAgregadas: string[], avisos: string[] }>}
 */
export async function reconcileRemoteSchema(local, remote, tables) {
    const existing = await remoteTableNames(remote);
    const tablasCreadas = [];
    const columnasAgregadas = [];
    const avisos = [];

    for (const { name, sql } of tables) {
        if (!existing.has(name)) {
            await remote.execute(ifNotExists(sql, 'TABLE'));
            tablasCreadas.push(name);
            continue;
        }

        const remoteCols = new Set(
            (await remote.execute(`PRAGMA table_info(${quoteId(name)})`)).rows.map(r => r.name)
        );
        for (const col of localColumns(local, name)) {
            if (remoteCols.has(col.name)) continue;
            // Solo nombre y tipo: ADD COLUMN no admite NOT NULL sin DEFAULT ni ciertas restricciones.
            // La nube es una copia; las reglas se validan en la base local.
            const type = col.type ? ` ${col.type}` : '';
            await remote.execute(`ALTER TABLE ${quoteId(name)} ADD COLUMN ${quoteId(col.name)}${type}`);
            columnasAgregadas.push(`${name}.${col.name}`);
        }
    }

    const extras = local.prepare(`
        SELECT type, name, sql FROM sqlite_master
        WHERE type IN ('index', 'view') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    `).all();
    for (const obj of extras) {
        try {
            await remote.execute(ifNotExists(obj.sql, obj.type === 'index' ? 'INDEX' : 'VIEW'));
        } catch (err) {
            avisos.push(`${obj.type} ${obj.name}: ${err.message}`);
        }
    }

    return { tablasCreadas, columnasAgregadas, avisos };
}

/**
 * Elimina los triggers de la nube: allí solo se guardan datos ya calculados por la base local.
 */
export async function dropAllRemoteTriggers(remote) {
    const res = await remote.execute(`SELECT name FROM sqlite_master WHERE type = 'trigger'`);
    for (const row of res.rows) {
        if (row.name) await remote.execute(`DROP TRIGGER IF EXISTS ${quoteId(row.name)}`);
    }
}

/** Vacía en la nube las tablas excluidas (tokens/sesiones) que versiones anteriores subieron. */
async function purgeExcludedRemoteTables(remote) {
    const existing = await remoteTableNames(remote);
    for (const table of EXCLUDED_TABLES) {
        if (existing.has(table)) await remote.execute(`DELETE FROM ${quoteId(table)}`);
    }
}

// ── Copia de datos ────────────────────────────────────────────────────────────

/** Inserta o reemplaza filas en lotes (cada lote es atómico). */
export async function upsertBatch(remote, tableName, rows) {
    if (!rows || rows.length === 0) return 0;
    const columns = Object.keys(rows[0]);
    const insertSql = `INSERT OR REPLACE INTO ${quoteId(tableName)} (${columns.map(quoteId).join(', ')}) ` +
        `VALUES (${columns.map(() => '?').join(', ')})`;

    for (const chunk of chunks(rows, UPSERT_BATCH_SIZE)) {
        await remote.batch(chunk.map(row => ({
            sql: insertSql,
            args: columns.map(c => {
                const val = row[c];
                if (typeof val === 'boolean') return val ? 1 : 0;
                if (val === undefined) return null;
                return val;
            })
        })), 'write');
    }
    return rows.length;
}

/**
 * Borra en la nube las filas cuyo id ya no existe en la base local.
 * Se ejecuta DESPUÉS de copiar, nunca antes.
 */
export async function pruneRemoteRows(local, remote, tableName) {
    if (!hasIdColumn(local, tableName)) return 0;

    const localIds = new Set(
        local.prepare(`SELECT id FROM ${quoteId(tableName)}`).all().map(r => String(r.id))
    );
    const remoteIds = (await remote.execute(`SELECT id FROM ${quoteId(tableName)}`)).rows.map(r => r.id);
    const toDelete = remoteIds.filter(id => !localIds.has(String(id)));

    for (const chunk of chunks(toDelete, ID_CHUNK_SIZE)) {
        await remote.execute({
            sql: `DELETE FROM ${quoteId(tableName)} WHERE id IN (${chunk.map(() => '?').join(', ')})`,
            args: chunk
        });
    }
    return toDelete.length;
}

// ── Verificación y reparación ─────────────────────────────────────────────────

/**
 * Compara COUNT(*) y MAX(id) de cada tabla en local y en la nube (una sola petición).
 * @returns {Promise<{ ok: boolean, diferencias: Array<{ tabla, local, nube }> }>}
 */
export async function verifyRemote(local, remote, tableNames) {
    const existing = await remoteTableNames(remote);
    const tables = tableNames.filter(t => localTableExists(local, t) && hasIdColumn(local, t));
    const present = tables.filter(t => existing.has(t));

    const remoteStats = new Map();
    if (present.length) {
        const results = await remote.batch(
            present.map(t => ({ sql: `SELECT COUNT(*) AS n, MAX(id) AS m FROM ${quoteId(t)}` })),
            'read'
        );
        present.forEach((t, i) => {
            const r = results[i].rows[0];
            remoteStats.set(t, { n: Number(r.n), m: r.m === null ? null : Number(r.m) });
        });
    }

    const diferencias = [];
    for (const t of tables) {
        const l = local.prepare(`SELECT COUNT(*) AS n, MAX(id) AS m FROM ${quoteId(t)}`).get();
        const loc = { n: Number(l.n), m: l.m === null || l.m === undefined ? null : Number(l.m) };
        const nub = remoteStats.get(t) || { n: 0, m: null };
        if (loc.n !== nub.n || loc.m !== nub.m) diferencias.push({ tabla: t, local: loc, nube: nub });
    }
    return { ok: diferencias.length === 0, diferencias };
}

/**
 * Re-sube completas las tablas con diferencias y borra en la nube los ids que ya no existen en local,
 * EXCEPTO en tablas protegidas donde la nube tiene más registros (se conservan y se reporta).
 * @returns {Promise<{ reparadas: string[], conservadas: Array<{ tabla, local, nube }> }>}
 */
export async function repairTables(local, remote, diferencias) {
    const order = getLocalTables(local).map(t => t.name);
    const byTable = new Map(diferencias.map(d => [d.tabla, d]));
    const targets = order.filter(t => byTable.has(t));
    const reparadas = [];
    const conservadas = [];

    for (const t of targets) {
        const rows = local.prepare(`SELECT * FROM ${quoteId(t)}`).all();
        await upsertBatch(remote, t, rows);
    }
    for (const t of [...targets].reverse()) {
        const d = byTable.get(t);
        if (GUARD_TABLES.includes(t) && d.nube.n > d.local.n) {
            conservadas.push({ tabla: t, local: d.local.n, nube: d.nube.n });
            continue;
        }
        await pruneRemoteRows(local, remote, t);
        reparadas.push(t);
    }
    return { reparadas, conservadas };
}

// ── Orquestación ──────────────────────────────────────────────────────────────

/**
 * Carga completa protegida: copia toda la base local a la nube sin vaciarla antes.
 *
 * @param {Object} opts
 * @param {string}  opts.instanciaId - id de la base local (getOrCreateInstanciaId)
 * @param {boolean} [opts.force]     - omite la guarda anti-sobrescritura (confirmación explícita del admin).
 *                                     Nunca omite la verificación de integridad.
 * @param {string}  opts.timestamp   - marca de inicio (se guarda como last_sync)
 * @param {Function} [opts.log]
 * @returns {Promise<Object>} { success, conflict?, motivos?, comparacion?, totalRows, pruned, tablesCopied, schema, verificacion }
 */
export async function seedRemote(local, remote, { instanciaId, force = false, timestamp, log = () => {} }) {
    const integridad = checkLocalIntegrity(local);
    if (!integridad.ok) {
        throw new Error(`La base local no pasó la verificación de integridad (${integridad.errores.join('; ')}). ` +
            'No se sube a la nube para no propagar daños.');
    }
    if (integridad.fkViolaciones > 0) {
        log(`Aviso: ${integridad.fkViolaciones} referencia(s) huérfanas en la base local (foreign_key_check)`);
    }

    const safety = await checkSeedSafety(local, remote, instanciaId);
    if (!safety.seguro && !force) {
        return {
            success: false,
            conflict: true,
            motivos: safety.motivos,
            comparacion: safety.comparacion
        };
    }
    if (!safety.seguro && force) {
        log(`Reemplazo forzado de la nube: ${safety.motivos.map(m => m.tipo).join(', ')}`);
    }

    // El registro de cambios se activa ANTES de leer los datos: lo que cambie durante la copia
    // queda pendiente para el siguiente incremental (re-subir un registro es idempotente).
    ensureChangeTracking(local);
    const cursorInicio = maxChangeId(local);

    const tables = getLocalTables(local);
    const schema = await reconcileRemoteSchema(local, remote, tables);
    if (schema.columnasAgregadas.length) log(`Columnas agregadas en la nube: ${schema.columnasAgregadas.join(', ')}`);

    await dropAllRemoteTriggers(remote);
    await purgeExcludedRemoteTables(remote);

    let totalRows = 0;
    const tablesCopied = [];
    for (const { name } of tables) {
        const rows = local.prepare(`SELECT * FROM ${quoteId(name)}`).all();
        if (rows.length === 0) continue;
        await upsertBatch(remote, name, rows);
        totalRows += rows.length;
        tablesCopied.push({ table: name, count: rows.length });
    }

    // Borrar lo que ya no existe en local, de hijos a padres
    let pruned = 0;
    for (const { name } of [...tables].reverse()) {
        pruned += await pruneRemoteRows(local, remote, name);
    }

    await writeRemoteMeta(remote, buildRemoteMeta(local, instanciaId, timestamp));
    commitChanges(local, cursorInicio);

    const verificacion = await verifyRemote(local, remote, tables.map(t => t.name));

    return {
        success: true, totalRows, pruned, tablesCopied, schema, timestamp,
        verificacion, fkViolaciones: integridad.fkViolaciones
    };
}

/**
 * Sincronización incremental basada en `sync_cambios`.
 *
 * @param {Object} opts
 * @param {string}  opts.instanciaId
 * @param {string}  opts.timestamp
 * @param {boolean} [opts.verifyAll=false] - verificar todas las tablas (verificación periódica)
 * @param {Function} [opts.log]
 * @returns {Promise<Object>}
 *   { needsSeed: true, reason }                         → la nube no corresponde / faltan triggers: carga completa
 *   { success: true, syncedCount: 0, reason: 'no_local_changes' } → sin llamadas de red
 *   { success: true, syncedCount, upserted, deleted, verificacion }
 */
export async function incrementalRemote(local, remote, { instanciaId, timestamp, verifyAll = false, log = () => {} }) {
    const tracking = ensureChangeTracking(local);
    if (tracking.created.length > 0) {
        // Tablas sin registro de cambios hasta ahora (primera vez o tabla nueva): sus cambios previos
        // no están registrados, se requiere una carga completa.
        return { needsSeed: true, reason: 'tracking_installed' };
    }

    const pending = readPendingChanges(local);
    if (pending.total === 0 && !verifyAll) {
        return { success: true, syncedCount: 0, reason: 'no_local_changes', timestamp };
    }

    const remoteMeta = await readRemoteMeta(remote);
    if (remoteMeta.instancia_id !== instanciaId) {
        return { needsSeed: true, reason: 'remote_identity' };
    }

    const tables = getLocalTables(local);
    if (remoteMeta.ultima_migracion !== getLocalSchemaVersion(local)) {
        const schema = await reconcileRemoteSchema(local, remote, tables);
        if (schema.columnasAgregadas.length) log(`Columnas agregadas en la nube: ${schema.columnasAgregadas.join(', ')}`);
    }

    let push = { upserted: 0, deleted: 0, tablas: [] };
    if (pending.total > 0) {
        await dropAllRemoteTriggers(remote);
        push = await pushChanges(local, remote, pending.porTabla);
        commitChanges(local, pending.maxId);
    }

    // Verificación: tablas tocadas en este ciclo, o todas si toca la verificación periódica
    const toVerify = verifyAll ? tables.map(t => t.name) : push.tablas;
    let verificacion = { ok: true, diferencias: [], reparadas: [], conservadas: [] };
    if (toVerify.length) {
        const v = await verifyRemote(local, remote, toVerify);
        verificacion = { ...verificacion, ...v };
        if (!v.ok) {
            // No reparar tablas con cambios nuevos registrados durante este ciclo: el próximo ciclo los sube
            const recientes = readPendingChanges(local).porTabla;
            const aReparar = v.diferencias.filter(d => !recientes.has(d.tabla));
            if (aReparar.length) {
                const rep = await repairTables(local, remote, aReparar);
                log(`Reparación de la copia: ${rep.reparadas.join(', ') || 'ninguna'}` +
                    (rep.conservadas.length ? `; conservadas en la nube: ${rep.conservadas.map(c => c.tabla).join(', ')}` : ''));
                const again = await verifyRemote(local, remote, toVerify);
                verificacion = { ...again, reparadas: rep.reparadas, conservadas: rep.conservadas };
            }
        }
    }

    await writeRemoteMeta(remote, buildRemoteMeta(local, instanciaId, timestamp));

    return {
        success: true,
        syncedCount: push.upserted + push.deleted,
        upserted: push.upserted,
        deleted: push.deleted,
        verificacion,
        timestamp
    };
}
