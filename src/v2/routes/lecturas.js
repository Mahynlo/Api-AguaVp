/**
 * Rutas para gestión de lecturas - V2
 * 
 * File: src/v2/routes/lecturas.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para manejar operaciones CRUD de lecturas de medidores en la versión 2 de la API.
 * Mantiene compatibilidad total con los endpoints de V1 mientras utiliza 
 * la arquitectura moderna V2 con Turso database y Server-Sent Events.
 * 
 * Funcionalidades V1 preservadas:
 * - POST /registrar: Registrar nueva lectura de medidor
 * - GET /listar: Listar todas las lecturas o una específica por ID
 * - GET /listar/:id: Obtener una lectura específica por ID
 * - PUT /modificar/:id: Modificar lectura existente
 * - GET /por-ruta: Obtener lecturas por ruta y período específico
 * - POST /generar-facturas-masivo: Generar facturas masivas para lecturas sin facturar
 * 
 * Cambios en V2:
 * - Integración con sistema SSE para notificaciones en tiempo real
 * - Migración a controladores que usan Turso database (@libsql/client)
 * - Mantiene compatibilidad exacta con endpoints de V1
 * - Configuración automática de managers SSE
 * - Procesamiento optimizado de lecturas masivas
 * - Mejor manejo de errores y validaciones
 * - Respuestas estandarizadas con metadatos
 * - Generación automática de facturas mejorada
 * 
 * Arquitectura:
 * - Base de datos: Turso (compatible con SQLite)
 * - Notificaciones: Server-Sent Events (SSE)
 * - Autenticación: JWT tokens
 * - Validación: App key middleware
 * - Integración: Automática con SSE managers
 * 
 * Dependencias de tablas:
 * - lecturas: Tabla principal de lecturas
 * - medidores: Información del medidor leído
 * - clientes: Cliente asociado al medidor
 * - rutas: Ruta de lectura asignada
 * - facturas: Facturas generadas desde lecturas
 * - usuarios: Usuario que registra/modifica lecturas
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
 * - Mismo algoritmo de procesamiento masivo
 * 
 * @author Sistema AguaVP
 * @version 2.0.0
 * @since 1.0.0
 */

import express from 'express';
import authMiddleware, { requirePermission } from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import lecturasController, { setSSEManagers } from '../controllers/lecturasController.js';
import { 
  validate,
  registrarLecturaSchema,
  actualizarLecturaSchema,
  lecturaIdParamSchema,
  buscarLecturaSchema
} from '../validators/index.js';

const router = express.Router();

// ===================================================================
// SSE CONFIGURATION MIDDLEWARE
// ===================================================================

// Configurar managers SSE al cargar el módulo
let sseManagerConfigured = false;

/**
 * Middleware para configuración automática de SSE managers
 * Configura los managers de SSE y notificaciones al primer uso
 * Esto permite notificaciones en tiempo real para todas las operaciones de lecturas
 */
const configureSSE = (req, res, next) => {
    if (!sseManagerConfigured && req.app) {
        const sseManager = req.app.get('sseManager');
        const notificationManager = req.app.get('notificationManager');
        
        if (sseManager && notificationManager) {
            setSSEManagers(sseManager, notificationManager);
            sseManagerConfigured = true;
            console.log('✅ SSE Managers configurados para lecturas V2');
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
 *   name: Lecturas V2
 *   description: |
 *     **Gestión de Lecturas - API V2**
 *     
 *     Rutas de lecturas versión 2 con integración SSE y arquitectura moderna.
 *     Mantiene compatibilidad total con endpoints V1 mientras proporciona
 *     notificaciones en tiempo real y procesamiento optimizado de lecturas.
 *     
 *     **Características V2:**
 *     - Base de datos Turso con alta disponibilidad
 *     - Server-Sent Events para notificaciones en tiempo real
 *     - Procesamiento optimizado de lecturas masivas
 *     - Configuración automática de managers SSE
 *     - Compatibilidad completa con API V1
 *     - Validaciones mejoradas y manejo de errores
 *     - Integración con múltiples tablas para datos completos
 *     - Generación automática de facturas mejorada
 *     
 *     **Endpoints compatibles con V1:**
 *     - POST /registrar: Mismo proceso de registro que V1
 *     - GET /listar: Misma estructura de respuesta que V1
 *     - GET /listar/:id: Misma funcionalidad que V1
 *     - PUT /modificar/:id: Misma capacidad de modificación que V1
 *     - GET /por-ruta: Mismo filtrado por ruta y período que V1
 *     - POST /generar-facturas-masivo: Mismo procesamiento masivo que V1
 *     
 *     **Mejoras técnicas:**
 *     - Uso de @libsql/client para Turso
 *     - Notificaciones automáticas vía SSE
 *     - Procesamiento batch optimizado
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
 *     LecturaRegistro:
 *       type: object
 *       required:
 *         - medidor_id
 *         - cliente_id
 *         - lectura_actual
 *         - fecha_lectura
 *         - ruta_id
 *         - tomada_por
 *       properties:
 *         medidor_id:
 *           type: integer
 *           description: ID del medidor del cual se toma la lectura
 *           example: 5
 *         cliente_id:
 *           type: integer
 *           description: ID del cliente asociado al medidor
 *           example: 3
 *         lectura_actual:
 *           type: number
 *           minimum: 0
 *           description: Valor actual del medidor en metros cúbicos
 *           example: 1250.75
 *         fecha_lectura:
 *           type: string
 *           format: date
 *           description: Fecha en que se tomó la lectura
 *           example: "2024-01-15"
 *         ruta_id:
 *           type: integer
 *           description: ID de la ruta de lectura asignada
 *           example: 2
 *         tomada_por:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Usuario que tomó la lectura
 *           example: "lector1"
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Observaciones adicionales sobre la lectura
 *           example: "Lectura tomada con normalidad, medidor en buen estado"
 *         periodo:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *           description: Período de facturación en formato YYYY-MM
 *           example: "2024-01"
 *       example:
 *         medidor_id: 5
 *         cliente_id: 3
 *         lectura_actual: 1250.75
 *         fecha_lectura: "2024-01-15"
 *         ruta_id: 2
 *         tomada_por: "lector1"
 *         observaciones: "Lectura tomada con normalidad"
 *         periodo: "2024-01"
 *     
 *     LecturaModificacion:
 *       type: object
 *       properties:
 *         lectura_actual:
 *           type: number
 *           minimum: 0
 *           description: Nuevo valor de lectura
 *           example: 1255.25
 *         fecha_lectura:
 *           type: string
 *           format: date
 *           description: Nueva fecha de lectura
 *           example: "2024-01-16"
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Nuevas observaciones
 *           example: "Corrección por relectura - medidor estaba obstruido"
 *         modificado_por:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Usuario que realiza la modificación
 *           example: "supervisor"
 *         estado_lectura:
 *           type: string
 *           enum: [pendiente, procesada, facturada, anulada]
 *           description: Nuevo estado de la lectura
 *           example: "procesada"
 *       example:
 *         lectura_actual: 1255.25
 *         observaciones: "Corrección por relectura"
 *         modificado_por: "supervisor"
 *         estado_lectura: "procesada"
 *     
 *     LecturaRespuesta:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único de la lectura
 *           example: 1
 *         medidor_id:
 *           type: integer
 *           description: ID del medidor
 *           example: 5
 *         medidor_numero:
 *           type: string
 *           description: Número del medidor
 *           example: "MED-005"
 *         cliente_id:
 *           type: integer
 *           description: ID del cliente
 *           example: 3
 *         cliente_nombre:
 *           type: string
 *           description: Nombre completo del cliente
 *           example: "Juan Carlos García"
 *         lectura_anterior:
 *           type: number
 *           description: Lectura anterior del medidor
 *           example: 1225.50
 *         lectura_actual:
 *           type: number
 *           description: Lectura actual del medidor
 *           example: 1250.75
 *         consumo_m3:
 *           type: number
 *           description: Consumo calculado en metros cúbicos
 *           example: 25.25
 *         fecha_lectura:
 *           type: string
 *           format: date
 *           description: Fecha de la lectura
 *           example: "2024-01-15"
 *         periodo:
 *           type: string
 *           description: Período de facturación
 *           example: "2024-01"
 *         ruta_id:
 *           type: integer
 *           description: ID de la ruta
 *           example: 2
 *         ruta_nombre:
 *           type: string
 *           description: Nombre de la ruta
 *           example: "Ruta Centro"
 *         estado_lectura:
 *           type: string
 *           description: Estado actual de la lectura
 *           example: "procesada"
 *         tiene_factura:
 *           type: boolean
 *           description: Indica si la lectura ya tiene factura generada
 *           example: false
 *         observaciones:
 *           type: string
 *           description: Observaciones de la lectura
 *           example: "Lectura tomada con normalidad"
 *         tomada_por:
 *           type: string
 *           description: Usuario que tomó la lectura
 *           example: "lector1"
 *         fecha_registro:
 *           type: string
 *           format: date-time
 *           description: Fecha de registro en el sistema
 *           example: "2024-01-15T14:30:00Z"
 *       example:
 *         id: 1
 *         medidor_id: 5
 *         medidor_numero: "MED-005"
 *         cliente_id: 3
 *         cliente_nombre: "Juan Carlos García"
 *         lectura_anterior: 1225.50
 *         lectura_actual: 1250.75
 *         consumo_m3: 25.25
 *         fecha_lectura: "2024-01-15"
 *         periodo: "2024-01"
 *         ruta_id: 2
 *         ruta_nombre: "Ruta Centro"
 *         estado_lectura: "procesada"
 *         tiene_factura: false
 *         observaciones: "Lectura tomada con normalidad"
 *         tomada_por: "lector1"
 *         fecha_registro: "2024-01-15T14:30:00Z"
 */

// ===================================================================
// ENDPOINT IMPLEMENTATIONS - V1 COMPATIBLE
// ===================================================================

/**
 * @swagger
 * /api/v2/lecturas/registrar:
 *   post:
 *     summary: Registrar una nueva lectura de medidor (V2 - Compatible con V1)
 *     description: |
 *       Registra una nueva lectura de medidor manteniendo compatibilidad total con V1.
 *       Utiliza arquitectura V2 con Turso database, cálculo automático de consumo y notificaciones SSE.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos requeridos
 *       - Mismo cálculo de consumo
 *       - Misma validación de datos
 *       - Misma estructura de respuesta
 *       
 *       **Mejoras V2:**
 *       - Notificaciones SSE automáticas
 *       - Base de datos Turso distribuida
 *       - Validación mejorada de integridad referencial
 *       - Cálculo optimizado de consumo
 *       
 *       **Proceso de registro:**
 *       1. Validación de autenticación y permisos
 *       2. Validación de datos de entrada
 *       3. Verificación de medidor, cliente y ruta
 *       4. Obtención de lectura anterior
 *       5. Cálculo automático de consumo
 *       6. Inserción en base de datos
 *       7. Notificación SSE a clientes conectados
 *       8. Respuesta con datos de la lectura registrada
 *     tags: [Lecturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LecturaRegistro'
 *           examples:
 *             lectura_normal:
 *               summary: Lectura con consumo normal
 *               value:
 *                 medidor_id: 5
 *                 cliente_id: 3
 *                 lectura_actual: 1250.75
 *                 fecha_lectura: "2024-01-15"
 *                 ruta_id: 2
 *                 tomada_por: "lector1"
 *                 observaciones: "Lectura tomada con normalidad"
 *                 periodo: "2024-01"
 *             lectura_alto_consumo:
 *               summary: Lectura con alto consumo
 *               value:
 *                 medidor_id: 8
 *                 cliente_id: 12
 *                 lectura_actual: 2150.50
 *                 fecha_lectura: "2024-01-15"
 *                 ruta_id: 3
 *                 tomada_por: "lector2"
 *                 observaciones: "Consumo superior al promedio - verificar posibles fugas"
 *                 periodo: "2024-01"
 *     responses:
 *       201:
 *         description: Lectura registrada exitosamente
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
 *                   example: "Lectura registrada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/LecturaRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     consumo_calculado:
 *                       type: number
 *                       description: Consumo calculado automáticamente
 *                       example: 25.25
 *                     lectura_anterior_valor:
 *                       type: number
 *                       description: Valor de la lectura anterior
 *                       example: 1225.50
 *                     puede_generar_factura:
 *                       type: boolean
 *                       description: Indica si la lectura puede generar factura
 *                       example: true
 *       400:
 *         description: Datos de entrada inválidos
 *       404:
 *         description: Medidor, cliente o ruta no encontrados
 *       409:
 *         description: Ya existe una lectura para este período
 *       500:
 *         description: Error interno del servidor
 */
// Rutas adaptadas de V1 con los mismos endpoints exactos
router.post("/registrar", appKeyMiddleware, authMiddleware, requirePermission('lecturas.tomar'), validate(registrarLecturaSchema), configureSSE, lecturasController.registrarLectura);

/**
 * @swagger
 * /api/v2/lecturas/listar:
 *   get:
 *     summary: Listar todas las lecturas (V2 - Compatible con V1)
 *     description: |
 *       Lista todas las lecturas del sistema manteniendo compatibilidad con V1.
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
 *       - Información completa de cliente y medidor
 *     tags: [Lecturas V2]
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
 *       - name: ruta_id
 *         in: query
 *         required: false
 *         description: Filtrar por ID de ruta específica
 *         schema:
 *           type: integer
 *           example: 2
 *       - name: estado
 *         in: query
 *         required: false
 *         description: Filtrar por estado de lectura
 *         schema:
 *           type: string
 *           enum: [pendiente, procesada, facturada, anulada]
 *           example: "procesada"
 *     responses:
 *       200:
 *         description: Lista de lecturas obtenida exitosamente
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
 *                   example: "Lista de lecturas obtenida exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LecturaRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     total_lecturas:
 *                       type: integer
 *                       example: 450
 *                     lecturas_sin_factura:
 *                       type: integer
 *                       example: 25
 *                     consumo_total_periodo:
 *                       type: number
 *                       example: 12500.75
 *       500:
 *         description: Error interno del servidor
 */
router.get("/listar", appKeyMiddleware, authMiddleware, configureSSE, lecturasController.obtenerLecturas);

/**
 * @swagger
 * /api/v2/lecturas/listar/{id}:
 *   get:
 *     summary: Obtener una lectura específica por ID (V2 - Compatible con V1)
 *     description: |
 *       Obtiene los detalles de una lectura específica por su ID manteniendo compatibilidad con V1.
 *       Incluye información detallada del cliente, medidor y ruta.
 *     tags: [Lecturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID de la lectura a obtener
 *         schema:
 *           type: string
 *           example: "1"
 *     responses:
 *       200:
 *         description: Lectura encontrada exitosamente
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
 *                   example: "Lectura encontrada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/LecturaRespuesta'
 *       404:
 *         description: Lectura no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.get("/listar/:id", appKeyMiddleware, authMiddleware, validate(lecturaIdParamSchema, 'params'), configureSSE, lecturasController.obtenerLecturas);

/**
 * @swagger
 * /api/v2/lecturas/modificar/{id}:
 *   put:
 *     summary: Modificar una lectura existente (V2 - Compatible con V1)
 *     description: |
 *       Modifica los datos de una lectura existente manteniendo compatibilidad con V1.
 *       Utiliza transacciones Turso y notificaciones SSE automáticas.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos modificables
 *       - Misma validación de datos
 *       - Mismo recálculo de consumo
 *       - Misma estructura de respuesta
 *       
 *       **Mejoras V2:**
 *       - Transacciones atómicas en Turso
 *       - Notificaciones SSE automáticas
 *       - Mejor validación de concurrencia
 *       - Recálculo optimizado de consumo
 *     tags: [Lecturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID de la lectura a modificar
 *         schema:
 *           type: string
 *           example: "1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LecturaModificacion'
 *     responses:
 *       200:
 *         description: Lectura modificada exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Lectura no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.put("/modificar/:id", appKeyMiddleware, authMiddleware, requirePermission('lecturas.modificar'), validate(lecturaIdParamSchema, 'params'), validate(actualizarLecturaSchema), configureSSE, lecturasController.modificarLectura);

/**
 * @swagger
 * /api/v2/lecturas/por-ruta:
 *   get:
 *     summary: Obtener lecturas por ruta y período (V2 - Compatible con V1)
 *     description: |
 *       Obtiene las lecturas filtradas por ruta y período específico manteniendo compatibilidad con V1.
 *       Utiliza query parameters para el filtrado: ?ruta_id=1&periodo=2024-01
 *       
 *       **Compatibilidad V1:**
 *       - Mismos parámetros de filtrado
 *       - Misma estructura de respuesta
 *       - Mismo ordenamiento
 *       
 *       **Mejoras V2:**
 *       - Consultas optimizadas en Turso
 *       - Mejor rendimiento en filtrados
 *       - Información más detallada
 *     tags: [Lecturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: ruta_id
 *         in: query
 *         required: true
 *         description: ID de la ruta para filtrar
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: periodo
 *         in: query
 *         required: true
 *         description: Período en formato YYYY-MM
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *           example: "2024-01"
 *     responses:
 *       200:
 *         description: Lecturas filtradas obtenidas exitosamente
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
 *                   example: "Lecturas por ruta obtenidas exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LecturaRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     ruta_nombre:
 *                       type: string
 *                       example: "Ruta Centro"
 *                     total_lecturas_ruta:
 *                       type: integer
 *                       example: 45
 *                     consumo_total_ruta:
 *                       type: number
 *                       example: 1250.75
 *       400:
 *         description: Parámetros requeridos faltantes
 *       500:
 *         description: Error interno del servidor
 */
// Obtener lecturas por ruta y periodo (via query params: ?ruta_id=1&periodo=2025-06)
router.get("/por-ruta", appKeyMiddleware, authMiddleware, configureSSE, lecturasController.obtenerLecturasPorRutaYPeriodo);

/**
 * @swagger
 * /api/v2/lecturas/generar-facturas-masivo:
 *   post:
 *     summary: Generar facturas masivas para lecturas sin facturar (V2 - Compatible con V1)
 *     description: |
 *       Genera facturas de forma masiva para todas las lecturas que no tienen factura asociada
 *       manteniendo compatibilidad total con V1. Utiliza procesamiento batch optimizado y notificaciones SSE.
 *       
 *       **Compatibilidad V1:**
 *       - Mismo algoritmo de procesamiento masivo
 *       - Misma validación de lecturas elegibles
 *       - Misma estructura de respuesta
 *       - Mismo manejo de errores por lote
 *       
 *       **Mejoras V2:**
 *       - Procesamiento batch optimizado en Turso
 *       - Notificaciones SSE de progreso en tiempo real
 *       - Mejor manejo de transacciones
 *       - Rollback automático en caso de errores
 *       
 *       **Proceso de generación:**
 *       1. Identificación de lecturas sin factura
 *       2. Validación de datos requeridos para facturación
 *       3. Obtención de tarifas vigentes
 *       4. Procesamiento por lotes con transacciones
 *       5. Generación de facturas individuales
 *       6. Notificaciones SSE de progreso
 *       7. Respuesta con resumen de procesamiento
 *     tags: [Lecturas V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               periodo:
 *                 type: string
 *                 pattern: '^\d{4}-\d{2}$'
 *                 description: Período específico para procesar (opcional)
 *                 example: "2024-01"
 *               ruta_id:
 *                 type: integer
 *                 description: ID de ruta específica para procesar (opcional)
 *                 example: 2
 *               limite_procesamiento:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1000
 *                 description: Límite de lecturas a procesar por lote
 *                 example: 100
 *               generado_por:
 *                 type: string
 *                 description: Usuario que ejecuta el procesamiento masivo
 *                 example: "admin"
 *           examples:
 *             procesamiento_completo:
 *               summary: Procesar todas las lecturas sin factura
 *               value:
 *                 generado_por: "admin"
 *                 limite_procesamiento: 500
 *             procesamiento_por_periodo:
 *               summary: Procesar solo un período específico
 *               value:
 *                 periodo: "2024-01"
 *                 generado_por: "admin"
 *                 limite_procesamiento: 100
 *             procesamiento_por_ruta:
 *               summary: Procesar solo una ruta específica
 *               value:
 *                 ruta_id: 2
 *                 periodo: "2024-01"
 *                 generado_por: "operador1"
 *                 limite_procesamiento: 50
 *     responses:
 *       200:
 *         description: Procesamiento masivo completado exitosamente
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
 *                   example: "Procesamiento masivo de facturas completado"
 *                 data:
 *                   type: object
 *                   properties:
 *                     lecturas_procesadas:
 *                       type: integer
 *                       description: Total de lecturas procesadas
 *                       example: 85
 *                     facturas_generadas:
 *                       type: integer
 *                       description: Total de facturas generadas exitosamente
 *                       example: 82
 *                     errores_procesamiento:
 *                       type: integer
 *                       description: Número de errores durante el procesamiento
 *                       example: 3
 *                     valor_total_facturado:
 *                       type: number
 *                       description: Valor total de las facturas generadas
 *                       example: 2750500.75
 *                     tiempo_procesamiento:
 *                       type: string
 *                       description: Tiempo total de procesamiento
 *                       example: "2.5 segundos"
 *                     detalle_errores:
 *                       type: array
 *                       description: Detalles de los errores ocurridos
 *                       items:
 *                         type: object
 *                         properties:
 *                           lectura_id:
 *                             type: integer
 *                             example: 45
 *                           error:
 *                             type: string
 *                             example: "Tarifa no encontrada para el período"
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     periodo_procesado:
 *                       type: string
 *                       example: "2024-01"
 *                     rutas_procesadas:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [1, 2, 3]
 *                     fecha_procesamiento:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-20T15:30:00Z"
 *       400:
 *         description: Parámetros de entrada inválidos
 *       500:
 *         description: Error interno durante el procesamiento masivo
 */
// 🧾 Generar facturas para lecturas sin factura (procesamiento masivo)
router.post("/generar-facturas-masivo", appKeyMiddleware, authMiddleware, requirePermission('lecturas.recalcular'), configureSSE, lecturasController.generarFacturasParaLecturasSinFactura);

/**
 * @swagger
 * /api/v2/lecturas/medidor/{id}:
 *   get:
 *     summary: Obtener historial completo de lecturas de un medidor
 *     description: |
 *       Retorna el historial completo de lecturas de un medidor específico con análisis de consumo,
 *       detección de anomalías y gráfica de tendencias.
 *       
 *       **Características:**
 *       - Historial de todas las lecturas del medidor
 *       - Estadísticas de consumo (promedio, mínimo, máximo)
 *       - Detección automática de anomalías (consumos atípicos)
 *       - Gráfica de consumo por periodo (últimos 12 periodos)
 *       - Información de facturas asociadas
 *     tags: [Lecturas V2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID del medidor
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: limit
 *         in: query
 *         required: false
 *         description: Número máximo de lecturas a retornar
 *         schema:
 *           type: integer
 *           default: 100
 *           example: 50
 *     responses:
 *       200:
 *         description: Historial de lecturas obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 medidor:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     numero_serie:
 *                       type: string
 *                       example: "MED-2024-001"
 *                     cliente_id:
 *                       type: integer
 *                       example: 5
 *                     cliente_nombre:
 *                       type: string
 *                       example: "Juan Pérez"
 *                 estadisticas:
 *                   type: object
 *                   properties:
 *                     total_lecturas:
 *                       type: integer
 *                       example: 24
 *                     promedio_consumo:
 *                       type: number
 *                       example: 18.5
 *                     consumo_minimo:
 *                       type: number
 *                       example: 10.2
 *                     consumo_maximo:
 *                       type: number
 *                       example: 45.8
 *                     anomalias_detectadas:
 *                       type: integer
 *                       example: 2
 *                 lecturas_con_anomalia:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       periodo:
 *                         type: string
 *                       consumo:
 *                         type: number
 *                       promedio:
 *                         type: number
 *                       desviacion:
 *                         type: string
 *                         example: "+150.00%"
 *                 grafica_consumo:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       periodo:
 *                         type: string
 *                         example: "2024-12"
 *                       consumo:
 *                         type: number
 *                         example: 18.5
 *                 historial:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Medidor no encontrado
 *       500:
 *         description: Error interno del servidor
 */
router.get("/medidor/:id", appKeyMiddleware, authMiddleware, configureSSE, lecturasController.obtenerLecturasPorMedidor);

/**
 * @swagger
 * /api/v2/lecturas/cliente/{id}:
 *   get:
 *     summary: Obtener todas las lecturas de un cliente
 *     description: |
 *       Retorna todas las lecturas de todos los medidores asociados a un cliente,
 *       con resumen de consumo y facturación por periodo.
 *       
 *       **Características:**
 *       - Lecturas de todos los medidores del cliente
 *       - Consumo total por periodo
 *       - Resumen de facturación
 *       - Filtro opcional por periodo
 *     tags: [Lecturas V2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID del cliente
 *         schema:
 *           type: integer
 *           example: 5
 *       - name: periodo
 *         in: query
 *         required: false
 *         description: Filtrar por periodo específico (YYYY-MM)
 *         schema:
 *           type: string
 *           example: "2024-12"
 *     responses:
 *       200:
 *         description: Lecturas del cliente obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cliente:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 5
 *                     nombre:
 *                       type: string
 *                       example: "Juan Pérez"
 *                     total_medidores:
 *                       type: integer
 *                       example: 3
 *                 resumen:
 *                   type: object
 *                   properties:
 *                     total_lecturas:
 *                       type: integer
 *                       example: 72
 *                     consumo_total:
 *                       type: string
 *                       example: "1350.50"
 *                     promedio_por_lectura:
 *                       type: string
 *                       example: "18.76"
 *                     monto_total_facturado:
 *                       type: string
 *                       example: "135000.00"
 *                 consumo_por_periodo:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       periodo:
 *                         type: string
 *                         example: "2024-12"
 *                       consumo_total:
 *                         type: number
 *                         example: 55.5
 *                       cantidad_lecturas:
 *                         type: integer
 *                         example: 3
 *                       monto_total:
 *                         type: number
 *                         example: 12500.00
 *                 lecturas:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Cliente no encontrado o sin medidores
 *       500:
 *         description: Error interno del servidor
 */
router.get("/cliente/:id", appKeyMiddleware, authMiddleware, configureSSE, lecturasController.obtenerLecturasPorCliente);

/**
 * @swagger
 * /api/v2/lecturas/estadisticas:
 *   get:
 *     summary: Obtener estadísticas generales de lecturas
 *     description: |
 *       Retorna estadísticas completas sobre las lecturas del sistema,
 *       incluyendo consumos, facturación, tendencias y distribución.
 *       
 *       **Métricas incluidas:**
 *       - Total de lecturas y facturación
 *       - Consumo total y promedios
 *       - Distribución por rangos de consumo
 *       - Tendencias por periodo (últimos 12 meses)
 *       - Top 10 mayores consumos
 *       - Medidores sin lecturas recientes
 *       
 *       **Útil para:**
 *       - Dashboards de administración
 *       - Reportes de consumo
 *       - Análisis de tendencias
 *       - Detección de anomalías
 *     tags: [Lecturas V2]
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
 *                     total_lecturas:
 *                       type: integer
 *                       example: 5420
 *                     lecturas_mes_actual:
 *                       type: integer
 *                       example: 450
 *                     medidores_sin_lectura_mes:
 *                       type: integer
 *                       example: 25
 *                     lecturas_con_factura:
 *                       type: integer
 *                       example: 5200
 *                     lecturas_sin_factura:
 *                       type: integer
 *                       example: 220
 *                     porcentaje_facturacion:
 *                       type: string
 *                       example: "95.94"
 *                 consumo:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: string
 *                       example: "98500.50"
 *                     promedio:
 *                       type: string
 *                       example: "18.18"
 *                     minimo:
 *                       type: string
 *                       example: "2.50"
 *                     maximo:
 *                       type: string
 *                       example: "250.00"
 *                 distribucion_consumo:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rango:
 *                         type: string
 *                         example: "10-20 m³"
 *                       cantidad:
 *                         type: integer
 *                         example: 2340
 *                 tendencias:
 *                   type: object
 *                   properties:
 *                     por_periodo:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           periodo:
 *                             type: string
 *                             example: "2024-12"
 *                           cantidad_lecturas:
 *                             type: integer
 *                             example: 450
 *                           consumo_total:
 *                             type: string
 *                             example: "8200.50"
 *                           consumo_promedio:
 *                             type: string
 *                             example: "18.22"
 *                 top_consumos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       lectura_id:
 *                         type: integer
 *                       consumo_m3:
 *                         type: number
 *                       periodo:
 *                         type: string
 *                       numero_serie:
 *                         type: string
 *                       cliente_nombre:
 *                         type: string
 *                 fecha_generacion:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.get("/estadisticas", appKeyMiddleware, authMiddleware, configureSSE, lecturasController.estadisticas);

router.get("/validar-cobranza", appKeyMiddleware, authMiddleware, configureSSE, lecturasController.validarCobranzaPeriodoAnterior);

// ===================================================================
// EXPORT MODULE
// ===================================================================

export default router;

