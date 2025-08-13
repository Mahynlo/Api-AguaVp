import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import pagosController from '../controllers/pagosController.js';
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

const router = express.Router();

router.post('/registrar', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, pagosController.registrarPago);
router.get('/listar', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, pagosController.obtenerPagos);
router.get('/listar/:id', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, pagosController.obtenerPagos);
router.put('/modificar/:id', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, pagosController.modificarPago);

export default router;
