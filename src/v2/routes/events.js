/**
 * Rutas para Server-Sent Events (SSE)
 * 
 * File: src/v2/routes/events.js
 * 
 * Descripción:
 * - Endpoints para conexiones SSE
 * - Reemplaza las conexiones WebSocket de v1
 * - Mantiene compatibilidad con eventos existentes
 * 
 * Endpoints:
 * - GET /api/v2/events/stream - Conexión SSE principal
 * - GET /api/v2/events/health - Health check de SSE
 * - GET /api/v2/events/stats - Estadísticas de conexiones y eventos
 * - POST /api/v2/events/notify - Envío manual de notificaciones (admin)
 */

import express from 'express';
import SSEManager from '../sse/sseManager.js';
import SSENotificationManager from '../sse/notificationManager.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

// Los managers se configurarán desde el app
let sseManager = null;
let notificationManager = null;

// Middleware para configurar managers desde el app
const configureManagers = (req, res, next) => {
    if (!sseManager) {
        sseManager = req.app.get('sseManager');
        notificationManager = req.app.get('notificationManager');
    }
    next();
};

/**
 * @swagger
 * /api/v2/events/stream:
 *   get:
 *     tags: [Events SSE]
 *     summary: Establecer conexión Server-Sent Events
 *     description: Establece una conexión SSE para recibir notificaciones en tiempo real
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Token JWT para autenticación (opcional)
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Bearer token para autenticación (opcional)
 *     responses:
 *       200:
 *         description: Conexión SSE establecida
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 event: welcome
 *                 data: {"type":"welcome","data":{"message":"Conectado a API Agua-VP v2 (SSE)","connectionId":"user123","timestamp":"2025-08-16T10:00:00.000Z","serverStatus":"OK"}}
 *       
 *       500:
 *         description: Error al establecer conexión SSE
 */
router.get('/stream', configureManagers, (req, res) => {
  if (!sseManager) {
    return res.status(500).json({ error: 'SSE Manager no disponible' });
  }
  
  const connectionId = sseManager.createConnection(req, res);
  
  // La conexión se mantiene abierta automáticamente
  // Los eventos se envían a través del SSEManager
});

/**
 * @swagger
 * /api/v2/events/health:
 *   get:
 *     tags: [Events SSE]
 *     summary: Health check del sistema SSE
 *     description: Verifica el estado del sistema de Server-Sent Events
 *     responses:
 *       200:
 *         description: Estado del sistema SSE
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 type:
 *                   type: string
 *                   example: SSE
 *                 connections:
 *                   type: number
 *                   example: 5
 *                 uptime:
 *                   type: number
 *                   example: 3600
 *                 timestamp:
 *                   type: string
 *                   example: "2025-08-16T10:00:00.000Z"
 */
router.get('/health', configureManagers, (req, res) => {
  if (!sseManager) {
    return res.status(500).json({ error: 'SSE Manager no disponible' });
  }
  
  const healthData = sseManager.healthCheck();
  res.json(healthData);
});

/**
 * @swagger
 * /api/v2/events/stats:
 *   get:
 *     tags: [Events SSE]
 *     summary: Estadísticas del sistema SSE
 *     description: Obtiene estadísticas detalladas de conexiones y eventos SSE
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas del sistema SSE
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connections:
 *                   type: object
 *                 events:
 *                   type: object
 *                 notifications:
 *                   type: object
 *       401:
 *         description: No autorizado
 */
router.get('/stats', configureManagers, authMiddleware, (req, res) => {
  try {
    if (!sseManager || !notificationManager) {
      return res.status(500).json({ error: 'SSE Managers no disponibles' });
    }
    
    const stats = {
      connections: sseManager.getConnectionStats(),
      events: sseManager.getEventStats(),
      notifications: notificationManager.getEstadisticas(),
      timestamp: new Date().toISOString()
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Error al obtener estadísticas SSE',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/v2/events/notify:
 *   post:
 *     tags: [Events SSE]
 *     summary: Enviar notificación manual
 *     description: Permite a administradores enviar notificaciones manuales via SSE
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo
 *               - mensaje
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [info, warning, error, success, maintenance]
 *                 example: info
 *               mensaje:
 *                 type: string
 *                 example: "Mantenimiento programado a las 2:00 AM"
 *               datos:
 *                 type: object
 *                 example: {"duracion": "2 horas"}
 *               solo_autenticados:
 *                 type: boolean
 *                 default: false
 *                 example: true
 *     responses:
 *       200:
 *         description: Notificación enviada exitosamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Sin permisos de administrador
 */
router.post('/notify', configureManagers, authMiddleware, (req, res) => {
  try {
    if (!notificationManager) {
      return res.status(500).json({ error: 'Notification Manager no disponible' });
    }
    
    const { tipo, mensaje, datos = {}, solo_autenticados = false } = req.body;
    
    if (!tipo || !mensaje) {
      return res.status(400).json({
        error: 'Tipo y mensaje son obligatorios'
      });
    }

    // Verificar permisos de administrador (opcional)
    // if (req.usuario.rol !== 'admin') {
    //   return res.status(403).json({
    //     error: 'Se requieren permisos de administrador'
    //   });
    // }

    let result;
    
    switch (tipo) {
      case 'maintenance':
        result = notificationManager.mantenimientoSistema('manual', mensaje, datos.duracion);
        break;
      case 'alert':
        result = notificationManager.alertaSistema(mensaje, datos.nivel || 'info', datos);
        break;
      default:
        result = notificationManager.notificacionPersonalizada(
          `manual_${tipo}`,
          { mensaje, ...datos },
          solo_autenticados
        );
    }

    res.json({
      message: 'Notificación enviada exitosamente',
      tipo,
      destinatarios: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error al enviar notificación',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/v2/events/test:
 *   post:
 *     tags: [Events SSE]
 *     summary: Probar conexión SSE
 *     description: Envía un evento de prueba a todas las conexiones SSE activas
 *     responses:
 *       200:
 *         description: Evento de prueba enviado
 */
router.post('/test', configureManagers, (req, res) => {
  try {
    if (!sseManager) {
      return res.status(500).json({ error: 'SSE Manager no disponible' });
    }
    
    const result = sseManager.broadcast('test_event', {
      message: 'Este es un evento de prueba',
      timestamp: new Date().toISOString(),
      sender: 'API Test'
    });

    res.json({
      message: 'Evento de prueba enviado',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al enviar evento de prueba',
      message: error.message
    });
  }
});

export default router;
