//file: src/routes/tarifas.js
import express from "express";
import authMiddleware from '../middlewares/authMiddleware.js';
import tarifasController from "../controllers/tarifasController.js";
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tarifas
 *   description: Rutas de tarifas
*/

router.post("/registrar", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, tarifasController.registrarTarifa);
router.post("/registrar-rangos", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, tarifasController.registrarRangosTarifa);

router.get("/listar", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, tarifasController.obtenerTodasLasTarifas);
router.get("/listarHistorico", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, tarifasController.obtenerHistorialTarifas);

router.put("/modificar/:id", appKeyMiddleware, authMiddleware, tarifasController.modificarTarifa);
router.put("/modificar-rangos/:id", appKeyMiddleware, authMiddleware, tarifasController.modificarRangosTarifa);

export default router;
