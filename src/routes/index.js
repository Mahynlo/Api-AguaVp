/**
 * Router Principal Versionado
 * 
 * File: src/routes/index.js
 */

const express = require('express');
const router = express.Router();
const { getVersionsInfo, getCurrentVersion } = require('../config/versions');

// Importar rutas
const v1Routes = require('../v1');
const healthRoutes = require('../v1/routes/health');

// Health Check (sin versión para compatibilidad)
router.use('/health', healthRoutes);

// Versión 1 de la API
router.use('/v1', v1Routes);

// Información de versiones
router.get('/versions', (req, res) => {
  try {
    const versionsInfo = getVersionsInfo();
    res.json({
      message: 'Información de versiones de la API',
      ...versionsInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al obtener información de versiones',
      message: error.message
    });
  }
});

// Ruta raíz
router.get('/', (req, res) => {
  try {
    const currentVersion = getCurrentVersion();
    res.json({ 
      message: 'API de Agua Potable - Versiones Disponibles 🚰',
      current_version: currentVersion,
      versions: getVersionsInfo(),
      endpoints: {
        [currentVersion]: `/api/${currentVersion}`,
        health: '/api/health',
        versions: '/api/versions',
        documentation: '/api-docs'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error en el router principal',
      message: error.message
    });
  }
});

module.exports = router;

