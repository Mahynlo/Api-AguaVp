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
export async function pushChanges(local, remote, porTabla, stats = { conflictosResueltos: 0 }) {
    const tables = getLocalTables(local).map(t => t.name).filter(t => porTabla.has(t));
    const deletesByTable = new Map();
    const uploader = createUploader(local, remote, { stats });
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
            upserted += await uploader.upsert(table, rows);
        }
        const missing = ids.filter(id => !found.has(String(id)));
        if (missing.length) deletesByTable.set(table, missing);
    }
    await uploader.finish();

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

    return { upserted, deleted, tablas: tables, conflictosResueltos: stats.conflictosResueltos };
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

/**
 * Metadatos a guardar en la nube tras una sincronización correcta.
 * `equipo_id` identifica la computadora que escribe (no viaja dentro de la base): si otra computadora con
 * la misma base empieza a escribir en la misma copia, se detecta (ver checkSeedSafety / incrementalRemote).
 */
export function buildRemoteMeta(local, instanciaId, lastSync, equipoId = null) {
    const conteos = Object.fromEntries(GUARD_TABLES.map(t => [t, countLocal(local, t)]));
    const meta = {
        instancia_id: instanciaId,
        last_sync: lastSync,
        ultima_migracion: getLocalSchemaVersion(local),
        conteos: JSON.stringify(conteos)
    };
    if (equipoId) meta.equipo_id = equipoId;
    return meta;
}

// ── Guarda anti-sobrescritura ─────────────────────────────────────────────────

/**
 * Determina si es seguro reemplazar el contenido de la nube con la base local.
 * @returns {Promise<{ seguro: boolean, motivos: Array, comparacion: Array, remoteMeta: Object }>}
 */
export async function checkSeedSafety(local, remote, instanciaId, { equipoId = null, tomarControl = false } = {}) {
    const remoteMeta = await readRemoteMeta(remote);
    const existing = await remoteTableNames(remote);
    const motivos = [];

    if (remoteMeta.instancia_id && remoteMeta.instancia_id !== instanciaId) {
        motivos.push({
            tipo: 'instancia',
            mensaje: 'La copia en la nube pertenece a otra base de datos (otra instalación o una base nueva).'
        });
    } else if (remoteMeta.equipo_id && equipoId && remoteMeta.equipo_id !== equipoId && !tomarControl) {
        motivos.push({
            tipo: 'equipo',
            mensaje: `Otra computadora escribió en esta copia de la nube (última sincronización: ${remoteMeta.last_sync || 'desconocida'}). ` +
                'Si esa computadora sigue en uso, no continúes: las dos mezclarían sus datos en la nube. ' +
                'Si esta computadora la reemplaza, confirma para que esta pase a ser la que respalda.'
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

    const columnasSoloNube = await remoteExtraColumns(local, remote, getLocalTables(local).map(t => t.name), existing);
    if (columnasSoloNube.length > 0) {
        motivos.push({
            tipo: 'columnas',
            mensaje: 'La nube tiene columnas con datos que esta base no tiene: ' + columnasSoloNube.join(', ') +
                '. Subir esta base las vaciaría en la nube; restaura desde la nube para conservarlas.'
        });
    }

    const seguro = motivos.length === 0;
    // Si hay conflicto, calcular exactamente qué se eliminaría de la nube con un reemplazo forzado
    const eliminaria = seguro ? [] : await remoteRowsMissingLocally(local, remote, getLocalTables(local).map(t => t.name), existing);

    return { seguro, motivos, comparacion, remoteMeta, columnasSoloNube, eliminaria };
}

/**
 * Registros que existen en la nube y no en la base local (los que un reemplazo forzado eliminaría).
 * @returns {Promise<Array<{ tabla, total, ids: number[] }>>} ids: hasta 20 por tabla
 */
export async function remoteRowsMissingLocally(local, remote, tableNames, existing = null) {
    const names = existing || await remoteTableNames(remote);
    const out = [];
    for (const t of tableNames) {
        if (!names.has(t) || !hasIdColumn(local, t)) continue;
        const localIds = new Set(local.prepare(`SELECT id FROM ${quoteId(t)}`).all().map(r => String(r.id)));
        const faltan = (await remote.execute(`SELECT id FROM ${quoteId(t)} ORDER BY id`)).rows
            .map(r => r.id).filter(id => !localIds.has(String(id)));
        if (faltan.length) out.push({ tabla: t, total: faltan.length, ids: faltan.slice(0, 20).map(Number) });
    }
    return out;
}

/**
 * Columnas que existen en la nube pero no en la base local (tablas sincronizadas presentes en ambos lados).
 * Un INSERT OR REPLACE desde esta base las dejaría en NULL en la nube.
 * @returns {Promise<string[]>} "tabla.columna"
 */
export async function remoteExtraColumns(local, remote, tableNames, existing = null) {
    const names = existing || await remoteTableNames(remote);
    const present = tableNames.filter(t => names.has(t));
    if (present.length === 0) return [];
    const results = await remote.batch(present.map(t => ({ sql: `PRAGMA table_info(${quoteId(t)})` })), 'read');
    const extras = [];
    present.forEach((t, i) => {
        const localCols = new Set(localColumns(local, t).map(c => c.name));
        for (const r of results[i].rows) {
            if (!localCols.has(r.name)) extras.push(`${t}.${r.name}`);
        }
    });
    return extras;
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

const isUniqueError = (err) => /UNIQUE constraint failed/i.test(String(err?.message || err));

/** Índices UNIQUE (no la llave primaria) de una tabla local: [['col1','col2'], ...] */
function uniqueKeys(local, table) {
    return local.prepare(`PRAGMA index_list(${quoteId(table)})`).all()
        .filter(i => i.unique && i.origin !== 'pk' && !i.partial)
        .map(i => local.prepare(`PRAGMA index_info(${quoteId(i.name)})`).all().map(c => c.name))
        .filter(cols => cols.length && cols.every(Boolean));
}

/**
 * Inserta o actualiza filas en la nube EN SU LUGAR (`INSERT … ON CONFLICT(id) DO UPDATE`), en lotes atómicos.
 *
 * No se usa `INSERT OR REPLACE`: para SQLite eso es borrar + insertar, y Turso aplica las acciones de las
 * llaves foráneas (ON DELETE CASCADE / SET NULL) a ese borrado — p. ej. subir una tarifa borraba sus rangos
 * en la nube y subir un usuario vaciaba `user_permission_overrides.updated_by`.
 *
 * Si un lote choca con otro índice UNIQUE (p. ej. intercambio de `orden` en una ruta), se reintenta fila por
 * fila y se eliminan en la nube solo las filas OBSOLETAS que ocupan esa clave única con otro id (en local esa
 * clave pertenece a la fila que se sube). Esos casos se cuentan en `stats.conflictosResueltos`.
 *
 * @param {Object} [opts]
 * @param {Object} [opts.local] - base local (para conocer los índices UNIQUE al resolver choques)
 * @param {{ conflictosResueltos: number }} [opts.stats]
 */
export async function upsertBatch(remote, tableName, rows, { local = null, stats = null, defer = [] } = {}) {
    if (!rows || rows.length === 0) return 0;
    const columns = Object.keys(rows[0]);
    const table = quoteId(tableName);
    // Columnas diferidas (ver deferredFkColumns): NULL en filas nuevas y sin tocar en las existentes;
    // su valor se escribe en el segundo paso (applyDeferredColumns).
    const deferred = new Set(columns.includes('id') ? defer : []);
    const insertCols = `(${columns.map(quoteId).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    const updates = columns.filter(c => c !== 'id' && !deferred.has(c)).map(c => `${quoteId(c)} = excluded.${quoteId(c)}`);
    const sql = !columns.includes('id')
        ? `INSERT OR REPLACE INTO ${table} ${insertCols}`
        : `INSERT INTO ${table} ${insertCols} ON CONFLICT(id) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`;
    const argsOf = (row) => columns.map(c => {
        if (deferred.has(c)) return null;
        const val = row[c];
        if (typeof val === 'boolean') return val ? 1 : 0;
        if (val === undefined) return null;
        return val;
    });

    for (const chunk of chunks(rows, UPSERT_BATCH_SIZE)) {
        try {
            await remote.batch(chunk.map(row => ({ sql, args: argsOf(row) })), 'write');
        } catch (err) {
            if (!isUniqueError(err) || !local || !columns.includes('id')) throw err;
            const keys = uniqueKeys(local, tableName);
            for (const row of chunk) {
                try {
                    await remote.execute({ sql, args: argsOf(row) });
                } catch (rowErr) {
                    if (!isUniqueError(rowErr)) throw rowErr;
                    for (const key of keys) {
                        if (key.some(c => row[c] === null || row[c] === undefined)) continue;
                        const res = await remote.execute({
                            sql: `DELETE FROM ${table} WHERE ${key.map(c => `${quoteId(c)} = ?`).join(' AND ')} AND id <> ?`,
                            args: [...key.map(c => row[c]), row.id]
                        });
                        if (stats && res.rowsAffected) stats.conflictosResueltos += res.rowsAffected;
                    }
                    await remote.execute({ sql, args: argsOf(row) });
                }
            }
        }
    }
    return rows.length;
}

/**
 * Columnas con llave foránea que se suben en un segundo paso: las que apuntan a la MISMA tabla
 * (p. ej. `usuarios.eliminado_por` hacia un usuario con id mayor) o a una tabla que se sube DESPUÉS
 * (`facturas.convenio_id` → `convenios_pago`, `pagos.parcialidad_id` → `parcialidades_convenio`).
 * Turso valida cada fila al insertarla: con la nube vacía, o con el registro referido creado en el
 * mismo ciclo, la fila referida todavía no existe. Solo columnas que admiten NULL.
 * @param {string[]} order - tablas en el orden de subida
 * @returns {Map<string, string[]>} tabla → columnas diferidas
 */
export function deferredFkColumns(local, order) {
    const pos = new Map(order.map((t, i) => [t, i]));
    const out = new Map();
    for (const table of order) {
        const nullable = new Set(localColumns(local, table).filter(c => !c.notnull && !c.pk).map(c => c.name));
        const cols = new Set();
        for (const fk of local.prepare(`PRAGMA foreign_key_list(${quoteId(table)})`).all()) {
            const p = pos.get(fk.table);
            if (p !== undefined && p >= pos.get(table) && nullable.has(fk.from)) cols.add(fk.from);
        }
        if (cols.size) out.set(table, [...cols]);
    }
    return out;
}

/** Segundo paso: escribe en la nube el valor local de las columnas diferidas de `rows`. */
async function applyDeferredColumns(remote, tableName, rows, cols) {
    const table = quoteId(tableName);
    const tieneValor = (r) => cols.some(c => r[c] !== null && r[c] !== undefined);
    const conValor = rows.filter(tieneValor);
    const sinValor = rows.filter(r => !tieneValor(r)).map(r => r.id);

    const sql = `UPDATE ${table} SET ${cols.map(c => `${quoteId(c)} = ?`).join(', ')} WHERE id = ?`;
    for (const chunk of chunks(conValor, UPSERT_BATCH_SIZE)) {
        await remote.batch(chunk.map(r => ({ sql, args: [...cols.map(c => r[c] ?? null), r.id] })), 'write');
    }
    // Filas que en local no tienen referencia: vaciar solo las que en la nube todavía la tengan
    for (const chunk of chunks(sinValor, ID_CHUNK_SIZE)) {
        await remote.execute({
            sql: `UPDATE ${table} SET ${cols.map(c => `${quoteId(c)} = NULL`).join(', ')} ` +
                `WHERE id IN (${chunk.map(() => '?').join(', ')}) AND (${cols.map(c => `${quoteId(c)} IS NOT NULL`).join(' OR ')})`,
            args: chunk
        });
    }
}

/**
 * Sube filas de varias tablas, en orden de dependencias, en dos pasos: `upsert()` por tabla con las
 * referencias diferidas pendientes y `finish()` para escribirlas cuando todas las filas ya existen en la nube.
 * Llamar a `finish()` ANTES de borrar filas en la nube.
 */
function createUploader(local, remote, { stats = null } = {}) {
    const deferred = deferredFkColumns(local, getLocalTables(local).map(t => t.name));
    const pending = [];
    return {
        async upsert(table, rows) {
            const cols = deferred.get(table) || [];
            const n = await upsertBatch(remote, table, rows, { local, stats, defer: cols });
            if (cols.length && rows.length && 'id' in rows[0]) {
                pending.push({ table, cols, rows: rows.map(r => Object.fromEntries(['id', ...cols].map(c => [c, r[c]]))) });
            }
            return n;
        },
        async finish() {
            for (const p of pending.splice(0)) await applyDeferredColumns(remote, p.table, p.rows, p.cols);
        }
    };
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

    const uploader = createUploader(local, remote);
    for (const t of targets) {
        const rows = local.prepare(`SELECT * FROM ${quoteId(t)}`).all();
        await uploader.upsert(t, rows);
    }
    await uploader.finish();
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

// ── Verificación por contenido ────────────────────────────────────────────────

const CONTENT_PAGE_SIZE = 1000;

/** Valor normalizado para comparar local (better-sqlite3/node:sqlite) y nube (libsql). */
const normalizeValue = (v) => {
    if (v === null || v === undefined) return null;
    if (v instanceof ArrayBuffer) return `hex:${Buffer.from(v).toString('hex')}`;
    if (ArrayBuffer.isView(v)) return `hex:${Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('hex')}`;
    if (typeof v === 'bigint') return Number(v);
    return v;
};
const rowHash = (row, cols) =>
    crypto.createHash('sha1').update(JSON.stringify(cols.map(c => normalizeValue(row[c])))).digest('base64');

/**
 * Compara el CONTENIDO de cada tabla, fila por fila (hash de las columnas comunes), entre local y nube.
 * Detecta lo que COUNT/MAX(id) no ve: campos cambiados o vaciados. Descarga las filas de la nube por páginas.
 * @returns {Promise<{ ok: boolean, diferencias: Array<{ tabla, distintas: number[], soloLocal: number[], soloNube: number[] }>, filas: number }>}
 */
export async function verifyContent(local, remote, tableNames) {
    const existing = await remoteTableNames(remote);
    const diferencias = [];
    let filas = 0;

    for (const t of tableNames) {
        if (!localTableExists(local, t) || !hasIdColumn(local, t)) continue;
        if (!existing.has(t)) {
            const ids = local.prepare(`SELECT id FROM ${quoteId(t)}`).all().map(r => Number(r.id));
            if (ids.length) diferencias.push({ tabla: t, distintas: [], soloLocal: ids, soloNube: [] });
            continue;
        }
        const remoteCols = new Set((await remote.execute(`PRAGMA table_info(${quoteId(t)})`)).rows.map(r => r.name));
        const cols = localColumns(local, t).map(c => c.name).filter(c => remoteCols.has(c));
        const select = cols.map(quoteId).join(', ');

        const locales = new Map(
            local.prepare(`SELECT ${select} FROM ${quoteId(t)}`).all().map(r => [String(r.id), rowHash(r, cols)])
        );
        const distintas = [];
        const soloNube = [];
        const vistos = new Set();
        let lastId = null;
        for (;;) {
            const page = await remote.execute({
                sql: `SELECT ${select} FROM ${quoteId(t)}` + (lastId === null ? '' : ' WHERE id > ?') +
                    ` ORDER BY id LIMIT ${CONTENT_PAGE_SIZE}`,
                args: lastId === null ? [] : [lastId]
            });
            for (const r of page.rows) {
                const key = String(r.id);
                vistos.add(key);
                const h = locales.get(key);
                if (h === undefined) soloNube.push(Number(r.id));
                else if (h !== rowHash(r, cols)) distintas.push(Number(r.id));
            }
            filas += page.rows.length;
            if (page.rows.length < CONTENT_PAGE_SIZE) break;
            lastId = page.rows[page.rows.length - 1].id;
        }
        const soloLocal = [...locales.keys()].filter(k => !vistos.has(k)).map(Number);
        if (distintas.length || soloNube.length || soloLocal.length) {
            diferencias.push({ tabla: t, distintas, soloLocal, soloNube });
        }
    }
    return { ok: diferencias.length === 0, diferencias, filas };
}

/**
 * Corrige en la nube las diferencias de contenido: re-sube las filas distintas o faltantes y borra las que
 * solo existen en la nube, EXCEPTO en tablas protegidas (se conservan y se reportan).
 */
export async function repairContent(local, remote, diferencias) {
    const order = getLocalTables(local).map(t => t.name);
    const byTable = new Map(diferencias.map(d => [d.tabla, d]));
    const targets = order.filter(t => byTable.has(t));
    const reparadas = [];
    const conservadas = [];

    const uploader = createUploader(local, remote);
    for (const t of targets) {
        const ids = [...byTable.get(t).distintas, ...byTable.get(t).soloLocal];
        for (const chunk of chunks(ids, ID_CHUNK_SIZE)) {
            const rows = local.prepare(
                `SELECT * FROM ${quoteId(t)} WHERE id IN (${chunk.map(() => '?').join(', ')})`
            ).all(...chunk);
            await uploader.upsert(t, rows);
        }
    }
    await uploader.finish();
    for (const t of [...targets].reverse()) {
        const { soloNube } = byTable.get(t);
        if (soloNube.length && GUARD_TABLES.includes(t)) {
            conservadas.push({ tabla: t, ids: soloNube.slice(0, 20), total: soloNube.length });
        } else {
            for (const chunk of chunks(soloNube, ID_CHUNK_SIZE)) {
                await remote.execute({
                    sql: `DELETE FROM ${quoteId(t)} WHERE id IN (${chunk.map(() => '?').join(', ')})`,
                    args: chunk
                });
            }
        }
        reparadas.push(t);
    }
    return { reparadas, conservadas };
}

// ── Restauración desde la nube ────────────────────────────────────────────────

const RESTORE_PAGE_SIZE = 1000;

/** Valores de libsql → valores aceptados por SQLite local (BLOB llega como ArrayBuffer). */
const toLocalValue = (v) => (v instanceof ArrayBuffer ? Buffer.from(v) : v);

/**
 * Resumen de la copia en la nube para confirmar una restauración (sin escribir nada).
 * @returns {Promise<{ disponible: boolean, meta: Object, tablas: Array<{ tabla, nube }> }>}
 */
export async function describeRemoteCopy(remote) {
    const meta = await readRemoteMeta(remote);
    const existing = await remoteTableNames(remote);
    const tablas = [...existing].filter(t =>
        !LOCAL_ONLY_TABLES.has(t) && !EXCLUDED_TABLES.has(t) && !t.startsWith('sqlite_') && t !== '__drizzle_migrations'
    ).sort();
    const counts = await countRemote(remote, tablas, existing);
    const conDatos = GUARD_TABLES.some(t => counts[t] > 0);
    return {
        disponible: Boolean(meta.instancia_id) || conDatos,
        meta,
        tablas: tablas.map(t => ({ tabla: t, nube: counts[t] }))
    };
}

/**
 * Llena una base local NUEVA, ya creada con las migraciones de la versión instalada
 * (esquema actual + triggers de negocio), con los datos de la copia en la nube.
 *
 * - Se copian solo las columnas que existen en ambos lados; las columnas nuevas toman su DEFAULT.
 * - `__drizzle_migrations` no se copia (la base nueva tiene su propio historial de migraciones).
 * - Los triggers se desactivan durante la copia (los datos ya vienen calculados) y se restauran al final.
 * - La base resultante hereda la identidad de la copia y queda marcada para una carga completa
 *   (verificada) cuando la sincronización vuelva a activarse.
 * - Valida integridad y que la cantidad de registros copiados coincida con la nube; si algo falla, lanza error
 *   (la base local en uso NO se toca en ningún caso: esto solo escribe en `target`).
 *
 * @returns {Promise<{ instanciaId, lastSyncNube, tablas: Array<{ tabla, registros }>, totalRegistros, fkViolaciones, triggers }>}
 */
export async function restoreRemoteInto(target, remote, { log = () => {} } = {}) {
    const copia = await describeRemoteCopy(remote);
    if (!copia.disponible) {
        throw new Error('La nube no contiene una copia de AguaVP para restaurar.');
    }
    const remoteCounts = new Map(copia.tablas.map(t => [t.tabla, t.nube]));

    // Desactivar triggers (de negocio y de registro) durante la copia
    const triggers = target.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL`).all();
    for (const t of triggers) target.exec(`DROP TRIGGER IF EXISTS ${quoteId(t.name)}`);
    target.exec('PRAGMA foreign_keys = OFF');

    const tablas = [];
    const tablasConservadas = [];
    const columnasConservadas = [];
    let totalRegistros = 0;
    try {
        // Tablas que existen en la nube pero no en esta versión (p. ej. de migraciones que ya no están
        // en el código): se recrean con su definición de la nube para no perder sus datos
        const targetTables = new Set(getLocalTables(target).map(t => t.name));
        const remoteDefs = new Map(
            (await remote.execute(`SELECT name, sql FROM sqlite_master WHERE type = 'table'`)).rows.map(r => [r.name, r.sql])
        );
        for (const t of remoteCounts.keys()) {
            if (targetTables.has(t) || !remoteDefs.get(t)) continue;
            target.exec(ifNotExists(remoteDefs.get(t), 'TABLE'));
            tablasConservadas.push(t);
        }

        for (const { name } of getLocalTables(target)) {
            if (name === '__drizzle_migrations' || !remoteCounts.has(name)) continue;

            const remoteInfo = (await remote.execute(`PRAGMA table_info(${quoteId(name)})`)).rows;
            // Columnas que la nube tiene y esta versión no: se agregan (nombre y tipo) para conservar sus datos
            const targetCols = new Set(localColumns(target, name).map(c => c.name));
            for (const r of remoteInfo) {
                if (targetCols.has(r.name)) continue;
                target.exec(`ALTER TABLE ${quoteId(name)} ADD COLUMN ${quoteId(r.name)}${r.type ? ` ${r.type}` : ''}`);
                columnasConservadas.push(`${name}.${r.name}`);
            }
            const remoteCols = new Set(remoteInfo.map(r => r.name));
            const cols = localColumns(target, name).map(c => c.name).filter(c => remoteCols.has(c));
            if (!cols.includes('id')) continue;

            const insert = target.prepare(
                `INSERT INTO ${quoteId(name)} (${cols.map(quoteId).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
            );
            target.exec('BEGIN');
            try {
                // Las migraciones pueden haber sembrado filas por defecto: la copia de la nube manda
                target.exec(`DELETE FROM ${quoteId(name)}`);
                let lastId = null;
                let copiados = 0;
                for (;;) {
                    const page = await remote.execute({
                        sql: `SELECT ${cols.map(quoteId).join(', ')} FROM ${quoteId(name)}` +
                            (lastId === null ? '' : ' WHERE id > ?') + ` ORDER BY id LIMIT ${RESTORE_PAGE_SIZE}`,
                        args: lastId === null ? [] : [lastId]
                    });
                    for (const row of page.rows) insert.run(...cols.map(c => toLocalValue(row[c])));
                    copiados += page.rows.length;
                    if (page.rows.length < RESTORE_PAGE_SIZE) break;
                    lastId = page.rows[page.rows.length - 1].id;
                }
                target.exec('COMMIT');
                tablas.push({ tabla: name, registros: copiados });
                totalRegistros += copiados;
            } catch (err) {
                target.exec('ROLLBACK');
                throw new Error(`Error copiando la tabla ${name}: ${err.message}`);
            }
        }
    } finally {
        target.exec('PRAGMA foreign_keys = ON');
        for (const t of triggers) target.exec(t.sql);
    }

    // Identidad heredada: la sincronización continúa con la misma copia, empezando por una carga completa
    ensureLocalStateTable(target);
    setLocalState(target, 'instancia_id', copia.meta.instancia_id || crypto.randomUUID());
    setLocalState(target, 'requiere_carga_completa', '1');
    setLocalState(target, 'restaurada_desde_nube', new Date().toISOString());
    // Restaurar en esta computadora la convierte en la que respalda esta copia (ver motivo 'equipo')
    setLocalState(target, 'tomar_control_equipo', '1');

    // Validaciones
    const integridad = checkLocalIntegrity(target);
    if (!integridad.ok) {
        throw new Error(`La base restaurada no pasó la verificación de integridad: ${integridad.errores.join('; ')}`);
    }
    const diferencias = tablas
        .map(t => ({ ...t, local: countLocal(target, t.tabla), nube: remoteCounts.get(t.tabla) }))
        .filter(t => t.local !== t.nube);
    if (diferencias.length) {
        throw new Error('Los registros copiados no coinciden con la nube en: ' +
            diferencias.map(d => `${d.tabla} (copiados ${d.local}, nube ${d.nube})`).join(', '));
    }
    // Contenido: cada fila restaurada debe ser idéntica a la de la nube (columnas comunes)
    const contenido = await verifyContent(target, remote, tablas.map(t => t.tabla));
    if (!contenido.ok) {
        throw new Error('El contenido restaurado no coincide con la nube en: ' +
            contenido.diferencias.map(d => `${d.tabla} (${d.distintas.length} distintas, ${d.soloNube.length} faltantes, ${d.soloLocal.length} sobrantes)`).join(', '));
    }
    const triggersFinales = target.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'`).get().n;
    if (Number(triggersFinales) !== triggers.length) {
        throw new Error(`No se restauraron todos los triggers (${triggersFinales} de ${triggers.length}).`);
    }
    if (integridad.fkViolaciones > 0) {
        log(`Aviso: ${integridad.fkViolaciones} referencia(s) huérfanas en la copia restaurada`);
    }
    if (tablasConservadas.length || columnasConservadas.length) {
        log(`Conservado de la nube (no existe en esta versión): ${[...tablasConservadas, ...columnasConservadas].join(', ')}`);
    }

    return {
        instanciaId: getLocalState(target, 'instancia_id'),
        lastSyncNube: copia.meta.last_sync || null,
        tablasConservadas,
        columnasConservadas,
        tablas,
        totalRegistros,
        fkViolaciones: integridad.fkViolaciones,
        triggers: Number(triggersFinales),
        filasVerificadas: contenido.filas
    };
}

// ── Orquestación ──────────────────────────────────────────────────────────────

/**
 * Carga completa protegida: copia toda la base local a la nube sin vaciarla antes.
 *
 * @param {Object} opts
 * @param {string}  opts.instanciaId - id de la base local (getOrCreateInstanciaId)
 * @param {string}  [opts.equipoId]  - id de esta computadora (detecta otra computadora escribiendo en la copia)
 * @param {boolean} [opts.force]     - omite la guarda anti-sobrescritura (confirmación explícita del admin).
 *                                     Nunca omite la verificación de integridad.
 * @param {string}  opts.timestamp   - marca de inicio (se guarda como last_sync)
 * @param {Function} [opts.log]
 * @returns {Promise<Object>} { success, conflict?, motivos?, comparacion?, eliminaria?, totalRows, pruned, tablesCopied, schema, verificacion }
 */
export async function seedRemote(local, remote, { instanciaId, equipoId = null, force = false, timestamp, log = () => {} }) {
    const integridad = checkLocalIntegrity(local);
    if (!integridad.ok) {
        throw new Error(`La base local no pasó la verificación de integridad (${integridad.errores.join('; ')}). ` +
            'No se sube a la nube para no propagar daños.');
    }
    if (integridad.fkViolaciones > 0) {
        log(`Aviso: ${integridad.fkViolaciones} referencia(s) huérfanas en la base local (foreign_key_check)`);
    }

    ensureLocalStateTable(local);
    const tomarControl = getLocalState(local, 'tomar_control_equipo') === '1';
    const safety = await checkSeedSafety(local, remote, instanciaId, { equipoId, tomarControl });
    if (!safety.seguro && !force) {
        return {
            success: false,
            conflict: true,
            motivos: safety.motivos,
            comparacion: safety.comparacion,
            eliminaria: safety.eliminaria
        };
    }
    if (!safety.seguro && force) {
        log(`Reemplazo forzado de la nube: ${safety.motivos.map(m => m.tipo).join(', ')}; se eliminan de la nube: ` +
            (safety.eliminaria.map(e => `${e.tabla} (${e.total})`).join(', ') || 'nada'));
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
    const uploader = createUploader(local, remote);
    for (const { name } of tables) {
        const rows = local.prepare(`SELECT * FROM ${quoteId(name)}`).all();
        if (rows.length === 0) continue;
        await uploader.upsert(name, rows);
        totalRows += rows.length;
        tablesCopied.push({ table: name, count: rows.length });
    }
    // Referencias hacia adelante (misma tabla o tabla posterior), con todas las filas ya en la nube
    await uploader.finish();

    // Borrar lo que ya no existe en local, de hijos a padres
    let pruned = 0;
    for (const { name } of [...tables].reverse()) {
        pruned += await pruneRemoteRows(local, remote, name);
    }

    await writeRemoteMeta(remote, buildRemoteMeta(local, instanciaId, timestamp, equipoId));
    commitChanges(local, cursorInicio);
    setLocalState(local, 'tomar_control_equipo', '0');

    // Verificación por contenido de toda la copia recién subida
    const v = await verifyContent(local, remote, tables.map(t => t.name));
    const verificacion = { ok: v.ok, diferencias: v.diferencias, filas: v.filas, tipo: 'contenido', reparadas: [], conservadas: [] };

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
 * @param {string}  [opts.equipoId]
 * @param {string}  opts.timestamp
 * @param {boolean} [opts.verifyAll=false] - verificación periódica: integridad local + CONTENIDO de todas las tablas
 * @param {Function} [opts.log]
 * @returns {Promise<Object>}
 *   { needsSeed: true, reason }                                    → carga completa protegida
 *   { success: true, syncedCount: 0, reason: 'no_local_changes' }  → sin llamadas de red
 *   { success: true, syncedCount, upserted, deleted, verificacion, fkViolaciones? }
 *   { success: false, error, integridad }                          → base local dañada: no se sube nada
 */
export async function incrementalRemote(local, remote, { instanciaId, equipoId = null, timestamp, verifyAll = false, log = () => {} }) {
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

    // Verificación periódica: nunca subir desde una base local dañada
    let integridad = null;
    if (verifyAll) {
        integridad = checkLocalIntegrity(local);
        if (!integridad.ok) {
            return {
                success: false,
                error: `La base local no pasó la verificación de integridad (${integridad.errores.join('; ')}). No se sube nada a la nube.`,
                integridad
            };
        }
    }

    const remoteMeta = await readRemoteMeta(remote);
    if (remoteMeta.instancia_id !== instanciaId) {
        return { needsSeed: true, reason: 'remote_identity' };
    }
    if (remoteMeta.equipo_id && equipoId && remoteMeta.equipo_id !== equipoId) {
        // Otra computadora escribió en esta copia: la carga completa se bloquea con el motivo 'equipo'
        return { needsSeed: true, reason: 'other_device' };
    }

    const tables = getLocalTables(local);
    if (remoteMeta.ultima_migracion !== getLocalSchemaVersion(local)) {
        // Esquema distinto al de la última subida: si la nube tiene columnas que esta base no tiene,
        // subir filas las vaciaría → carga completa (que se bloquea con conflicto 'columnas')
        if ((await remoteExtraColumns(local, remote, tables.map(t => t.name))).length > 0) {
            return { needsSeed: true, reason: 'remote_columns' };
        }
        const schema = await reconcileRemoteSchema(local, remote, tables);
        if (schema.columnasAgregadas.length) log(`Columnas agregadas en la nube: ${schema.columnasAgregadas.join(', ')}`);
    }

    let push = { upserted: 0, deleted: 0, tablas: [], conflictosResueltos: 0 };
    if (pending.total > 0) {
        await dropAllRemoteTriggers(remote);
        push = await pushChanges(local, remote, pending.porTabla);
        commitChanges(local, pending.maxId);
    }

    let verificacion = { ok: true, diferencias: [], reparadas: [], conservadas: [], tipo: 'ninguna' };
    // Tablas con cambios registrados durante este ciclo: se suben en el siguiente, no se "reparan" ahora
    const recientes = () => readPendingChanges(local).porTabla;

    if (verifyAll || push.conflictosResueltos > 0) {
        // Contenido de TODAS las tablas, fila por fila (detecta campos cambiados o vaciados)
        const nombres = tables.map(t => t.name);
        const v = await verifyContent(local, remote, nombres);
        verificacion = { ...verificacion, ...v, tipo: 'contenido' };
        if (!v.ok) {
            const pendientes = recientes();
            const aReparar = v.diferencias.filter(d => !pendientes.has(d.tabla));
            if (aReparar.length) {
                const rep = await repairContent(local, remote, aReparar);
                log(`Reparación de la copia (contenido): ${rep.reparadas.join(', ') || 'ninguna'}` +
                    (rep.conservadas.length ? `; conservadas en la nube: ${rep.conservadas.map(c => `${c.tabla} (${c.total})`).join(', ')}` : ''));
                const again = await verifyContent(local, remote, aReparar.map(d => d.tabla));
                const restantes = [...v.diferencias.filter(d => !aReparar.includes(d)), ...again.diferencias];
                verificacion = {
                    ok: restantes.length === 0, diferencias: restantes, filas: v.filas, tipo: 'contenido',
                    reparadas: rep.reparadas, conservadas: rep.conservadas
                };
            }
        }
    } else if (push.tablas.length) {
        // Tablas tocadas en este ciclo: verificación rápida por cantidad e id máximo
        const v = await verifyRemote(local, remote, push.tablas);
        verificacion = { ...verificacion, ...v, tipo: 'conteo' };
        if (!v.ok) {
            const pendientes = recientes();
            const aReparar = v.diferencias.filter(d => !pendientes.has(d.tabla));
            if (aReparar.length) {
                const rep = await repairTables(local, remote, aReparar);
                log(`Reparación de la copia: ${rep.reparadas.join(', ') || 'ninguna'}` +
                    (rep.conservadas.length ? `; conservadas en la nube: ${rep.conservadas.map(c => c.tabla).join(', ')}` : ''));
                const again = await verifyRemote(local, remote, push.tablas);
                verificacion = { ...again, tipo: 'conteo', reparadas: rep.reparadas, conservadas: rep.conservadas };
            }
        }
    }

    await writeRemoteMeta(remote, buildRemoteMeta(local, instanciaId, timestamp, equipoId));

    return {
        success: true,
        syncedCount: push.upserted + push.deleted,
        upserted: push.upserted,
        deleted: push.deleted,
        verificacion,
        fkViolaciones: integridad ? integridad.fkViolaciones : undefined,
        timestamp
    };
}
