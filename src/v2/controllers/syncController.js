/**
 * Controlador de Sincronización Turso Cloud
 * File: src/v2/controllers/syncController.js
 */

import * as syncService from '../services/tursoSyncService.js';

/**
 * Respuesta cuando la carga semilla se bloquea para proteger la copia en la nube.
 * La app muestra los motivos y ofrece un reemplazo forzado ({ force: true } en /seed).
 */
function conflictResponse(result) {
    return {
        success: false,
        conflict: true,
        error: 'Sincronización bloqueada para proteger la copia en la nube',
        motivos: result.motivos,
        comparacion: result.comparacion
    };
}

/**
 * Obtener estado de la sincronización
 */
export async function getStatus(req, res) {
    try {
        const status = syncService.getStatus();
        res.json({
            success: true,
            status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Probar conexión con credenciales
 */
export async function testConnection(req, res) {
    const { tursoUrl, tursoToken } = req.body;

    if (!tursoUrl || !tursoToken) {
        return res.status(400).json({
            success: false,
            error: 'Debe proporcionar tursoUrl y tursoToken'
        });
    }

    try {
        const result = await syncService.testConnection(tursoUrl, tursoToken);
        res.json({
            success: true,
            message: 'Conexión con Turso Cloud exitosa',
            latencyMs: result.latencyMs
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Actualizar configuración dinámica en caliente
 */
export async function configure(req, res) {
    const { tursoUrl, tursoToken, autoSync, syncIntervalMs } = req.body;

    try {
        const status = syncService.configure({
            tursoUrl,
            tursoToken,
            autoSync,
            syncIntervalMs
        });

        res.json({
            success: true,
            message: 'Configuración de sincronización actualizada',
            status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Ejecutar carga semilla completa inicial
 */
export async function runSeed(req, res) {
    try {
        const force = req.body?.force === true;
        const result = await syncService.seedDatabase({ force });
        if (result?.conflict) {
            return res.status(409).json(conflictResponse(result));
        }
        res.json({
            success: true,
            message: 'Carga semilla inicial completada',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Forzar sincronización inmediata
 */
export async function syncNow(req, res) {
    try {
        const result = await syncService.syncIncremental();
        if (result?.conflict) {
            return res.status(409).json(conflictResponse(result));
        }
        res.json({
            success: true,
            message: 'Sincronización completada',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Resumen de la copia en la nube para confirmar una restauración
 */
export async function restorePreview(req, res) {
    try {
        const data = await syncService.describeCloudCopy();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Construye y valida una base restaurada desde la nube (no reemplaza la base en uso)
 */
export async function restorePrepare(req, res) {
    try {
        const data = await syncService.prepareRestore();
        res.json({ success: true, message: 'Copia de la nube preparada y verificada', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export default {
    getStatus,
    testConnection,
    configure,
    runSeed,
    syncNow,
    restorePreview,
    restorePrepare
};
