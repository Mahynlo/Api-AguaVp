/**
 * Rutas de Sincronización Turso Cloud
 * File: src/v2/routes/sync.js
 *
 * Acceso: la app de escritorio (header x-aguavp-internal-key con el secreto SECRET_APP_KEY
 * que ella misma genera y entrega a la API al arrancar) o un usuario con rol administrador/superadmin.
 */

import express from 'express';
import crypto from 'crypto';
import * as syncController from '../controllers/syncController.js';
import authMiddleware, { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

function hasInternalKey(req) {
    const provided = req.get('x-aguavp-internal-key');
    const expected = process.env.SECRET_APP_KEY;
    if (!provided || !expected) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const requireAdminRole = authorize(['administrador', 'superadmin']);

function requireSyncAccess(req, res, next) {
    if (hasInternalKey(req)) return next();
    return authMiddleware(req, res, () => requireAdminRole(req, res, next));
}

router.use(requireSyncAccess);

// Estado actual
router.get('/status', syncController.getStatus);

// Probar conexión
router.post('/test', syncController.testConnection);

// Configurar credenciales en caliente
router.post('/configure', syncController.configure);

// Carga inicial semilla ({ force: true } para reemplazar la nube pese a un conflicto)
router.post('/seed', syncController.runSeed);

// Sincronizar ahora
router.post('/now', syncController.syncNow);

export default router;
