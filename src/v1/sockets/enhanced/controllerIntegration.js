/**
 * Integración de Socket Manager con Controladores
 * 
 * File: src/v1/sockets/enhanced/controllerIntegration.js
 * 
 * Este archivo proporciona middlewares y métodos de integración
 * para conectar el sistema de WebSockets con los controladores
 * existentes de la API Agua-VP
 */

// import socketManager from './socketManager.js';

class ControllerIntegration {
  constructor() {
    this.eventHandlers = new Map();
    this.middlewares = new Map();
    this.socketManagerInstance = null;
  }

  /**
   * Inicializar con la instancia del socket manager
   */
  static initialize(socketManagerInstance) {
    this.socketManagerInstance = socketManagerInstance;
  }

  /**
   * Middleware para integrar WebSockets en controladores
   */
  static withWebSocket(req, res, next) {
    // Obtener el socketManager desde la app
    const socketManager = req.app.get('socketManager');
    //console.log(`🔌 [ControllerIntegration] withWebSocket middleware - socketManager found:`, !!socketManager);
    
    // Agregar métodos de WebSocket al objeto response con un nombre diferente
    res.websocket = {
      // Emitir a un usuario específico
      emitToUser: (userId, event, data) => {
        if (socketManager) {
          socketManager.emitToUser(userId, event, data);
        }
      },

      // Emitir a un room específico
      emitToRoom: (room, event, data) => {
        if (socketManager) {
          socketManager.emitToRoom(room, event, data);
        }
      },

      // Broadcast a todos los usuarios
      broadcast: (event, data) => {
        if (socketManager) {
          socketManager.broadcastToAll(event, data);
        }
      },

      // Emitir notificación de negocio
      notifyBusiness: (type, data, targetUsers = null) => {
        //console.log(`🔌 [ControllerIntegration] notifyBusiness called: ${type}`, data);
        if (socketManager && socketManager.notificationManager) {
          //console.log(`🔌 [ControllerIntegration] socketManager found, processing: ${type}`);
          const notificationManager = socketManager.notificationManager;
          switch (type) {
            case 'factura_generada':
              notificationManager.notifyFacturaGenerada(data, targetUsers);
              break;
            case 'pago_recibido':
              notificationManager.notifyPagoRecibido(data);
              break;
            case 'lectura_completada':
              notificationManager.notifyLecturaCompletada(data);
              break;
            case 'cliente_creado':
              //console.log(`🔌 [ControllerIntegration] Calling onClienteCreated with data:`, data);
              ControllerIntegration.onClienteCreated(data, socketManager);
              break;
            case 'cliente_actualizado':
              ControllerIntegration.onClienteUpdated(data, socketManager);
              break;
            case 'medidor_creado':
              //console.log(`🔌 [ControllerIntegration] Calling onMedidorCreado with data:`, data);
              ControllerIntegration.onMedidorCreado(data, socketManager);
              break;
            case 'medidor_actualizado':
              //console.log(`🔌 [ControllerIntegration] Calling onMedidorActualizado with data:`, data);
              ControllerIntegration.onMedidorActualizado(data, socketManager);
              break;
            default:
              console.warn(`Tipo de notificación no reconocido: ${type}`);
          }
        } else {
          console.error(`🔌 [ControllerIntegration] socketManager not found or missing notificationManager`);
          console.error(`🔌 [ControllerIntegration] socketManager:`, !!socketManager);
          console.error(`🔌 [ControllerIntegration] notificationManager:`, !!socketManager?.notificationManager);
        }
      },

      // Emitir alerta del sistema
      alert: (type, data) => {
        if (socketManager && socketManager.notificationManager) {
          const notificationManager = socketManager.notificationManager;
          switch (type) {
            case 'consumo_anormal':
              notificationManager.alertConsumoAnormal(data);
              break;
            case 'cliente_moroso':
              notificationManager.alertClienteMoroso(data);
              break;
            case 'system_failure':
              notificationManager.alertFallaSistema(data);
              break;
            default:
              console.warn(`Tipo de alerta no reconocido: ${type}`);
          }
        }
      },

      // Método para trackear operaciones
      trackOperation: (operation, data) => {
        console.log(`🔌 [ControllerIntegration] trackOperation called: ${operation}`, data);
        if (socketManager) {
          //console.log(`🔌 [ControllerIntegration] Emitting operation_tracked to administradores room`);
          // Enviar a ambos rooms para compatibilidad
          socketManager.emitToRoom('administradores', 'operation_tracked', {
            operation: operation,
            data: data,
            user: req.usuario || req.user || 'anonymous',
            timestamp: new Date().toISOString()
          });
          socketManager.emitToRoom('superadmins', 'operation_tracked', {
            operation: operation,
            data: data,
            user: req.usuario || req.user || 'anonymous',
            timestamp: new Date().toISOString()
          });
        } else {
          console.error(`🔌 [ControllerIntegration] socketManager not found for trackOperation`);
        }
      }
    };

    next();
  }

  /**
   * Eventos específicos para cada controlador
   */

  // Eventos para clientesController
  static onClienteCreated(clienteData, socketManager = null) {
    console.log(`🔌 [ControllerIntegration] onClienteCreated called with:`, clienteData);
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    console.log(`🔌 [ControllerIntegration] socketManager instance:`, !!sm);
    if (sm) {
      console.log(`🔌 [ControllerIntegration] Emitting cliente_created to clientes room`);
      sm.emitToRoom('clientes', 'cliente_created', {
        cliente: clienteData,
        timestamp: new Date().toISOString()
      });
      
      // Notificar a administradores
      console.log(`🔌 [ControllerIntegration] Emitting new_cliente_registered to administradores room`);
      sm.emitToRoom('administradores', 'new_cliente_registered', {
        cliente: clienteData,
        timestamp: new Date().toISOString()
      });
      
      // También enviar a superadmins para compatibilidad
      sm.emitToRoom('superadmins', 'new_cliente_registered', {
        cliente: clienteData,
        timestamp: new Date().toISOString()
      });

      this.updateDashboardMetrics('clientes', sm);
      console.log(`🔌 [ControllerIntegration] Cliente events emitted successfully`);
    } else {
      console.error(`🔌 [ControllerIntegration] No socketManager found for onClienteCreated`);
    }
  }

  static onClienteUpdated(clienteData, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      sm.emitToRoom('clientes', 'cliente_updated', {
        cliente: clienteData,
        timestamp: new Date().toISOString()
      });

      this.updateDashboardMetrics('clientes', sm);
    }
  }

  static onClienteDeleted(clienteId, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      sm.emitToRoom('clientes', 'cliente_deleted', {
        cliente_id: clienteId,
        timestamp: new Date().toISOString()
      });

      this.updateDashboardMetrics('clientes', sm);
    }
  }

  // Eventos para medidoresController
  static onMedidorCreado(medidorData, socketManager = null) {
    console.log(`🔌 [ControllerIntegration] onMedidorCreado called with:`, medidorData);
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    console.log(`🔌 [ControllerIntegration] socketManager instance:`, !!sm);
    if (sm) {
      console.log(`🔌 [ControllerIntegration] Emitting medidor_created to medidores room`);
      sm.emitToRoom('medidores', 'medidor_created', {
        medidor: medidorData,
        timestamp: new Date().toISOString()
      });
      
      // Notificar a administradores
      console.log(`🔌 [ControllerIntegration] Emitting new_medidor_registered to administradores room`);
      sm.emitToRoom('administradores', 'new_medidor_registered', {
        medidor: medidorData,
        timestamp: new Date().toISOString()
      });
      
      // También enviar a superadmins para compatibilidad
      sm.emitToRoom('superadmins', 'new_medidor_registered', {
        medidor: medidorData,
        timestamp: new Date().toISOString()
      });

      // Notificar cambio de estado si es relevante
      if (medidorData.estado_medidor) {
        sm.emitToRoom('medidores', 'medidor_status_changed', {
          medidor_id: medidorData.id,
          numero_serie: medidorData.numero_serie,
          nuevo_estado: medidorData.estado_medidor,
          ubicacion: medidorData.ubicacion,
          timestamp: new Date().toISOString()
        });
      }

      this.updateDashboardMetrics('medidores', sm);
      console.log(`🔌 [ControllerIntegration] Medidor events emitted successfully`);
    } else {
      console.error(`🔌 [ControllerIntegration] No socketManager found for onMedidorCreado`);
    }
  }

  static onMedidorActualizado(medidorData, socketManager = null) {
    console.log(`🔌 [ControllerIntegration] onMedidorActualizado called with:`, medidorData);
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      console.log(`🔌 [ControllerIntegration] Emitting medidor_updated to medidores room`);
      sm.emitToRoom('medidores', 'medidor_updated', {
        medidor: medidorData,
        cambios: medidorData.cambios_realizados || [],
        timestamp: new Date().toISOString()
      });

      // Notificar a administradores sobre cambios importantes
      sm.emitToRoom('administradores', 'medidor_modificado', {
        medidor_id: medidorData.id,
        numero_serie: medidorData.numero_serie,
        campos_modificados: medidorData.cambios_realizados || [],
        timestamp: new Date().toISOString()
      });

      // Si hay cambio de estado, emitir evento específico
      if (medidorData.cambios_realizados && medidorData.cambios_realizados.includes('estado_medidor')) {
        sm.emitToRoom('medidores', 'medidor_status_changed', {
          medidor_id: medidorData.id,
          numero_serie: medidorData.numero_serie,
          nuevo_estado: medidorData.estado_medidor,
          ubicacion: medidorData.ubicacion,
          timestamp: new Date().toISOString()
        });
      }

      this.updateDashboardMetrics('medidores', sm);
      console.log(`🔌 [ControllerIntegration] Medidor update events emitted successfully`);
    } else {
      console.error(`🔌 [ControllerIntegration] No socketManager found for onMedidorActualizado`);
    }
  }

  static onMedidorDeleted(medidorId, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      sm.emitToRoom('medidores', 'medidor_deleted', {
        medidor_id: medidorId,
        timestamp: new Date().toISOString()
      });

      sm.emitToRoom('administradores', 'medidor_eliminado', {
        medidor_id: medidorId,
        timestamp: new Date().toISOString()
      });

      this.updateDashboardMetrics('medidores', sm);
    }
  }

  // Eventos para facturasController
  static onFacturaGenerated(facturaData, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      // Notificar creación de factura
      sm.emitToRoom('facturas', 'factura_generated', {
        factura: facturaData,
        timestamp: new Date().toISOString()
      });

      // Notificación de negocio si existe el notificationManager
      if (sm.notificationManager) {
        sm.notificationManager.notifyFacturaGenerada(facturaData);
      }

      // Actualizar métricas del dashboard
      this.updateDashboardMetrics('facturas', sm);
    }
  }

  static onFacturacionMasiva(resultados, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      sm.emitToRoom('facturas', 'facturacion_masiva_completed', {
        total_generadas: resultados.exitosas?.length || 0,
        total_errores: resultados.errores?.length || 0,
        resumen: resultados,
        timestamp: new Date().toISOString()
      });

      // Notificar a administradores
      sm.emitToRoom('admins', 'bulk_operation_completed', {
        operation: 'facturacion_masiva',
        results: resultados,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Eventos para pagosController
  static onPagoReceived(pagoData, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      // Notificar pago recibido
      sm.emitToRoom('pagos', 'pago_received', {
        pago: pagoData,
        timestamp: new Date().toISOString()
      });

      // Notificación de negocio
      if (sm.notificationManager) {
        sm.notificationManager.notifyPagoRecibido(pagoData);
      }

      // Actualizar estado de factura en tiempo real
      sm.emitToRoom('facturas', 'factura_paid', {
        factura_id: pagoData.factura_id,
        pago_id: pagoData.id,
        nuevo_estado: 'pagada',
        timestamp: new Date().toISOString()
      });

      this.updateDashboardMetrics('pagos', sm);
    }
  }

  // Eventos para lecturasController
  static onLecturaRegistrada(lecturaData, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      // Notificar lectura completada
      sm.emitToRoom('lecturas', 'lectura_registered', {
        lectura: lecturaData,
        timestamp: new Date().toISOString()
      });

      // Notificación de negocio
      if (sm.notificationManager) {
        sm.notificationManager.notifyLecturaCompletada(lecturaData);
      }

      // Verificar consumo anormal
      if (this.isConsumoAnormal(lecturaData)) {
        if (sm.notificationManager) {
          sm.notificationManager.alertConsumoAnormal({
            id: lecturaData.medidor_id,
            numero: lecturaData.medidor_numero,
            cliente_nombre: lecturaData.cliente_nombre,
            consumo_promedio: lecturaData.consumo_promedio || 20,
            consumo_actual: lecturaData.consumo_calculado,
            variacion: this.calculateVariacion(lecturaData),
            ubicacion: lecturaData.direccion
          });
        }
      }

      this.updateDashboardMetrics('lecturas', sm);
    }
  }

  static onRutaProgresUpdate(rutaId, progreso) { // Emitir progreso de ruta
    socketManager.emitToRoom('operators', 'ruta_progress_update', {
      ruta_id: rutaId,
      progreso: progreso,
      timestamp: new Date().toISOString()
    });
  }

  // Eventos para medidorController
  static onMedidorCreated(medidorData) { // Emitir creación de medidor
    socketManager.emitToRoom('medidores', 'medidor_created', {
      medidor: medidorData,
      timestamp: new Date().toISOString()
    });
  }

  static onMedidorStatusChange(medidorId, nuevoEstado, razon) { // Emitir cambio de estado del medidor
    socketManager.emitToRoom('medidores', 'medidor_status_changed', {
      medidor_id: medidorId,
      nuevo_estado: nuevoEstado,
      razon: razon,
      timestamp: new Date().toISOString()
    });

    // Si el medidor se desactivó, alertar
    if (nuevoEstado === 'inactivo') {
      const notificationManager = socketManager.notificationManager;
      notificationManager.sendCustomNotification(
        null, // A todos los supervisores
        'Medidor Desactivado',
        `El medidor #${medidorId} ha sido desactivado: ${razon}`,
        { medidor_id: medidorId, estado: nuevoEstado, razon: razon },
        { priority: 'high', category: 'medidores' }
      );
    }
  }

  // Eventos para rutasController
  static onRutaCreated(rutaData) {
    socketManager.emitToRoom('rutas', 'ruta_created', {
      ruta: rutaData,
      timestamp: new Date().toISOString()
    });
  }

  static onRutaAsignada(rutaId, operadorId, operadorNombre) {
    socketManager.emitToRoom('operators', 'ruta_assigned', {
      ruta_id: rutaId,
      operador_id: operadorId,
      operador_nombre: operadorNombre,
      timestamp: new Date().toISOString()
    });

    // Notificar específicamente al operador asignado
    socketManager.emitToUser(operadorId, 'new_ruta_assignment', {
      ruta_id: rutaId,
      mensaje: `Se te ha asignado una nueva ruta: #${rutaId}`,
      timestamp: new Date().toISOString()
    });
  }

  // Eventos para tarifasController
  static onTarifaUpdated(tarifaData) {
    socketManager.emitToRoom('admins', 'tarifa_updated', {
      tarifa: tarifaData,
      timestamp: new Date().toISOString()
    });

    // Notificar cambio importante a todos los usuarios
    socketManager.broadcastToAll('system_update', {
      type: 'tarifa_change',
      message: 'Las tarifas han sido actualizadas',
      effective_date: tarifaData.fecha_vigencia,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Eventos del sistema y errores
   */
  static onSystemError(error, context) {
    const notificationManager = socketManager.notificationManager;
    notificationManager.alertFallaSistema({
      component: context.component || 'unknown',
      error_type: error.name || 'UnknownError',
      error_message: error.message,
      stack_trace: error.stack,
      affected_operations: context.operations || [],
      estimated_impact: context.impact || 'unknown'
    });
  }

  static onDatabaseConnectionLost() {
    socketManager.broadcastToAll('system_alert', {
      type: 'database_disconnected',
      severity: 'critical',
      title: 'Conexión a Base de Datos Perdida',
      message: 'Se ha perdido la conexión con la base de datos. Reconectando...',
      timestamp: new Date().toISOString()
    });
  }

  static onDatabaseConnectionRestored() {
    socketManager.broadcastToAll('system_alert', {
      type: 'database_reconnected',
      severity: 'info',
      title: 'Conexión a Base de Datos Restaurada',
      message: 'La conexión con la base de datos ha sido restaurada',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Métricas y Dashboard
   */
  static updateDashboardMetrics(category, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      // Simular obtención de métricas actualizadas
      const metrics = this.getCurrentMetrics(category);
      
      sm.emitToRoom('dashboard', 'metrics_update', {
        category: category,
        metrics: metrics,
        timestamp: new Date().toISOString()
      });
    }
  }

  static getCurrentMetrics(category) {
    // Aquí se implementaría la lógica real para obtener métricas
    // Por ahora retornamos datos simulados
    const mockMetrics = {
      clientes: {
        total: 1250,
        activos: 1180,
        morosos: 45,
        nuevos_mes: 23
      },
      facturas: {
        total_mes: 1180,
        pagadas: 950,
        pendientes: 230,
        vencidas: 85,
        ingresos_mes: 245000
      },
      pagos: {
        total_mes: 950,
        efectivo: 320,
        transferencia: 580,
        tarjeta: 50,
        monto_total: 195000
      },
      lecturas: {
        programadas: 1180,
        completadas: 1050,
        pendientes: 130,
        porcentaje_completado: 89
      },
      medidores: {
        total: 1250,
        activos: 1200,
        inactivos: 30,
        mantenimiento: 20
      }
    };

    return mockMetrics[category] || {};
  }

  /**
   * Métodos de utilidad
   */
  static isConsumoAnormal(lecturaData) { // Verificar si el consumo es anormal
    const variacion = this.calculateVariacion(lecturaData);
    return Math.abs(variacion) > 50; // Más del 50% de variación
  }

  static calculateVariacion(lecturaData) { // Calcular variación porcentual del consumo
    const consumoPromedio = lecturaData.consumo_promedio || 20; // Default 20m³
    if (consumoPromedio === 0) return 0;
    return ((lecturaData.consumo_calculado - consumoPromedio) / consumoPromedio) * 100;
  }

  /**
   * Middlewares específicos por controlador
   */
  static createControllerMiddleware(controllerName) {
    return (req, res, next) => {
      // Agregar métodos específicos del controlador
      res.socket.controller = controllerName;
      
      // Agregar método para trackear operaciones
      res.socket.trackOperation = (operation, data) => {
        socketManager.emitToRoom('admins', 'operation_tracked', {
          controller: controllerName,
          operation: operation,
          data: data,
          user: req.user || 'anonymous',
          timestamp: new Date().toISOString()
        });
      };

      next();
    };
  }

  /**
   * Integración con autenticación
   */
  static onUserLogin(userData, socketManager = null) {
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      // Notificar login exitoso a administradores
      sm.emitToRoom('admins', 'user_logged_in', {
        user: {
          id: userData.id,
          email: userData.email,
          role: userData.role,
          name: userData.name
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  static onUserLogout(userData, socketManager = null) { // Notificar logout a administradores
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      // Notificar logout a administradores
      sm.emitToRoom('admins', 'user_logged_out', {
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  static onFailedLoginAttempt(attemptData, socketManager = null) { // Notificar intentos de login fallidos
    const sm = socketManager || require('../../../server').app?.get('socketManager');
    if (sm) {
      // Alertar sobre intentos de login fallidos
      sm.emitToRoom('admins', 'failed_login_attempt', {
        email: attemptData.email,
        ip: attemptData.ip,
        user_agent: attemptData.user_agent,
        timestamp: new Date().toISOString()
      });

      // Si hay muchos intentos fallidos, crear alerta
      if (attemptData.consecutive_failures > 5) {
        if (sm.notificationManager) {
          sm.notificationManager.sendCustomNotification(
            null,
            'Posible Ataque de Fuerza Bruta',
            `Múltiples intentos de login fallidos para ${attemptData.email}`,
            attemptData,
            { priority: 'high', category: 'security' }
          );
        }
      }
    }
  }

  /**
   * Método estático para usar desde los controladores sin instancia
   */
  static emit(req, event, room, data) { // Emitir evento a un room específico
    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.emitToRoom(room, event, data);
    }
  }

  static broadcast(req, event, data) { // Emitir evento a todos los usuarios conectados
    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.broadcastToAll(event, data);
    }
  }

  static notify(req, type, data, targetUsers = null) { // Notificar evento de negocio
    const socketManager = req.app.get('socketManager');
    if (socketManager && socketManager.notificationManager) {
      const notificationManager = socketManager.notificationManager;
      switch (type) {
        case 'cliente_creado':
          this.onClienteCreated(data, socketManager);
          break;
        case 'cliente_actualizado':
          this.onClienteUpdated(data, socketManager);
          break;
        case 'factura_generada':
          this.onFacturaGenerated(data, socketManager);
          break;
        case 'pago_recibido':
          this.onPagoReceived(data, socketManager);
          break;
        case 'lectura_registrada':
          this.onLecturaRegistrada(data, socketManager);
          break;
        default:
          console.warn(`Tipo de notificación no reconocido: ${type}`);
      }
    }
  }
}

export default ControllerIntegration;
export const { withWebSocket } = ControllerIntegration;
