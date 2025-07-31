// File: src/routes/index.js
const express = require('express');
const router = express.Router();

// Ruta principal - status de la API
router.get('/', (req, res) => {
  res.json({ mensaje: 'API de Agua Potable funcionando 🚰' });
});

// Health Check Routes (públicas, sin autenticación)
router.use('/health', require('./health'));             // Health Check endpoints

// Rutas agrupadas
router.use('/app', require('./appRoutes'));             // Rutas específicas de la app
router.use('/auth', require('./authroutes'));           // Autenticación
router.use('/clientes', require('./clientes'));         // Clientes
router.use('/medidores', require('./medidores'));       // Medidores
router.use('/tarifas', require('./tarifas'));           // Tarifas
router.use('/lecturas', require('./lecturas'));         // Lecturas
router.use('/facturas', require('./facturas'));         // Facturas
router.use('/pagos', require('./pagos'));               // Pagos
router.use('/rutas', require('./rutas'));             // Rutas de medidores


// Exporta el router principal
module.exports = router;

