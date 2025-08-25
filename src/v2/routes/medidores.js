/**
 * Rutas para gestión de medidores - V2
 * 
 * File: src/v2/routes/medidores.js
 * Version: 2.0.0
 * 
 * Descripción: 
 * Rutas para manejar operaciones CRUD de medidores en la versión 2 de la API.
 * Mantiene compatibilidad total con los endpoints de V1 mientras utiliza 
 * la arquitectura moderna V2 con Turso database y Server-Sent Events.
 * 
 * Funcionalidades V1 preservadas:
 * - POST /registrar: Registrar un nuevo medidor con validación de duplicados
 * - GET /listar: Listar todos los medidores con información de clientes asociados
 * - PUT /modificar/:id: Modificar datos de medidor existente
 * 
 * Cambios en V2:
 * - Integración con sistema SSE para notificaciones en tiempo real
 * - Migración a controladores que usan Turso database (@libsql/client)
 * - Mantiene compatibilidad exacta con endpoints de V1
 * - Configuración automática de managers SSE
 * - Mejor manejo de errores y validaciones
 * - Respuestas estandarizadas con metadatos
 * - Gestión optimizada de asignación/liberación de clientes
 * 
 * Arquitectura:
 * - Base de datos: Turso (compatible con SQLite)
 * - Notificaciones: Server-Sent Events (SSE)
 * - Autenticación: JWT tokens
 * - Validación: App key middleware
 * - Integración: Automática con SSE managers
 * 
 * Dependencias de tablas:
 * - medidores: Tabla principal de medidores
 * - clientes: Clientes asociados a medidores
 * - historial_cambios: Auditoría de cambios
 * - lecturas: Lecturas tomadas de los medidores
 * - usuarios: Usuario que registra/modifica medidores
 * 
 * Seguridad:
 * - Autenticación JWT requerida
 * - Validación de clave de aplicación
 * - Sanitización de datos de entrada
 * - Auditoría de cambios en historial_cambios
 * 
 * Notas de compatibilidad:
 * - Mantiene exactamente los mismos endpoints que V1
 * - Preserva estructura de respuestas V1
 * - Compatible con clientes existentes de la API
 * - Mismo algoritmo de asignación/liberación de clientes
 * 
 * @author Sistema AguaVP
 * @version 2.0.0
 * @since 1.0.0
 */

import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import medidorController, { setSSEManagers } from '../controllers/medidorController.js';

const router = express.Router();

// ===================================================================
// SSE CONFIGURATION MIDDLEWARE
// ===================================================================

// Configurar managers SSE al cargar el módulo
let sseManagerConfigured = false;

/**
 * Middleware para configuración automática de SSE managers
 * Configura los managers de SSE y notificaciones al primer uso
 * Esto permite notificaciones en tiempo real para todas las operaciones de medidores
 */
const configureSSE = (req, res, next) => {
    if (!sseManagerConfigured && req.app) {
        const sseManager = req.app.get('sseManager');
        const notificationManager = req.app.get('notificationManager');
        
        if (sseManager && notificationManager) {
            setSSEManagers(sseManager, notificationManager);
            sseManagerConfigured = true;
            console.log('✅ SSE Managers configurados para medidores V2');
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
 *   name: Medidores V2
 *   description: |
 *     **Gestión de Medidores - API V2**
 *     
 *     Rutas de medidores versión 2 con integración SSE y arquitectura moderna.
 *     Mantiene compatibilidad total con endpoints V1 mientras proporciona
 *     notificaciones en tiempo real y gestión optimizada de medidores.
 *     
 *     **Características V2:**
 *     - Base de datos Turso con alta disponibilidad
 *     - Server-Sent Events para notificaciones en tiempo real
 *     - Gestión optimizada de asignación/liberación de clientes
 *     - Configuración automática de managers SSE
 *     - Compatibilidad completa con API V1
 *     - Validaciones mejoradas y manejo de errores
 *     - Integración con múltiples tablas para datos completos
 *     - Auditoría automática de cambios
 *     
 *     **Endpoints compatibles con V1:**
 *     - POST /registrar: Mismo proceso de registro que V1
 *     - GET /listar: Misma estructura de respuesta que V1
 *     - PUT /modificar/:id: Misma capacidad de modificación que V1
 *     
 *     **Mejoras técnicas:**
 *     - Uso de @libsql/client para Turso
 *     - Notificaciones automáticas vía SSE
 *     - Gestión de asignación de clientes optimizada
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
 *     MedidorRegistro:
 *       type: object
 *       required:
 *         - numero_medidor
 *         - marca
 *         - modelo
 *         - fecha_instalacion
 *         - estado_medidor
 *         - registrado_por
 *       properties:
 *         numero_medidor:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *           description: Número único del medidor
 *           example: "MED-001"
 *         marca:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           description: Marca del medidor
 *           example: "AquaTech"
 *         modelo:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           description: Modelo del medidor
 *           example: "AT-150"
 *         fecha_instalacion:
 *           type: string
 *           format: date
 *           description: Fecha de instalación del medidor
 *           example: "2024-01-15"
 *         estado_medidor:
 *           type: string
 *           enum: [activo, inactivo, mantenimiento, dañado]
 *           description: Estado actual del medidor
 *           example: "activo"
 *         ubicacion:
 *           type: string
 *           maxLength: 200
 *           description: Ubicación física del medidor
 *           example: "Calle 123 #45-67, frente a la casa"
 *         lectura_inicial:
 *           type: number
 *           minimum: 0
 *           description: Lectura inicial del medidor al momento de instalación
 *           example: 0
 *         cliente_asignado:
 *           type: integer
 *           description: ID del cliente al que se asigna el medidor (opcional)
 *           example: 5
 *         registrado_por:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Usuario que registra el medidor
 *           example: "admin"
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Observaciones adicionales del medidor
 *           example: "Medidor nuevo instalado en zona residencial"
 *       example:
 *         numero_medidor: "MED-001"
 *         marca: "AquaTech"
 *         modelo: "AT-150"
 *         fecha_instalacion: "2024-01-15"
 *         estado_medidor: "activo"
 *         ubicacion: "Calle 123 #45-67, frente a la casa"
 *         lectura_inicial: 0
 *         cliente_asignado: 5
 *         registrado_por: "admin"
 *         observaciones: "Medidor nuevo instalado en zona residencial"
 *     
 *     MedidorModificacion:
 *       type: object
 *       properties:
 *         marca:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           description: Nueva marca del medidor
 *           example: "AquaTech Pro"
 *         modelo:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           description: Nuevo modelo del medidor
 *           example: "AT-200"
 *         estado_medidor:
 *           type: string
 *           enum: [activo, inactivo, mantenimiento, dañado]
 *           description: Nuevo estado del medidor
 *           example: "mantenimiento"
 *         ubicacion:
 *           type: string
 *           maxLength: 200
 *           description: Nueva ubicación del medidor
 *           example: "Calle 123 #45-67, lado izquierdo"
 *         cliente_asignado:
 *           type: integer
 *           description: ID del nuevo cliente asignado (null para liberar)
 *           example: 8
 *         observaciones:
 *           type: string
 *           maxLength: 500
 *           description: Nuevas observaciones
 *           example: "Medidor reubicado por mejoras en la instalación"
 *         modificado_por:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Usuario que realiza la modificación
 *           example: "supervisor"
 *       example:
 *         estado_medidor: "mantenimiento"
 *         observaciones: "Medidor enviado a mantenimiento preventivo"
 *         modificado_por: "supervisor"
 *     
 *     MedidorRespuesta:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único del medidor
 *           example: 1
 *         numero_medidor:
 *           type: string
 *           description: Número único del medidor
 *           example: "MED-001"
 *         marca:
 *           type: string
 *           description: Marca del medidor
 *           example: "AquaTech"
 *         modelo:
 *           type: string
 *           description: Modelo del medidor
 *           example: "AT-150"
 *         fecha_instalacion:
 *           type: string
 *           format: date
 *           description: Fecha de instalación
 *           example: "2024-01-15"
 *         estado_medidor:
 *           type: string
 *           description: Estado actual del medidor
 *           example: "activo"
 *         ubicacion:
 *           type: string
 *           description: Ubicación física del medidor
 *           example: "Calle 123 #45-67, frente a la casa"
 *         lectura_inicial:
 *           type: number
 *           description: Lectura inicial del medidor
 *           example: 0
 *         lectura_actual:
 *           type: number
 *           description: Última lectura registrada
 *           example: 1250.75
 *         cliente_asignado:
 *           type: integer
 *           nullable: true
 *           description: ID del cliente asignado
 *           example: 5
 *         cliente_nombre:
 *           type: string
 *           nullable: true
 *           description: Nombre del cliente asignado
 *           example: "Juan Carlos García"
 *         total_lecturas:
 *           type: integer
 *           description: Total de lecturas registradas
 *           example: 25
 *         ultima_lectura_fecha:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Fecha de la última lectura
 *           example: "2024-01-20"
 *         observaciones:
 *           type: string
 *           description: Observaciones del medidor
 *           example: "Medidor funcionando correctamente"
 *         registrado_por:
 *           type: string
 *           description: Usuario que registró el medidor
 *           example: "admin"
 *         fecha_registro:
 *           type: string
 *           format: date-time
 *           description: Fecha de registro en el sistema
 *           example: "2024-01-15T10:30:00Z"
 *         fecha_modificacion:
 *           type: string
 *           format: date-time
 *           description: Última modificación
 *           example: "2024-01-20T14:45:00Z"
 *         modificado_por:
 *           type: string
 *           description: Usuario que realizó la última modificación
 *           example: "supervisor"
 *       example:
 *         id: 1
 *         numero_medidor: "MED-001"
 *         marca: "AquaTech"
 *         modelo: "AT-150"
 *         fecha_instalacion: "2024-01-15"
 *         estado_medidor: "activo"
 *         ubicacion: "Calle 123 #45-67, frente a la casa"
 *         lectura_inicial: 0
 *         lectura_actual: 1250.75
 *         cliente_asignado: 5
 *         cliente_nombre: "Juan Carlos García"
 *         total_lecturas: 25
 *         ultima_lectura_fecha: "2024-01-20"
 *         observaciones: "Medidor funcionando correctamente"
 *         registrado_por: "admin"
 *         fecha_registro: "2024-01-15T10:30:00Z"
 *         fecha_modificacion: "2024-01-20T14:45:00Z"
 *         modificado_por: "supervisor"
 */

// ===================================================================
// ENDPOINT IMPLEMENTATIONS - V1 COMPATIBLE
// ===================================================================

/**
 * @swagger
 * /api/v2/medidores/registrar:
 *   post:
 *     summary: Registrar un nuevo medidor (V2 - Compatible con V1)
 *     description: |
 *       Registra un nuevo medidor en el sistema manteniendo compatibilidad total con V1.
 *       Utiliza arquitectura V2 con Turso database, validación de duplicados y notificaciones SSE.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos requeridos
 *       - Misma validación de duplicados por número de medidor
 *       - Misma estructura de respuesta
 *       - Mismo manejo de asignación de clientes
 *       
 *       **Mejoras V2:**
 *       - Notificaciones SSE automáticas
 *       - Base de datos Turso distribuida
 *       - Validación mejorada de integridad referencial
 *       - Registro de auditoría en historial_cambios
 *       
 *       **Proceso de registro:**
 *       1. Validación de autenticación y permisos
 *       2. Validación de datos de entrada
 *       3. Verificación de número de medidor único
 *       4. Validación de cliente asignado (si aplica)
 *       5. Inserción en base de datos
 *       6. Registro en historial de cambios
 *       7. Notificación SSE a clientes conectados
 *       8. Respuesta con datos del medidor registrado
 *     tags: [Medidores V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MedidorRegistro'
 *           examples:
 *             medidor_con_cliente:
 *               summary: Medidor asignado a cliente
 *               value:
 *                 numero_medidor: "MED-001"
 *                 marca: "AquaTech"
 *                 modelo: "AT-150"
 *                 fecha_instalacion: "2024-01-15"
 *                 estado_medidor: "activo"
 *                 ubicacion: "Calle 123 #45-67, frente a la casa"
 *                 lectura_inicial: 0
 *                 cliente_asignado: 5
 *                 registrado_por: "admin"
 *                 observaciones: "Medidor nuevo instalado en zona residencial"
 *             medidor_sin_cliente:
 *               summary: Medidor sin asignar
 *               value:
 *                 numero_medidor: "MED-002"
 *                 marca: "HydroMeter"
 *                 modelo: "HM-100"
 *                 fecha_instalacion: "2024-01-16"
 *                 estado_medidor: "activo"
 *                 ubicacion: "Almacén central"
 *                 lectura_inicial: 0
 *                 registrado_por: "operador1"
 *                 observaciones: "Medidor en stock para futuras instalaciones"
 *     responses:
 *       201:
 *         description: Medidor registrado exitosamente
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
 *                   example: "Medidor registrado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/MedidorRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     asignado_a_cliente:
 *                       type: boolean
 *                       description: Indica si el medidor fue asignado a un cliente
 *                       example: true
 *                     cliente_notificado:
 *                       type: boolean
 *                       description: Indica si se notificó al cliente (si aplica)
 *                       example: true
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
 *                   example: "Los siguientes campos son requeridos: numero_medidor, marca, modelo, fecha_instalacion, estado_medidor, registrado_por"
 *       404:
 *         description: Cliente no encontrado (si se especifica cliente_asignado)
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
 *                   example: "Cliente no encontrado"
 *                 details:
 *                   type: string
 *                   example: "No se encontró un cliente con ID: 5"
 *       409:
 *         description: Conflicto - Medidor ya existe
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
 *                   example: "Este medidor ya está registrado"
 *                 details:
 *                   type: string
 *                   example: "Ya existe un medidor con el número: MED-001"
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
 *                   example: "Error al registrar el medidor"
 *                 details:
 *                   type: string
 *                   example: "Error de conexión con la base de datos Turso"
 */
// Rutas adaptadas de V1 con los mismos endpoints exactos
router.post("/registrar", appKeyMiddleware, authMiddleware, configureSSE, medidorController.registrarMedidor);

/**
 * @swagger
 * /api/v2/medidores/listar:
 *   get:
 *     summary: Listar todos los medidores (V2 - Compatible con V1)
 *     description: |
 *       Lista todos los medidores del sistema manteniendo compatibilidad con V1.
 *       Utiliza consultas optimizadas en Turso y notificaciones SSE.
 *       Incluye información de clientes asignados y estadísticas de lecturas.
 *       
 *       **Compatibilidad V1:**
 *       - Misma estructura de respuesta
 *       - Mismos datos incluidos
 *       - Mismo ordenamiento por fecha de instalación
 *       
 *       **Mejoras V2:**
 *       - Consultas optimizadas en Turso
 *       - Actualizaciones automáticas vía SSE
 *       - Mejor rendimiento en consultas grandes
 *       - Información completa de clientes y lecturas
 *     tags: [Medidores V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: estado
 *         in: query
 *         required: false
 *         description: Filtrar por estado del medidor
 *         schema:
 *           type: string
 *           enum: [activo, inactivo, mantenimiento, dañado]
 *           example: "activo"
 *       - name: marca
 *         in: query
 *         required: false
 *         description: Filtrar por marca del medidor
 *         schema:
 *           type: string
 *           example: "AquaTech"
 *       - name: cliente_asignado
 *         in: query
 *         required: false
 *         description: Filtrar medidores asignados (true) o sin asignar (false)
 *         schema:
 *           type: boolean
 *           example: true
 *     responses:
 *       200:
 *         description: Lista de medidores obtenida exitosamente
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
 *                   example: "Lista de medidores obtenida exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MedidorRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     total_medidores:
 *                       type: integer
 *                       description: Total de medidores en el sistema
 *                       example: 150
 *                     medidores_activos:
 *                       type: integer
 *                       description: Número de medidores activos
 *                       example: 142
 *                     medidores_asignados:
 *                       type: integer
 *                       description: Medidores asignados a clientes
 *                       example: 135
 *                     medidores_sin_asignar:
 *                       type: integer
 *                       description: Medidores disponibles para asignación
 *                       example: 15
 *                     marcas_disponibles:
 *                       type: array
 *                       description: Lista de marcas registradas
 *                       items:
 *                         type: string
 *                       example: ["AquaTech", "HydroMeter", "WaterFlow"]
 *                     version:
 *                       type: string
 *                       example: "2.0.0"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00Z"
 *                     request_id:
 *                       type: string
 *                       example: "req_987654321"
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
 *                   example: "Error al obtener la lista de medidores"
 *                 details:
 *                   type: string
 *                   example: "Error de conexión con la base de datos Turso"
 */
router.get("/listar", appKeyMiddleware, authMiddleware, configureSSE, medidorController.obtenerMedidores);

/**
 * @swagger
 * /api/v2/medidores/modificar/{id}:
 *   put:
 *     summary: Modificar un medidor existente (V2 - Compatible con V1)
 *     description: |
 *       Modifica los datos de un medidor existente manteniendo compatibilidad con V1.
 *       Utiliza transacciones Turso y notificaciones SSE automáticas.
 *       Permite asignar/liberar clientes y actualizar estado del medidor.
 *       
 *       **Compatibilidad V1:**
 *       - Mismos campos modificables
 *       - Misma validación de datos
 *       - Misma estructura de respuesta
 *       - Mismo manejo de asignación/liberación de clientes
 *       
 *       **Mejoras V2:**
 *       - Transacciones atómicas en Turso
 *       - Notificaciones SSE automáticas
 *       - Mejor validación de concurrencia
 *       - Registro de auditoría automático
 *     tags: [Medidores V2]
 *     security:
 *       - bearerAuth: []
 *       - appKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID del medidor a modificar
 *         schema:
 *           type: string
 *           example: "1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MedidorModificacion'
 *           examples:
 *             cambio_estado:
 *               summary: Cambiar estado a mantenimiento
 *               value:
 *                 estado_medidor: "mantenimiento"
 *                 observaciones: "Medidor enviado a mantenimiento preventivo"
 *                 modificado_por: "supervisor"
 *             asignar_cliente:
 *               summary: Asignar medidor a cliente
 *               value:
 *                 cliente_asignado: 8
 *                 ubicacion: "Calle 456 #78-90, Nueva dirección"
 *                 observaciones: "Medidor reasignado por cambio de cliente"
 *                 modificado_por: "admin"
 *             liberar_medidor:
 *               summary: Liberar medidor de cliente
 *               value:
 *                 cliente_asignado: null
 *                 estado_medidor: "inactivo"
 *                 observaciones: "Medidor liberado - cliente canceló servicio"
 *                 modificado_por: "operador1"
 *     responses:
 *       200:
 *         description: Medidor modificado exitosamente
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
 *                   example: "Medidor modificado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/MedidorRespuesta'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     cambios_realizados:
 *                       type: array
 *                       description: Lista de campos modificados
 *                       items:
 *                         type: string
 *                       example: ["estado_medidor", "observaciones"]
 *                     cliente_anterior:
 *                       type: integer
 *                       nullable: true
 *                       description: ID del cliente anterior (si cambió asignación)
 *                       example: 5
 *                     cliente_nuevo:
 *                       type: integer
 *                       nullable: true
 *                       description: ID del nuevo cliente asignado
 *                       example: 8
 *                     notificaciones_enviadas:
 *                       type: array
 *                       description: Lista de notificaciones SSE enviadas
 *                       items:
 *                         type: string
 *                       example: ["medidor_modificado", "cliente_asignado"]
 *                     version:
 *                       type: string
 *                       example: "2.0.0"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-20T14:45:00Z"
 *       400:
 *         description: Datos inválidos
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
 *                   example: "El estado 'invalido' no es válido. Estados permitidos: activo, inactivo, mantenimiento, dañado"
 *       404:
 *         description: Medidor no encontrado
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
 *                   example: "Medidor no encontrado"
 *                 details:
 *                   type: string
 *                   example: "No se encontró un medidor con ID: 999"
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
 *                   example: "Error al modificar el medidor"
 *                 details:
 *                   type: string
 *                   example: "Error en transacción de base de datos"
 */
router.put("/modificar/:id", appKeyMiddleware, authMiddleware, configureSSE, medidorController.modificarMedidor);

// ===================================================================
// EXPORT MODULE
// ===================================================================

export default router;
