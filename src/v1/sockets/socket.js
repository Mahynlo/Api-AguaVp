/**
 * WebSocket Configuration
 * 
 * File: src/sockets/socket.js
 * 
 * Descripción:
 * - Configuración de eventos WebSocket para comunicación en tiempo real
 * - Manejo de conexiones, desconexiones y eventos personalizados
 * 
 * Eventos:
 * - connection: Nueva conexión establecida
 * - disconnect: Conexión cerrada
 * - health_check: Verificación de estado de conexión
 * - api_status: Estado general de la API
 */

let connectedClients = 0;
let connectionStats = {
  totalConnections: 0,
  currentConnections: 0,
  lastConnection: null,
  lastDisconnection: null
};

module.exports = (io) => {
  io.on('connection', (socket) => {
    connectedClients++;
    connectionStats.totalConnections++;
    connectionStats.currentConnections = connectedClients;
    connectionStats.lastConnection = new Date().toISOString();
    
    console.log(`🟢 Cliente conectado: ${socket.id} | Total: ${connectedClients}`);

    // Enviar bienvenida al cliente conectado
    socket.emit('welcome', {
      message: 'Conectado a API Agua-VP',
      clientId: socket.id,
      timestamp: new Date().toISOString(),
      serverStatus: 'OK'
    });

    // Health check del WebSocket
    socket.on('health_check', () => {
      socket.emit('health_response', {
        status: 'OK',
        timestamp: new Date().toISOString(),
        connectedClients: connectedClients,
        serverUptime: process.uptime()
      });
    });

    // Solicitar estado de la API
    socket.on('api_status', () => {
      socket.emit('api_status_response', {
        status: 'OK',
        timestamp: new Date().toISOString(),
        services: {
          api: 'UP',
          websocket: 'UP',
          database: 'UP' // Se podría verificar con una consulta real
        },
        stats: connectionStats
      });
    });

    // Ping/Pong para mantener conexión activa
    socket.on('ping', () => {
      socket.emit('pong', {
        timestamp: new Date().toISOString()
      });
    });

    // Broadcast de notificaciones (para futuras funcionalidades)
    socket.on('broadcast_notification', (data) => {
      socket.broadcast.emit('notification', {
        ...data,
        timestamp: new Date().toISOString(),
        from: socket.id
      });
    });

    // Manejo de desconexión
    socket.on('disconnect', (reason) => {
      connectedClients--;
      connectionStats.currentConnections = connectedClients;
      connectionStats.lastDisconnection = new Date().toISOString();
      
      console.log(`🔴 Cliente desconectado: ${socket.id} | Razón: ${reason} | Total: ${connectedClients}`);
    });

    // Manejo de errores
    socket.on('error', (error) => {
      console.error(`❌ Error en socket ${socket.id}:`, error);
    });
  });

  // Función para obtener estadísticas de conexión (puede ser llamada desde otros módulos)
  io.getConnectionStats = () => connectionStats;
  
  // Función para broadcast de notificaciones del sistema
  io.broadcastSystemNotification = (message, type = 'info') => {
    io.emit('system_notification', {
      message,
      type,
      timestamp: new Date().toISOString()
    });
  };
};
