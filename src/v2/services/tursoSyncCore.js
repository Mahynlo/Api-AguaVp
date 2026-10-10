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
 *      ni más registros de negocio que la local (base local perdida/vacía/antigua).
 *   3. Las columnas nuevas de la base local se agregan en la nube antes de copiar.
 */

import crypto from 'crypto';

// Tabla local con el estado de sincronización (nunca se sube a la nube)
export const LOCAL_STATE_TABLE = 'sync_estado';
// Tabla remota con la identidad y metadatos de la copia (nunca se copia de la nube a local)
export const REMOTE_META_TABLE = '_aguavp_sync_meta';
export const LOCAL_ONLY_TABLES = new Set([LOCAL_STATE_TABLE, REMOTE_META_TABLE]);

// Tablas de negocio cuya cantidad de registros no debería disminuir en local.
// Si la nube tiene MÁS registros que la local, la base local se considera perdida,
// vacía o restaurada desde un respaldo antiguo y la carga completa se bloquea.
export const GUARD_TABLES = ['clientes', 'medidores', 'lecturas', 'facturas', 'pagos', 'tarifas', 'usuarios'];

// Orden estricto de tablas para respetar dependencias de claves foráneas
export const TABLE_SYNC_ORDER = [
    '__drizzle_migrations',
    'apps',
    'usuarios',
    'historial_passwords',
    'refresh_tokens',
    'sesiones',
    'tokens_revocados',
    'auditoria_seguridad',
    'permissions_catalog',
    'role_permissions',
    'user_permission_overrides',
    'password_recovery_tokens',
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
const DELETE_BATCH_SIZE = 500;

const quoteId = (name) => `"${String(name).replace(/"/g, '""')}"`;

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

// ── Tablas y conteos ──────────────────────────────────────────────────────────

/** Tablas locales a sincronizar, ordenadas por dependencias. */
export function getLocalTables(local) {
    const rows = local.prepare(`
        SELECT name, sql FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).all();
    const map = new Map(rows.filter(r => !LOCAL_ONLY_TABLES.has(r.name)).map(r => [r.name, r.sql]));

    const ordered = TABLE_SYNC_ORDER.filter(t => map.has(t));
    for (const name of [...map.keys()].sort()) {
        if (!ordered.includes(name)) ordered.push(name);
    }
    return ordered.map(name => ({ name, sql: map.get(name) }));
}

function localColumns(local, table) {
    return local.prepare(`PRAGMA table_info(${quoteId(table)})`).all();
}

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

// ── Copia de datos ────────────────────────────────────────────────────────────

/** Inserta o reemplaza filas en lotes (cada lote es atómico). */
export async function upsertBatch(remote, tableName, rows) {
    if (!rows || rows.length === 0) return 0;
    const columns = Object.keys(rows[0]);
    const insertSql = `INSERT OR REPLACE INTO ${quoteId(tableName)} (${columns.map(quoteId).join(', ')}) ` +
        `VALUES (${columns.map(() => '?').join(', ')})`;

    for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
        const chunk = rows.slice(i, i + UPSERT_BATCH_SIZE);
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
    if (!localColumns(local, tableName).some(c => c.name === 'id')) return 0;

    const localIds = new Set(
        local.prepare(`SELECT id FROM ${quoteId(tableName)}`).all().map(r => String(r.id))
    );
    const remoteIds = (await remote.execute(`SELECT id FROM ${quoteId(tableName)}`)).rows.map(r => r.id);
    const toDelete = remoteIds.filter(id => !localIds.has(String(id)));

    for (let i = 0; i < toDelete.length; i += DELETE_BATCH_SIZE) {
        const chunk = toDelete.slice(i, i + DELETE_BATCH_SIZE);
        await remote.execute({
            sql: `DELETE FROM ${quoteId(tableName)} WHERE id IN (${chunk.map(() => '?').join(', ')})`,
            args: chunk
        });
    }
    return toDelete.length;
}

/**
 * Carga completa protegida: copia toda la base local a la nube sin vaciarla antes.
 *
 * @param {Object} opts
 * @param {string}  opts.instanciaId - id de la base local (getOrCreateInstanciaId)
 * @param {boolean} [opts.force]     - omite la guarda anti-sobrescritura (confirmación explícita del admin)
 * @param {string}  opts.timestamp   - marca de inicio (se guarda como last_sync)
 * @param {Function} [opts.log]
 * @returns {Promise<Object>} { success, conflict?, motivos?, comparacion?, totalRows, pruned, tablesCopied, schema }
 */
export async function seedRemote(local, remote, { instanciaId, force = false, timestamp, log = () => {} }) {
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

    const tables = getLocalTables(local);
    const schema = await reconcileRemoteSchema(local, remote, tables);
    if (schema.columnasAgregadas.length) log(`Columnas agregadas en la nube: ${schema.columnasAgregadas.join(', ')}`);

    await dropAllRemoteTriggers(remote);

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

    return { success: true, totalRows, pruned, tablesCopied, schema, timestamp };
}
