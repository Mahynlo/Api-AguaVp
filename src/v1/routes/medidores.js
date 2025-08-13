/**
 * Rutas de Medidores
 * 
 * File: src/routes/medidores.js
 * 
 * Descripción:
 * *  - /registrar: Registrar un nuevo medidor
 * * * - /listar: Listar todos los medidores
 * * * - /modificar/:id: Modificar un medidor existente
 * 
 * 
 * Funciones:
 * * - registrarMedidor: Maneja el registro de un nuevo medidor. Verifica si el medidor ya existe y lo registra.
 * * * - obtenerMedidores: Obtiene todos los medidores de la base de datos.
 * * * * - modificarMedidor: Modifica los datos de un medidor existente.
 * 
 * 
 * Notas:
 * * - Se utiliza sqlite3 para interactuar con la base de datos SQLite.
 * * * - Se utiliza un middleware para verificar la autenticación de los usuarios.
 * 
 * Pendiente de implementar:
 */
import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import appKeyMiddleware from '../middlewares/appKeyMiddleware.js';
import MedidorController from "../controllers/medidorController.js";
import { withWebSocket } from '../sockets/enhanced/controllerIntegration.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Medidores
 *   description: Rutas de medidores
*/




/**
 * @swagger
 * /api/medidores/registrar:
 *   post:
 *     summary: Registrar un nuevo medidor
 *     tags: [Medidores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cliente_id:
 *                 type: integer
 *               numero_serie:
 *                 type: string
 *               ubicacion:
 *                 type: string
 *               fecha_instalacion:
 *                 type: string
 *                 format: date
 *               latitud:
 *                 type: number
 *               longitud:
 *                 type: number
 *               estado_medidor:
 *                type: string
 *               modificado_por:
 *                type: string
 * 
 *     responses:
 *       201:
 *          description: Medidor registrado
 *       400:
 *         description: Todos los campos son obligatorios
 *       409:
 *         description: El número de serie ya está registrado
 *       500:
 *         description: Error al registrar el medidor
 */
router.post("/registrar", appKeyMiddleware, authMiddleware, withWebSocket, MedidorController.registrarMedidor);


/**
 * @swagger
 * /api/medidores/listar:
 *   get:
 *     summary: Listar todos los medidores
 *     tags: [Medidores]
 *     responses:
 *       200:
 *         description: Lista de medidores
 *       500:
 *         description: Error al obtener los medidores
 */
router.get("/listar", appKeyMiddleware, authMiddleware, withWebSocket, MedidorController.obtenerMedidores);


/**
 * @swagger
 * /api/medidores/modificar/{id}:
 *   put:
 *     summary: Modificar un medidor existente
 *     tags: [Medidores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID del medidor a modificar
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cliente_id:
 *                 type: integer
 *               numero_serie:
 *                 type: string
 *               ubicacion:
 *                 type: string
 *               fecha_instalacion:
 *                 type: string
 *                 format: date
 *               latitud:
 *                 type: number
 *               longitud:
 *                 type: number
 *               estado_medidor:
 *                type: string
 *
 *
 *
 *
 *
 *     responses:
 *       200:
 *        description: Medidor modificado
 *       400:
 *        description: Al menos un campo es obligatorio
 *       404:
 *        description: Medidor no encontrado
 *       500:
 *        description: Error al modificar el medidor
 */

router.put("/modificar/:id", appKeyMiddleware, authMiddleware, withWebSocket, MedidorController.modificarMedidor);

export default router;
