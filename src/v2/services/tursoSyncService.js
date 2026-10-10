/**
 * Servicio de Sincronización Espejo con Turso Cloud
 * File: src/v2/services/tursoSyncService.js
 *
 * Responsabilidades (la lógica de datos vive en tursoSyncCore.js):
 * - Mantener el cliente de Turso, la configuración y el temporizador del ciclo automático
 * - Coordinar carga semilla protegida e incremental, evitando ejecuciones simultáneas
 * - Persistir el estado en la tabla local `sync_estado` (última sincronización, URL, cursor de cambios)
 * - Exponer el estado para el panel de la app (conflicto, verificación, cambios pendientes)
 *
 * Garantías (ver tursoSyncCore.js):
 * - La nube nunca se vacía antes de copiar; la carga completa se bloquea si la base local parece
 *   perdida, de otra instalación o antigua, y nunca sube una base que no pasa PRAGMA quick_check.
 * - Todo cambio local de una tabla sincronizada queda en `sync_cambios` (triggers locales) y se sube
 *   en el siguiente ciclo; sin cambios no hay llamadas de red (cuota de 3 GB/mes).
 * - Tras subir cambios se verifica la nube (y una vez al día, todas las tablas) y se repara.
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sqlite } from '../../database/db-sqlite.js';
import { customMigrate } from '../../database/sqlite-migrator.js';
import {
    GUARD_TABLES,
    describeRemoteCopy,
    restoreRemoteInto,
    ensureLocalStateTable,
    getLocalState,
    setLocalState,
    getOrCreateInstanciaId,
    ensureChangeTracking,
    disableChangeTracking,
    readPendingChanges,
    seedRemote,
    incrementalRemote
} from './tursoSyncCore.js';

const VERIFICACION_COMPLETA_MS = 24 * 60 * 60 * 1000;
const MIGRATIONS_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

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
    conflicto: null,     // { motivos, comparacion, fecha } cuando la carga semilla fue bloqueada
    verificacion: null   // { ok, fecha, diferencias, reparadas, conservadas } de la última verificación
};

let syncTimer = null;

const log = (msg) => console.log(`[TursoSync] ${msg}`);

// ── Estado persistente ────────────────────────────────────────────────────────

/**
 * Última sincronización correcta CON LA BASE REMOTA ACTUAL.
 * Devuelve null (→ carga semilla) si se vinculó otra URL o si se marcó que hace falta una carga completa.
 */
function getLastSync() {
    ensureLocalStateTable(sqlite);
    const lastSync = getLocalState(sqlite, 'last_sync');
    const lastUrl = getLocalState(sqlite, 'last_sync_url');
    if (!lastSync || lastUrl !== syncConfig.tursoUrl) return null;
    if (getLocalState(sqlite, 'requiere_carga_completa') === '1') return null;
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

function pendingChangesSafe() {
    try {
        return readPendingChanges(sqlite).total;
    } catch (_) {
        return null;
    }
}

function verificacionCompletaPendiente() {
    const ultima = getLocalState(sqlite, 'ultima_verificacion_completa');
    return !ultima || Date.now() - new Date(ultima).getTime() >= VERIFICACION_COMPLETA_MS;
}

function registrarVerificacion(verificacion, fecha, completa) {
    if (!verificacion) return;
    syncState.verificacion = { ...verificacion, fecha, completa };
    if (completa && verificacion.ok) setLocalState(sqlite, 'ultima_verificacion_completa', fecha);
    if (!verificacion.ok) {
        log(`⚠️ Verificación con diferencias en: ${verificacion.diferencias.map(d => d.tabla).join(', ')}`);
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
            log(`Conectado a la base remota: ${syncConfig.tursoUrl}`);

            // Registrar cambios desde ya; si faltaban triggers, sus cambios previos no están
            // registrados y el siguiente ciclo hace una carga completa protegida.
            ensureLocalStateTable(sqlite);
            const tracking = ensureChangeTracking(sqlite);
            if (tracking.created.length > 0) setLocalState(sqlite, 'requiere_carga_completa', '1');

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
        // Sin nube: dejar de registrar cambios. Al volver a vincular se hace una carga completa.
        try {
            ensureLocalStateTable(sqlite);
            disableChangeTracking(sqlite);
            setLocalState(sqlite, 'requiere_carga_completa', '1');
        } catch (err) {
            console.warn('[TursoSync] Aviso al desactivar el registro de cambios:', err.message);
        }
        log('Modo local puro — sin credenciales de Turso configuradas');
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
        conflicto: syncState.conflicto,
        verificacion: syncState.verificacion,
        cambiosPendientes: tursoClient ? pendingChangesSafe() : null
    };
}

/**
 * Carga Semilla protegida: copia esquema y datos locales completos hacia Turso.
 * Se utiliza cuando la base de Turso es nueva, se vinculó otra base, faltaba el registro de cambios
 * o la nube no tiene la identidad de esta base.
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
    log(`🚀 Iniciando carga semilla hacia Turso${force ? ' (reemplazo forzado)' : ''}...`);

    try {
        const instanciaId = getOrCreateInstanciaId(sqlite);
        const result = await seedRemote(sqlite, tursoClient, {
            instanciaId,
            force,
            timestamp: seedStartTime,
            log
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
        setLocalState(sqlite, 'requiere_carga_completa', '0');
        registrarVerificacion(result.verificacion, seedStartTime, true);
        syncState.conflicto = null;
        syncState.lastSyncSuccess = true;
        syncState.totalRecordsSynced += result.totalRows;

        log(`✅ Carga semilla completada. Registros copiados: ${result.totalRows}, eliminados en la nube: ${result.pruned}`);
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
 * Sincronización Incremental:
 * 1. Sin sincronización previa con esta base remota (o con carga completa pendiente) → carga semilla protegida.
 * 2. Lee `sync_cambios` desde el último cursor. Sin cambios (y sin verificación diaria pendiente) → 0 llamadas de red.
 * 3. Sube el estado actual de los registros modificados (alta/edición → INSERT OR REPLACE; ya no existe → DELETE).
 * 4. Verifica las tablas tocadas (todas, una vez al día) y repara diferencias.
 */
export async function syncIncremental() {
    if (!tursoClient) return { success: false, reason: 'unconfigured' };
    if (syncState.inProgress) return { success: false, reason: 'already_running' };

    if (!getLastSync()) {
        return await seedDatabase();
    }

    const syncStartTime = new Date().toISOString();
    const verifyAll = verificacionCompletaPendiente();
    syncState.inProgress = true;
    syncState.lastError = null;
    let result;

    try {
        const instanciaId = getOrCreateInstanciaId(sqlite);
        result = await incrementalRemote(sqlite, tursoClient, {
            instanciaId,
            timestamp: syncStartTime,
            verifyAll,
            log
        });

        if (!result.needsSeed) {
            saveLastSync(syncStartTime);
            registrarVerificacion(result.verificacion, syncStartTime, verifyAll);
            syncState.lastSyncSuccess = true;
            syncState.totalRecordsSynced += result.syncedCount || 0;
            if (result.syncedCount) {
                log(`Sincronización incremental exitosa (${result.upserted} subidos, ${result.deleted} eliminados)`);
            }
            return result;
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
        syncState.inProgress = false;
    }

    // La nube no corresponde a esta base o faltaba el registro de cambios: carga semilla protegida
    const motivos = {
        remote_identity: 'La nube no corresponde a esta base local',
        remote_columns: 'La nube tiene columnas que esta base no tiene',
        tracking_installed: 'Registro de cambios recién activado'
    };
    log(`${motivos[result.reason] || result.reason} — se ejecuta carga semilla protegida`);
    setLocalState(sqlite, 'requiere_carga_completa', '1');
    return await seedDatabase();
}

// ── Restauración desde la nube ────────────────────────────────────────────────

/**
 * Resumen de la copia en la nube (fecha, identidad, registros por tabla) junto a los registros
 * de la base local, para que el administrador confirme la restauración.
 */
export async function describeCloudCopy() {
    if (!tursoClient) throw new Error('El cliente de Turso no está configurado');
    const copia = await describeRemoteCopy(tursoClient);
    const local = Object.fromEntries(GUARD_TABLES.map(t => {
        try {
            return [t, Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n)];
        } catch (_) {
            return [t, 0];
        }
    }));
    return {
        disponible: copia.disponible,
        lastSyncNube: copia.meta.last_sync || null,
        mismaBase: Boolean(copia.meta.instancia_id) && copia.meta.instancia_id === getOrCreateInstanciaId(sqlite),
        tablas: copia.tablas,
        comparacion: GUARD_TABLES.map(t => ({
            tabla: t,
            nube: copia.tablas.find(x => x.tabla === t)?.nube ?? 0,
            local: local[t]
        }))
    };
}

/**
 * Construye en un archivo NUEVO (carpeta `restauraciones` junto a la base) una base con el esquema
 * de esta versión y los datos de la nube, y la valida. No toca la base en uso: el reemplazo lo hace
 * la app de escritorio al reiniciar (la conexión de la API debe estar cerrada).
 * @returns {Promise<Object>} resumen de restoreRemoteInto + { archivo }
 */
export async function prepareRestore() {
    if (!tursoClient) throw new Error('El cliente de Turso no está configurado');
    if (syncState.inProgress) throw new Error('Una sincronización ya se encuentra en progreso');

    syncState.inProgress = true;
    const dbDir = path.dirname(process.env.DB_PATH || sqlite.name);
    const dir = path.join(dbDir, 'restauraciones');
    fs.mkdirSync(dir, { recursive: true });
    const archivo = path.join(dir, `nube-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    log(`⬇️ Preparando restauración desde la nube en ${archivo}`);

    let target;
    try {
        target = new Database(archivo);
        target.pragma('journal_mode = DELETE'); // archivo único, listo para copiarse
        customMigrate(target, MIGRATIONS_FOLDER, () => {});
        const result = await restoreRemoteInto(target, tursoClient, { log });
        target.close();
        target = null;
        log(`✅ Copia de la nube preparada y verificada (${result.totalRegistros} registros)`);
        return { ...result, archivo };
    } catch (error) {
        if (target) {
            try { target.close(); } catch (_) {}
        }
        fs.rmSync(archivo, { force: true });
        console.error('[TursoSync] ❌ Error preparando la restauración:', error);
        throw error;
    } finally {
        syncState.inProgress = false;
    }
}

export default {
    testConnection,
    configure,
    getStatus,
    seedDatabase,
    syncIncremental,
    describeCloudCopy,
    prepareRestore
};
