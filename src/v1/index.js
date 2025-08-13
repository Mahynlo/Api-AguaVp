/**
 * Router de la API v1
 * 
 * File: src/v1/index.js
 * 
 * Descripción:
 * - Router principal para la versión 1 de la API
 * - Agrupa todas las rutas de la versión v1
 * - Mantiene compatibilidad con la estructura anterior
 * 
 * Endpoints disponibles:
 * - /api/v1/auth - Autenticación
 * - /api/v1/clientes - Gestión de clientes
 * - /api/v1/medidores - Gestión de medidores
 * - /api/v1/lecturas - Gestión de lecturas
 * - /api/v1/facturas - Gestión de facturas
 * - /api/v1/pagos - Gestión de pagos
 * - /api/v1/tarifas - Gestión de tarifas
 * - /api/v1/rutas - Gestión de rutas
 * - /api/v1/app - Rutas específicas de la aplicación
 */

import express from 'express';
import { getVersionInfo } from '../config/versions.js';

// Importar rutas
import appRoutes from './routes/appRoutes.js';
import authRoutes from './routes/authroutes.js';
import clientesRoutes from './routes/clientes.js';
import medidoresRoutes from './routes/medidores.js';
import tarifasRoutes from './routes/tarifas.js';
import lecturasRoutes from './routes/lecturas.js';
import facturasRoutes from './routes/facturas.js';
import pagosRoutes from './routes/pagos.js';
import rutasRoutes from './routes/rutas.js';

const router = express.Router();

// Ruta principal de la versión v1
router.get('/', (req, res) => {
  try {
    const versionInfo = getVersionInfo('v1');
    
    res.json({ 
      version: 'v1',
      message: 'API de Agua Potable - Versión 1.0 🚰',
      info: versionInfo,
      endpoints: {
        auth: '/api/v1/auth',
        clientes: '/api/v1/clientes',
        medidores: '/api/v1/medidores',
        lecturas: '/api/v1/lecturas',
        facturas: '/api/v1/facturas',
        pagos: '/api/v1/pagos',
        tarifas: '/api/v1/tarifas',
        rutas: '/api/v1/rutas',
        app: '/api/v1/app'
      },
      documentation: '/api-docs',
      health: '/api/health',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Error al obtener información de la versión',
      message: error.message,
      version: 'v1'
    });
  }
});

// Rutas agrupadas de la v1
router.use('/app', appRoutes);           // Rutas específicas de la app
router.use('/auth', authRoutes);         // Autenticación
router.use('/clientes', clientesRoutes);       // Clientes
router.use('/medidores', medidoresRoutes);     // Medidores
router.use('/tarifas', tarifasRoutes);         // Tarifas
router.use('/lecturas', lecturasRoutes);       // Lecturas
router.use('/facturas', facturasRoutes);       // Facturas
router.use('/pagos', pagosRoutes);             // Pagos
router.use('/rutas', rutasRoutes);             // Rutas de medidores

// Exporta el router de la v1
export default router;
