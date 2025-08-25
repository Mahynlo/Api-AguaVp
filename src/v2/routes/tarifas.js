/**
 * Rutas para gestión de tarifas - V2
 * 
 * File: src/v2/routes/tarifas.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para manejar operaciones CRUD de tarifas en la versión 2 de la API.
 * Mantiene compatibilidad total con los endpoints de V1 mientras utiliza 
 * la arquitectura moderna V2 con Turso database y Server-Sent Events.
 * 
 * Funcionalidades V1 preservadas:
 * - POST /registrar: Registrar nueva tarifa con estructura básica
 * - POST /registrar-rangos: Registrar tarifa con rangos de consumo
 * - GET /listar: Listar todas las tarifas activas
 * - GET /listarHistorico: Obtener historial completo de tarifas
 * - PUT /modificar/:id: Modificar tarifa específica
 * - PUT /modificar-rangos/:id: Modificar rangos de tarifa específica
 * 
 * Cambios en V2:
 * - Integración con sistema SSE para notificaciones en tiempo real
 * - Migración a controladores que usan Turso database (@libsql/client)
 * - Mantiene compatibilidad exacta con endpoints de V1
 * - Configuración automática de managers SSE
 * - Mejor manejo de errores y validaciones
 * - Respuestas estandarizadas con metadatos
 * - Gestión optimizada de rangos tarifarios
 * - Cálculos automáticos de tarifas escalonadas
 * 
 * Arquitectura:
 * - Base de datos: Turso (compatible con SQLite)
 * - Notificaciones: Server-Sent Events (SSE)
 * - Autenticación: JWT tokens
 * - Validación: App key middleware
 * - Integración: Automática con SSE managers
 * 
 * Dependencias de tablas:
 * - tarifas: Tabla principal de tarifas
 * - rangos_tarifa: Rangos de consumo y precios
 * - facturas: Facturas que usan estas tarifas
 * - usuarios: Usuario que crea/modifica tarifas
 * 
 * Seguridad:
 * - Autenticación JWT requerida
 * - Validación de clave de aplicación
 * - Sanitización de datos de entrada
 * - Auditoría de cambios en tarifas
 * 
 * Notas de compatibilidad:
 * - Mantiene exactamente los mismos endpoints que V1
 * - Preserva estructura de respuestas V1
 * - Compatible con clientes existentes de la API
 * - Mismo algoritmo de cálculo de tarifas escalonadas
 * 
 * @author Sistema AguaVP
 * @version 2.0.0
 * @since 1.0.0
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import tarifasController, { setSSEManagers } from '../controllers/tarifasController.js';

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
 *     Tarifa:
 *       type: object
 *       required:
 *         - nombre
 *         - precio_base
 *         - tipo
 *         - usuario_id
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único de la tarifa
 *           example: 1
 *         nombre:
 *           type: string
 *           minLength: 3
 *           maxLength: 100
 *           description: Nombre descriptivo de la tarifa
 *           example: "Tarifa Residencial 2024"
 *         descripcion:
 *           type: string
 *           maxLength: 500
 *           description: Descripción detallada de la tarifa
 *           example: "Tarifa para uso residencial con rangos escalonados"
 *         precio_base:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           description: Precio base de la tarifa (primer rango)
 *           example: 12.50
 *         tipo:
 *           type: string
 *           enum: [residencial, comercial, industrial, publica]
 *           description: Tipo de tarifa según uso
 *           example: "residencial"
 *         estado:
 *           type: string
 *           enum: [activa, inactiva, borrador]
 *           default: activa
 *           description: Estado actual de la tarifa
 *           example: "activa"
 *         fecha_vigencia:
 *           type: string
 *           format: date
 *           description: Fecha desde la cual la tarifa es válida
 *           example: "2024-01-01"
 *         fecha_fin:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Fecha hasta la cual la tarifa es válida (null = indefinida)
 *           example: null
 *         usuario_id:
 *           type: integer
 *           description: ID del usuario que creó la tarifa
 *           example: 1
 *         fecha_creacion:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación de la tarifa
 *           example: "2024-01-15T10:30:00Z"
 *         fecha_actualizacion:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 *           example: "2024-01-16T14:20:00Z"
 *     
 *     TarifaConRangos:
 *       allOf:
 *         - $ref: '#/components/schemas/Tarifa'
 *         - type: object
 *           properties:
 *             rangos:
 *               type: array
 *               description: Rangos de consumo y precios escalonados
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID del rango
 *                     example: 1
 *                   rango_desde:
 *                     type: number
 *                     description: Consumo mínimo del rango (m³)
 *                     example: 0
 *                   rango_hasta:
 *                     type: number
 *                     description: Consumo máximo del rango (m³, null = ilimitado)
 *                     example: 20
 *                   precio_m3:
 *                     type: number
 *                     format: decimal
 *                     description: Precio por metro cúbico en este rango
 *                     example: 8.50
 *                   descripcion:
 *                     type: string
 *                     description: Descripción del rango
 *                     example: "Consumo básico residencial"
 *     
 *     RangoTarifa:
 *       type: object
 *       required:
 *         - tarifa_id
 *         - rango_desde
 *         - precio_m3
 *       properties:
 *         tarifa_id:
 *           type: integer
 *           description: ID de la tarifa a la que pertenece el rango
 *           example: 1
 *         rango_desde:
 *           type: number
 *           minimum: 0
 *           description: Consumo mínimo del rango en metros cúbicos
 *           example: 0
 *         rango_hasta:
 *           type: number
 *           minimum: 0
 *           nullable: true
 *           description: Consumo máximo del rango (null para último rango)
 *           example: 20
 *         precio_m3:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           description: Precio por metro cúbico en este rango
 *           example: 8.50
 *         descripcion:
 *           type: string
 *           maxLength: 200
 *           description: Descripción opcional del rango
 *           example: "Consumo básico residencial"
 *     
 *     RegistroTarifaConRangos:
 *       type: object
 *       required:
 *         - tarifa
 *         - rangos
 *       properties:
 *         tarifa:
 *           $ref: '#/components/schemas/Tarifa'
 *         rangos:
 *           type: array
 *           minItems: 1
 *           description: Lista de rangos tarifarios
 *           items:
 *             $ref: '#/components/schemas/RangoTarifa'
 *     
 *     RespuestaTarifa:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indica si la operación fue exitosa
 *           example: true
 *         message:
 *           type: string
 *           description: Mensaje descriptivo del resultado
 *           example: "Tarifa registrada exitosamente"
 *         data:
 *           $ref: '#/components/schemas/Tarifa'
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
 *     RespuestaListaTarifas:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indica si la operación fue exitosa
 *           example: true
 *         message:
 *           type: string
 *           description: Mensaje descriptivo del resultado
 *           example: "Tarifas obtenidas exitosamente"
 *         data:
 *           type: array
 *           description: Lista de tarifas
 *           items:
 *             $ref: '#/components/schemas/TarifaConRangos'
 *         metadata:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: Total de tarifas encontradas
 *               example: 5
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
 *     ErrorTarifas:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           description: Mensaje de error
 *           example: "Error al procesar la tarifa"
 *         error:
 *           type: string
 *           description: Detalles técnicos del error
 *           example: "Validation failed: nombre is required"
 *         code:
 *           type: string
 *           description: Código de error específico
 *           example: "TARIFA_VALIDATION_ERROR"
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
 *   name: Tarifas V2
 *   description: Tarifas de agua v2 con SSE y compatibilidad V1
 */

/**
 * @swagger
 * /api/v2/tarifas/registrar:
 *   post:
 *     summary: Registrar nueva tarifa básica
 *     description: |
 *       Registra una nueva tarifa con estructura básica (sin rangos escalonados).
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Notificación automática vía SSE cuando se registra la tarifa
 *       - Integración con base de datos Turso para mejor rendimiento
 *       - Validaciones mejoradas de datos de entrada
 *       - Auditoría automática de creación de tarifas
 *       - Manejo optimizado de errores con códigos específicos
 *     tags: [Tarifas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Tarifa'
 *           examples:
 *             tarifa_residencial:
 *               summary: Tarifa residencial básica
 *               value:
 *                 nombre: "Tarifa Residencial 2024"
 *                 descripcion: "Tarifa básica para uso residencial"
 *                 precio_base: 12.50
 *                 tipo: "residencial"
 *                 estado: "activa"
 *                 fecha_vigencia: "2024-01-01"
 *                 usuario_id: 1
 *             tarifa_comercial:
 *               summary: Tarifa comercial
 *               value:
 *                 nombre: "Tarifa Comercial Centro"
 *                 descripcion: "Tarifa para establecimientos comerciales"
 *                 precio_base: 18.75
 *                 tipo: "comercial"
 *                 estado: "activa"
 *                 fecha_vigencia: "2024-01-01"
 *                 usuario_id: 1
 *     responses:
 *       201:
 *         description: Tarifa registrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaTarifa'
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       409:
 *         description: Conflicto - tarifa con ese nombre ya existe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 * 
 * /api/v2/tarifas/registrar-rangos:
 *   post:
 *     summary: Registrar tarifa con rangos escalonados
 *     description: |
 *       Registra una nueva tarifa con rangos de consumo escalonados (tarifa progresiva).
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Validación automática de rangos no superpuestos
 *       - Cálculo automático de tarifas escalonadas
 *       - Notificación SSE de creación de tarifa con rangos
 *       - Transacciones atómicas para tarifa + rangos
 *     tags: [Tarifas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegistroTarifaConRangos'
 *           examples:
 *             tarifa_residencial_escalonada:
 *               summary: Tarifa residencial con 3 rangos
 *               value:
 *                 tarifa:
 *                   nombre: "Tarifa Residencial Escalonada 2024"
 *                   descripcion: "Tarifa residencial con consumo escalonado"
 *                   precio_base: 8.50
 *                   tipo: "residencial"
 *                   estado: "activa"
 *                   fecha_vigencia: "2024-01-01"
 *                   usuario_id: 1
 *                 rangos:
 *                   - rango_desde: 0
 *                     rango_hasta: 20
 *                     precio_m3: 8.50
 *                     descripcion: "Consumo básico"
 *                   - rango_desde: 21
 *                     rango_hasta: 50
 *                     precio_m3: 12.75
 *                     descripcion: "Consumo medio"
 *                   - rango_desde: 51
 *                     rango_hasta: null
 *                     precio_m3: 18.90
 *                     descripcion: "Consumo alto"
 *     responses:
 *       201:
 *         description: Tarifa con rangos registrada exitosamente
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
 *                   example: "Tarifa con rangos registrada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/TarifaConRangos'
 *                 metadata:
 *                   $ref: '#/components/schemas/RespuestaTarifa/properties/metadata'
 *       400:
 *         description: Datos de entrada inválidos o rangos superpuestos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 * 
 * /api/v2/tarifas/listar:
 *   get:
 *     summary: Listar todas las tarifas activas
 *     description: |
 *       Obtiene todas las tarifas activas con sus rangos correspondientes.
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Consulta optimizada desde base de datos Turso
 *       - Incluye información completa de rangos tarifarios
 *       - Filtros avanzados por tipo y estado
 *       - Ordenamiento configurable
 *     tags: [Tarifas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo
 *         required: false
 *         schema:
 *           type: string
 *           enum: [residencial, comercial, industrial, publica, todas]
 *           default: todas
 *         description: Filtrar tarifas por tipo
 *         example: residencial
 *       - in: query
 *         name: incluir_rangos
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Incluir información de rangos tarifarios
 *         example: true
 *     responses:
 *       200:
 *         description: Tarifas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaListaTarifas'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 * 
 * /api/v2/tarifas/listarHistorico:
 *   get:
 *     summary: Obtener historial completo de tarifas
 *     description: |
 *       Obtiene el historial completo de todas las tarifas incluyendo activas, inactivas y en borrador.
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Historial completo con auditoría de cambios
 *       - Información de usuarios que modificaron tarifas
 *       - Fechas de vigencia y vencimiento
 *       - Rangos históricos preservados
 *     tags: [Tarifas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fecha_desde
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtrar desde fecha específica
 *         example: "2024-01-01"
 *       - in: query
 *         name: fecha_hasta
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtrar hasta fecha específica
 *         example: "2024-12-31"
 *     responses:
 *       200:
 *         description: Historial de tarifas obtenido exitosamente
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
 *                   example: "Historial de tarifas obtenido exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/TarifaConRangos'
 *                       - type: object
 *                         properties:
 *                           usuario_nombre:
 *                             type: string
 *                             description: Nombre del usuario que creó la tarifa
 *                             example: "Admin Sistema"
 *                           modificaciones:
 *                             type: integer
 *                             description: Número de modificaciones realizadas
 *                             example: 2
 *                 metadata:
 *                   $ref: '#/components/schemas/RespuestaListaTarifas/properties/metadata'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 * 
 * /api/v2/tarifas/modificar/{id}:
 *   put:
 *     summary: Modificar tarifa específica
 *     description: |
 *       Modifica los datos básicos de una tarifa específica (no incluye rangos).
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Auditoría automática de modificaciones
 *       - Validación de que la tarifa no esté siendo usada en facturas activas
 *       - Notificación SSE de modificación
 *       - Preservación de rangos existentes
 *     tags: [Tarifas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID único de la tarifa a modificar
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "Tarifa Residencial 2024 Actualizada"
 *               descripcion:
 *                 type: string
 *                 maxLength: 500
 *                 example: "Tarifa residencial con ajuste por inflación"
 *               precio_base:
 *                 type: number
 *                 format: decimal
 *                 minimum: 0
 *                 example: 13.25
 *               estado:
 *                 type: string
 *                 enum: [activa, inactiva, borrador]
 *                 example: "activa"
 *               fecha_fin:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: "2024-12-31"
 *     responses:
 *       200:
 *         description: Tarifa modificada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaTarifa'
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       404:
 *         description: Tarifa no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       409:
 *         description: Conflicto - tarifa en uso por facturas activas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 * 
 * /api/v2/tarifas/modificar-rangos/{id}:
 *   put:
 *     summary: Modificar rangos de tarifa específica
 *     description: |
 *       Modifica los rangos de consumo de una tarifa específica.
 *       **Endpoint compatible con V1** - mantiene la misma funcionalidad y estructura de respuesta.
 *       
 *       Características V2:
 *       - Reemplazo completo de rangos existentes
 *       - Validación de rangos no superpuestos
 *       - Transacción atómica para todos los rangos
 *       - Notificación SSE de modificación de rangos
 *       - Auditoría de cambios en rangos tarifarios
 *     tags: [Tarifas V2]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID único de la tarifa cuyos rangos se modificarán
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rangos
 *             properties:
 *               rangos:
 *                 type: array
 *                 minItems: 1
 *                 description: Nuevos rangos tarifarios (reemplaza todos los existentes)
 *                 items:
 *                   $ref: '#/components/schemas/RangoTarifa'
 *           examples:
 *             nuevos_rangos_residencial:
 *               summary: Actualización de rangos residenciales
 *               value:
 *                 rangos:
 *                   - rango_desde: 0
 *                     rango_hasta: 25
 *                     precio_m3: 9.00
 *                     descripcion: "Consumo básico actualizado"
 *                   - rango_desde: 26
 *                     rango_hasta: 60
 *                     precio_m3: 14.00
 *                     descripcion: "Consumo medio actualizado"
 *                   - rango_desde: 61
 *                     rango_hasta: null
 *                     precio_m3: 20.50
 *                     descripcion: "Consumo alto actualizado"
 *     responses:
 *       200:
 *         description: Rangos de tarifa modificados exitosamente
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
 *                   example: "Rangos de tarifa modificados exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/TarifaConRangos'
 *                 metadata:
 *                   $ref: '#/components/schemas/RespuestaTarifa/properties/metadata'
 *       400:
 *         description: Datos de entrada inválidos o rangos superpuestos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       404:
 *         description: Tarifa no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorTarifas'
 */

// === RUTAS V2 CON COMPATIBILIDAD V1 ===
// Todas las rutas mantienen exactamente los mismos endpoints que V1
// pero con arquitectura V2 mejorada (Turso + SSE)

router.post("/registrar", appKeyMiddleware, configureSSE, authMiddleware, tarifasController.registrarTarifa);
router.post("/registrar-rangos", appKeyMiddleware, configureSSE, authMiddleware, tarifasController.registrarRangosTarifa);

router.get("/listar", appKeyMiddleware, configureSSE, authMiddleware, tarifasController.obtenerTodasLasTarifas);
router.get("/listarHistorico", appKeyMiddleware, configureSSE, authMiddleware, tarifasController.obtenerHistorialTarifas);

router.put("/modificar/:id", appKeyMiddleware, configureSSE, authMiddleware, tarifasController.modificarTarifa);
router.put("/modificar-rangos/:id", appKeyMiddleware, configureSSE, authMiddleware, tarifasController.modificarRangosTarifa);

export default router;
