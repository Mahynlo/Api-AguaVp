//file: src/routes/lecturas.js
import express from "express";
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import lecturasController from "../controllers/lecturasController.js";
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Lecturas
 *   description: Rutas de lecturas
 */

router.post("/registrar", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, lecturasController.registrarLectura);
router.get("/listar", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, lecturasController.obtenerLecturas);
router.get("/listar/:id", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, lecturasController.obtenerLecturas);
router.put("/modificar/:id", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, lecturasController.modificarLectura);

// Obtener lecturas por ruta y periodo (via query params: ?ruta_id=1&periodo=2025-06)
router.get("/por-ruta", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, lecturasController.obtenerLecturasPorRutaYPeriodo);

// 🧾 Generar facturas para lecturas sin factura (procesamiento masivo)
router.post("/generar-facturas-masivo", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, lecturasController.generarFacturasParaLecturasSinFactura);

export default router;

