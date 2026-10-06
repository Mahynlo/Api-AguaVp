/**
 * Servicio de Sincronización Espejo con Turso Cloud
 * File: src/v2/services/tursoSyncService.js
 *
 * Responsabilidades:
 * - Probar conectividad con la base de datos de Turso
 * - Carga semilla inicial (Seed) de la estructura y datos locales hacia la nube
 * - Sincronización incremental periódica y manual de cambios locales hacia Turso
 * - Resiliencia offline: fallos de red no interrumpen el servidor local
 * - Cuidado estricto de la cuota mensual de transferencia (3 GB/mes) mediante detección local de cambios
 * - Prevención de conflictos de triggers: el SQLite local es el único maestro con lógica de negocio;
 *   la réplica en la nube no ejecuta triggers que alteren saldos ni restrinjan datos históricos.
 */

import { createClient } from '@libsql/client';
import dbWrapper, { sqlite } from '../../database/db-sqlite.js';

// Estado en memoria del servicio
let tursoClient = null;
let syncConfig = {
    tursoUrl: process.env.TURSO_DATABASE_URL || '',
    tursoToken: process.env.TURSO_AUTH_TOKEN || '',
    autoSync: true,
    syncIntervalMs: 15 * 60 * 1000 // 15 minutos (optimizado para cuota 3GB)
};

let syncState = {
    inProgress: false,
    lastSync: null,
    lastSyncSuccess: null,
    lastError: null,
    totalRecordsSynced: 0
};

let syncTimer = null;

// Orden estricto de tablas para respetar dependencias de claves foráneas
const TABLE_SYNC_ORDER = [
    '__drizzle_migrations',
    'apps',
    'usuarios',
    'historial_passwords',
    'refresh_tokens',
    'sesiones',
    'tokens_revocados',
    'auditoria_seguridad',
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
    'convenios_pago',
    'parcialidades_convenio',
    'pagos',
    'cortes_servicio',
    'historial_cambios'
];

/**
 * Elimina todos los triggers en la base de datos remota de Turso.
 * La base en la nube es un respaldo y réplica de consulta.
 * Los triggers de cálculo y validación de negocio (saldos, pagos, parcialidades)
 * ya se ejecutaron en el SQLite local (maestro). Si se ejecutan en Turso,
 * distorsionan saldos o bloquean la inserción de registros históricos legítimos.
 */
async function dropAllRemoteTriggers() {
    if (!tursoClient) return;
    try {
        const triggersResult = await tursoClient.execute(
            "SELECT name FROM sqlite_master WHERE type = 'trigger'"
        );
        for (const row of triggersResult.rows) {
            const trigName = row.name || row[0];
            if (trigName) {
                console.log(`[TursoSync] Desactivando trigger remoto en Turso: ${trigName}`);
                await tursoClient.execute(`DROP TRIGGER IF EXISTS "${trigName}"`);
            }
        }
    } catch (err) {
        console.warn('[TursoSync] Aviso al limpiar triggers remotos en Turso:', err.message);
    }
}

/**
 * Inserta o reemplaza filas en lotes en Turso (INSERT OR REPLACE)
 */
async function upsertBatch(tableName, rows) {
    if (!rows || rows.length === 0) return 0;
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const insertSql = `INSERT OR REPLACE INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const statements = chunk.map(row => ({
            sql: insertSql,
            args: columns.map(c => {
                const val = row[c];
                if (typeof val === 'boolean') return val ? 1 : 0;
                if (val === undefined) return null;
                return val;
            })
        }));

        await tursoClient.batch(statements, 'write');
    }
    return rows.length;
}

/**
 * Prueba la conectividad con una base de datos en Turso
 * @param {string} url - URL de la base de Turso (libsql://...)
 * @param {string} token - Token de autenticación JWT
 * @returns {Promise<{ ok: boolean, latencyMs: number }>}
 */
export async function testConnection(url, token) {
    if (!url || !token) {
        throw new Error('URL y Token de Turso son obligatorios');
    }

    const testClient = createClient({
        url: url.trim(),
        authToken: token.trim()
    });

    const start = Date.now();
    await testClient.execute('SELECT 1 as ping');
    const latencyMs = Date.now() - start;

    return { ok: true, latencyMs };
}

/**
 * Inicializa o reconfigura el servicio de sincronización
 * @param {Object} config - { tursoUrl, tursoToken, autoSync, syncIntervalMs }
 */
export function configure(config = {}) {
    if (config.tursoUrl !== undefined) syncConfig.tursoUrl = (config.tursoUrl || '').trim();
    if (config.tursoToken !== undefined) syncConfig.tursoToken = (config.tursoToken || '').trim();
    if (config.autoSync !== undefined) syncConfig.autoSync = Boolean(config.autoSync);
    if (config.syncIntervalMs) syncConfig.syncIntervalMs = Number(config.syncIntervalMs);

    // Reiniciar timer previo
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }

    if (syncConfig.tursoUrl && syncConfig.tursoToken) {
        try {
            tursoClient = createClient({
                url: syncConfig.tursoUrl,
                authToken: syncConfig.tursoToken
            });
            console.log(`[TursoSync] Conectado a la base remota: ${syncConfig.tursoUrl}`);

            if (syncConfig.autoSync) {
                syncTimer = setInterval(() => {
                    syncIncremental().catch(err => {
                        console.warn('[TursoSync] Error en sync automático (silencioso):', err.message);
                    });
                }, syncConfig.syncIntervalMs);
            }
        } catch (err) {
            console.error('[TursoSync] Error inicializando cliente Turso:', err.message);
            tursoClient = null;
        }
    } else {
        tursoClient = null;
        console.log('[TursoSync] Modo local puro — sin credenciales de Turso configuradas');
    }

    return getStatus();
}

/**
 * Obtiene el estado actual de sincronización
 */
export function getStatus() {
    return {
        configured: Boolean(syncConfig.tursoUrl && syncConfig.tursoToken),
        tursoUrl: syncConfig.tursoUrl ? syncConfig.tursoUrl.replace(/:[^@]+@/, ':***@') : null,
        autoSync: syncConfig.autoSync,
        inProgress: syncState.inProgress,
        lastSync: syncState.lastSync,
        lastSyncSuccess: syncState.lastSyncSuccess,
        lastError: syncState.lastError,
        totalRecordsSynced: syncState.totalRecordsSynced
    };
}

/**
 * Carga Semilla Inicial: Copia esquema y datos locales completos hacia Turso
 * Se utiliza cuando la base de Turso es nueva o se conecta por primera vez
 */
export async function seedDatabase() {
    if (!tursoClient) {
        throw new Error('El cliente de Turso no está configurado');
    }
    if (syncState.inProgress) {
        throw new Error('Una sincronización ya se encuentra en progreso');
    }

    syncState.inProgress = true;
    syncState.lastError = null;
    console.log('[TursoSync] 🚀 Iniciando carga semilla inicial hacia Turso...');

    try {
        // 1. Obtener todas las tablas locales de SQLite
        const tables = sqlite.prepare(`
            SELECT name, sql FROM sqlite_master 
            WHERE type='table' 
              AND name NOT LIKE 'sqlite_%' 
            ORDER BY name
        `).all();

        const tableMap = new Map(tables.map(t => [t.name, t.sql]));

        // 2. Crear las tablas en Turso si no existen
        for (const tableName of TABLE_SYNC_ORDER) {
            const createSql = tableMap.get(tableName);
            if (createSql) {
                try {
                    const safeSql = createSql.replace(/CREATE TABLE\s+(?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ');
                    await tursoClient.execute(safeSql);
                } catch (err) {
                    console.warn(`[TursoSync] Aviso creando tabla ${tableName} en Turso:`, err.message);
                }
            }
        }

        // Crear cualquier tabla restante que no esté en la lista predefinida
        for (const [tableName, createSql] of tableMap.entries()) {
            if (!TABLE_SYNC_ORDER.includes(tableName)) {
                try {
                    const safeSql = createSql.replace(/CREATE TABLE\s+(?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ');
                    await tursoClient.execute(safeSql);
                } catch (err) {
                    console.warn(`[TursoSync] Aviso creando tabla extra ${tableName}:`, err.message);
                }
            }
        }

        // 3. Crear índices
        const indexes = sqlite.prepare(`
            SELECT sql FROM sqlite_master 
            WHERE type='index' 
              AND sql IS NOT NULL 
              AND name NOT LIKE 'sqlite_%'
        `).all();

        for (const idx of indexes) {
            try {
                const safeIdxSql = idx.sql.replace(/CREATE INDEX\s+(?!IF NOT EXISTS)/i, 'CREATE INDEX IF NOT EXISTS ');
                await tursoClient.execute(safeIdxSql);
            } catch (_) {}
        }

        // 4. Crear vistas
        const views = sqlite.prepare(`
            SELECT name, sql FROM sqlite_master 
            WHERE type='view' 
              AND sql IS NOT NULL
        `).all();

        for (const v of views) {
            try {
                const safeViewSql = v.sql.replace(/CREATE VIEW\s+(?!IF NOT EXISTS)/i, 'CREATE VIEW IF NOT EXISTS ');
                await tursoClient.execute(safeViewSql);
            } catch (_) {}
        }

        // 5. IMPORTANTE: Desactivar/eliminar triggers en Turso para que no interfieran con la carga de datos
        await dropAllRemoteTriggers();

        // 6. Limpiar registros obsoletos en Turso (en orden inverso de claves foráneas)
        // para garantizar que registros eliminados localmente no persistan en la nube
        const allSyncTables = [...TABLE_SYNC_ORDER];
        for (const [tableName] of tableMap.entries()) {
            if (!allSyncTables.includes(tableName)) {
                allSyncTables.push(tableName);
            }
        }

        const reverseTables = [...allSyncTables].reverse();
        for (const tableName of reverseTables) {
            if (tableMap.has(tableName)) {
                try {
                    await tursoClient.execute(`DELETE FROM "${tableName}"`);
                } catch (_) {}
            }
        }

        let totalRows = 0;
        const tablesCopied = [];

        // 7. Copiar datos tabla por tabla en lotes respetando el orden de claves foráneas
        for (const tableName of allSyncTables) {
            if (!tableMap.has(tableName)) continue;

            const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
            if (rows.length === 0) continue;

            await upsertBatch(tableName, rows);

            totalRows += rows.length;
            tablesCopied.push({ table: tableName, count: rows.length });
            console.log(`[TursoSync] ✓ Tabla ${tableName} copiada (${rows.length} registros)`);
        }

        syncState.lastSync = new Date().toISOString();
        syncState.lastSyncSuccess = true;
        syncState.totalRecordsSynced += totalRows;

        console.log(`[TursoSync] ✅ Carga semilla completada exitosamente. Total registros respaldados: ${totalRows}`);
        return {
            success: true,
            totalRows,
            tablesCopied,
            timestamp: syncState.lastSync
        };
    } catch (error) {
        syncState.lastSyncSuccess = false;
        syncState.lastError = error.message;
        console.error('[TursoSync] ❌ Error en carga semilla:', error);
        throw error;
    } finally {
        syncState.inProgress = false;
    }
}

/**
 * Sincronización Incremental Inteligente:
 * 1. Consulta la base SQLite local primero.
 * 2. Si no hay cambios locales pendientes, NO realiza llamadas de red (ahorro 100% de la cuota de 3 GB).
 * 3. Si hay cambios, sincroniza únicamente los registros modificados o creados.
 */
export async function syncIncremental() {
    if (!tursoClient) return { success: false, reason: 'unconfigured' };
    if (syncState.inProgress) return { success: false, reason: 'already_running' };

    // Si nunca se ha hecho sync previo, ejecutamos la semilla
    if (!syncState.lastSync) {
        return await seedDatabase();
    }

    const lastSync = syncState.lastSync;
    let pendingChangesCount = 0;
    const modifiedTables = new Map(); // table -> Set of ids

    // 1. Detectar actualizaciones mediante historial_cambios local
    try {
        const recentHistorial = sqlite.prepare(`
            SELECT tabla, registro_id FROM historial_cambios 
            WHERE fecha_modificacion >= ?
        `).all(lastSync);

        for (const h of recentHistorial) {
            if (!modifiedTables.has(h.tabla)) {
                modifiedTables.set(h.tabla, new Set());
            }
            modifiedTables.get(h.tabla).add(h.registro_id);
            pendingChangesCount++;
        }
    } catch (_) {}

    // 2. Detectar nuevos registros en tablas con columna de fecha
    const dateTables = [
        { name: 'usuarios', col: 'fecha_creacion' },
        { name: 'rutas', col: 'fecha_creacion' },
        { name: 'clientes', col: 'fecha_creacion' },
        { name: 'medidores', col: 'fecha_creacion' },
        { name: 'lecturas', col: 'fecha_creacion' },
        { name: 'facturas', col: 'fecha_creacion' },
        { name: 'convenios_pago', col: 'fecha_creacion' },
        { name: 'pagos', col: 'fecha_creacion' },
        { name: 'cortes_servicio', col: 'fecha_creacion' },
        { name: 'cliente_medidor_historial', col: 'fecha_inicio' },
        { name: 'historial_cambios', col: 'fecha_modificacion' },
        { name: 'auditoria_seguridad', col: 'fecha_evento' }
    ];

    const newRowsByTable = new Map();
    for (const dt of dateTables) {
        try {
            const rows = sqlite.prepare(`
                SELECT * FROM "${dt.name}" 
                WHERE "${dt.col}" >= ?
            `).all(lastSync);

            if (rows.length > 0) {
                newRowsByTable.set(dt.name, rows);
                pendingChangesCount += rows.length;
            }
        } catch (_) {}
    }

    // Detectar parcialidades si hubo convenios nuevos o pagos recientes
    try {
        const newConvenios = newRowsByTable.get('convenios_pago');
        if (newConvenios && newConvenios.length > 0) {
            const cIds = newConvenios.map(c => c.id);
            const placeholders = cIds.map(() => '?').join(',');
            const parcialidades = sqlite.prepare(`
                SELECT * FROM parcialidades_convenio WHERE convenio_id IN (${placeholders})
            `).all(...cIds);
            if (parcialidades.length > 0) {
                newRowsByTable.set('parcialidades_convenio', parcialidades);
                pendingChangesCount += parcialidades.length;
            }
        }

        const paidParcialidades = sqlite.prepare(`
            SELECT * FROM parcialidades_convenio WHERE fecha_pago >= ?
        `).all(lastSync);
        if (paidParcialidades.length > 0) {
            const existing = newRowsByTable.get('parcialidades_convenio') || [];
            const existingIds = new Set(existing.map(p => p.id));
            for (const p of paidParcialidades) {
                if (!existingIds.has(p.id)) existing.push(p);
            }
            newRowsByTable.set('parcialidades_convenio', existing);
            pendingChangesCount += paidParcialidades.length;
        }
    } catch (_) {}

    // Detectar rutas_puntos si hubo rutas nuevas
    try {
        const newRutas = newRowsByTable.get('rutas');
        if (newRutas && newRutas.length > 0) {
            const rIds = newRutas.map(r => r.id);
            const placeholders = rIds.map(() => '?').join(',');
            const puntos = sqlite.prepare(`
                SELECT * FROM rutas_puntos WHERE ruta_id IN (${placeholders})
            `).all(...rIds);
            if (puntos.length > 0) {
                newRowsByTable.set('rutas_puntos', puntos);
                pendingChangesCount += puntos.length;
            }
        }
    } catch (_) {}

    // Catálogos: verificar si hubo modificaciones
    const catalogTables = ['configuracion_servicio', 'tarifas', 'rangos_tarifas'];
    for (const cat of catalogTables) {
        if (modifiedTables.has(cat)) {
            pendingChangesCount++;
        }
    }

    // Detectar eliminaciones físicas registradas en historial_cambios (HARD_DELETE o DELETE)
    const deletedRecords = [];
    try {
        const deletions = sqlite.prepare(`
            SELECT tabla, registro_id FROM historial_cambios 
            WHERE operacion IN ('HARD_DELETE', 'DELETE') 
              AND fecha_modificacion >= ?
        `).all(lastSync);

        for (const d of deletions) {
            deletedRecords.push(d);
            pendingChangesCount++;
        }
    } catch (_) {}

    // ⭐ GUARDA DE CONSUMO (Cuidado de los 3 GB mensuales):
    // Si no hay NINGÚN cambio local, NO hacer llamadas a Turso por red.
    if (pendingChangesCount === 0) {
        syncState.lastSync = new Date().toISOString();
        syncState.lastSyncSuccess = true;
        return {
            success: true,
            syncedCount: 0,
            reason: 'no_local_changes',
            timestamp: syncState.lastSync
        };
    }

    syncState.inProgress = true;
    syncState.lastError = null;

    try {
        // Asegurar que Turso no tenga triggers activos que interfieran
        await dropAllRemoteTriggers();

        let totalSynced = 0;

        for (const tableName of TABLE_SYNC_ORDER) {
            const newRows = newRowsByTable.get(tableName) || [];
            const updatedIds = modifiedTables.get(tableName);
            let rowsToSync = [...newRows];

            if (updatedIds && updatedIds.size > 0) {
                const newIds = new Set(newRows.map(r => r.id));
                const idsToFetch = Array.from(updatedIds).filter(id => !newIds.has(id));
                if (idsToFetch.length > 0) {
                    const placeholders = idsToFetch.map(() => '?').join(',');
                    const updatedRows = sqlite.prepare(
                        `SELECT * FROM "${tableName}" WHERE id IN (${placeholders})`
                    ).all(...idsToFetch);
                    rowsToSync.push(...updatedRows);
                }
            }

            if (rowsToSync.length > 0) {
                const count = await upsertBatch(tableName, rowsToSync);
                totalSynced += count;
            }
        }

        // Catálogos modificados
        for (const cat of catalogTables) {
            if (modifiedTables.has(cat)) {
                const catRows = sqlite.prepare(`SELECT * FROM "${cat}"`).all();
                const count = await upsertBatch(cat, catRows);
                totalSynced += count;
            }
        }

        // Ejecutar eliminaciones físicas en Turso
        for (const d of deletedRecords) {
            try {
                await tursoClient.execute({
                    sql: `DELETE FROM "${d.tabla}" WHERE id = ?`,
                    args: [d.registro_id]
                });
                totalSynced++;
                console.log(`[TursoSync] ✓ Registro ${d.registro_id} eliminado de ${d.tabla} en Turso`);
            } catch (delErr) {
                console.warn(`[TursoSync] Aviso al eliminar en Turso (${d.tabla} #${d.registro_id}):`, delErr.message);
            }
        }

        syncState.lastSync = new Date().toISOString();
        syncState.lastSyncSuccess = true;
        syncState.totalRecordsSynced += totalSynced;

        console.log(`[TursoSync] Sincronización incremental exitosa (${totalSynced} registros enviados)`);
        return {
            success: true,
            syncedCount: totalSynced,
            timestamp: syncState.lastSync
        };
    } catch (error) {
        syncState.lastSyncSuccess = false;
        syncState.lastError = error.message;
        console.error('[TursoSync] Error durante sync incremental:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
        syncState.inProgress = false;
    }
}

export default {
    testConnection,
    configure,
    getStatus,
    seedDatabase,
    syncIncremental
};
