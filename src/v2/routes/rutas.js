/**
 * Rutas de /api/v2/rutas
 *
 * Rutas de lectura: alta, consulta y modificación, medidores asignados, orden y progreso de captura.
 * Lógica: controllers/rutasController.js → services/rutasService.js
 * Documentación Swagger: openapi/rutas.js
 */

import express from 'express';
import authMiddleware, { requirePermission } from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import rutasController, { setSSEManagers } from '../controllers/rutasController.js';

const router = express.Router();

// Configurar managers SSE al cargar el módulo
let sseManagerConfigured = false;
const configureSSE = (req, res, next) => {
    if (!sseManagerConfigured && req.app) {
        const sseManager = req.app.get('sseManager');
        const notificationManager = req.app.get('notificationManager');
        
        if (sseManager && notificationManager) {
            setSSEManagers(sseManager, notificationManager);
            sseManagerConfigured = true;
        }
    }
    next();
};

router.post("/crear", appKeyMiddleware, configureSSE, authMiddleware, requirePermission('rutas.crear'), rutasController.crearRuta);
router.post("/agregar-medidor", appKeyMiddleware, configureSSE, authMiddleware, rutasController.agregarMedidorARuta);
router.get("/:ruta_id/medidores", appKeyMiddleware, configureSSE, authMiddleware, rutasController.obtenerRutaConMedidores);
router.get("/listar/", appKeyMiddleware, configureSSE, authMiddleware, rutasController.listarRutas);

// Modificar información de una ruta
router.put("/:ruta_id", appKeyMiddleware, configureSSE, authMiddleware, requirePermission('rutas.modificar'), rutasController.modificarRuta);

// Eliminar medidor de una ruta (con reordenamiento automático)
router.delete("/:ruta_id/medidores/:medidor_id", appKeyMiddleware, configureSSE, authMiddleware, requirePermission('rutas.modificar'), rutasController.eliminarMedidorDeRuta);

// Reordenar medidores en una ruta
router.put("/:ruta_id/reordenar", appKeyMiddleware, configureSSE, authMiddleware, requirePermission('rutas.modificar'), rutasController.reordenarMedidores);

// Obtener progreso de captura/estadísticas de una ruta
router.get("/:ruta_id/progreso", appKeyMiddleware, configureSSE, authMiddleware, rutasController.obtenerProgresoCapturaRuta);

export default router;
