/**
 * Controlador de Sincronización Turso Cloud
 * File: src/v2/controllers/syncController.js
 */

import * as syncService from '../services/tursoSyncService.js';

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
        const result = await syncService.seedDatabase();
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

export default {
    getStatus,
    testConnection,
    configure,
    runSeed,
    syncNow
};
