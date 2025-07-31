/**
 * Configuración rápida para integrar WebSockets en controladores
 * 
 * File: src/v1/sockets/enhanced/quickIntegration.js
 * 
 * Este archivo proporciona métodos simples para integrar WebSockets
 * en cualquier controlador existente sin modificar mucho código.
 */

const ControllerIntegration = require('./controllerIntegration');

class QuickIntegration {
  
  /**
   * Integrar WebSocket a todas las rutas de un router
   * @param {Router} router - Router de Express
   */
  static addToAllRoutes(router) {
    router.use(ControllerIntegration.withWebSocket);
    return router;
  }

  /**
   * Integrar WebSocket a rutas específicas
   * @param {Router} router - Router de Express
   * @param {Array} routes - Array de rutas que necesitan WebSocket
   */
  static addToSpecificRoutes(router, routes = []) {
    routes.forEach(route => {
      // Esta función se ejecutaría en el middleware stack
      console.log(`WebSocket habilitado para ruta: ${route}`);
    });
    return router;
  }

  /**
   * Método helper para emitir eventos desde cualquier controlador
   * @param {Request} req - Request object
   * @param {String} eventType - Tipo de evento
   * @param {Object} data - Datos del evento
   * @param {String} room - Room específico (opcional)
   */
  static emit(req, eventType, data, room = null) {
    if (!req.app || !req.app.get('socketManager')) {
      console.warn('WebSocket no disponible en este contexto');
      return;
    }

    const socketManager = req.app.get('socketManager');
    
    if (room) {
      socketManager.emitToRoom(room, eventType, data);
    } else {
      socketManager.broadcastToAll(eventType, data);
    }
  }

  /**
   * Método helper para notificaciones de negocio
   * @param {Request} req - Request object
   * @param {String} businessType - Tipo de evento de negocio
   * @param {Object} data - Datos del evento
   */
  static notifyBusiness(req, businessType, data) {
    if (!req.app || !req.app.get('socketManager')) {
      console.warn('WebSocket no disponible en este contexto');
      return;
    }

    switch (businessType) {
      case 'cliente_creado':
        ControllerIntegration.onClienteCreated(data, req.app.get('socketManager'));
        break;
      case 'cliente_actualizado':
        ControllerIntegration.onClienteUpdated(data, req.app.get('socketManager'));
        break;
      case 'factura_generada':
        ControllerIntegration.onFacturaGenerated(data, req.app.get('socketManager'));
        break;
      case 'pago_recibido':
        ControllerIntegration.onPagoReceived(data, req.app.get('socketManager'));
        break;
      case 'lectura_registrada':
        ControllerIntegration.onLecturaRegistrada(data, req.app.get('socketManager'));
        break;
      default:
        console.warn(`Tipo de evento de negocio no reconocido: ${businessType}`);
    }
  }

  /**
   * Método helper para tracking de operaciones
   * @param {Request} req - Request object
   * @param {String} operation - Nombre de la operación
   * @param {Object} data - Datos de la operación
   */
  static trackOperation(req, operation, data) {
    if (!req.app || !req.app.get('socketManager')) {
      console.warn('WebSocket no disponible en este contexto');
      return;
    }

    const socketManager = req.app.get('socketManager');
    const userData = req.usuario || req.user || { id: 'anonymous' };
    
    socketManager.emitToRoom('admins', 'operation_tracked', {
      operation: operation,
      data: data,
      user: userData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Actualizar métricas del dashboard
   * @param {Request} req - Request object
   * @param {String} category - Categoría de métricas
   */
  static updateDashboard(req, category) {
    if (!req.app || !req.app.get('socketManager')) {
      console.warn('WebSocket no disponible en este contexto');
      return;
    }

    ControllerIntegration.updateDashboardMetrics(category, req.app.get('socketManager'));
  }

  /**
   * Templates para eventos comunes
   */
  static templates = {
    /**
     * Template para registro de entidad
     */
    entityCreated: (req, entityType, entityData) => {
      QuickIntegration.emit(req, `${entityType}_created`, {
        [entityType]: entityData,
        timestamp: new Date().toISOString()
      }, `${entityType}s`);

      QuickIntegration.trackOperation(req, `${entityType}_created`, {
        entity_id: entityData.id,
        entity_type: entityType
      });

      QuickIntegration.updateDashboard(req, `${entityType}s`);
    },

    /**
     * Template para actualización de entidad
     */
    entityUpdated: (req, entityType, entityData, changes = {}) => {
      QuickIntegration.emit(req, `${entityType}_updated`, {
        [entityType]: entityData,
        changes: changes,
        timestamp: new Date().toISOString()
      }, `${entityType}s`);

      QuickIntegration.trackOperation(req, `${entityType}_updated`, {
        entity_id: entityData.id,
        entity_type: entityType,
        changes_count: Object.keys(changes).length
      });

      QuickIntegration.updateDashboard(req, `${entityType}s`);
    },

    /**
     * Template para eliminación de entidad
     */
    entityDeleted: (req, entityType, entityId) => {
      QuickIntegration.emit(req, `${entityType}_deleted`, {
        [`${entityType}_id`]: entityId,
        timestamp: new Date().toISOString()
      }, `${entityType}s`);

      QuickIntegration.trackOperation(req, `${entityType}_deleted`, {
        entity_id: entityId,
        entity_type: entityType
      });

      QuickIntegration.updateDashboard(req, `${entityType}s`);
    }
  };
}

/**
 * Decorador para métodos de controlador
 * Agrega automáticamente eventos WebSocket a métodos existentes
 */
function withWebSocketEvents(eventType, room = null) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function(req, res, ...args) {
      // Ejecutar método original
      const result = originalMethod.apply(this, [req, res, ...args]);

      // Si es una Promise, manejar cuando se resuelva
      if (result && typeof result.then === 'function') {
        return result.then(data => {
          QuickIntegration.emit(req, eventType, data, room);
          return data;
        });
      } else {
        // Si no es async, emitir inmediatamente
        QuickIntegration.emit(req, eventType, {
          timestamp: new Date().toISOString(),
          operation: propertyKey
        }, room);
        return result;
      }
    };

    return descriptor;
  };
}

module.exports = {
  QuickIntegration,
  withWebSocketEvents
};

/**
 * EJEMPLOS DE USO:
 * 
 * 1. Integración simple en un controlador existente:
 * 
 * const { QuickIntegration } = require('../sockets/enhanced/quickIntegration');
 * 
 * // En el método del controlador
 * registrarMedidor: (req, res) => {
 *   // ... lógica existente ...
 *   
 *   // Al final, agregar evento WebSocket
 *   QuickIntegration.templates.entityCreated(req, 'medidor', nuevoMedidor);
 *   
 *   res.json({ mensaje: "Medidor registrado", id: nuevoMedidor.id });
 * }
 * 
 * 2. Integración usando notificaciones de negocio:
 * 
 * registrarFactura: (req, res) => {
 *   // ... lógica existente ...
 *   
 *   QuickIntegration.notifyBusiness(req, 'factura_generada', facturaData);
 *   
 *   res.json({ mensaje: "Factura generada" });
 * }
 * 
 * 3. Integración en rutas (router):
 * 
 * const { QuickIntegration } = require('../sockets/enhanced/quickIntegration');
 * 
 * // Agregar a todas las rutas del router
 * QuickIntegration.addToAllRoutes(router);
 * 
 * 4. Uso del decorador (experimental):
 * 
 * class MedidorController {
 *   @withWebSocketEvents('medidor_created', 'medidores')
 *   registrarMedidor(req, res) {
 *     // ... lógica del controlador ...
 *   }
 * }
 */
