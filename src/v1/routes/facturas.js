import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import facturasController from '../controllers/facturasController.js';
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

const router = express.Router();

router.post('/generar', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, facturasController.generarFactura);
router.get('/listar', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, facturasController.obtenerFacturas);
router.get('/listar/:id', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, facturasController.obtenerFacturas);
router.put('/modificar/:id', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, facturasController.modificarFactura);

export default router;

