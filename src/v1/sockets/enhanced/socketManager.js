/**
 * Socket Manager Mejorado - Implementación Práctica
 * 
 * File: src/sockets/enhanced/socketManager.js
 * 
 * Esta es una implementación práctica de las mejoras propuestas
 * para el sistema de WebSockets de la API Agua-VP
 */

const jwt = require('jsonwebtoken');
const NotificationManager = require('./notificationManager');

class SocketManager {
  constructor() {
    this.io = null;
    this.notificationManager = null;
    this.connectedUsers = new Map(); // userId -> socket info
    this.roomStats = new Map(); // room -> user count
    this.eventStats = {
      totalEvents: 0,
      eventsByType: new Map(),
      lastEventTime: null
    };
  }

  /**
   * Inicializar el Socket Manager
   */
  initialize(socketIO) {
    this.io = socketIO;
    this.notificationManager = new NotificationManager(socketIO, this);
    
    // Middleware de autenticación
    this.io.use(this.authenticateSocket.bind(this));
    
    // Configurar eventos de conexión
    
    this.io.on('connection', this.handleConnection.bind(this));
    
    // Iniciar servicios automáticos
    this.startAutomaticServices();
    
    console.log('🚀 Socket Manager inicializado correctamente');
  }

  /**
   * Middleware de autenticación para WebSocket
   */
  authenticateSocket(socket, next) {
    try {
      const userToken = socket.handshake.auth.token;
      const appKeyToken = socket.handshake.auth.appKey;
      
      // Validar App Key JWT Token (token de aplicación)
      if (!appKeyToken) {
        return next(new Error('App Key Token requerido'));
      }
      
      try {
        const appDecoded = jwt.verify(appKeyToken, process.env.SECRET_APP_KEY || 'default-app-secret');
        socket.appId = appDecoded.app_id;
      } catch (appError) {
        return next(new Error('App Key Token inválido: ' + appError.message));
      }
      
      // Validar JWT Token de usuario (token de sesión)
      if (!userToken) {
        return next(new Error('User Token requerido'));
      }
      
      const userDecoded = jwt.verify(userToken, process.env.JWT_SECRET || 'default-user-secret');
      
      // Validar que el rol sea uno de los permitidos
      const validRoles = ['superadmin', 'administrador', 'operador'];
      if (!validRoles.includes(userDecoded.rol)) {
        return next(new Error('Rol de usuario no válido'));
      }
      
      // Asignar información del usuario al socket
      socket.userId = userDecoded.id;
      socket.userEmail = userDecoded.correo;
      socket.userRole = userDecoded.rol;
      socket.userName = userDecoded.nombre || 'Usuario';
      
      next();
    } catch (error) {
      next(new Error('Autenticación fallida: ' + error.message));
    }
  }

  /**
   * Manejar nueva conexión
   */
  handleConnection(socket) {
    const userInfo = {
      id: socket.userId,
      email: socket.userEmail,
      role: socket.userRole,
      name: socket.userName,
      socketId: socket.id,
      connectedAt: new Date().toISOString()
    };

    // Registrar usuario conectado
    this.connectedUsers.set(socket.userId, userInfo);
    
    console.log(`🟢 Usuario ${userInfo.name} (${userInfo.role}) conectado`);

    // Unir a rooms apropiados
    this.assignUserToRooms(socket);

    // Enviar bienvenida personalizada
    socket.emit('welcome', {
      message: `¡Bienvenido a Agua-VP, ${userInfo.name}!`,
      userInfo: userInfo,
      availableRooms: this.getUserRooms(socket.userRole),
      serverTime: new Date().toISOString()
    });

    // Configurar eventos básicos
    this.setupBasicEvents(socket);

    // Configurar eventos específicos del negocio
    this.setupBusinessEvents(socket);

    // Configurar eventos de comunicación
    this.setupCommunicationEvents(socket);

    // Configurar eventos de monitoreo
    this.setupMonitoringEvents(socket);

    // Manejar desconexión
    socket.on('disconnect', () => this.handleDisconnection(socket));

    // Notificar a administradores sobre nueva conexión
    if (userInfo.role !== 'superadmin' && userInfo.role !== 'administrador') {
      this.io.to('administradores').emit('user_connected', {
        user: userInfo,
        timestamp: new Date().toISOString()
      });
      
      // También notificar a superadmins
      this.io.to('superadmins').emit('user_connected', {
        user: userInfo,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Asignar usuario a rooms según su rol
   */
  assignUserToRooms(socket) {
    const rooms = this.getUserRooms(socket.userRole);
    
    rooms.forEach(room => {
      socket.join(room);
      this.updateRoomStats(room, 1);
    });

    // Notificar asignación de rooms
    socket.emit('rooms_assigned', {
      rooms: rooms,
      permissions: this.getRolePermissions(socket.userRole)
    });
  }

  /**
   * Obtener rooms según rol de usuario
   */
  getUserRooms(role) {
    const roleRooms = {
      superadmin: ['superadmins', 'administradores', 'operadores', 'global', 'lecturas', 'facturas', 'pagos', 'clientes', 'medidores', 'dashboard', 'system_management', 'user_management'],
      administrador: ['administradores', 'global', 'lecturas', 'facturas', 'pagos', 'clientes', 'medidores', 'dashboard', 'reports'],
      operador: ['operadores', 'lecturas', 'facturas', 'rutas', 'field_operations', 'clientes']
    };

    return roleRooms[role] || ['operadores']; // Default a operador si el rol no está definido
  }

  /**
   * Configurar eventos básicos del socket
   */
  setupBasicEvents(socket) {
    // Health check
    socket.on('health_check', () => {
      const response = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        connectedUsers: this.connectedUsers.size,
        userInfo: {
          id: socket.userId,
          role: socket.userRole,
          name: socket.userName
        }
      };
      socket.emit('health_response', response);
      this.trackEvent('health_check');
    });

    // Ping-pong
    socket.on('ping', () => {
      socket.emit('pong', {
        timestamp: new Date().toISOString(),
        latency: Date.now()
      });
      this.trackEvent('ping');
    });

    // Estadísticas de rooms
    socket.on('get_room_stats', () => {
      if (this.hasPermission(socket.userRole, 'read')) {
        const stats = this.getRoomStatistics();
        socket.emit('room_stats_response', stats);
        this.trackEvent('room_stats_request');
      }
    });
  }

  /**
   * Configurar eventos específicos del negocio
   */
  setupBusinessEvents(socket) {
    // Solicitar lecturas pendientes
    socket.on('solicitar_lecturas_pendientes', (data) => {
      if (this.hasPermission(socket.userRole, 'read')) {
        // Simular respuesta de lecturas pendientes
        const lecturas = {
          ruta_id: data.ruta_id || 1,
          lecturas_pendientes: [
            { id: 1, cliente: 'Cliente A', direccion: 'Calle 1' },
            { id: 2, cliente: 'Cliente B', direccion: 'Calle 2' }
          ],
          total: 2,
          fecha_solicitud: new Date().toISOString()
        };
        
        socket.emit('lecturas_pendientes_response', lecturas);
        this.trackEvent('lecturas_pendientes_request');
      }
    });

    // Confirmar lectura
    socket.on('confirmar_lectura', (data) => {
      if (this.hasPermission(socket.userRole, 'write')) {
        const confirmacion = {
          lectura_id: data.lectura_id,
          confirmado: true,
          timestamp: new Date().toISOString(),
          operador: socket.userName
        };
        
        socket.emit('lectura_confirmada_response', confirmacion);
        
        // Notificar a administradores
        this.io.to('administradores').emit('lectura_completada', {
          lectura_id: data.lectura_id,
          operador: socket.userName,
          timestamp: new Date().toISOString()
        });
        
        this.trackEvent('lectura_confirmada');
      }
    });
  }

  /**
   * Configurar eventos de comunicación
   */
  setupCommunicationEvents(socket) {
    // Mensaje a operadores
    socket.on('send_operator_message', (data) => {
      if (this.hasPermission(socket.userRole, 'broadcast')) {
        const message = {
          from: socket.userName,
          fromRole: socket.userRole,
          message: data.message,
          timestamp: new Date().toISOString(),
          messageId: Math.random().toString(36).substr(2, 9)
        };
        
        this.io.to('operadores').emit('operator_message', message);
        socket.emit('message_sent', { success: true, messageId: message.messageId });
        
        this.trackEvent('operator_message_sent');
      }
    });

    // Broadcast de emergencia
    socket.on('emergency_broadcast', (data) => {
      if (this.hasPermission(socket.userRole, 'broadcast')) {
        const emergency = {
          ...data,
          from: socket.userName,
          fromRole: socket.userRole,
          timestamp: new Date().toISOString(),
          emergencyId: Math.random().toString(36).substr(2, 9)
        };
        
        // Enviar a todos los usuarios conectados
        this.io.emit('emergency_notification', emergency);
        
        this.trackEvent('emergency_broadcast');
      }
    });

    // Broadcast general
    socket.on('general_broadcast', (data) => {
      if (this.hasPermission(socket.userRole, 'broadcast')) {
        const broadcast = {
          ...data,
          from: socket.userName,
          fromRole: socket.userRole,
          timestamp: new Date().toISOString(),
          broadcastId: Math.random().toString(36).substr(2, 9)
        };
        
        // Enviar a todos los usuarios conectados
        this.io.emit('general_broadcast', broadcast);
        
        this.trackEvent('general_broadcast');
      }
    });
  }

  /**
   * Configurar eventos de monitoreo
   */
  setupMonitoringEvents(socket) {
    // Solo para administradores y superadmins
    if (socket.userRole !== 'superadmin' && socket.userRole !== 'administrador') {
      return;
    }

    // Solicitar métricas del dashboard
    socket.on('request_dashboard_metrics', () => {
      const metrics = this.getDashboardMetrics();
      socket.emit('dashboard_metrics_response', metrics);
    });

    // Gestión de usuarios (solo superadmin)
    if (socket.userRole === 'superadmin') {
      socket.on('manage_user_connection', (data) => {
        if (data.action === 'disconnect' && data.userId) {
          const userSocket = this.findUserSocket(data.userId);
          if (userSocket) {
            userSocket.disconnect(true);
            socket.emit('user_disconnected_by_admin', {
              userId: data.userId,
              success: true
            });
          }
        }
      });
    }
  }

  /**
   * Manejar desconexión
   */
  handleDisconnection(socket) {
    const userInfo = this.connectedUsers.get(socket.userId);
    
    if (userInfo) {
      console.log(`🔴 Usuario ${userInfo.name} (${userInfo.role}) desconectado`);
      
      // Remover de usuarios conectados
      this.connectedUsers.delete(socket.userId);
      
      // Actualizar estadísticas de rooms
      const rooms = this.getUserRooms(socket.userRole);
      rooms.forEach(room => {
        this.updateRoomStats(room, -1);
      });
      
      // Notificar a administradores si no es admin
      if (userInfo.role !== 'superadmin' && userInfo.role !== 'administrador') {
        this.io.to('administradores').emit('user_disconnected', {
          user: userInfo,
          timestamp: new Date().toISOString()
        });
        
        this.io.to('superadmins').emit('user_disconnected', {
          user: userInfo,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Métodos de utilidad
   */
  hasPermission(role, permission) {
    const rolePermissions = this.getRolePermissions(role);
    return rolePermissions.includes(permission) || rolePermissions.includes('full_access');
  }

  getRolePermissions(role) { // Método para obtener permisos según rol
    const permissions = {
      superadmin: ['read', 'write', 'delete', 'broadcast', 'manage_users', 'manage_system', 'manage_apps', 'full_access'],
      administrador: ['read', 'write', 'delete', 'broadcast', 'manage_users', 'reports'],
      operador: ['read', 'write', 'field_operations', 'lecturas', 'basic_reports']
    };

    return permissions[role] || ['read']; // Default a solo lectura
  }

  findUserSocket(userId) {
    const sockets = this.io.sockets.sockets;
    for (let socket of sockets.values()) {
      if (socket.userId === userId) {
        return socket;
      }
    }
    return null;
  }

  updateRoomStats(room, delta) {
    const current = this.roomStats.get(room) || 0;
    const newCount = Math.max(0, current + delta);
    this.roomStats.set(room, newCount);
  }

  getRoomStatistics() {
    const stats = {};
    for (let [room, count] of this.roomStats.entries()) {
      stats[room] = count;
    }
    return {
      rooms: stats,
      totalConnections: this.connectedUsers.size,
      timestamp: new Date().toISOString()
    };
  }

  getDashboardMetrics() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalEvents: this.eventStats.totalEvents,
      eventsByType: Object.fromEntries(this.eventStats.eventsByType),
      lastEventTime: this.eventStats.lastEventTime,
      roomStats: this.getRoomStatistics().rooms,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  trackEvent(eventType) {
    this.eventStats.totalEvents++;
    const current = this.eventStats.eventsByType.get(eventType) || 0;
    this.eventStats.eventsByType.set(eventType, current + 1);
    this.eventStats.lastEventTime = new Date().toISOString();
  }

  startAutomaticServices() {
    // Enviar métricas cada 30 segundos a administradores
    setInterval(() => {
      this.sendDashboardMetrics();
    }, 30000);

    // Verificar conexiones inactivas cada 5 minutos
    setInterval(() => {
      this.checkInactiveConnections();
    }, 300000);
  }

  sendDashboardMetrics() { // Enviar métricas del dashboard a administradores y superadmins
    const metrics = this.getDashboardMetrics();
    this.io.to('administradores').emit('dashboard_metrics_update', metrics);
    this.io.to('superadmins').emit('dashboard_metrics_update', metrics);
  }

  checkInactiveConnections() { // Desconectar usuarios inactivos después de 30 minutos
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutos

    for (let [userId, userInfo] of this.connectedUsers.entries()) {
      const connectedTime = new Date(userInfo.connectedAt).getTime();
      if (now - connectedTime > inactiveThreshold) {
        const socket = this.findUserSocket(userId);
        if (socket) {
          console.log(`⏰ Desconectando usuario inactivo: ${userInfo.name}`);
          socket.disconnect(true);
        }
      }
    }
  }

  // Métodos públicos para uso externo
  emitToUser(userId, event, data) { // Emitir evento a un usuario específico
    const socket = this.findUserSocket(userId);
    if (socket) {
      socket.emit(event, data);
      this.trackEvent(`emit_to_user_${event}`);
    }
  }

  emitToRoom(room, event, data) { // Emitir evento a todos los usuarios en una sala específica
    if (this.io) {
      this.io.to(room).emit(event, data);
      this.trackEvent(`emit_to_room_${event}`);
    }
  }

  broadcastToAll(event, data) { // Emitir evento a todos los usuarios conectados
    if (this.io) {
      this.io.emit(event, data);
      this.trackEvent(`broadcast_${event}`);
    }
  }

  getConnectionStats() { // Obtener estadísticas de conexión
    return {
      connectedUsers: this.connectedUsers.size,
      rooms: Object.fromEntries(this.roomStats),
      totalEvents: this.eventStats.totalEvents,
      isActive: this.io !== null
    };
  }
}

module.exports = SocketManager;
