/**
 * Servidor de API REST para la gestión de Agua Potable
 * 
 * File: src/index.js
 * 
 * Descripción:
 * - Este archivo es el punto de entrada de la aplicación.
 * * - Configura el servidor Express y las rutas de la API.
 * 
 * Funciones:
 * - Carga las variables de entorno desde un archivo .env.
 * * - Configura el servidor Express.
 * * - Establece las rutas de la API.
 * * - Inicia el servidor en el puerto especificado.
 * 
 * * Notas:
 * - Se utiliza dotenv para cargar las variables de entorno.
 * * - Se utiliza express para crear el servidor.
 */
require('dotenv').config();
const server = require('./server');

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
