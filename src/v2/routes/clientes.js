/**
 * Rutas para gestión de clientes - V2
 * 
 * File: src/v2/routes/clientes.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para manejar operaciones CRUD de clientes en la versión 2 de la API.
 * Mantiene compatibilidad total con los endpoints de V1 mientras utiliza 
 * la arquitectura moderna V2 con Turso database y Server-Sent Events.
 * 
 * Funcionalidades V1 preservadas:
 * - POST /registrar: Registrar un nuevo cliente con validación completa
 * - GET /listar: Listar todos los clientes con información de medidores
 * - PUT /modificar/:id: Modificar datos de cliente existente
 * 
 * Cambios en V2:
 * - Integración con sistema SSE para notificaciones en tiempo real
 * - Migración a controladores que usan Turso database (@libsql/client)
 * - Mantiene compatibilidad exacta con endpoints de V1
 * - Configuración automática de managers SSE
 * - Mejor manejo de errores y validaciones
 * - Respuestas estandarizadas con metadatos
 * 
 * Arquitectura:
 * - Base de datos: Turso (compatible con SQLite)
 * - Notificaciones: Server-Sent Events (SSE)
 * - Autenticación: JWT tokens
 * - Validación: App key middleware
 * - Integración: Automática con SSE managers
 * 
 * @author Sistema AguaVP
 * @version 2.0.0
 * @since 1.0.0
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import clientesController, { setSSEManagers } from '../controllers/clientesController.js';

const router = express.Router();

// ===================================================================
// SSE CONFIGURATION MIDDLEWARE
// ===================================================================

// Configurar managers SSE al cargar el módulo
let sseManagerConfigured = false;

/**
 * Middleware para configuración automática de SSE managers
 * Configura los managers de SSE y notificaciones al primer uso
 * Esto permite notificaciones en tiempo real para todas las operaciones de clientes
 */
const configureSSE = (req, res, next) => {
    if (!sseManagerConfigured && req.app) {
        const sseManager = req.app.get('sseManager');
        const notificationManager = req.app.get('notificationManager');
        
        if (sseManager && notificationManager) {
            setSSEManagers(sseManager, notificationManager);
            sseManagerConfigured = true;
            console.log('✅ SSE Managers configurados para clientes V2');
        } else {
            console.log('⚠️ SSE Managers no encontrados en la aplicación');
        }
    }
    next();
};

// ===================================================================
// SWAGGER DOCUMENTATION TAGS
// ===================================================================

/**
 * @swagger
 * tags:
 *   name: Clientes V2
 *   description: |
 *     **Gestión de Clientes - API V2**
 *     
 *     Rutas de clientes versión 2 con integración SSE y arquitectura moderna.
 *     Mantiene compatibilidad total con endpoints V1 mientras proporciona
 *     notificaciones en tiempo real y mejor rendimiento.
 *     
 *     **Características V2:**
 *     - Base de datos Turso con alta disponibilidad
 *     - Server-Sent Events para notificaciones en tiempo real
 *     - Configuración automática de managers SSE
 *     - Compatibilidad completa con API V1
 *     - Validaciones mejoradas y manejo de errores
 *     
 *     **Endpoints compatibles con V1:**
 *     - POST /registrar: Mismo comportamiento que V1
 *     - GET /listar: Misma estructura de respuesta que V1
 *     - PUT /modificar/:id: Misma funcionalidad que V1
 *     
 *     **Mejoras técnicas:**
 *     - Uso de @libsql/client para Turso
 *     - Notificaciones automáticas vía SSE
 *     - Mejor manejo de concurrencia
 *     - Respuestas con metadatos adicionales
 */

// ===================================================================
// ENDPOINT IMPLEMENTATIONS - V1 COMPATIBLE
// ===================================================================

/**
 * @swagger
 * /api/v2/clientes/registrar:
 *   post:
 *     summary: Registrar un nuevo cliente (V2 - Compatible con V1)
 *     description: |
 *       Registra un nuevo cliente manteniendo compatibilidad total con V1.
 *       Utiliza arquitectura V2 con Turso database y notificaciones SSE.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos requeridos
 *       - Misma validación de duplicados
 *       - Misma estructura de respuesta
 *       
 *       **Mejoras V2:**
 *       - Notificaciones SSE automáticas
 *       - Base de datos Turso distribuida
 *       - Mejor manejo de errores
 *     tags: [Clientes V2]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - apellido
 *               - correo
 *               - telefono
 *               - direccion
 *               - ciudad
 *               - estado_cliente
 *               - modificado_por
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: "Juan Carlos"
 *               apellido:
 *                 type: string
 *                 example: "García López"
 *               correo:
 *                 type: string
 *                 format: email
 *                 example: "juan.garcia@email.com"
 *               telefono:
 *                 type: string
 *                 example: "+57 300 123 4567"
 *               direccion:
 *                 type: string
 *                 example: "Calle 123 #45-67"
 *               ciudad:
 *                 type: string
 *                 example: "Bogotá"
 *               estado_cliente:
 *                 type: string
 *                 enum: [activo, inactivo, suspendido, moroso]
 *                 example: "activo"
 *               modificado_por:
 *                 type: string
 *                 example: "admin"
 *     responses:
 *       201:
 *         description: Cliente registrado exitosamente
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: Cliente ya existe
 *       500:
 *         description: Error interno del servidor
 */

// Rutas adaptadas de V1 con los mismos endpoints exactos
router.post("/registrar", configureSSE, authMiddleware, clientesController.registrarCliente);

/**
 * @swagger
 * /api/v2/clientes/listar:
 *   get:
 *     summary: Listar todos los clientes (V2 - Compatible con V1)
 *     description: |
 *       Lista todos los clientes del sistema manteniendo compatibilidad con V1.
 *       Utiliza consultas optimizadas en Turso y notificaciones SSE.
 *       
 *       **Compatibilidad V1:**
 *       - Misma estructura de respuesta
 *       - Mismos datos incluidos
 *       - Mismo ordenamiento
 *       
 *       **Mejoras V2:**
 *       - Consultas optimizadas en Turso
 *       - Actualizaciones automáticas vía SSE
 *       - Mejor rendimiento en consultas grandes
 *     tags: [Clientes V2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de clientes obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Lista de clientes obtenida exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       nombre:
 *                         type: string
 *                         example: "Juan Carlos"
 *                       apellido:
 *                         type: string
 *                         example: "García López"
 *                       correo:
 *                         type: string
 *                         example: "juan.garcia@email.com"
 *                       telefono:
 *                         type: string
 *                         example: "+57 300 123 4567"
 *                       direccion:
 *                         type: string
 *                         example: "Calle 123 #45-67"
 *                       ciudad:
 *                         type: string
 *                         example: "Bogotá"
 *                       estado_cliente:
 *                         type: string
 *                         example: "activo"
 *                       fecha_registro:
 *                         type: string
 *                         format: date-time
 *                       modificado_por:
 *                         type: string
 *                         example: "admin"
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.get("/listar", configureSSE, authMiddleware, clientesController.obtenerClientes);

/**
 * @swagger
 * /api/v2/clientes/modificar/{id}:
 *   put:
 *     summary: Modificar un cliente existente (V2 - Compatible con V1)
 *     description: |
 *       Modifica los datos de un cliente existente manteniendo compatibilidad con V1.
 *       Utiliza transacciones Turso y notificaciones SSE automáticas.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos modificables
 *       - Misma validación
 *       - Misma estructura de respuesta
 *       
 *       **Mejoras V2:**
 *       - Transacciones atómicas en Turso
 *       - Notificaciones SSE automáticas
 *       - Mejor validación de concurrencia
 *     tags: [Clientes V2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID del cliente a modificar
 *         schema:
 *           type: string
 *           example: "1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: "Juan Carlos"
 *               apellido:
 *                 type: string
 *                 example: "García López"
 *               correo:
 *                 type: string
 *                 format: email
 *                 example: "juan.garcia@email.com"
 *               telefono:
 *                 type: string
 *                 example: "+57 300 123 4567"
 *               direccion:
 *                 type: string
 *                 example: "Calle 123 #45-67"
 *               ciudad:
 *                 type: string
 *                 example: "Bogotá"
 *               estado_cliente:
 *                 type: string
 *                 enum: [activo, inactivo, suspendido, moroso]
 *                 example: "activo"
 *               modificado_por:
 *                 type: string
 *                 example: "admin"
 *     responses:
 *       200:
 *         description: Cliente modificado exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Cliente no encontrado
 *       500:
 *         description: Error interno del servidor
 */
router.put("/modificar/:id", configureSSE, authMiddleware, clientesController.modificarCliente);

/**
 * @swagger
 * /api/v2/clientes/{id}/asignar-tarifa:
 *   put:
 *     summary: Asignar tarifa a un cliente
 *     description: |
 *       Operación especializada para cambiar la tarifa de un cliente.
 *       Valida que la tarifa exista y registra el cambio en el historial.
 *       Envía notificación SSE automáticamente.
 *       
 *       **Características:**
 *       - Validación de existencia de cliente y tarifa
 *       - Previene asignación duplicada
 *       - Registro completo en historial de cambios
 *       - Notificación en tiempo real vía SSE
 *     tags: [Clientes V2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID del cliente
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tarifa_id
 *             properties:
 *               tarifa_id:
 *                 type: integer
 *                 description: ID de la tarifa a asignar
 *                 example: 2
 *     responses:
 *       200:
 *         description: Tarifa asignada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: "Tarifa asignada exitosamente"
 *                 cliente_id:
 *                   type: integer
 *                   example: 1
 *                 tarifa_anterior:
 *                   type: integer
 *                   nullable: true
 *                   example: 1
 *                 tarifa_nueva:
 *                   type: integer
 *                   example: 2
 *                 tarifa_nombre:
 *                   type: string
 *                   example: "Tarifa Residencial Alta"
 *                 tarifa_descripcion:
 *                   type: string
 *                   example: "Tarifa para consumo residencial elevado"
 *       400:
 *         description: Tarifa ya asignada o datos inválidos
 *       404:
 *         description: Cliente o tarifa no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.put("/:id/asignar-tarifa", configureSSE, authMiddleware, clientesController.asignarTarifa);

/**
 * @swagger
 * /api/v2/clientes/estadisticas:
 *   get:
 *     summary: Obtener estadísticas y analíticas de clientes
 *     description: |
 *       Retorna estadísticas completas sobre los clientes del sistema.
 *       Incluye métricas de registro, distribución geográfica, estados,
 *       asignación de medidores y tendencias temporales.
 *       
 *       **Métricas incluidas:**
 *       - Total de clientes y registros recientes
 *       - Distribución por estado (activos/inactivos)
 *       - Distribución geográfica por ciudad
 *       - Distribución por tipo de tarifa
 *       - Tendencias de registro (mensual y anual)
 *       - Estadísticas de medidores asignados
 *       
 *       **Útil para:**
 *       - Dashboards administrativos
 *       - Reportes gerenciales
 *       - Análisis de crecimiento
 *       - Gráficas y visualizaciones
 *     tags: [Clientes V2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resumen:
 *                   type: object
 *                   properties:
 *                     total_clientes:
 *                       type: integer
 *                       example: 150
 *                     clientes_ultimo_mes:
 *                       type: integer
 *                       example: 12
 *                     clientes_activos:
 *                       type: integer
 *                       example: 140
 *                     clientes_inactivos:
 *                       type: integer
 *                       example: 10
 *                     clientes_con_medidores:
 *                       type: integer
 *                       example: 135
 *                     clientes_sin_medidores:
 *                       type: integer
 *                       example: 15
 *                     total_medidores_asignados:
 *                       type: integer
 *                       example: 145
 *                 distribucion:
 *                   type: object
 *                   properties:
 *                     por_estado:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           estado:
 *                             type: string
 *                             example: "Activo"
 *                           cantidad:
 *                             type: integer
 *                             example: 140
 *                     por_ciudad:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           ciudad:
 *                             type: string
 *                             example: "Bogotá"
 *                           cantidad:
 *                             type: integer
 *                             example: 85
 *                     por_tarifa:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tarifa_nombre:
 *                             type: string
 *                             example: "Tarifa Residencial"
 *                           tarifa_descripcion:
 *                             type: string
 *                             example: "Tarifa para uso residencial básico"
 *                           cantidad_clientes:
 *                             type: integer
 *                             example: 120
 *                 tendencias:
 *                   type: object
 *                   properties:
 *                     registros_por_mes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           mes:
 *                             type: string
 *                             example: "2024-12"
 *                           cantidad:
 *                             type: integer
 *                             example: 8
 *                     registros_ano_actual:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           mes:
 *                             type: string
 *                             example: "Ene"
 *                           cantidad:
 *                             type: integer
 *                             example: 10
 *                 medidores:
 *                   type: object
 *                   properties:
 *                     clientes_con_medidores:
 *                       type: integer
 *                       example: 135
 *                     clientes_sin_medidores:
 *                       type: integer
 *                       example: 15
 *                     total_medidores_asignados:
 *                       type: integer
 *                       example: 145
 *                     porcentaje_con_medidores:
 *                       type: string
 *                       example: "90.00"
 *                 fecha_generacion:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-12-09T10:30:00.000Z"
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.get("/estadisticas", configureSSE, authMiddleware, clientesController.estadisticas);

// ===================================================================
// SOFT DELETE ENDPOINTS
// ===================================================================

/**
 * @swagger
 * /api/v2/clientes/{id}/eliminar:
 *   delete:
 *     summary: Eliminar cliente (soft delete)
 *     description: Marca un cliente como eliminado sin borrar sus datos. Preserva el historial de facturas y medidores.
 *     tags: [Clientes V2]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del cliente a eliminar
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               razon:
 *                 type: string
 *                 example: "Cliente duplicado"
 *     responses:
 *       200:
 *         description: Cliente eliminado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cliente eliminado correctamente"
 *                 cliente_id:
 *                   type: integer
 *                   example: 123
 *       400:
 *         description: Cliente ya eliminado o tiene facturas pendientes
 *       404:
 *         description: Cliente no encontrado
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.delete("/:id/eliminar", configureSSE, authMiddleware, clientesController.eliminarCliente);

/**
 * @swagger
 * /api/v2/clientes/{id}/restaurar:
 *   put:
 *     summary: Restaurar cliente eliminado
 *     description: Recupera un cliente de la "papelera" cambiando su estado a Activo
 *     tags: [Clientes V2]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del cliente a restaurar
 *     responses:
 *       200:
 *         description: Cliente restaurado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cliente restaurado correctamente"
 *                 cliente_id:
 *                   type: integer
 *                   example: 123
 *       400:
 *         description: Cliente no está eliminado
 *       404:
 *         description: Cliente no encontrado
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.put("/:id/restaurar", configureSSE, authMiddleware, clientesController.restaurarCliente);

/**
 * @swagger
 * /api/v2/clientes/eliminados:
 *   get:
 *     summary: Obtener clientes eliminados
 *     description: Lista todos los clientes que están en estado "Eliminado" (papelera)
 *     tags: [Clientes V2]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de clientes eliminados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 5
 *                 clientes_eliminados:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 123
 *                       nombre:
 *                         type: string
 *                         example: "Juan Pérez"
 *                       direccion:
 *                         type: string
 *                         example: "Calle 123"
 *                       telefono:
 *                         type: string
 *                         example: "555-1234"
 *                       ciudad:
 *                         type: string
 *                         example: "Bogotá"
 *                       correo:
 *                         type: string
 *                         example: "juan@example.com"
 *                       fecha_eliminacion:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-12-09T15:30:00"
 *                       razon_eliminacion:
 *                         type: string
 *                         example: "Cliente duplicado"
 *                       eliminado_por_nombre:
 *                         type: string
 *                         example: "Admin Usuario"
 *                       total_facturas:
 *                         type: integer
 *                         example: 12
 *                       total_medidores:
 *                         type: integer
 *                         example: 1
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.get("/eliminados", configureSSE, authMiddleware, clientesController.obtenerClientesEliminados);

// ===================================================================
// EXPORT MODULE
// ===================================================================

export default router;
