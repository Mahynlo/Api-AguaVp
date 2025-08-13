/**
 * Notification Manager - Sistema de Notificaciones en Tiempo Real
 * 
 * File: src/sockets/enhanced/notificationManager.js
 * 
 * Maneja todas las notificaciones en tiempo real del sistema
 * Agua-VP, incluyendo notificaciones del negocio, alertas del sistema
 * y comunicaciones entre usuarios.
 */

class NotificationManager {
  constructor(socketIO) {
    this.io = socketIO;
    this.notificationQueue = new Map(); // userId -> notifications[]
    this.activeAlerts = new Map(); // alertId -> alert data
    this.notificationStats = {
      sent: 0,
      delivered: 0,
      failed: 0,
      byType: new Map()
    };
  }

  /**
   * Notificaciones específicas del negocio de agua
   */

  // Notificación de nueva factura generada
  notifyFacturaGenerada(facturaData, targetUsers = null) {
    const notification = {
      id: this.generateNotificationId(),
      type: 'factura_generada',
      title: 'Nueva Factura Generada',
      message: `Factura #${facturaData.numero} generada para ${facturaData.cliente_nombre}`,
      data: {
        factura_id: facturaData.id,
        numero: facturaData.numero,
        cliente: facturaData.cliente_nombre,
        monto: facturaData.monto_total,
        periodo: facturaData.periodo
      },
      priority: 'normal',
      category: 'facturacion',
      timestamp: new Date().toISOString(),
      expiresAt: this.getExpirationTime(24) // 24 horas
    };

    if (targetUsers) {
      this.sendToUsers(targetUsers, 'business_notification', notification);
    } else {
      this.io.to('facturas').emit('business_notification', notification);
    }

    this.trackNotification('factura_generada');
  }

  // Notificación de pago recibido
  notifyPagoRecibido(pagoData) {
    const notification = {
      id: this.generateNotificationId(),
      type: 'pago_recibido',
      title: 'Pago Recibido',
      message: `Pago de $${pagoData.monto} recibido de ${pagoData.cliente_nombre}`,
      data: {
        pago_id: pagoData.id,
        factura_id: pagoData.factura_id,
        cliente: pagoData.cliente_nombre,
        monto: pagoData.monto,
        metodo: pagoData.metodo_pago
      },
      priority: 'high',
      category: 'pagos',
      timestamp: new Date().toISOString(),
      actions: [
        {
          label: 'Ver Recibo',
          action: 'view_receipt',
          data: { pago_id: pagoData.id }
        }
      ]
    };

    // Notificar a equipo de administración y contabilidad
    this.io.to('admins').emit('business_notification', notification);
    this.io.to('pagos').emit('business_notification', notification);

    this.trackNotification('pago_recibido');
  }

  // Notificación de lectura de medidor completada
  notifyLecturaCompletada(lecturaData) {
    const notification = {
      id: this.generateNotificationId(),
      type: 'lectura_completada',
      title: 'Lectura de Medidor Completada',
      message: `Lectura registrada para medidor #${lecturaData.medidor_numero}`,
      data: {
        lectura_id: lecturaData.id,
        medidor_numero: lecturaData.medidor_numero,
        cliente: lecturaData.cliente_nombre,
        lectura_actual: lecturaData.lectura_actual,
        consumo: lecturaData.consumo_calculado,
        fecha_lectura: lecturaData.fecha_lectura
      },
      priority: 'normal',
      category: 'lecturas',
      timestamp: new Date().toISOString()
    };

    this.io.to('lecturas').emit('business_notification', notification);
    this.trackNotification('lectura_completada');
  }

  // Alerta de consumo anormal
  alertConsumoAnormal(medidorData) {
    const alert = {
      id: this.generateNotificationId(),
      type: 'consumo_anormal',
      severity: 'warning',
      title: 'Consumo Anormal Detectado',
      message: `Medidor #${medidorData.numero} registra consumo ${medidorData.variacion > 0 ? 'elevado' : 'bajo'} (${medidorData.variacion}%)`,
      data: {
        medidor_id: medidorData.id,
        numero: medidorData.numero,
        cliente: medidorData.cliente_nombre,
        consumo_promedio: medidorData.consumo_promedio,
        consumo_actual: medidorData.consumo_actual,
        variacion: medidorData.variacion,
        ubicacion: medidorData.ubicacion
      },
      priority: 'high',
      category: 'alertas',
      timestamp: new Date().toISOString(),
      requiresAction: true,
      actions: [
        {
          label: 'Revisar Medidor',
          action: 'inspect_meter',
          data: { medidor_id: medidorData.id }
        },
        {
          label: 'Contactar Cliente',
          action: 'contact_client',
          data: { cliente_id: medidorData.cliente_id }
        }
      ]
    };

    // Almacenar como alerta activa
    this.activeAlerts.set(alert.id, alert);

    // Notificar a supervisores y operadores de campo
    this.io.to('supervisors').emit('system_alert', alert);
    this.io.to('operators').emit('system_alert', alert);

    this.trackNotification('consumo_anormal');
  }

  // Alerta de cliente moroso
  alertClienteMoroso(clienteData) {
    const alert = {
      id: this.generateNotificationId(),
      type: 'cliente_moroso',
      severity: 'high',
      title: 'Cliente en Morosidad',
      message: `Cliente ${clienteData.nombre} tiene ${clienteData.facturas_pendientes} facturas pendientes`,
      data: {
        cliente_id: clienteData.id,
        nombre: clienteData.nombre,
        telefono: clienteData.telefono,
        facturas_pendientes: clienteData.facturas_pendientes,
        monto_total_adeudado: clienteData.monto_total_adeudado,
        dias_morosidad: clienteData.dias_morosidad
      },
      priority: 'high',
      category: 'cobranza',
      timestamp: new Date().toISOString(),
      requiresAction: true,
      actions: [
        {
          label: 'Ver Historial',
          action: 'view_payment_history',
          data: { cliente_id: clienteData.id }
        },
        {
          label: 'Programar Cobranza',
          action: 'schedule_collection',
          data: { cliente_id: clienteData.id }
        },
        {
          label: 'Suspender Servicio',
          action: 'suspend_service',
          data: { cliente_id: clienteData.id }
        }
      ]
    };

    this.activeAlerts.set(alert.id, alert);

    // Notificar a equipo de cobranza
    this.io.to('admins').emit('system_alert', alert);

    this.trackNotification('cliente_moroso');
  }

  // Alerta de falla del sistema
  alertFallaSistema(errorData) {
    const alert = {
      id: this.generateNotificationId(),
      type: 'system_failure',
      severity: 'critical',
      title: 'Falla del Sistema Detectada',
      message: `Error en ${errorData.component}: ${errorData.error_message}`,
      data: {
        component: errorData.component,
        error_type: errorData.error_type,
        error_message: errorData.error_message,
        stack_trace: errorData.stack_trace,
        affected_operations: errorData.affected_operations,
        estimated_impact: errorData.estimated_impact
      },
      priority: 'critical',
      category: 'system',
      timestamp: new Date().toISOString(),
      requiresAction: true,
      autoResolve: false
    };

    this.activeAlerts.set(alert.id, alert);

    // Notificar inmediatamente a todos los administradores
    this.io.to('admins').emit('critical_alert', alert);

    // También enviar por email/SMS si está configurado
    this.triggerExternalNotification(alert);

    this.trackNotification('system_failure');
  }

  /**
   * Notificaciones de progreso de tareas
   */
  notifyTaskProgress(taskId, progress, message, userId) {
    const notification = {
      taskId: taskId,
      progress: progress, // 0-100
      message: message,
      timestamp: new Date().toISOString()
    };

    if (userId) {
      this.sendToUser(userId, 'task_progress', notification);
    }
  }

  notifyTaskCompleted(taskId, result, userId) {
    const notification = {
      taskId: taskId,
      status: 'completed',
      result: result,
      completedAt: new Date().toISOString()
    };

    if (userId) {
      this.sendToUser(userId, 'task_completed', notification);
    }
  }

  /**
   * Sistema de notificaciones personalizadas
   */
  sendCustomNotification(userId, title, message, data = {}, options = {}) {
    const notification = {
      id: this.generateNotificationId(),
      type: 'custom',
      title: title,
      message: message,
      data: data,
      priority: options.priority || 'normal',
      category: options.category || 'general',
      timestamp: new Date().toISOString(),
      actions: options.actions || [],
      expiresAt: options.expiresAt || this.getExpirationTime(24)
    };

    this.sendToUser(userId, 'custom_notification', notification);
    this.trackNotification('custom');
  }

  /**
   * Broadcast a grupos específicos
   */
  broadcastToRole(role, event, data) {
    const roomMap = {
      admin: 'admins',
      supervisor: 'supervisors',
      operator: 'operators',
      viewer: 'viewers'
    };

    const room = roomMap[role];
    if (room) {
      this.io.to(room).emit(event, data);
      this.trackNotification(`broadcast_${role}`);
    }
  }

  broadcastMaintenance(maintenanceData) { // Notificación de mantenimiento programado
    const notification = {
      id: this.generateNotificationId(),
      type: 'maintenance',
      title: 'Mantenimiento Programado',
      message: `Mantenimiento del sistema programado para ${maintenanceData.scheduled_date}`,
      data: maintenanceData,
      priority: 'high',
      category: 'system',
      timestamp: new Date().toISOString()
    };

    this.io.emit('maintenance_notification', notification);
    this.trackNotification('maintenance');
  }

  /**
   * Gestión de alertas activas
   */
  resolveAlert(alertId, resolvedBy, resolution) {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedBy = resolvedBy;
      alert.resolution = resolution;
      alert.resolvedAt = new Date().toISOString();

      // Notificar resolución
      this.io.emit('alert_resolved', {
        alertId: alertId,
        resolvedBy: resolvedBy,
        resolution: resolution,
        originalAlert: alert
      });

      // Remover de alertas activas si no es persistente
      if (alert.autoResolve !== false) {
        this.activeAlerts.delete(alertId);
      }
    }
  }

  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Métodos de utilidad
   */
  sendToUser(userId, event, data) {
    // Encontrar socket del usuario específico
    const userSocket = this.findUserSocket(userId);
    if (userSocket) {
      userSocket.emit(event, data);
      this.notificationStats.delivered++;
    } else {
      // Agregar a cola si el usuario no está conectado
      this.queueNotification(userId, event, data);
      console.log(`Usuario ${userId} no conectado, notificación en cola`);
    }
  }

  sendToUsers(userIds, event, data) { // Enviar notificación a múltiples usuarios
    userIds.forEach(userId => {
      this.sendToUser(userId, event, data);
    });
  }

  queueNotification(userId, event, data) { // Agregar notificación a la cola del usuario
    if (!this.notificationQueue.has(userId)) {
      this.notificationQueue.set(userId, []);
    }
    
    this.notificationQueue.get(userId).push({
      event: event,
      data: data,
      queuedAt: new Date().toISOString()
    });

    // Limpiar notificaciones viejas (más de 7 días)
    this.cleanOldQueuedNotifications(userId);
  }

  deliverQueuedNotifications(userId) {
    const queuedNotifications = this.notificationQueue.get(userId);
    if (queuedNotifications && queuedNotifications.length > 0) {
      const userSocket = this.findUserSocket(userId);
      if (userSocket) {
        queuedNotifications.forEach(notification => {
          userSocket.emit(notification.event, notification.data);
        });
        
        // Limpiar cola después de entregar
        this.notificationQueue.delete(userId);
        console.log(`Entregadas ${queuedNotifications.length} notificaciones en cola para usuario ${userId}`);
      }
    }
  }

  findUserSocket(userId) {
    // Este método debería ser implementado según la estructura del SocketManager
    // Por ahora retornamos null
    return null;
  }

  generateNotificationId() { // Generar un ID único para la notificación
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getExpirationTime(hours) { // Obtener tiempo de expiración para notificaciones
    const now = new Date();
    now.setHours(now.getHours() + hours);
    return now.toISOString();
  }

  trackNotification(type) { // Registrar estadísticas de notificación
    this.notificationStats.sent++;
    const current = this.notificationStats.byType.get(type) || 0;
    this.notificationStats.byType.set(type, current + 1);
  }

  cleanOldQueuedNotifications(userId) { // Limpiar notificaciones en cola más viejas de 7 días
    const queue = this.notificationQueue.get(userId);
    if (queue) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const filteredQueue = queue.filter(notification => {
        return new Date(notification.queuedAt) > sevenDaysAgo;
      });

      if (filteredQueue.length !== queue.length) {
        this.notificationQueue.set(userId, filteredQueue);
      }
    }
  }

  triggerExternalNotification(alert) { 
    // Aquí se podría integrar con servicios externos como:
    // - SendGrid para emails
    // - Twilio para SMS
    // - Slack/Discord webhooks
    // - Push notifications
    
    console.log('🚨 ALERTA CRÍTICA - Activar notificaciones externas:', alert.title);
  }

  /**
   * Estadísticas y métricas
   */
  getNotificationStats() {
    return {
      ...this.notificationStats,
      activeAlerts: this.activeAlerts.size,
      queuedNotifications: Array.from(this.notificationQueue.values())
        .reduce((total, queue) => total + queue.length, 0),
      byTypeBreakdown: Object.fromEntries(this.notificationStats.byType)
    };
  }

  /**
   * Métodos para integración con controladores
   */
  
  // Integración con facturasController
  onFacturaCreated(facturaData) {
    this.notifyFacturaGenerada(facturaData);
  }

  onFacturaVencida(facturaData) {
    this.alertClienteMoroso({
      id: facturaData.cliente_id,
      nombre: facturaData.cliente_nombre,
      telefono: facturaData.cliente_telefono,
      facturas_pendientes: 1, // Se calcularía dinámicamente
      monto_total_adeudado: facturaData.monto_total,
      dias_morosidad: this.calculateDaysPastDue(facturaData.fecha_vencimiento)
    });
  }

  // Integración con pagosController
  onPagoReceived(pagoData) {
    this.notifyPagoRecibido(pagoData);
  }

  // Integración con lecturasController
  onLecturaCompleted(lecturaData) {
    this.notifyLecturaCompletada(lecturaData);
    
    // Verificar si el consumo es anormal
    if (this.isConsumoAnormal(lecturaData)) {
      this.alertConsumoAnormal({
        id: lecturaData.medidor_id,
        numero: lecturaData.medidor_numero,
        cliente_nombre: lecturaData.cliente_nombre,
        consumo_promedio: lecturaData.consumo_promedio,
        consumo_actual: lecturaData.consumo_calculado,
        variacion: this.calculateVariacion(lecturaData),
        ubicacion: lecturaData.ubicacion
      });
    }
  }

  // Métodos de cálculo auxiliares
  calculateDaysPastDue(fechaVencimiento) {
    const today = new Date();
    const dueDate = new Date(fechaVencimiento);
    const diffTime = today - dueDate;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isConsumoAnormal(lecturaData) {
    const variacion = this.calculateVariacion(lecturaData);
    return Math.abs(variacion) > 50; // Más del 50% de variación
  }

  calculateVariacion(lecturaData) {
    if (lecturaData.consumo_promedio === 0) return 0;
    return ((lecturaData.consumo_calculado - lecturaData.consumo_promedio) / lecturaData.consumo_promedio) * 100;
  }
}

export default NotificationManager;
