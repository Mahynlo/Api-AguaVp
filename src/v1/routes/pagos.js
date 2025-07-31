const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const appKeyMiddleware = require('../middlewares/appKeyMiddleware');
const pagosController = require('../controllers/pagosController');
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

router.post('/registrar', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, pagosController.registrarPago);
router.get('/listar', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, pagosController.obtenerPagos);
router.get('/listar/:id', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, pagosController.obtenerPagos);
router.put('/modificar/:id', appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, pagosController.modificarPago);


module.exports = router;
