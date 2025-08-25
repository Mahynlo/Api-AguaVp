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

// ===================================================================
// EXPORT MODULE
// ===================================================================

export default router;
