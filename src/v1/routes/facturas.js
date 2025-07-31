const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const appKeyMiddleware = require('../middlewares/appKeyMiddleware');
const facturasController = require('../controllers/facturasController');
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

router.post('/generar', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, facturasController.generarFactura);
router.get('/listar', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, facturasController.obtenerFacturas);
router.get('/listar/:id', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, facturasController.obtenerFacturas);
router.put('/modificar/:id', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, facturasController.modificarFactura);

module.exports = router;

