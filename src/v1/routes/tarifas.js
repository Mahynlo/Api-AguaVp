//file: src/routes/tarifas.js
const express = require("express");
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const tarifasController = require("../controllers/tarifasController");
const appKeyMiddleware = require('../middlewares/appKeyMiddleware');
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

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

module.exports = router;
