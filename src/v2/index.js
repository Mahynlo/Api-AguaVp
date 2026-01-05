/**
 * Router de la API v2
 * 
 * File: src/v2/index.js
 * 
 * Descripción:
 * - Router principal para la versión 2 de la API
 * - Migración de WebSockets a Server-Sent Events (SSE)
 * - Migración de SQLite3 a Turso (@libsql/client)
 * - Mantiene compatibilidad con los controladores y middlewares de v1
 * 
 * Cambios en v2:
 * - WebSockets → Server-Sent Events (SSE)
 * - SQLite3 → Turso Database
 * - Nuevos endpoints para eventos en tiempo real
 * 
 * Endpoints disponibles:
 * - /api/v2/auth - Autenticación
 * - /api/v2/clientes - Gestión de clientes
 * - /api/v2/medidores - Gestión de medidores
 * - /api/v2/lecturas - Gestión de lecturas
 * - /api/v2/facturas - Gestión de facturas
 * - /api/v2/pagos - Gestión de pagos
 * - /api/v2/tarifas - Gestión de tarifas
 * - /api/v2/rutas - Gestión de rutas
 * - /api/v2/app - Rutas específicas de la aplicación
 * - /api/v2/events - Server-Sent Events (SSE)
 */

import express from 'express';
import { getVersionInfo } from '../config/versions.js';

// Importar rutas v2
import appRoutes from './routes/appRoutes.js';
import authRoutes from './routes/authroutes.js';
import clientesRoutes from './routes/clientes.js';
import medidoresRoutes from './routes/medidores.js';
import tarifasRoutes from './routes/tarifas.js';
import lecturasRoutes from './routes/lecturas.js';
import facturasRoutes from './routes/facturas.js';
import pagosRoutes from './routes/pagos.js';
import rutasRoutes from './routes/rutas.js';
import eventsRoutes from './routes/events.js'; // Nueva ruta para SSE
import dashboardRoutes from './routes/dashboard.js'; // Nueva ruta para Dashboard
import reportsRoutes from './routes/reports.js'; // Nueva ruta para Reportes
import deudoresRoutes from './routes/deudores.js'; // Nueva ruta para Deudores

const router = express.Router();

// Ruta principal de la versión v2
router.get('/', (req, res) => {
  try {
    const versionInfo = getVersionInfo('v2');

    res.json({
      version: 'v2',
      message: 'API de Agua Potable - Versión 2.0 🚰 (SSE + Turso)',
      info: versionInfo,
      endpoints: {
        auth: '/api/v2/auth',
        clientes: '/api/v2/clientes',
        medidores: '/api/v2/medidores',
        lecturas: '/api/v2/lecturas',
        facturas: '/api/v2/facturas',
        pagos: '/api/v2/pagos',
        tarifas: '/api/v2/tarifas',
        rutas: '/api/v2/rutas',
        app: '/api/v2/app',
        events: '/api/v2/events', // Nuevo endpoint SSE
        dashboard: '/api/v2/dashboard', // Nuevo endpoint Dashboard
        reports: '/api/v2/reports', // Nuevo endpoint Reportes
        deudores: '/api/v2/deudores' // Nuevo endpoint Deudores
      },
      documentation: '/api-docs',
      health: '/api/health',
      changes: {
        'websockets': 'Reemplazados por Server-Sent Events (SSE)',
        'database': 'Migrado de SQLite3 a Turso (@libsql/client)',
        'realtime': 'Notificaciones en tiempo real via SSE'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al obtener información de la versión',
      message: error.message,
      version: 'v2'
    });
  }
});

// Rutas agrupadas de la v2
router.use('/app', appRoutes);           // Rutas específicas de la app
router.use('/auth', authRoutes);         // Autenticación
router.use('/clientes', clientesRoutes); // Clientes
router.use('/medidores', medidoresRoutes); // Medidores
router.use('/tarifas', tarifasRoutes);   // Tarifas
router.use('/lecturas', lecturasRoutes); // Lecturas
router.use('/facturas', facturasRoutes); // Facturas
router.use('/pagos', pagosRoutes);       // Pagos
router.use('/rutas', rutasRoutes);       // Rutas de medidores
router.use('/events', eventsRoutes);     // Nuevo: Server-Sent Events
router.use('/dashboard', dashboardRoutes); // Nuevo: Dashboard
router.use('/reports', reportsRoutes);     // Nuevo: Reportes
router.use('/deudores', deudoresRoutes);     // Nuevo: Deudores

// Exporta el router de la v2
export default router;
