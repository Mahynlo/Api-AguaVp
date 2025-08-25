/**
 * SSE Manager - Sistema de Server-Sent Events
 * 
 * File: src/v2/sse/sseManager.js
 * 
 * Descripción:
 * - Gestiona las conexiones de Server-Sent Events (SSE)
 * - Reemplaza el sistema de WebSockets de la v1
 * - Mantiene compatibilidad con los eventos de la v1
 * 
 * Funcionalidades:
 * - Gestión de conexiones SSE
 * - Autenticación de usuarios
 * - Notificaciones en tiempo real
 * - Estadísticas de conexión
 * - Manejo de eventos del sistema
 */

import jwt from 'jsonwebtoken';

class SSEManager {
  constructor() {
    this.connections = new Map(); // userId -> { res, lastActivity, userInfo }
    this.connectionStats = {
      totalConnections: 0,
      currentConnections: 0,
      lastConnection: null,
      lastDisconnection: null
    };
    this.eventStats = {
      totalEvents: 0,
      eventsByType: new Map(),
      lastEventTime: null
    };
    
    // Limpiar conexiones inactivas cada 30 segundos
    setInterval(() => this.cleanupInactiveConnections(), 30000);
  }

  /**
   * Crear una nueva conexión SSE
   */
  createConnection(req, res) {
    try {
      // Configurar headers para SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Autenticación opcional
      let userInfo = null;
      const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
      
      if (token) {
        try {
          userInfo = jwt.verify(token, process.env.JWT_SECRET);
        } catch (authError) {
          // Continuar sin autenticación si el token es inválido
          console.warn('SSE: Token inválido, continuando sin autenticación');
        }
      }

      const connectionId = userInfo?.id || `anonymous_${Date.now()}_${Math.random()}`;
      
      // Almacenar conexión
      this.connections.set(connectionId, {
        res,
        lastActivity: Date.now(),
        userInfo,
        connectionTime: new Date().toISOString()
      });

      // Actualizar estadísticas
      this.connectionStats.totalConnections++;
      this.connectionStats.currentConnections = this.connections.size;
      this.connectionStats.lastConnection = new Date().toISOString();

      console.log(`🟢 Nueva conexión SSE: ${connectionId} | Total: ${this.connections.size}`);

      // Enviar mensaje de bienvenida
      this.sendToConnection(connectionId, 'welcome', {
        message: 'Conectado a API Agua-VP v2 (SSE)',
        connectionId,
        timestamp: new Date().toISOString(),
        serverStatus: 'OK'
      });

      // Configurar heartbeat
      const heartbeatInterval = setInterval(() => {
        if (this.connections.has(connectionId)) {
          this.sendToConnection(connectionId, 'heartbeat', {
            timestamp: new Date().toISOString(),
            serverUptime: process.uptime()
          });
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Heartbeat cada 30 segundos

      // Manejar desconexión
      req.on('close', () => {
        this.handleDisconnection(connectionId);
        clearInterval(heartbeatInterval);
      });

      req.on('error', (error) => {
        console.error(`❌ Error en conexión SSE ${connectionId}:`, error);
        this.handleDisconnection(connectionId);
        clearInterval(heartbeatInterval);
      });

      return connectionId;

    } catch (error) {
      console.error('❌ Error al crear conexión SSE:', error);
      res.status(500).json({ error: 'Error al establecer conexión SSE' });
    }
  }

  /**
   * Enviar evento a una conexión específica
   */
  sendToConnection(connectionId, eventType, data) {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    try {
      const eventData = {
        type: eventType,
        data,
        timestamp: new Date().toISOString()
      };

      connection.res.write(`event: ${eventType}\n`);
      connection.res.write(`data: ${JSON.stringify(eventData)}\n\n`);
      
      // Actualizar actividad
      connection.lastActivity = Date.now();
      
      // Actualizar estadísticas
      this.updateEventStats(eventType);
      
      return true;
    } catch (error) {
      console.error(`❌ Error enviando evento SSE a ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
      return false;
    }
  }

  /**
   * Broadcast a todas las conexiones
   */
  broadcast(eventType, data) {
    let successCount = 0;
    let failCount = 0;

    for (const [connectionId] of this.connections) {
      if (this.sendToConnection(connectionId, eventType, data)) {
        successCount++;
      } else {
        failCount++;
      }
    }

    console.log(`📡 Broadcast ${eventType}: ${successCount} éxito, ${failCount} fallos`);
    return { successCount, failCount };
  }

  /**
   * Broadcast a usuarios autenticados
   */
  broadcastToAuthenticated(eventType, data) {
    let successCount = 0;
    let failCount = 0;

    for (const [connectionId, connection] of this.connections) {
      if (connection.userInfo) {
        if (this.sendToConnection(connectionId, eventType, data)) {
          successCount++;
        } else {
          failCount++;
        }
      }
    }

    console.log(`📡 Broadcast autenticado ${eventType}: ${successCount} éxito, ${failCount} fallos`);
    return { successCount, failCount };
  }

  /**
   * Enviar notificación del sistema
   */
  systemNotification(message, type = 'info') {
    return this.broadcast('system_notification', {
      message,
      type,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Manejar desconexión
   */
  handleDisconnection(connectionId) {
    if (this.connections.has(connectionId)) {
      this.connections.delete(connectionId);
      this.connectionStats.currentConnections = this.connections.size;
      this.connectionStats.lastDisconnection = new Date().toISOString();
      
      console.log(`🔴 Desconexión SSE: ${connectionId} | Total: ${this.connections.size}`);
    }
  }

  /**
   * Limpiar conexiones inactivas
   */
  cleanupInactiveConnections() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutos
    
    for (const [connectionId, connection] of this.connections) {
      if (now - connection.lastActivity > timeout) {
        console.log(`🧹 Limpiando conexión inactiva: ${connectionId}`);
        this.handleDisconnection(connectionId);
      }
    }
  }

  /**
   * Actualizar estadísticas de eventos
   */
  updateEventStats(eventType) {
    this.eventStats.totalEvents++;
    this.eventStats.lastEventTime = new Date().toISOString();
    
    const count = this.eventStats.eventsByType.get(eventType) || 0;
    this.eventStats.eventsByType.set(eventType, count + 1);
  }

  /**
   * Obtener estadísticas de conexión
   */
  getConnectionStats() {
    return {
      ...this.connectionStats,
      activeConnections: Array.from(this.connections.entries()).map(([id, conn]) => ({
        connectionId: id,
        authenticated: !!conn.userInfo,
        userId: conn.userInfo?.id || null,
        connectionTime: conn.connectionTime,
        lastActivity: new Date(conn.lastActivity).toISOString()
      }))
    };
  }

  /**
   * Obtener estadísticas de eventos
   */
  getEventStats() {
    return {
      ...this.eventStats,
      eventsByType: Object.fromEntries(this.eventStats.eventsByType)
    };
  }

  /**
   * Health check del SSE
   */
  healthCheck() {
    return {
      status: 'OK',
      type: 'SSE',
      connections: this.connections.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      stats: this.getConnectionStats(),
      events: this.getEventStats()
    };
  }
}

export default SSEManager;
