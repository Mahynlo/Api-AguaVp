/**
 * SSE Notification Manager
 * 
 * File: src/v2/sse/notificationManager.js
 * 
 * Descripción:
 * - Gestiona las notificaciones en tiempo real vía SSE
 * - Reemplaza el sistema de notificaciones WebSocket de v1
 * - Mantiene compatibilidad con los tipos de eventos existentes
 */

class SSENotificationManager {
  constructor(sseManager) {
    this.sseManager = sseManager;
    this.notificationQueue = [];
    this.retryInterval = 5000; // 5 segundos
  }

  /**
   * Notificación de cliente creado
   */
  clienteCreado(clienteData, modificadoPor) {
    const notification = {
      type: 'cliente_creado',
      data: {
        cliente: clienteData,
        modificado_por: modificadoPor,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('cliente_creado', notification.data);
  }

  /**
   * Notificación de cliente modificado
   */
  clienteModificado(clienteData, cambios, modificadoPor) {
    const notification = {
      type: 'cliente_modificado',
      data: {
        cliente: clienteData,
        cambios,
        modificado_por: modificadoPor,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('cliente_modificado', notification.data);
  }

  /**
   * Notificación de medidor registrado
   */
  medidorRegistrado(medidorData, modificadoPor) {
    const notification = {
      type: 'medidor_registrado',
      data: {
        medidor: medidorData,
        modificado_por: modificadoPor,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('medidor_registrado', notification.data);
  }

  /**
   * Notificación de lectura registrada
   */
  lecturaRegistrada(lecturaData, modificadoPor) {
    const notification = {
      type: 'lectura_registrada',
      data: {
        lectura: lecturaData,
        modificado_por: modificadoPor,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('lectura_registrada', notification.data);
  }

  /**
   * Notificación de factura generada
   */
  facturaGenerada(facturaData, modificadoPor) {
    const notification = {
      type: 'factura_generada',
      data: {
        factura: facturaData,
        modificado_por: modificadoPor,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('factura_generada', notification.data);
  }

  /**
   * Notificación de pago registrado
   */
  pagoRegistrado(pagoData, modificadoPor) {
    const notification = {
      type: 'pago_registrado',
      data: {
        pago: pagoData,
        modificado_por: modificadoPor,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('pago_registrado', notification.data);
  }

  /**
   * Notificación de tarifa actualizada
   */
  tarifaActualizada(tarifaData, modificadoPor) {
    const notification = {
      type: 'tarifa_actualizada',
      data: {
        tarifa: tarifaData,
        modificado_por: modificadoPor,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('tarifa_actualizada', notification.data);
  }

  /**
   * Notificación de ruta actualizada
   */
  rutaActualizada(rutaData, modificadoPor) {
    const notification = {
      type: 'ruta_actualizada',
      data: {
        ruta: rutaData,
        modificado_por: modificadoPor,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('ruta_actualizada', notification.data);
  }

  /**
   * Notificación de alerta del sistema
   */
  alertaSistema(mensaje, nivel = 'info', datos = {}) {
    const notification = {
      type: 'alerta_sistema',
      data: {
        mensaje,
        nivel, // info, warning, error, success
        datos,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('alerta_sistema', notification.data);
  }

  /**
   * Notificación de mantenimiento
   */
  mantenimientoSistema(tipo, mensaje, duracionEstimada = null) {
    const notification = {
      type: 'mantenimiento_sistema',
      data: {
        tipo, // programado, emergencia, completado
        mensaje,
        duracion_estimada: duracionEstimada,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('mantenimiento_sistema', notification.data);
  }

  /**
   * Notificación de actualización de estado
   */
  actualizacionEstado(servicio, estado, detalles = {}) {
    const notification = {
      type: 'actualizacion_estado',
      data: {
        servicio, // api, database, cache, etc.
        estado,   // online, offline, warning, error
        detalles,
        timestamp: new Date().toISOString()
      }
    };

    return this.sseManager.broadcast('actualizacion_estado', notification.data);
  }

  /**
   * Notificación personalizada
   */
  notificacionPersonalizada(tipo, datos, soloAutenticados = false) {
    const notification = {
      type: tipo,
      data: {
        ...datos,
        timestamp: new Date().toISOString()
      }
    };

    if (soloAutenticados) {
      return this.sseManager.broadcastToAuthenticated(tipo, notification.data);
    } else {
      return this.sseManager.broadcast(tipo, notification.data);
    }
  }

  /**
   * Obtener estadísticas de notificaciones
   */
  getEstadisticas() {
    return {
      notificaciones_enviadas: this.sseManager.getEventStats(),
      conexiones_activas: this.sseManager.getConnectionStats(),
      cola_pendiente: this.notificationQueue.length,
      timestamp: new Date().toISOString()
    };
  }
}

export default SSENotificationManager;
