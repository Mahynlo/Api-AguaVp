/**
 * Rutas para gestión de rutas de distribución - V2
 * 
 * File: src/v2/routes/rutas.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para manejar operaciones CRUD de rutas de distribución en la versión 2 de la API.
 * Mantiene compatibilidad total con los endpoints de V1 mientras utiliza 
 * la arquitectura moderna V2 con Turso database y Server-Sent Events.
 * 
 * Funcionalidades V1 preservadas:
 * - POST /crear: Crear una nueva ruta de distribución
 * - POST /agregar-medidor: Agregar medidor a una ruta existente
 * - GET /:ruta_id/medidores: Obtener medidores asignados a una ruta específica
 * - GET /listar: Listar todas las rutas de distribución
 * 
 * Cambios en V2:
 * - Integración con sistema SSE para notificaciones en tiempo real
 * - Migración a controladores que usan Turso database (@libsql/client)
 * - Mantiene compatibilidad exacta con endpoints de V1
 * - Configuración automática de managers SSE
 * - Mejor manejo de errores y validaciones
 * - Respuestas estandarizadas con metadatos
 * - Gestión optimizada de asignación de medidores
 * 
 * Arquitectura:
 * - Base de datos: Turso (compatible con SQLite)
 * - Notificaciones: Server-Sent Events (SSE)
 * - Autenticación: JWT tokens
 * - Validación: App key middleware
 * - Integración: Automática con SSE managers
 * 
 * Dependencias de tablas:
 * - rutas: Tabla principal de rutas de distribución
 * - medidores: Medidores asignados a las rutas
 * - clientes: Clientes asociados a los medidores en las rutas
 * - lecturas: Lecturas tomadas por ruta
 * - usuarios: Usuario que crea/modifica rutas
 * 
 * Seguridad:
 * - Autenticación JWT requerida
 * - Validación de clave de aplicación
 * - Sanitización de datos de entrada
 * - Auditoría de cambios en rutas
 * 
 * Notas de compatibilidad:
 * - Mantiene exactamente los mismos endpoints que V1
 * - Preserva estructura de respuestas V1
 * - Compatible con clientes existentes de la API
 * - Mismo algoritmo de asignación de medidores
 * 
 * @author Sistema AguaVP
 * @version 2.0.0
 * @since 1.0.0
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import rutasController, { setSSEManagers } from '../controllers/rutasController.js';

const router = express.Router();

// Configurar managers SSE al cargar el módulo
let sseManagerConfigured = false;
const configureSSE = (req, res, next) => {
    if (!sseManagerConfigured && req.app) {
        const sseManager = req.app.get('sseManager');
        const notificationManager = req.app.get('notificationManager');
        
        if (sseManager && notificationManager) {
            setSSEManagers(sseManager, notificationManager);
            sseManagerConfigured = true;
        }
    }
    next();
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Ruta:
 *       type: object
 *       required:
 *         - nombre
 *         - descripcion
 *         - usuario_id
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único de la ruta de distribución
 *           example: 1
 *         nombre:
 *           type: string
 *           minLength: 3
 *           maxLength: 100
 *           description: Nombre descriptivo de la ruta
 *           example: "Ruta Centro Norte"
 *         descripcion:
 *           type: string
 *           maxLength: 500
 *           description: Descripción detallada de la ruta
 *           example: "Ruta que incluye el centro y zona norte de la ciudad"
 *         usuario_id:
 *           type: integer
 *           description: ID del usuario responsable de la ruta
 *           example: 1
 *         estado:
 *           type: string
 *           enum: [activa, inactiva, mantenimiento]
 *           default: activa
 *           description: Estado actual de la ruta
 *           example: "activa"
 *         fecha_creacion:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación de la ruta
 *           example: "2024-01-15T10:30:00Z"
 *         fecha_actualizacion:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 *           example: "2024-01-16T14:20:00Z"
 *     
 *     RutaConMedidores:
 *       allOf:
 *         - $ref: '#/components/schemas/Ruta'
 *         - type: object
 *           properties:
 *             medidores:
 *               type: array
 *               description: Lista de medidores asignados a la ruta
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID del medidor
 *                     example: 1
 *                   numero_medidor:
 *                     type: string
 *                     description: Número único del medidor
 *                     example: "MED-001"
 *                   cliente_nombre:
 *                     type: string
 *                     description: Nombre del cliente asociado
 *                     example: "Juan Pérez"
 *                   direccion:
 *                     type: string
 *                     description: Dirección del medidor
 *                     example: "Av. Principal 123"
 *                   estado:
 *                     type: string
 *                     description: Estado del medidor
 *                     example: "activo"
 *                   orden:
 *                     type: integer
 *                     description: Orden del medidor en la ruta
 *                     example: 1
 *                   fecha_asignacion:
 *                     type: string
 *                     format: date-time
 *                     description: Fecha de asignación a la ruta
 *                     example: "2024-01-15T10:30:00Z"
 *     
 *     AsignacionMedidor:
 *       type: object
 *       required:
 *         - ruta_id
 *         - medidor_id
 *       properties:
 *         ruta_id:
 *           type: integer
 *           description: ID de la ruta a la que se asignará el medidor
 *           example: 1
 *         medidor_id:
 *           type: integer
 *           description: ID del medidor a asignar
 *           example: 5
 *         orden:
 *           type: integer
 *           minimum: 1
 *           description: Orden del medidor en la ruta (opcional, se asigna automáticamente si no se especifica)
 *           example: 3
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Observaciones sobre la asignación
 *           example: "Medidor asignado por expansión de ruta"
 *     
 *     RespuestaRuta:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indica si la operación fue exitosa
 *           example: true
 *         message:
 *           type: string
 *           description: Mensaje descriptivo del resultado
 *           example: "Ruta creada exitosamente"
 *         data:
 *           $ref: '#/components/schemas/Ruta'
 *         metadata:
 *           type: object
 *           properties:
 *             timestamp:
 *               type: string
 *               format: date-time
 *               description: Timestamp de la operación
 *               example: "2024-01-15T10:30:00Z"
 *             version:
 *               type: string
 *               description: Versión de la API
 *               example: "2.0.0"
 *             request_id:
 *               type: string
 *               description: ID único de la solicitud
 *               example: "req_abc123"
 *             sse_notification:
 *               type: boolean
 *               description: Indica si se envió notificación SSE
 *               example: true
 *     
 *     RespuestaListaRutas:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indica si la operación fue exitosa
 *           example: true
 *         message:
 *           type: string
 *           description: Mensaje descriptivo del resultado
 *           example: "Rutas obtenidas exitosamente"
 *         data:
 *           type: array
 *           description: Lista de rutas de distribución
 *           items:
 *             $ref: '#/components/schemas/Ruta'
 *         metadata:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: Total de rutas encontradas
 *               example: 15
 *             timestamp:
 *               type: string
 *               format: date-time
 *               description: Timestamp de la operación
 *               example: "2024-01-15T10:30:00Z"
 *             version:
 *               type: string
 *               description: Versión de la API
 *               example: "2.0.0"
 *     
 *     RespuestaRutaConMedidores:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indica si la operación fue exitosa
 *           example: true
 *         message:
 *           type: string
 *           description: Mensaje descriptivo del resultado
 *           example: "Ruta con medidores obtenida exitosamente"
 *         data:
 *           $ref: '#/components/schemas/RutaConMedidores'
 *         metadata:
 *           type: object
 *           properties:
 *             timestamp:
 *               type: string
 *               format: date-time
 *               description: Timestamp de la operación
 *               example: "2024-01-15T10:30:00Z"
 *             version:
 *               type: string
 *               description: Versión de la API
 *               example: "2.0.0"
 *             total_medidores:
 *               type: integer
 *               description: Total de medidores en la ruta
 *               example: 25
 *     
 *     ErrorRutas:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           description: Mensaje de error
 *           example: "Error al procesar la ruta"
 *         error:
 *           type: string
 *           description: Detalles técnicos del error
 *           example: "Validation failed: nombre is required"
 *         code:
 *           type: string
 *           description: Código de error específico
 *           example: "RUTA_VALIDATION_ERROR"
 *         metadata:
 *           type: object
 *           properties:
 *             timestamp:
 *               type: string
 *               format: date-time
 *               example: "2024-01-15T10:30:00Z"
 *             version:
 *               type: string
 *               example: "2.0.0"
 *             request_id:
 *               type: string
 *               example: "req_error_123"
 * 
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: x-api-key
 *       description: Clave de aplicación requerida para autenticación
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: Token JWT para autenticación de usuario
 * 
 * security:
 *   - ApiKeyAuth: []
 *   - BearerAuth: []
 * 
 * tags:
 *   name: Rutas V2
 *   description: Rutas de distribución v2 con SSE y compatibilidad V1
 */

/**
 * @swagger
 * /api/v2/rutas/crear:
 *   post:
 *     summary: Crear nueva ruta de distribución
 *     description: |
 *       Crea una nueva ruta de distribución para organizar la lectura de medidores.
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Notificación automática vía SSE cuando se crea la ruta
 *       - Integración con base de datos Turso para mejor rendimiento
 *       - Validaciones mejoradas de datos de entrada
 *       - Auditoría automática de creación de rutas
 *       - Manejo optimizado de errores con códigos específicos
 *     tags: [Rutas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - descripcion
 *               - usuario_id
 *             properties:
 *               nombre:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: Nombre descriptivo de la ruta
 *                 example: "Ruta Centro Norte"
 *               descripcion:
 *                 type: string
 *                 maxLength: 500
 *                 description: Descripción detallada de la ruta y zonas que cubre
 *                 example: "Ruta que incluye el centro y zona norte de la ciudad, aproximadamente 50 medidores"
 *               usuario_id:
 *                 type: integer
 *                 description: ID del usuario responsable de la ruta
 *                 example: 1
 *               estado:
 *                 type: string
 *                 enum: [activa, inactiva, mantenimiento]
 *                 default: activa
 *                 description: Estado inicial de la ruta
 *                 example: "activa"
 *           examples:
 *             nueva_ruta_residencial:
 *               summary: Ruta residencial típica
 *               value:
 *                 nombre: "Ruta Residencial A1"
 *                 descripcion: "Zona residencial del sector A, incluye calles principales y secundarias"
 *                 usuario_id: 1
 *                 estado: "activa"
 *             nueva_ruta_comercial:
 *               summary: Ruta comercial céntrica
 *               value:
 *                 nombre: "Ruta Comercial Centro"
 *                 descripcion: "Zona comercial del centro de la ciudad, alta densidad de medidores"
 *                 usuario_id: 2
 *                 estado: "activa"
 *     responses:
 *       201:
 *         description: Ruta creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaRuta'
 *             examples:
 *               ruta_creada:
 *                 summary: Ruta creada correctamente
 *                 value:
 *                   success: true
 *                   message: "Ruta creada exitosamente"
 *                   data:
 *                     id: 1
 *                     nombre: "Ruta Centro Norte"
 *                     descripcion: "Ruta que incluye el centro y zona norte de la ciudad"
 *                     usuario_id: 1
 *                     estado: "activa"
 *                     fecha_creacion: "2024-01-15T10:30:00Z"
 *                     fecha_actualizacion: "2024-01-15T10:30:00Z"
 *                   metadata:
 *                     timestamp: "2024-01-15T10:30:00Z"
 *                     version: "2.0.0"
 *                     request_id: "req_crear_ruta_001"
 *                     sse_notification: true
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *             examples:
 *               datos_invalidos:
 *                 summary: Error de validación
 *                 value:
 *                   success: false
 *                   message: "Datos de entrada inválidos"
 *                   error: "El nombre de la ruta es requerido y debe tener al menos 3 caracteres"
 *                   code: "VALIDATION_ERROR"
 *                   metadata:
 *                     timestamp: "2024-01-15T10:30:00Z"
 *                     version: "2.0.0"
 *                     request_id: "req_error_001"
 *       401:
 *         description: No autorizado - token inválido o faltante
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *       403:
 *         description: Acceso denegado - permisos insuficientes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *       409:
 *         description: Conflicto - ruta con ese nombre ya existe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *             examples:
 *               ruta_duplicada:
 *                 summary: Nombre de ruta duplicado
 *                 value:
 *                   success: false
 *                   message: "Ya existe una ruta con ese nombre"
 *                   error: "Duplicate entry for route name: Ruta Centro Norte"
 *                   code: "DUPLICATE_ROUTE_NAME"
 *                   metadata:
 *                     timestamp: "2024-01-15T10:30:00Z"
 *                     version: "2.0.0"
 *                     request_id: "req_conflict_001"
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 * 
 * /api/v2/rutas/agregar-medidor:
 *   post:
 *     summary: Agregar medidor a ruta existente
 *     description: |
 *       Asigna un medidor específico a una ruta de distribución existente.
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Notificación automática vía SSE cuando se asigna el medidor
 *       - Validación de que el medidor no esté ya asignado a otra ruta
 *       - Cálculo automático del orden en la ruta si no se especifica
 *       - Verificación de estado del medidor antes de asignación
 *       - Auditoría de cambios en asignaciones
 *     tags: [Rutas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AsignacionMedidor'
 *           examples:
 *             asignacion_automatica:
 *               summary: Asignación con orden automático
 *               value:
 *                 ruta_id: 1
 *                 medidor_id: 5
 *                 observaciones: "Medidor añadido por expansión de cobertura"
 *             asignacion_con_orden:
 *               summary: Asignación con orden específico
 *               value:
 *                 ruta_id: 1
 *                 medidor_id: 8
 *                 orden: 3
 *                 observaciones: "Inserción en posición específica por optimización de ruta"
 *     responses:
 *       200:
 *         description: Medidor asignado exitosamente a la ruta
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
 *                   example: "Medidor asignado exitosamente a la ruta"
 *                 data:
 *                   type: object
 *                   properties:
 *                     ruta_id:
 *                       type: integer
 *                       example: 1
 *                     medidor_id:
 *                       type: integer
 *                       example: 5
 *                     orden:
 *                       type: integer
 *                       example: 4
 *                     fecha_asignacion:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T11:45:00Z"
 *                     observaciones:
 *                       type: string
 *                       example: "Medidor añadido por expansión de cobertura"
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T11:45:00Z"
 *                     version:
 *                       type: string
 *                       example: "2.0.0"
 *                     request_id:
 *                       type: string
 *                       example: "req_asignar_medidor_001"
 *                     sse_notification:
 *                       type: boolean
 *                       example: true
 *             examples:
 *               medidor_asignado:
 *                 summary: Asignación exitosa
 *                 value:
 *                   success: true
 *                   message: "Medidor asignado exitosamente a la ruta"
 *                   data:
 *                     ruta_id: 1
 *                     medidor_id: 5
 *                     orden: 4
 *                     fecha_asignacion: "2024-01-15T11:45:00Z"
 *                     observaciones: "Medidor añadido por expansión de cobertura"
 *                   metadata:
 *                     timestamp: "2024-01-15T11:45:00Z"
 *                     version: "2.0.0"
 *                     request_id: "req_asignar_001"
 *                     sse_notification: true
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *             examples:
 *               datos_invalidos:
 *                 summary: Error de validación
 *                 value:
 *                   success: false
 *                   message: "Datos de entrada inválidos"
 *                   error: "ruta_id y medidor_id son requeridos"
 *                   code: "VALIDATION_ERROR"
 *       404:
 *         description: Ruta o medidor no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *             examples:
 *               ruta_no_encontrada:
 *                 summary: Ruta no existe
 *                 value:
 *                   success: false
 *                   message: "Ruta no encontrada"
 *                   error: "No existe ruta con ID: 999"
 *                   code: "ROUTE_NOT_FOUND"
 *               medidor_no_encontrado:
 *                 summary: Medidor no existe
 *                 value:
 *                   success: false
 *                   message: "Medidor no encontrado"
 *                   error: "No existe medidor con ID: 888"
 *                   code: "METER_NOT_FOUND"
 *       409:
 *         description: Conflicto - medidor ya asignado a otra ruta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *             examples:
 *               medidor_ya_asignado:
 *                 summary: Medidor ya está en una ruta
 *                 value:
 *                   success: false
 *                   message: "Medidor ya está asignado a otra ruta"
 *                   error: "Meter ID 5 is already assigned to route ID 2"
 *                   code: "METER_ALREADY_ASSIGNED"
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 * 
 * /api/v2/rutas/{ruta_id}/medidores:
 *   get:
 *     summary: Obtener ruta con sus medidores asignados
 *     description: |
 *       Recupera la información completa de una ruta específica incluyendo todos los medidores asignados.
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Datos optimizados desde base de datos Turso
 *       - Información enriquecida de cada medidor (cliente, dirección, estado)
 *       - Orden de medidores preservado para optimización de lectura
 *       - Metadatos adicionales sobre la ruta y sus medidores
 *       - Caché inteligente para consultas frecuentes
 *     tags: [Rutas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ruta_id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID único de la ruta de distribución
 *         example: 1
 *       - in: query
 *         name: incluir_inactivos
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Incluir medidores inactivos en la respuesta
 *         example: false
 *       - in: query
 *         name: orden
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Orden de los medidores (ascendente o descendente)
 *         example: asc
 *     responses:
 *       200:
 *         description: Ruta con medidores obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaRutaConMedidores'
 *             examples:
 *               ruta_con_medidores:
 *                 summary: Ruta con varios medidores
 *                 value:
 *                   success: true
 *                   message: "Ruta con medidores obtenida exitosamente"
 *                   data:
 *                     id: 1
 *                     nombre: "Ruta Centro Norte"
 *                     descripcion: "Ruta que incluye el centro y zona norte"
 *                     usuario_id: 1
 *                     estado: "activa"
 *                     fecha_creacion: "2024-01-15T10:30:00Z"
 *                     fecha_actualizacion: "2024-01-16T14:20:00Z"
 *                     medidores:
 *                       - id: 1
 *                         numero_medidor: "MED-001"
 *                         cliente_nombre: "Juan Pérez"
 *                         direccion: "Av. Principal 123"
 *                         estado: "activo"
 *                         orden: 1
 *                         fecha_asignacion: "2024-01-15T10:30:00Z"
 *                       - id: 5
 *                         numero_medidor: "MED-005"
 *                         cliente_nombre: "María García"
 *                         direccion: "Calle Secundaria 456"
 *                         estado: "activo"
 *                         orden: 2
 *                         fecha_asignacion: "2024-01-15T11:45:00Z"
 *                   metadata:
 *                     timestamp: "2024-01-16T15:30:00Z"
 *                     version: "2.0.0"
 *                     total_medidores: 2
 *               ruta_sin_medidores:
 *                 summary: Ruta recién creada sin medidores
 *                 value:
 *                   success: true
 *                   message: "Ruta con medidores obtenida exitosamente"
 *                   data:
 *                     id: 3
 *                     nombre: "Ruta Nueva Zona"
 *                     descripcion: "Ruta en desarrollo para nueva zona residencial"
 *                     usuario_id: 2
 *                     estado: "activa"
 *                     fecha_creacion: "2024-01-16T09:00:00Z"
 *                     fecha_actualizacion: "2024-01-16T09:00:00Z"
 *                     medidores: []
 *                   metadata:
 *                     timestamp: "2024-01-16T15:30:00Z"
 *                     version: "2.0.0"
 *                     total_medidores: 0
 *       404:
 *         description: Ruta no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *             examples:
 *               ruta_no_encontrada:
 *                 summary: ID de ruta no válido
 *                 value:
 *                   success: false
 *                   message: "Ruta no encontrada"
 *                   error: "No existe ruta con ID: 999"
 *                   code: "ROUTE_NOT_FOUND"
 *                   metadata:
 *                     timestamp: "2024-01-16T15:30:00Z"
 *                     version: "2.0.0"
 *                     request_id: "req_not_found_001"
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 * 
 * /api/v2/rutas/listar:
 *   get:
 *     summary: Listar todas las rutas de distribución
 *     description: |
 *       Obtiene una lista completa de todas las rutas de distribución registradas en el sistema.
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Consulta optimizada desde base de datos Turso
 *       - Paginación automática para grandes volúmenes de datos
 *       - Filtros avanzados por estado, usuario responsable y fecha
 *       - Información resumida de cada ruta con conteo de medidores
 *       - Ordenamiento configurable por múltiples campos
 *     tags: [Rutas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         required: false
 *         schema:
 *           type: string
 *           enum: [activa, inactiva, mantenimiento, todas]
 *           default: todas
 *         description: Filtrar rutas por estado
 *         example: activa
 *       - in: query
 *         name: usuario_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: Filtrar rutas por usuario responsable
 *         example: 1
 *       - in: query
 *         name: limite
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Número máximo de rutas a retornar
 *         example: 20
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Número de rutas a saltar para paginación
 *         example: 0
 *       - in: query
 *         name: ordenar_por
 *         required: false
 *         schema:
 *           type: string
 *           enum: [nombre, fecha_creacion, fecha_actualizacion, estado]
 *           default: fecha_creacion
 *         description: Campo por el cual ordenar los resultados
 *         example: nombre
 *       - in: query
 *         name: orden
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Dirección del ordenamiento
 *         example: asc
 *     responses:
 *       200:
 *         description: Lista de rutas obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaListaRutas'
 *             examples:
 *               lista_completa:
 *                 summary: Lista con múltiples rutas
 *                 value:
 *                   success: true
 *                   message: "Rutas obtenidas exitosamente"
 *                   data:
 *                     - id: 1
 *                       nombre: "Ruta Centro Norte"
 *                       descripcion: "Ruta que incluye el centro y zona norte"
 *                       usuario_id: 1
 *                       estado: "activa"
 *                       fecha_creacion: "2024-01-15T10:30:00Z"
 *                       fecha_actualizacion: "2024-01-16T14:20:00Z"
 *                     - id: 2
 *                       nombre: "Ruta Industrial Este"
 *                       descripcion: "Zona industrial del sector este"
 *                       usuario_id: 2
 *                       estado: "activa"
 *                       fecha_creacion: "2024-01-14T08:15:00Z"
 *                       fecha_actualizacion: "2024-01-14T08:15:00Z"
 *                     - id: 3
 *                       nombre: "Ruta Residencial Sur"
 *                       descripcion: "Zona residencial del sur de la ciudad"
 *                       usuario_id: 1
 *                       estado: "mantenimiento"
 *                       fecha_creacion: "2024-01-13T16:45:00Z"
 *                       fecha_actualizacion: "2024-01-16T09:30:00Z"
 *                   metadata:
 *                     total: 3
 *                     timestamp: "2024-01-16T16:00:00Z"
 *                     version: "2.0.0"
 *               lista_vacia:
 *                 summary: Sistema sin rutas registradas
 *                 value:
 *                   success: true
 *                   message: "Rutas obtenidas exitosamente"
 *                   data: []
 *                   metadata:
 *                     total: 0
 *                     timestamp: "2024-01-16T16:00:00Z"
 *                     version: "2.0.0"
 *               lista_filtrada:
 *                 summary: Rutas filtradas por estado activo
 *                 value:
 *                   success: true
 *                   message: "Rutas obtenidas exitosamente"
 *                   data:
 *                     - id: 1
 *                       nombre: "Ruta Centro Norte"
 *                       descripcion: "Ruta que incluye el centro y zona norte"
 *                       usuario_id: 1
 *                       estado: "activa"
 *                       fecha_creacion: "2024-01-15T10:30:00Z"
 *                       fecha_actualizacion: "2024-01-16T14:20:00Z"
 *                     - id: 2
 *                       nombre: "Ruta Industrial Este"
 *                       descripcion: "Zona industrial del sector este"
 *                       usuario_id: 2
 *                       estado: "activa"
 *                       fecha_creacion: "2024-01-14T08:15:00Z"
 *                       fecha_actualizacion: "2024-01-14T08:15:00Z"
 *                   metadata:
 *                     total: 2
 *                     timestamp: "2024-01-16T16:00:00Z"
 *                     version: "2.0.0"
 *       400:
 *         description: Parámetros de consulta inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 *             examples:
 *               parametros_invalidos:
 *                 summary: Error en parámetros de filtro
 *                 value:
 *                   success: false
 *                   message: "Parámetros de consulta inválidos"
 *                   error: "Estado debe ser uno de: activa, inactiva, mantenimiento, todas"
 *                   code: "INVALID_QUERY_PARAMS"
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorRutas'
 */

// === RUTAS V2 CON COMPATIBILIDAD V1 ===
// Todas las rutas mantienen exactamente los mismos endpoints que V1
// pero con arquitectura V2 mejorada (Turso + SSE)

router.post("/crear", appKeyMiddleware, configureSSE, authMiddleware, rutasController.crearRuta);
router.post("/agregar-medidor", appKeyMiddleware, configureSSE, authMiddleware, rutasController.agregarMedidorARuta);
router.get("/:ruta_id/medidores", appKeyMiddleware, configureSSE, authMiddleware, rutasController.obtenerRutaConMedidores);
router.get("/listar/", appKeyMiddleware, configureSSE, authMiddleware, rutasController.listarRutas);

export default router;
