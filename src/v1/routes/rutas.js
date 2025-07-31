// file: src/routes/rutas.js
const express = require("express");
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const appKeyMiddleware = require('../middlewares/appKeyMiddleware');
const rutasController = require("../controllers/rutasController");
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

// Crear nueva ruta
router.post("/crear", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, rutasController.crearRuta);

// Agregar medidor a una ruta
router.post("/agregar-medidor", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, rutasController.agregarMedidorARuta);

// Obtener medidores de una ruta
router.get("/:ruta_id/medidores", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, rutasController.obtenerRutaConMedidores);

// Listar todas las rutas
router.get("/listar/", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, rutasController.listarRutas);


module.exports = router;
