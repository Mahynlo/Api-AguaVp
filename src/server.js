/**
 * Configuración del servidor Express
 * 
 * File: src/server.js
 * 
 * Descripción:
 * - Este archivo configura el servidor Express y las rutas de la API.
 * - Establece la conexión con el servidor WebSocket.
 * - Configura los middlewares y las rutas de la API.
 * 
 * Funciones:
 * - Carga las variables de entorno desde un archivo .env.
 * - Configura el servidor Express.
 * - Establece las rutas de la API.
 * - Inicia el servidor en el puerto especificado.
 * 
 * Notas:
 * - Se utiliza dotenv para cargar las variables de entorno.
 * - Se utiliza express para crear el servidor.
 * - Se utiliza cors para permitir el acceso desde diferentes dominios.
 * - Se utiliza socket.io para establecer la conexión WebSocket.
 * - Se utiliza sqlite3 para interactuar con la base de datos SQLite.
 * - Se utiliza bcryptjs para cifrar las contraseñas.
 * 
 */

// Cargar variables de entorno
import 'dotenv/config';

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import setupSocket from './v1/sockets/socket.js';
import SocketManager from './v1/sockets/enhanced/socketManager.js';
import SSEManager from './v2/sse/sseManager.js';
import SSENotificationManager from './v2/sse/notificationManager.js';
import routes from './routes/index.js';
//documentación
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

// Configuración de Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API AGUA-VP',
      version: '1.0.0',
      description: 'Documentación de la API versionada para gestionar clientes y medidores de agua potable',
      contact: {
        name: 'Equipo de Desarrollo',
        email: 'soporte@agua-vp.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Servidor de desarrollo - API v1'
      },
      {
        url: 'http://localhost:3000/api',
        description: 'Servidor de desarrollo - Sin versión (redirige a v1)'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key'
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/v1/routes/*.js'], // <--- importante: ruta a las rutas versionadas
};


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // ⚠️ Para producción se debe restringir esto
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar Socket Manager mejorado (v1)
const socketManager = new SocketManager();

// Inicializar SSE Manager (v2)
const sseManager = new SSEManager();
const sseNotificationManager = new SSENotificationManager(sseManager);

// Hacer disponible los objetos en toda la aplicación
app.set('io', io);
app.set('socketManager', socketManager);
app.set('sseManager', sseManager); // Nuevo para v2
app.set('notificationManager', sseNotificationManager); // Nuevo para v2

// Rutas
app.use('/api', routes);


const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'API Agua Potable v1.0',
  customfavIcon: './public/assets/images/icon.png',
  customCss: `
    .swagger-ui .topbar { background-color: #0d6efd; }
    .topbar-wrapper span { color: #fff !important; font-weight: bold; }
    .swagger-ui .info .title { font-size: 2em; color: #0d6efd; }
    .swagger-ui .info .description { margin: 20px 0; }
  `,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    showExtensions: true,
    tryItOutEnabled: true
  }
}));


// WebSocket - Sistema dual: básico + mejorado (v1)
setupSocket(io);  // Sistema básico para compatibilidad
socketManager.initialize(io);  // Sistema mejorado con autenticación y roles

console.log('🚀 Sistemas inicializados:');
console.log('   - WebSockets (v1): Activo');
console.log('   - SSE (v2): Activo');

export default server;
