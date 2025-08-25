/**
 * Rutas para gestión de pagos - V2
 * 
 * File: src/v2/routes/pagos.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para manejar operaciones CRUD de pagos en la versión 2 de la API.
 * Mantiene compatibilidad total con los endpoints de V1 mientras utiliza 
 * la arquitectura moderna V2 con Turso database y Server-Sent Events.
 * 
 * Funcionalidades V1 preservadas:
 * - POST /registrar: Registrar un nuevo pago de factura
 * - GET /listar: Listar todos los pagos o uno específico por ID
 * - GET /listar/:id: Obtener un pago específico por ID
 * - PUT /modificar/:id: Modificar datos de pago existente
 * 
 * Cambios en V2:
 * - Integración con sistema SSE para notificaciones en tiempo real
 * - Migración a controladores que usan Turso database (@libsql/client)
 * - Mantiene compatibilidad exacta con endpoints de V1
 * - Configuración automática de managers SSE
 * - Actualización automática de estado de facturas
 * - Mejor manejo de errores y validaciones
 * - Respuestas estandarizadas con metadatos
 * - Cálculo automático de cambios y saldos
 * 
 * Arquitectura:
 * - Base de datos: Turso (compatible con SQLite)
 * - Notificaciones: Server-Sent Events (SSE)
 * - Autenticación: JWT tokens
 * - Validación: App key middleware
 * - Integración: Automática con SSE managers
 * 
 * Dependencias de tablas:
 * - pagos: Tabla principal de pagos
 * - facturas: Facturas asociadas a los pagos
 * - clientes: Cliente que realiza el pago
 * - usuarios: Usuario que registra/modifica pagos
 * - medidores: Medidor asociado a la factura
 * 
 * Seguridad:
 * - Autenticación JWT requerida
 * - Validación de clave de aplicación
 * - Sanitización de datos de entrada
 * - Auditoría de transacciones de pago
 * 
 * Notas de compatibilidad:
 * - Mantiene exactamente los mismos endpoints que V1
 * - Preserva estructura de respuestas V1
 * - Compatible con clientes existentes de la API
 * - Mismo algoritmo de cálculo de cambios
 * - Misma actualización de estado de facturas
 * 
 * @author Sistema AguaVP
 * @version 2.0.0
 * @since 1.0.0
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import pagosController, { setSSEManagers } from '../controllers/pagosController.js';

const router = express.Router();

// ===================================================================
// SSE CONFIGURATION MIDDLEWARE
// ===================================================================

// Configurar managers SSE al cargar el módulo
let sseManagerConfigured = false;

/**
 * Middleware para configuración automática de SSE managers
 * Configura los managers de SSE y notificaciones al primer uso
 * Esto permite notificaciones en tiempo real para todas las operaciones de pagos
 */
const configureSSE = (req, res, next) => {
    if (!sseManagerConfigured && req.app) {
        const sseManager = req.app.get('sseManager');
        const notificationManager = req.app.get('notificationManager');
        
        if (sseManager && notificationManager) {
            setSSEManagers(sseManager, notificationManager);
            sseManagerConfigured = true;
            console.log('✅ SSE Managers configurados para pagos V2');
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
 *   name: Pagos V2
 *   description: |
 *     **Gestión de Pagos - API V2**
 *     
 *     Rutas de pagos versión 2 con integración SSE y arquitectura moderna.
 *     Mantiene compatibilidad total con endpoints V1 mientras proporciona
 *     notificaciones en tiempo real y procesamiento optimizado de pagos.
 *     
 *     **Características V2:**
 *     - Base de datos Turso con alta disponibilidad
 *     - Server-Sent Events para notificaciones en tiempo real
 *     - Actualización automática de estado de facturas
 *     - Configuración automática de managers SSE
 *     - Compatibilidad completa con API V1
 *     - Validaciones mejoradas y manejo de errores
 *     - Integración con múltiples tablas para datos completos
 *     - Cálculo automático de cambios y saldos
 *     
 *     **Endpoints compatibles con V1:**
 *     - POST /registrar: Mismo proceso de registro que V1
 *     - GET /listar: Misma estructura de respuesta que V1
 *     - GET /listar/:id: Misma funcionalidad que V1
 *     - PUT /modificar/:id: Misma capacidad de modificación que V1
 *     
 *     **Mejoras técnicas:**
 *     - Uso de @libsql/client para Turso
 *     - Notificaciones automáticas vía SSE
 *     - Transacciones atómicas para pagos
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
 *     PagoRegistro:
 *       type: object
 *       required:
 *         - factura_id
 *         - cliente_id
 *         - monto_pagado
 *         - metodo_pago
 *         - fecha_pago
 *         - recibido_por
 *       properties:
 *         factura_id:
 *           type: integer
 *           description: ID de la factura que se está pagando
 *           example: 15
 *         cliente_id:
 *           type: integer
 *           description: ID del cliente que realiza el pago
 *           example: 5
 *         monto_pagado:
 *           type: number
 *           minimum: 0.01
 *           description: Monto pagado por el cliente
 *           example: 50000.00
 *         metodo_pago:
 *           type: string
 *           enum: [efectivo, transferencia, cheque, tarjeta_credito, tarjeta_debito]
 *           description: Método de pago utilizado
 *           example: "efectivo"
 *         fecha_pago:
 *           type: string
 *           format: date
 *           description: Fecha en que se realizó el pago
 *           example: "2024-01-20"
 *         recibido_por:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Usuario que recibió el pago
 *           example: "cajero1"
 *         numero_referencia:
 *           type: string
 *           maxLength: 100
 *           description: Número de referencia del pago (opcional)
 *           example: "REF-2024-001"
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Observaciones adicionales del pago
 *           example: "Pago completo de factura enero 2024"
 *       example:
 *         factura_id: 15
 *         cliente_id: 5
 *         monto_pagado: 50000.00
 *         metodo_pago: "efectivo"
 *         fecha_pago: "2024-01-20"
 *         recibido_por: "cajero1"
 *         numero_referencia: "REF-2024-001"
 *         observaciones: "Pago completo de factura enero 2024"
 *     
 *     PagoModificacion:
 *       type: object
 *       properties:
 *         monto_pagado:
 *           type: number
 *           minimum: 0.01
 *           description: Nuevo monto pagado
 *           example: 52000.00
 *         metodo_pago:
 *           type: string
 *           enum: [efectivo, transferencia, cheque, tarjeta_credito, tarjeta_debito]
 *           description: Nuevo método de pago
 *           example: "transferencia"
 *         fecha_pago:
 *           type: string
 *           format: date
 *           description: Nueva fecha de pago
 *           example: "2024-01-21"
 *         numero_referencia:
 *           type: string
 *           maxLength: 100
 *           description: Nuevo número de referencia
 *           example: "REF-2024-001-CORR"
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Nuevas observaciones
 *           example: "Corrección por diferencia en el cambio"
 *         modificado_por:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Usuario que realiza la modificación
 *           example: "supervisor"
 *         estado_pago:
 *           type: string
 *           enum: [pendiente, completado, parcial, anulado]
 *           description: Nuevo estado del pago
 *           example: "completado"
 *       example:
 *         monto_pagado: 52000.00
 *         observaciones: "Corrección por diferencia en el cambio"
 *         modificado_por: "supervisor"
 *         estado_pago: "completado"
 *     
 *     PagoRespuesta:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único del pago
 *           example: 1
 *         numero_pago:
 *           type: string
 *           description: Número único de pago
 *           example: "PAG-2024-001"
 *         factura_id:
 *           type: integer
 *           description: ID de la factura pagada
 *           example: 15
 *         numero_factura:
 *           type: string
 *           description: Número de la factura pagada
 *           example: "FAC-2024-015"
 *         cliente_id:
 *           type: integer
 *           description: ID del cliente
 *           example: 5
 *         cliente_nombre:
 *           type: string
 *           description: Nombre completo del cliente
 *           example: "Juan Carlos García"
 *         monto_factura:
 *           type: number
 *           description: Monto total de la factura
 *           example: 50000.00
 *         monto_pagado:
 *           type: number
 *           description: Monto pagado por el cliente
 *           example: 50000.00
 *         cambio:
 *           type: number
 *           description: Cambio calculado (si aplica)
 *           example: 0.00
 *         saldo_pendiente:
 *           type: number
 *           description: Saldo pendiente por pagar
 *           example: 0.00
 *         metodo_pago:
 *           type: string
 *           description: Método de pago utilizado
 *           example: "efectivo"
 *         fecha_pago:
 *           type: string
 *           format: date
 *           description: Fecha del pago
 *           example: "2024-01-20"
 *         numero_referencia:
 *           type: string
 *           description: Número de referencia del pago
 *           example: "REF-2024-001"
 *         estado_pago:
 *           type: string
 *           description: Estado actual del pago
 *           example: "completado"
 *         estado_factura_actualizado:
 *           type: string
 *           description: Nuevo estado de la factura después del pago
 *           example: "pagada"
 *         observaciones:
 *           type: string
 *           description: Observaciones del pago
 *           example: "Pago completo de factura enero 2024"
 *         recibido_por:
 *           type: string
 *           description: Usuario que recibió el pago
 *           example: "cajero1"
 *         fecha_registro:
 *           type: string
 *           format: date-time
 *           description: Fecha de registro en el sistema
 *           example: "2024-01-20T15:30:00Z"
 *       example:
 *         id: 1
 *         numero_pago: "PAG-2024-001"
 *         factura_id: 15
 *         numero_factura: "FAC-2024-015"
 *         cliente_id: 5
 *         cliente_nombre: "Juan Carlos García"
 *         monto_factura: 50000.00
 *         monto_pagado: 50000.00
 *         cambio: 0.00
 *         saldo_pendiente: 0.00
 *         metodo_pago: "efectivo"
 *         fecha_pago: "2024-01-20"
 *         numero_referencia: "REF-2024-001"
 *         estado_pago: "completado"
 *         estado_factura_actualizado: "pagada"
 *         observaciones: "Pago completo de factura enero 2024"
 *         recibido_por: "cajero1"
 *         fecha_registro: "2024-01-20T15:30:00Z"
 */

// ===================================================================
// ENDPOINT IMPLEMENTATIONS - V1 COMPATIBLE
// ===================================================================

/**
 * @swagger
 * /api/v2/pagos/registrar:
 *   post:
 *     summary: Registrar un nuevo pago (V2 - Compatible con V1)
 *     description: |
 *       Registra un nuevo pago de factura manteniendo compatibilidad total con V1.
 *       Utiliza arquitectura V2 con Turso database, cálculo automático de cambios/saldos y notificaciones SSE.
 *       Actualiza automáticamente el estado de la factura según el monto pagado.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos requeridos
 *       - Mismo cálculo de cambios y saldos
 *       - Misma validación de datos
 *       - Misma estructura de respuesta
 *       - Misma actualización de estado de facturas
 *       
 *       **Mejoras V2:**
 *       - Notificaciones SSE automáticas
 *       - Base de datos Turso distribuida
 *       - Transacciones atómicas para pagos
 *       - Validación mejorada de integridad referencial
 *       
 *       **Proceso de registro:**
 *       1. Validación de autenticación y permisos
 *       2. Validación de datos de entrada
 *       3. Verificación de existencia de factura y cliente
 *       4. Cálculo automático de cambio y saldo pendiente
 *       5. Determinación del nuevo estado de la factura
 *       6. Inserción del pago en transacción atómica
 *       7. Actualización del estado de la factura
 *       8. Notificación SSE a clientes conectados
 *       9. Respuesta con datos del pago registrado
 *     tags: [Pagos V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PagoRegistro'
 *           examples:
 *             pago_completo:
 *               summary: Pago completo de factura
 *               value:
 *                 factura_id: 15
 *                 cliente_id: 5
 *                 monto_pagado: 50000.00
 *                 metodo_pago: "efectivo"
 *                 fecha_pago: "2024-01-20"
 *                 recibido_por: "cajero1"
 *                 numero_referencia: "REF-2024-001"
 *                 observaciones: "Pago completo de factura enero 2024"
 *             pago_parcial:
 *               summary: Pago parcial de factura
 *               value:
 *                 factura_id: 16
 *                 cliente_id: 8
 *                 monto_pagado: 30000.00
 *                 metodo_pago: "transferencia"
 *                 fecha_pago: "2024-01-20"
 *                 recibido_por: "cajero2"
 *                 numero_referencia: "TRF-2024-456"
 *                 observaciones: "Abono parcial - cliente pagará el resto la próxima semana"
 *             pago_con_cambio:
 *               summary: Pago en efectivo con cambio
 *               value:
 *                 factura_id: 17
 *                 cliente_id: 12
 *                 monto_pagado: 55000.00
 *                 metodo_pago: "efectivo"
 *                 fecha_pago: "2024-01-20"
 *                 recibido_por: "cajero1"
 *                 observaciones: "Pago en efectivo - cambio: $5,000"
 *     responses:
 *       201:
 *         description: Pago registrado exitosamente
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
 *                   example: "Pago registrado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/PagoRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     calculo_detalle:
 *                       type: object
 *                       description: Detalle del cálculo del pago
 *                       properties:
 *                         monto_factura_original:
 *                           type: number
 *                           example: 50000.00
 *                         monto_recibido:
 *                           type: number
 *                           example: 50000.00
 *                         cambio_calculado:
 *                           type: number
 *                           example: 0.00
 *                         saldo_pendiente:
 *                           type: number
 *                           example: 0.00
 *                         tipo_pago:
 *                           type: string
 *                           enum: [completo, parcial, excedente]
 *                           example: "completo"
 *                     estado_factura:
 *                       type: object
 *                       properties:
 *                         estado_anterior:
 *                           type: string
 *                           example: "pendiente"
 *                         estado_nuevo:
 *                           type: string
 *                           example: "pagada"
 *                         actualizada:
 *                           type: boolean
 *                           example: true
 *                     version:
 *                       type: string
 *                       example: "2.0.0"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-20T15:30:00Z"
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
 *                   example: "Los siguientes campos son requeridos: factura_id, cliente_id, monto_pagado, metodo_pago, fecha_pago, recibido_por"
 *       404:
 *         description: Factura o cliente no encontrados
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
 *                   example: "No se encontró una factura con ID: 15"
 *       409:
 *         description: Conflicto - Factura ya pagada
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
 *                   example: "La factura ya está pagada"
 *                 details:
 *                   type: string
 *                   example: "La factura FAC-2024-015 ya tiene estado 'pagada'"
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
 *                   example: "Error al registrar el pago"
 *                 details:
 *                   type: string
 *                   example: "Error en transacción de base de datos"
 */
// Rutas adaptadas de V1 con los mismos endpoints exactos
router.post('/registrar', appKeyMiddleware, authMiddleware, configureSSE, pagosController.registrarPago);

/**
 * @swagger
 * /api/v2/pagos/listar:
 *   get:
 *     summary: Listar todos los pagos (V2 - Compatible con V1)
 *     description: |
 *       Lista todos los pagos del sistema manteniendo compatibilidad con V1.
 *       Utiliza consultas optimizadas en Turso y notificaciones SSE.
 *       Incluye información completa de facturas, clientes y cálculos.
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
 *       - Información completa de facturas y clientes
 *     tags: [Pagos V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: fecha_inicio
 *         in: query
 *         required: false
 *         description: Fecha de inicio para filtrar pagos (formato YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2024-01-01"
 *       - name: fecha_fin
 *         in: query
 *         required: false
 *         description: Fecha de fin para filtrar pagos (formato YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2024-01-31"
 *       - name: metodo_pago
 *         in: query
 *         required: false
 *         description: Filtrar por método de pago
 *         schema:
 *           type: string
 *           enum: [efectivo, transferencia, cheque, tarjeta_credito, tarjeta_debito]
 *           example: "efectivo"
 *       - name: cliente_id
 *         in: query
 *         required: false
 *         description: Filtrar por ID de cliente específico
 *         schema:
 *           type: integer
 *           example: 5
 *       - name: estado
 *         in: query
 *         required: false
 *         description: Filtrar por estado de pago
 *         schema:
 *           type: string
 *           enum: [pendiente, completado, parcial, anulado]
 *           example: "completado"
 *     responses:
 *       200:
 *         description: Lista de pagos obtenida exitosamente
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
 *                   example: "Lista de pagos obtenida exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PagoRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     total_pagos:
 *                       type: integer
 *                       description: Total de pagos en el período
 *                       example: 125
 *                     monto_total_recaudado:
 *                       type: number
 *                       description: Monto total recaudado
 *                       example: 6250000.75
 *                     pagos_por_metodo:
 *                       type: object
 *                       description: Distribución de pagos por método
 *                       properties:
 *                         efectivo:
 *                           type: integer
 *                           example: 75
 *                         transferencia:
 *                           type: integer
 *                           example: 35
 *                         tarjeta_credito:
 *                           type: integer
 *                           example: 15
 *                     facturas_pagadas:
 *                       type: integer
 *                       description: Total de facturas pagadas completamente
 *                       example: 110
 *                     pagos_parciales:
 *                       type: integer
 *                       description: Total de pagos parciales
 *                       example: 15
 *       500:
 *         description: Error interno del servidor
 */
router.get('/listar', appKeyMiddleware, authMiddleware, configureSSE, pagosController.obtenerPagos);

/**
 * @swagger
 * /api/v2/pagos/listar/{id}:
 *   get:
 *     summary: Obtener un pago específico por ID (V2 - Compatible con V1)
 *     description: |
 *       Obtiene los detalles de un pago específico por su ID manteniendo compatibilidad con V1.
 *       Incluye información detallada de la factura, cliente y cálculos realizados.
 *     tags: [Pagos V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID del pago a obtener
 *         schema:
 *           type: string
 *           example: "1"
 *     responses:
 *       200:
 *         description: Pago encontrado exitosamente
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
 *                   example: "Pago encontrado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/PagoRespuesta'
 *       404:
 *         description: Pago no encontrado
 *       500:
 *         description: Error interno del servidor
 */
router.get('/listar/:id', appKeyMiddleware, authMiddleware, configureSSE, pagosController.obtenerPagos);

/**
 * @swagger
 * /api/v2/pagos/modificar/{id}:
 *   put:
 *     summary: Modificar un pago existente (V2 - Compatible con V1)
 *     description: |
 *       Modifica los datos de un pago existente manteniendo compatibilidad con V1.
 *       Utiliza transacciones Turso y notificaciones SSE automáticas.
 *       Recalcula automáticamente cambios, saldos y actualiza estado de factura.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos modificables
 *       - Misma validación de datos
 *       - Mismo recálculo de cambios y saldos
 *       - Misma estructura de respuesta
 *       - Misma actualización de estado de facturas
 *       
 *       **Mejoras V2:**
 *       - Transacciones atómicas en Turso
 *       - Notificaciones SSE automáticas
 *       - Mejor validación de concurrencia
 *       - Recálculo optimizado de valores
 *     tags: [Pagos V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID del pago a modificar
 *         schema:
 *           type: string
 *           example: "1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PagoModificacion'
 *           examples:
 *             correccion_monto:
 *               summary: Corrección de monto pagado
 *               value:
 *                 monto_pagado: 52000.00
 *                 observaciones: "Corrección por diferencia en el cambio"
 *                 modificado_por: "supervisor"
 *             cambio_metodo:
 *               summary: Cambio de método de pago
 *               value:
 *                 metodo_pago: "transferencia"
 *                 numero_referencia: "TRF-2024-789"
 *                 observaciones: "Cliente cambió efectivo por transferencia"
 *                 modificado_por: "cajero1"
 *             anular_pago:
 *               summary: Anular pago
 *               value:
 *                 estado_pago: "anulado"
 *                 observaciones: "Pago anulado por solicitud del cliente"
 *                 modificado_por: "supervisor"
 *     responses:
 *       200:
 *         description: Pago modificado exitosamente
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
 *                   example: "Pago modificado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/PagoRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     recalculo_realizado:
 *                       type: boolean
 *                       description: Indica si se recalcularon valores
 *                       example: true
 *                     valores_anteriores:
 *                       type: object
 *                       properties:
 *                         monto_anterior:
 *                           type: number
 *                           example: 50000.00
 *                         cambio_anterior:
 *                           type: number
 *                           example: 0.00
 *                     valores_nuevos:
 *                       type: object
 *                       properties:
 *                         monto_nuevo:
 *                           type: number
 *                           example: 52000.00
 *                         cambio_nuevo:
 *                           type: number
 *                           example: 2000.00
 *                     estado_factura_actualizado:
 *                       type: boolean
 *                       description: Indica si se actualizó el estado de la factura
 *                       example: true
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Pago no encontrado
 *       409:
 *         description: No se puede modificar pago anulado
 *       500:
 *         description: Error interno del servidor
 */
router.put('/modificar/:id', appKeyMiddleware, authMiddleware, configureSSE, pagosController.modificarPago);

// ===================================================================
// EXPORT MODULE
// ===================================================================

export default router;
