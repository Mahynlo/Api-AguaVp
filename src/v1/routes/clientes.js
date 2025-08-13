/**
 * Rutas de Clientes
 * 
 * File: src/routes/clientes.js
 * 
 * Descripción:
 *  - /registrar: Registrar un nuevo cliente
 * * - /listar: Listar todos los clientes
 * * - /modificar/:id: Modificar un cliente existente
 * 
 * Funciones:
 * - registrarCliente: Maneja el registro de un nuevo cliente. Verifica si el cliente ya existe y lo registra.
 * * - obtenerClientes: Obtiene todos los clientes de la base de datos.
 * * * - modificarCliente: Modifica los datos de un cliente existente.
 * 
 * 
 * Notas:
 * - Se utiliza sqlite3 para interactuar con la base de datos SQLite.
 * * - Se utiliza un middleware para verificar la autenticación de los usuarios.
 * 
 * Pendiente de implementar:
 */
import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import clientesController from "../controllers/clientesController.js";
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import ControllerIntegration from '../sockets/enhanced/controllerIntegration.js';

const router = express.Router();

console.log("Clientes router loaded");
// Middleware para verificar la autenticación
console.log(authMiddleware);



/**
 * @swagger
 * tags:
 *   name: Clientes
 *   description: Rutas de clientes
*/

/**
 * @swagger
 * /api/clientes/registrar:
 *   post:
 *     summary: Registrar un nuevo cliente
 *     tags: [Clientes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               apellido:
 *                 type: string
 *               correo:
 *                 type: string
 *               telefono:
 *                 type: string
 *               direccion:
 *                type: string
 *               ciudad:
 *                 type: string
 *               estado_cliente:
 *                 type: string
 *               modificado_por:
 *                type: string
 *             
 *     responses:
 *       201:
 *         description: Cliente registrado con éxito
 *       400:
 *         description: Todos los campos son obligatorios
 *       409:
 *          description: Este cliente ya está registrado
 *       500:
 *          description: (Error al registrar el cliente) o (Error al verificar cliente existente)
 */
router.post("/registrar", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, clientesController.registrarCliente);

/**
 * @swagger
 * /api/clientes/listar:
 *   get:
 *     summary: Listar todos los clientes
 *     tags: [Clientes]
 *     responses:
 *       200:
 *         description: Lista de clientes
 *       500:
 *         description: Error al obtener la lista de clientes
 */
router.get("/listar", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, clientesController.obtenerClientes);

/**
 * @swagger
 * /api/clientes/modificar/{id}:
 *   put:
 *     summary: Modificar un cliente existente
 *     tags: [Clientes]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID del cliente a modificar
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               apellido:
 *                 type: string
 *               correo:
 *                 type: string
 *               telefono:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cliente modificado
 *       400:
 *         description: Error al modificar el cliente
 *       404:
 *         description: Cliente no encontrado
 *       500:
 *         description: Error al modificar el cliente
 */

router.put("/modificar/:id", appKeyMiddleware, authMiddleware, ControllerIntegration.withWebSocket, clientesController.modificarCliente);

export default router;
