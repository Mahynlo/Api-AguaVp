/**
 * Servicio de Sincronización Espejo con Turso Cloud
 * File: src/v2/services/tursoSyncService.js
 *
 * Responsabilidades:
 * - Probar conectividad con la base de datos de Turso
 * - Carga semilla (Seed) protegida de la estructura y datos locales hacia la nube
 * - Sincronización incremental periódica y manual de cambios locales hacia Turso
 * - Resiliencia offline: fallos de red no interrumpen el servidor local
 * - Cuidado estricto de la cuota mensual de transferencia (3 GB/mes) mediante detección local de cambios
 * - Prevención de conflictos de triggers: el SQLite local es el único maestro con lógica de negocio;
 *   la réplica en la nube no ejecuta triggers que alteren saldos ni restrinjan datos históricos.
 *
 * Protección de datos (lógica en tursoSyncCore.js):
 * - El estado (last_sync, instancia_id) se guarda en la tabla local `sync_estado`, no en memoria:
 *   la carga semilla ya no se repite en cada arranque.
 * - La carga semilla nunca vacía la nube antes de copiar y se bloquea si la nube pertenece a otra
 *   base o tiene más registros de negocio que la local (base local perdida o antigua).
 */

import { createClient } from '@libsql/client';
import { sqlite } from '../../database/db-sqlite.js';
import {
    TABLE_SYNC_ORDER,
    ensureLocalStateTable,
    getLocalState,
    setLocalState,
    getOrCreateInstanciaId,
    getLocalSchemaVersion,
    getLocalTables,
    readRemoteMeta,
    writeRemoteMeta,
    buildRemoteMeta,
    reconcileRemoteSchema,
    dropAllRemoteTriggers,
    upsertBatch,
    seedRemote
} from './tursoSyncCore.js';

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
    lastSyncSuccess: null,
    lastError: null,
    totalRecordsSynced: 0,
    conflicto: null // { motivos, comparacion, fecha } cuando la carga semilla fue bloqueada
};

let syncTimer = null;

/**
 * Normaliza una fecha ISO o Date al formato canónico de SQLite en UTC: YYYY-MM-DD HH:MM:SS
 */
function toSqliteDateTime(date = new Date()) {
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return '1970-01-01 00:00:00';
        const pad = n => String(n).padStart(2, '0');
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    } catch (_) {
        return '1970-01-01 00:00:00';
    }
}

// ── Estado persistente ────────────────────────────────────────────────────────

/**
 * Última sincronización correcta CON LA BASE REMOTA ACTUAL.
 * Si se vinculó otra URL de Turso, devuelve null para forzar una carga semilla completa.
 */
function getLastSync() {
    ensureLocalStateTable(sqlite);
    const lastSync = getLocalState(sqlite, 'last_sync');
    const lastUrl = getLocalState(sqlite, 'last_sync_url');
    if (!lastSync || lastUrl !== syncConfig.tursoUrl) return null;
    return lastSync;
}

function saveLastSync(timestamp) {
    setLocalState(sqlite, 'last_sync', timestamp);
    setLocalState(sqlite, 'last_sync_url', syncConfig.tursoUrl);
}

function readLastSyncSafe() {
    try {
        return getLastSync();
    } catch (_) {
        return null;
    }
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
    syncState.conflicto = null;

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
        lastSync: readLastSyncSafe(),
        lastSyncSuccess: syncState.lastSyncSuccess,
        lastError: syncState.lastError,
        totalRecordsSynced: syncState.totalRecordsSynced,
        conflicto: syncState.conflicto
    };
}

/**
 * Carga Semilla protegida: copia esquema y datos locales completos hacia Turso.
 * Se utiliza cuando la base de Turso es nueva, se vinculó otra base o no hay sincronización previa.
 *
 * Nunca vacía la nube antes de copiar. Si la nube pertenece a otra base o tiene más registros de
 * negocio que la local, NO copia y devuelve { success: false, conflict: true, motivos, comparacion }.
 *
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - reemplaza la nube aunque haya conflicto (confirmación del admin)
 */
export async function seedDatabase({ force = false } = {}) {
    if (!tursoClient) {
        throw new Error('El cliente de Turso no está configurado');
    }
    if (syncState.inProgress) {
        throw new Error('Una sincronización ya se encuentra en progreso');
    }

    syncState.inProgress = true;
    syncState.lastError = null;
    const seedStartTime = new Date().toISOString();
    console.log(`[TursoSync] 🚀 Iniciando carga semilla hacia Turso${force ? ' (reemplazo forzado)' : ''}...`);

    try {
        const instanciaId = getOrCreateInstanciaId(sqlite);
        const result = await seedRemote(sqlite, tursoClient, {
            instanciaId,
            force,
            timestamp: seedStartTime,
            log: msg => console.log(`[TursoSync] ${msg}`)
        });

        if (result.conflict) {
            syncState.conflicto = {
                motivos: result.motivos,
                comparacion: result.comparacion,
                fecha: seedStartTime
            };
            syncState.lastSyncSuccess = false;
            syncState.lastError = 'Carga semilla bloqueada para proteger la copia en la nube. ' +
                result.motivos.map(m => m.mensaje).join(' ');
            console.warn(`[TursoSync] ⛔ ${syncState.lastError}`);
            return result;
        }

        saveLastSync(seedStartTime);
        syncState.conflicto = null;
        syncState.lastSyncSuccess = true;
        syncState.totalRecordsSynced += result.totalRows;

        console.log(`[TursoSync] ✅ Carga semilla completada. Registros copiados: ${result.totalRows}, eliminados en la nube: ${result.pruned}`);
        return result;
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
 * 4. Si no hay sincronización previa con esta base remota, o la nube no tiene la identidad de esta
 *    base, ejecuta la carga semilla protegida.
 */
export async function syncIncremental() {
    if (!tursoClient) return { success: false, reason: 'unconfigured' };
    if (syncState.inProgress) return { success: false, reason: 'already_running' };

    const lastSync = getLastSync();

    // Sin sincronización previa con esta base remota: carga semilla (con guarda anti-sobrescritura)
    if (!lastSync) {
        return await seedDatabase();
    }

    const syncStartTime = new Date().toISOString();
    const lastSyncSqlite = toSqliteDateTime(lastSync);
    let pendingChangesCount = 0;
    const modifiedTables = new Map(); // table -> Set of ids

    // 1. Detectar actualizaciones mediante historial_cambios local
    try {
        const recentHistorial = sqlite.prepare(`
            SELECT tabla, registro_id FROM historial_cambios
            WHERE datetime(fecha_modificacion) >= datetime(?)
              AND operacion NOT IN ('HARD_DELETE', 'DELETE')
        `).all(lastSyncSqlite);

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
                WHERE datetime("${dt.col}") >= datetime(?)
            `).all(lastSyncSqlite);

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
            SELECT * FROM parcialidades_convenio
            WHERE datetime(fecha_pago) >= datetime(?)
        `).all(lastSyncSqlite);
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
    const deletedRecordsMap = new Map();
    try {
        const deletions = sqlite.prepare(`
            SELECT tabla, registro_id FROM historial_cambios
            WHERE operacion IN ('HARD_DELETE', 'DELETE')
              AND datetime(fecha_modificacion) >= datetime(?)
        `).all(lastSyncSqlite);

        for (const d of deletions) {
            deletedRecordsMap.set(`${d.tabla}:${d.registro_id}`, d);
            pendingChangesCount++;
        }
    } catch (_) {}
    const deletedRecords = Array.from(deletedRecordsMap.values());

    // ⭐ GUARDA DE CONSUMO (Cuidado de los 3 GB mensuales):
    // Si no hay NINGÚN cambio local, NO hacer llamadas a Turso por red.
    if (pendingChangesCount === 0) {
        saveLastSync(syncStartTime);
        syncState.lastSyncSuccess = true;
        return {
            success: true,
            syncedCount: 0,
            reason: 'no_local_changes',
            timestamp: syncStartTime
        };
    }

    syncState.inProgress = true;
    syncState.lastError = null;
    let delegateToSeed = false;

    try {
        // La nube debe pertenecer a esta base; si fue recreada o es de otra base, se requiere carga semilla
        const instanciaId = getOrCreateInstanciaId(sqlite);
        const remoteMeta = await readRemoteMeta(tursoClient);
        if (remoteMeta.instancia_id !== instanciaId) {
            delegateToSeed = true;
        } else {
            // Columnas/tablas nuevas tras una actualización de la API
            if (remoteMeta.ultima_migracion !== getLocalSchemaVersion(sqlite)) {
                const schema = await reconcileRemoteSchema(sqlite, tursoClient, getLocalTables(sqlite));
                if (schema.columnasAgregadas.length) {
                    console.log(`[TursoSync] Columnas agregadas en la nube: ${schema.columnasAgregadas.join(', ')}`);
                }
            }

            // Asegurar que Turso no tenga triggers activos que interfieran
            await dropAllRemoteTriggers(tursoClient);

            // Desactivar FKs durante la sincronización incremental
            // INSERT OR REPLACE hace DELETE+INSERT internamente, lo que activa validación de FKs
            try {
                await tursoClient.execute('PRAGMA foreign_keys = OFF');
            } catch (_) {
                try { await tursoClient.execute('PRAGMA defer_foreign_keys = ON'); } catch (_) {}
            }

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
                    const count = await upsertBatch(tursoClient, tableName, rowsToSync);
                    totalSynced += count;
                }
            }

            // Catálogos modificados
            for (const cat of catalogTables) {
                if (modifiedTables.has(cat)) {
                    const catRows = sqlite.prepare(`SELECT * FROM "${cat}"`).all();
                    const count = await upsertBatch(tursoClient, cat, catRows);
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

            await writeRemoteMeta(tursoClient, buildRemoteMeta(sqlite, instanciaId, syncStartTime));
            saveLastSync(syncStartTime);
            syncState.lastSyncSuccess = true;
            syncState.totalRecordsSynced += totalSynced;

            console.log(`[TursoSync] Sincronización incremental exitosa (${totalSynced} registros enviados)`);
            return {
                success: true,
                syncedCount: totalSynced,
                timestamp: syncStartTime
            };
        }
    } catch (error) {
        syncState.lastSyncSuccess = false;
        syncState.lastError = error.message;
        console.error('[TursoSync] Error durante sync incremental:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
        // Re-activar FKs siempre, incluso si hubo error
        if (!delegateToSeed) {
            try {
                await tursoClient.execute('PRAGMA foreign_keys = ON');
            } catch (_) {}
        }
        syncState.inProgress = false;
    }

    // La nube no tiene la identidad de esta base (recreada, vinculada a otra base o copia anterior
    // a esta versión): carga semilla protegida
    console.log('[TursoSync] La nube no corresponde a esta base local — se ejecuta carga semilla protegida');
    return await seedDatabase();
}

export default {
    testConnection,
    configure,
    getStatus,
    seedDatabase,
    syncIncremental
};
