/**
 * Router Principal Versionado
 * 
 * File: src/routes/index.js
 */

import express from 'express';
import { getVersionsInfo, getCurrentVersion } from '../config/versions.js';

// Importar rutas
// import v1Routes from '../v1/index.js'; // DESACTIVADO TEMPORALMENTE
import v2Routes from '../v2/index.js'; // Nueva v2
import healthRoutes from '../v1/routes/health.js';

const router = express.Router();

// Health Check (sin versión para compatibilidad)
router.use('/health', healthRoutes);

// Versión 1 de la API - DESACTIVADA TEMPORALMENTE
// router.use('/v1', v1Routes);

// Ruta de información para v1 desactivada
router.use('/v1', (req, res) => {
  res.status(503).json({
    error: "API v1 temporalmente desactivada",
    message: "La versión 1 de la API está temporalmente desactivada. Por favor, use la versión 2.",
    current_version: "v2",
    migration_guide: {
      base_url: "/api/v2",
      changes: [
        "WebSockets → Server-Sent Events (SSE)",
        "SQLite3 → Turso Database", 
        "Headers: x-app-key: AppKey <token>",
        "SSE endpoint: /api/v2/events/stream"
      ]
    },
    timestamp: new Date().toISOString()
  });
});

// Versión 2 de la API - Nueva
router.use('/v2', v2Routes);

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
        'v1': '/api/v1',
        'v2': '/api/v2', // Nueva v2
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

export default router;

