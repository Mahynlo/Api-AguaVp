/**
 * Rutas de Sincronización Turso Cloud
 * File: src/v2/routes/sync.js
 */

import express from 'express';
import * as syncController from '../controllers/syncController.js';

const router = express.Router();

// Estado actual
router.get('/status', syncController.getStatus);

// Probar conexión
router.post('/test', syncController.testConnection);

// Configurar credenciales en caliente
router.post('/configure', syncController.configure);

// Carga inicial semilla
router.post('/seed', syncController.runSeed);

// Sincronizar ahora
router.post('/now', syncController.syncNow);

export default router;
