/**
 * Health Check Controller
 * 
 * File: src/controllers/healthController.js
 * 
 * Descripción:
 * - Controlador para verificar la salud de la API
 * - Verifica el estado de la base de datos, memoria, tiempo de respuesta
 * 
 * Funciones:
 * - checkHealth: Verificación completa de la salud del sistema
 * - checkDatabase: Verificación específica de la base de datos
 * - getSystemInfo: Información del sistema
 */

import dbTurso from '../../database/db-sqlite.js';
import os from 'os';
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

/**
 * Health Check completo de la API
 * ⚠️ PROTEGIDO: Requiere API Key + JWT Token
 * Devuelve información sensible del sistema
 */
const checkHealth = async (req, res) => {
  const startTime = Date.now();

  try {
    // Verificar base de datos (Turso)
    await dbTurso.execute("SELECT 1");
    const responseTime = Date.now() - startTime;

    // Obtener estadísticas de WebSocket si están disponibles
    const wsStats = req.app.get('io') ? req.app.get('io').getConnectionStats() : null;

    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version || '1.0.0',
      services: {
        api: 'UP',
        database: 'UP',
        websocket: wsStats ? 'UP' : 'DOWN'
      },
      websocket: wsStats,
      system: getSystemInfo()
    });

  } catch (err) {
    const responseTime = Date.now() - startTime;
    const wsStats = req.app.get('io') ? req.app.get('io').getConnectionStats() : null;

    return res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        api: 'UP',
        database: 'DOWN',
        websocket: wsStats ? 'UP' : 'DOWN'
      },
      websocket: wsStats,
      error: {
        database: err.message
      },
      system: getSystemInfo()
    });
  }
};

/**
 * Health Check simple - solo verifica que la API responda
 * 🌐 PÚBLICO: No requiere autenticación
 * Solo devuelve información básica y segura
 */
const checkSimpleHealth = (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'API funcionando correctamente 🚰'
  });
};

/**
 * Verificación específica de la base de datos
 * ⚠️ PROTEGIDO: Requiere API Key + JWT Token
 * Devuelve información sobre estructura de BD
 */
const checkDatabase = async (req, res) => {
  const startTime = Date.now();

  try {
    // Verificar conexión básica
    await dbTurso.execute("SELECT 1 as test");

    // Verificar que las tablas principales existan
    // Nota: sqlite_master es compatible en Turso/LibSQL
    const tablesResult = await dbTurso.execute({
      sql: `SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name IN ('clientes', 'medidores', 'lecturas', 'facturas', 'pagos', 'usuarios')`,
      args: []
    });

    const tables = tablesResult.rows;
    const responseTime = Date.now() - startTime;

    res.status(200).json({
      status: 'OK',
      service: 'database',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      tables: tables.map(t => t.name),
      tablesCount: tables.length
    });

  } catch (err) {
    const responseTime = Date.now() - startTime;
    return res.status(503).json({
      status: 'ERROR',
      service: 'database',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      error: err.message
    });
  }
};

/**
 * Información del sistema
 */
const getSystemInfo = () => {
  const memUsage = process.memoryUsage();

  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    uptime: `${Math.floor(process.uptime())}s`,
    memory: {
      used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      system: `${Math.round(os.totalmem() / 1024 / 1024)}MB`
    },
    cpu: {
      model: os.cpus()[0].model,
      cores: os.cpus().length
    },
    loadAverage: os.loadavg()
  };
};

/**
 * Información detallada del sistema
 * ⚠️ PROTEGIDO: Requiere API Key + JWT Token
 * Devuelve información sensible del servidor
 */
const getSystemDetails = (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    system: getSystemInfo(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000,
      pid: process.pid
    }
  });
};

export default {
  checkHealth,
  checkSimpleHealth,
  checkDatabase,
  getSystemDetails,

  // Middleware de WebSocket para todas las operaciones de health
  withWebSocket: ControllerIntegration.withWebSocket
};
