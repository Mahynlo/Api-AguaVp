const express = require('express');
const router = express.Router();
const { getVersionsInfo, getCurrentVersion } = require('../config/versions');
const v1Routes = require('../v1');
const healthRoutes = require('../v1/routes/health');

router.use('/health', healthRoutes);
router.use('/v1', v1Routes);

router.get('/versions', (req, res) => {
  const versionsInfo = getVersionsInfo();
  res.json({
    message: 'Información de versiones de la API',
    ...versionsInfo,
    timestamp: new Date().toISOString()
  });
});

router.get('/', (req, res) => {
  const currentVersion = getCurrentVersion();
  res.json({ 
    message: 'API de Agua Potable - Versiones Disponibles 🚰',
    current_version: currentVersion,
    versions: getVersionsInfo(),
    endpoints: {
      [currentVersion]: `/api/${currentVersion}`,
      health: '/api/health',
      versions: '/api/versions'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
