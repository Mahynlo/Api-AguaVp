/**
 * Rutas para gestión de facturas - V2
 * 
 * File: src/v2/routes/facturas.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para manejar operaciones CRUD de facturas en la versión 2 de la API.
 * Mantiene compatibilidad total con los endpoints de V1 mientras utiliza 
 * la arquitectura moderna V2 con Turso database y Server-Sent Events.
 * 
 * Funcionalidades V1 preservadas:
 * - POST /generar: Generar una nueva factura con cálculo de tarifas
 * - GET /listar: Listar todas las facturas o una específica por ID
 * - GET /listar/:id: Obtener una factura específica por ID
 * - PUT /modificar/:id: Modificar datos de factura existente
 * 
 * Cambios en V2:
 * - Integración con sistema SSE para notificaciones en tiempo real
 * - Migración a controladores que usan Turso database (@libsql/client)
 * - Mantiene compatibilidad exacta con endpoints de V1
 * - Configuración automática de managers SSE
 * - Cálculo optimizado de tarifas con rangos
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
 * Dependencias de tablas:
 * - facturas: Tabla principal de facturas
 * - clientes: Información del cliente facturado
 * - lecturas: Lecturas del medidor para cálculo
 * - tarifas: Tarifas vigentes para cálculo
 * - rangos_tarifas: Rangos de consumo y precios
 * - medidores: Información del medidor
 * - rutas: Rutas de lectura
 * - usuarios: Usuario que genera/modifica facturas
 * 
 * Seguridad:
 * - Autenticación JWT requerida
 * - Validación de clave de aplicación
 * - Sanitización de datos de entrada
 * - Auditoría de cambios
 * 
 * Notas de compatibilidad:
 * - Mantiene exactamente los mismos endpoints que V1
 * - Preserva estructura de respuestas V1
 * - Compatible con clientes existentes de la API
 * - Mismo algoritmo de cálculo de tarifas
 * 
 * @author Sistema AguaVP
 * @version 2.0.0
 * @since 1.0.0
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import facturasController, { setSSEManagers } from '../controllers/facturasController.js';

const router = express.Router();

// ===================================================================
// SSE CONFIGURATION MIDDLEWARE
// ===================================================================

// Configurar managers SSE al cargar el módulo
let sseManagerConfigured = false;

/**
 * Middleware para configuración automática de SSE managers
 * Configura los managers de SSE y notificaciones al primer uso
 * Esto permite notificaciones en tiempo real para todas las operaciones de facturas
 */
const configureSSE = (req, res, next) => {
    if (!sseManagerConfigured && req.app) {
        const sseManager = req.app.get('sseManager');
        const notificationManager = req.app.get('notificationManager');
        
        if (sseManager && notificationManager) {
            setSSEManagers(sseManager, notificationManager);
            sseManagerConfigured = true;
            console.log('✅ SSE Managers configurados para facturas V2');
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
 *   name: Facturas V2
 *   description: |
 *     **Gestión de Facturas - API V2**
 *     
 *     Rutas de facturas versión 2 con integración SSE y arquitectura moderna.
 *     Mantiene compatibilidad total con endpoints V1 mientras proporciona
 *     notificaciones en tiempo real y cálculo optimizado de tarifas.
 *     
 *     **Características V2:**
 *     - Base de datos Turso con alta disponibilidad
 *     - Server-Sent Events para notificaciones en tiempo real
 *     - Cálculo optimizado de tarifas con rangos
 *     - Configuración automática de managers SSE
 *     - Compatibilidad completa con API V1
 *     - Validaciones mejoradas y manejo de errores
 *     - Integración con múltiples tablas para cálculos precisos
 *     
 *     **Endpoints compatibles con V1:**
 *     - POST /generar: Mismo algoritmo de generación que V1
 *     - GET /listar: Misma estructura de respuesta que V1
 *     - GET /listar/:id: Misma funcionalidad que V1
 *     - PUT /modificar/:id: Misma capacidad de modificación que V1
 *     
 *     **Mejoras técnicas:**
 *     - Uso de @libsql/client para Turso
 *     - Notificaciones automáticas vía SSE
 *     - Cálculo de tarifas por rangos optimizado
 *     - Mejor manejo de concurrencia
 *     - Respuestas con metadatos adicionales
 *     - Validación de integridad referencial
 */

// ===================================================================
// SWAGGER COMPONENT SCHEMAS
// ===================================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     FacturaGeneracion:
 *       type: object
 *       required:
 *         - lectura_id
 *         - cliente_id
 *         - medidor_id
 *         - periodo
 *         - consumo_m3
 *         - generado_por
 *       properties:
 *         lectura_id:
 *           type: integer
 *           description: ID de la lectura base para generar la factura
 *           example: 15
 *         cliente_id:
 *           type: integer
 *           description: ID del cliente a facturar
 *           example: 5
 *         medidor_id:
 *           type: integer
 *           description: ID del medidor asociado
 *           example: 3
 *         periodo:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *           description: Período de facturación en formato YYYY-MM
 *           example: "2024-01"
 *         consumo_m3:
 *           type: number
 *           minimum: 0
 *           description: Consumo en metros cúbicos
 *           example: 25.5
 *         generado_por:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Usuario que genera la factura
 *           example: "admin"
 *         tarifa_id:
 *           type: integer
 *           description: ID de tarifa específica (opcional, se calcula automáticamente)
 *           example: 1
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Observaciones adicionales para la factura
 *           example: "Lectura tomada con normalidad"
 *       example:
 *         lectura_id: 15
 *         cliente_id: 5
 *         medidor_id: 3
 *         periodo: "2024-01"
 *         consumo_m3: 25.5
 *         generado_por: "admin"
 *         observaciones: "Lectura tomada con normalidad"
 *     
 *     FacturaModificacion:
 *       type: object
 *       properties:
 *         consumo_m3:
 *           type: number
 *           minimum: 0
 *           description: Nuevo consumo en metros cúbicos
 *           example: 28.0
 *         estado_factura:
 *           type: string
 *           enum: [pendiente, pagada, vencida, cancelada]
 *           description: Nuevo estado de la factura
 *           example: "pagada"
 *         fecha_vencimiento:
 *           type: string
 *           format: date
 *           description: Nueva fecha de vencimiento
 *           example: "2024-02-15"
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Nuevas observaciones
 *           example: "Corrección por relectura"
 *         modificado_por:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Usuario que realiza la modificación
 *           example: "supervisor"
 *       example:
 *         consumo_m3: 28.0
 *         estado_factura: "pagada"
 *         observaciones: "Corrección por relectura"
 *         modificado_por: "supervisor"
 *     
 *     FacturaRespuesta:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único de la factura
 *           example: 1
 *         numero_factura:
 *           type: string
 *           description: Número único de factura
 *           example: "FAC-2024-001"
 *         cliente_id:
 *           type: integer
 *           description: ID del cliente
 *           example: 5
 *         cliente_nombre:
 *           type: string
 *           description: Nombre completo del cliente
 *           example: "Juan Carlos García"
 *         medidor_numero:
 *           type: string
 *           description: Número del medidor
 *           example: "MED-001"
 *         periodo:
 *           type: string
 *           description: Período facturado
 *           example: "2024-01"
 *         consumo_m3:
 *           type: number
 *           description: Consumo en metros cúbicos
 *           example: 25.5
 *         valor_total:
 *           type: number
 *           description: Valor total de la factura
 *           example: 45750.50
 *         fecha_emision:
 *           type: string
 *           format: date-time
 *           description: Fecha de emisión
 *           example: "2024-01-15T10:30:00Z"
 *         fecha_vencimiento:
 *           type: string
 *           format: date
 *           description: Fecha de vencimiento
 *           example: "2024-02-15"
 *         estado_factura:
 *           type: string
 *           description: Estado actual de la factura
 *           example: "pendiente"
 *         observaciones:
 *           type: string
 *           description: Observaciones de la factura
 *           example: "Lectura tomada con normalidad"
 *         generado_por:
 *           type: string
 *           description: Usuario que generó la factura
 *           example: "admin"
 *       example:
 *         id: 1
 *         numero_factura: "FAC-2024-001"
 *         cliente_id: 5
 *         cliente_nombre: "Juan Carlos García"
 *         medidor_numero: "MED-001"
 *         periodo: "2024-01"
 *         consumo_m3: 25.5
 *         valor_total: 45750.50
 *         fecha_emision: "2024-01-15T10:30:00Z"
 *         fecha_vencimiento: "2024-02-15"
 *         estado_factura: "pendiente"
 *         observaciones: "Lectura tomada con normalidad"
 *         generado_por: "admin"
 */

// ===================================================================
// ENDPOINT IMPLEMENTATIONS - V1 COMPATIBLE
// ===================================================================

/**
 * @swagger
 * /api/v2/facturas/generar:
 *   post:
 *     summary: Generar una nueva factura (V2 - Compatible con V1)
 *     description: |
 *       Genera una nueva factura basada en una lectura específica manteniendo compatibilidad total con V1.
 *       Utiliza arquitectura V2 con Turso database, cálculo optimizado de tarifas por rangos y notificaciones SSE.
 *       
 *       **Compatibilidad V1:**
 *       - Mismo algoritmo de cálculo de tarifas
 *       - Misma validación de datos requeridos
 *       - Misma estructura de respuesta
 *       - Mismo manejo de períodos y consumos
 *       
 *       **Mejoras V2:**
 *       - Cálculo optimizado de tarifas por rangos en Turso
 *       - Notificaciones SSE automáticas
 *       - Validación mejorada de integridad referencial
 *       - Mejor manejo de transacciones
 *       
 *       **Proceso de generación:**
 *       1. Validación de autenticación y permisos
 *       2. Validación de datos de entrada
 *       3. Verificación de existencia de lectura, cliente y medidor
 *       4. Obtención de tarifas vigentes y rangos
 *       5. Cálculo del valor por rangos de consumo
 *       6. Generación del número de factura único
 *       7. Inserción en base de datos
 *       8. Notificación SSE a clientes conectados
 *       9. Respuesta con datos de la factura generada
 *     tags: [Facturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FacturaGeneracion'
 *           examples:
 *             factura_normal:
 *               summary: Factura con consumo normal
 *               value:
 *                 lectura_id: 15
 *                 cliente_id: 5
 *                 medidor_id: 3
 *                 periodo: "2024-01"
 *                 consumo_m3: 25.5
 *                 generado_por: "admin"
 *                 observaciones: "Lectura tomada con normalidad"
 *             factura_alto_consumo:
 *               summary: Factura con alto consumo
 *               value:
 *                 lectura_id: 16
 *                 cliente_id: 8
 *                 medidor_id: 7
 *                 periodo: "2024-01"
 *                 consumo_m3: 45.8
 *                 generado_por: "operador1"
 *                 observaciones: "Consumo superior al promedio"
 *     responses:
 *       201:
 *         description: Factura generada exitosamente
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
 *                   example: "Factura generada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/FacturaRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     calculo_detalle:
 *                       type: object
 *                       description: Detalle del cálculo por rangos
 *                       properties:
 *                         rangos_aplicados:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               rango:
 *                                 type: string
 *                                 example: "0-20 m³"
 *                               consumo_rango:
 *                                 type: number
 *                                 example: 20
 *                               precio_unitario:
 *                                 type: number
 *                                 example: 1500
 *                               subtotal:
 *                                 type: number
 *                                 example: 30000
 *                     version:
 *                       type: string
 *                       example: "2.0.0"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00Z"
 *                     request_id:
 *                       type: string
 *                       example: "req_123456789"
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Datos de entrada inválidos"
 *                 details:
 *                   type: string
 *                   example: "Los siguientes campos son requeridos: lectura_id, cliente_id, medidor_id, periodo, consumo_m3, generado_por"
 *       404:
 *         description: Recurso no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Lectura no encontrada"
 *                 details:
 *                   type: string
 *                   example: "No se encontró una lectura con ID: 15"
 *       409:
 *         description: Conflicto - Factura ya existe
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Ya existe una factura para este período"
 *                 details:
 *                   type: string
 *                   example: "Cliente 5 ya tiene una factura generada para el período 2024-01"
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Error al generar la factura"
 *                 details:
 *                   type: string
 *                   example: "Error en el cálculo de tarifas por rangos"
 */
// Rutas adaptadas de V1 con los mismos endpoints exactos
router.post('/generar', appKeyMiddleware, authMiddleware, configureSSE, facturasController.generarFactura);

/**
 * @swagger
 * /api/v2/facturas/listar:
 *   get:
 *     summary: Listar todas las facturas (V2 - Compatible con V1)
 *     description: |
 *       Lista todas las facturas del sistema manteniendo compatibilidad con V1.
 *       Utiliza consultas optimizadas en Turso y notificaciones SSE.
 *       
 *       **Compatibilidad V1:**
 *       - Misma estructura de respuesta
 *       - Mismos datos incluidos
 *       - Mismo ordenamiento por fecha
 *       
 *       **Mejoras V2:**
 *       - Consultas optimizadas en Turso
 *       - Actualizaciones automáticas vía SSE
 *       - Mejor rendimiento en consultas grandes
 *       - Información de cliente y medidor incluida
 *     tags: [Facturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: periodo
 *         in: query
 *         required: false
 *         description: Filtrar por período (formato YYYY-MM)
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *           example: "2024-01"
 *       - name: estado
 *         in: query
 *         required: false
 *         description: Filtrar por estado de factura
 *         schema:
 *           type: string
 *           enum: [pendiente, pagada, vencida, cancelada]
 *           example: "pendiente"
 *       - name: cliente_id
 *         in: query
 *         required: false
 *         description: Filtrar por ID de cliente específico
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       200:
 *         description: Lista de facturas obtenida exitosamente
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
 *                   example: "Lista de facturas obtenida exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FacturaRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     total_facturas:
 *                       type: integer
 *                       description: Total de facturas en el sistema
 *                       example: 250
 *                     facturas_pendientes:
 *                       type: integer
 *                       description: Número de facturas pendientes
 *                       example: 45
 *                     facturas_pagadas:
 *                       type: integer
 *                       description: Facturas pagadas
 *                       example: 180
 *                     valor_total_pendiente:
 *                       type: number
 *                       description: Valor total pendiente de pago
 *                       example: 2850000.75
 *       500:
 *         description: Error interno del servidor
 */
router.get('/listar', appKeyMiddleware, authMiddleware, configureSSE, facturasController.obtenerFacturas);

/**
 * @swagger
 * /api/v2/facturas/listar/{id}:
 *   get:
 *     summary: Obtener una factura específica por ID (V2 - Compatible con V1)
 *     description: |
 *       Obtiene los detalles de una factura específica por su ID manteniendo compatibilidad con V1.
 *       Incluye información detallada del cliente, medidor y cálculos de tarifas.
 *       
 *       **Compatibilidad V1:**
 *       - Misma estructura de respuesta
 *       - Mismos datos incluidos
 *       - Mismo formato de información
 *       
 *       **Mejoras V2:**
 *       - Consulta optimizada en Turso
 *       - Información más detallada de cálculos
 *       - Mejor manejo de errores
 *     tags: [Facturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID de la factura a obtener
 *         schema:
 *           type: string
 *           example: "1"
 *     responses:
 *       200:
 *         description: Factura encontrada exitosamente
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
 *                   example: "Factura encontrada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/FacturaRespuesta'
 *       404:
 *         description: Factura no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Factura no encontrada"
 *                 details:
 *                   type: string
 *                   example: "No se encontró una factura con ID: 999"
 *       500:
 *         description: Error interno del servidor
 */
router.get('/listar/:id', appKeyMiddleware, authMiddleware, configureSSE, facturasController.obtenerFacturas);

/**
 * @swagger
 * /api/v2/facturas/modificar/{id}:
 *   put:
 *     summary: Modificar una factura existente (V2 - Compatible con V1)
 *     description: |
 *       Modifica los datos de una factura existente manteniendo compatibilidad con V1.
 *       Utiliza transacciones Turso y notificaciones SSE automáticas.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos modificables
 *       - Misma validación de datos
 *       - Misma estructura de respuesta
 *       - Mismo recálculo de valores al cambiar consumo
 *       
 *       **Mejoras V2:**
 *       - Transacciones atómicas en Turso
 *       - Notificaciones SSE automáticas
 *       - Mejor validación de concurrencia
 *       - Recálculo optimizado de tarifas
 *     tags: [Facturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID de la factura a modificar
 *         schema:
 *           type: string
 *           example: "1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FacturaModificacion'
 *           examples:
 *             cambio_consumo:
 *               summary: Modificar consumo y recalcular
 *               value:
 *                 consumo_m3: 28.0
 *                 observaciones: "Corrección por relectura"
 *                 modificado_por: "supervisor"
 *             cambio_estado:
 *               summary: Cambiar estado a pagada
 *               value:
 *                 estado_factura: "pagada"
 *                 observaciones: "Pago registrado el 2024-01-20"
 *                 modificado_por: "cajero"
 *     responses:
 *       200:
 *         description: Factura modificada exitosamente
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
 *                   example: "Factura modificada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/FacturaRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     recalculo_realizado:
 *                       type: boolean
 *                       description: Indica si se recalculó el valor por cambio de consumo
 *                       example: true
 *                     valor_anterior:
 *                       type: number
 *                       description: Valor anterior de la factura
 *                       example: 45750.50
 *                     valor_nuevo:
 *                       type: number
 *                       description: Nuevo valor calculado
 *                       example: 48200.25
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Factura no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.put('/modificar/:id', appKeyMiddleware, authMiddleware, configureSSE, facturasController.modificarFactura);

// ===================================================================
// EXPORT MODULE
// ===================================================================

export default router;
