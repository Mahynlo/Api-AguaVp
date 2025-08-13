import express from "express";
import appController from "../controllers/appController.js";

const router = express.Router();

// Ruta de instalación inicial
router.post("/registrarApp", appController.registrarApp);

export default router;
/**
 * @swagger
 * /api/app/registrarApp:
 *   post:
 *     summary: Registrar una nueva aplicación
 *     tags: [App]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre_app:
 *                 type: string
 *               version_app:
 *                 type: string
 *               fecha_instalacion:
 *                 type: string
 *                 format: date
 *               modificado_por:
 *                 type: string
 *
 *     responses:
 *       201:
 *         description: Aplicación registrada con éxito
 *       400:
 *         description: Todos los campos son obligatorios
 *       500:
 *         description: Error al registrar la aplicación
 */