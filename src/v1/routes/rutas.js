// file: src/routes/rutas.js
import express from "express";
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import rutasController from "../controllers/rutasController.js";
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

const router = express.Router();

// Crear nueva ruta
router.post("/crear", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, rutasController.crearRuta);

// Agregar medidor a una ruta
router.post("/agregar-medidor", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, rutasController.agregarMedidorARuta);

// Obtener medidores de una ruta
router.get("/:ruta_id/medidores", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, rutasController.obtenerRutaConMedidores);

// Listar todas las rutas
router.get("/listar/", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, rutasController.listarRutas);

export default router;
