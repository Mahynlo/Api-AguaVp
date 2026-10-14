/**
 * Configuración del servidor Express
 * 
 * File: src/server.js
 * 
 * Descripción:
 * - Este archivo configura el servidor Express y las rutas de la API.
 * - Configura los middlewares, SSE (notificaciones en tiempo real),
 *   los cron jobs y la documentación Swagger.
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
 * - La conexión a la base de datos vive en database/db-sqlite.js (better-sqlite3).
 * 
 */

// Cargar variables de entorno
import 'dotenv/config';

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import SSEManager from './v2/sse/sseManager.js';
import SSENotificationManager from './v2/sse/notificationManager.js';
import routes from './routes/index.js';
//documentación
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';


import { initDeudoresJob, setNotificationManager as setDeudoresNotificationManager } from './jobs/procesarDeudores.js';
import { initConveniosJob, setNotificationManager as setConveniosNotificationManager } from './jobs/verificarConvenios.js';
// Archivos con comentarios @swagger: cada módulo tiene sus rutas en v2/routes/<modulo>.js y,
// si su documentación está separada, en v2/openapi/<modulo>.js. Se ordenan por módulo para que
// Swagger muestre las secciones en el mismo orden de siempre.
// Rutas absolutas (con "/" para que glob funcione en Windows): con rutas relativas al cwd,
// dentro de Electron no se encontraba ningún archivo y la documentación salía vacía.
function archivosSwagger() {
  const v2Dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'v2');
  return ['routes', 'openapi']
    .flatMap((carpeta, prioridad) => {
      const dir = path.join(v2Dir, carpeta);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => ({ f, prioridad, ruta: path.join(dir, f) }));
    })
    .sort((a, b) => a.f.localeCompare(b.f, 'en') || a.prioridad - b.prioridad)
    .map(a => a.ruta.split(path.sep).join('/'));
}

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
        url: 'http://localhost:3000/api/v2',
        description: 'Servidor de desarrollo - API v2 (ACTIVA)'
      },
      {
        url: 'http://localhost:3000/api',
        description: 'Servidor de desarrollo - Rutas base'
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
  apis: archivosSwagger(),
};


const app = express();
const server = http.createServer(app);

// Configurar Express para confiar en proxies (Render, Nginx, etc.)
// Esto permite que Express use correctamente los headers X-Forwarded-*
// Usar número específico de proxies en lugar de 'true' para mayor seguridad
app.set('trust proxy', 1); // Confiar en 1 nivel de proxy (e.g., Nginx, Render)

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Inicializar SSE Manager
const sseManager = new SSEManager();
const sseNotificationManager = new SSENotificationManager(sseManager);

// Hacer disponible los objetos en toda la aplicación
app.set('sseManager', sseManager);
app.set('notificationManager', sseNotificationManager);

// Inicializar Cron Jobs
setDeudoresNotificationManager(sseNotificationManager);
initDeudoresJob();

setConveniosNotificationManager(sseNotificationManager);
initConveniosJob();
console.log('[Cron] Job de Convenios activado — verificación periódica de parcialidades');

// Rutas
app.use('/api', routes);


// La especificación se genera la primera vez que se abre /api-docs (y se guarda en caché),
// no al arrancar: así el inicio del servidor no paga el costo de leer las anotaciones.
let swaggerSpec = null;
const cargarSwaggerSpec = (req, res, next) => {
  swaggerSpec ??= swaggerJsdoc(swaggerOptions);
  req.swaggerDoc = swaggerSpec;
  next();
};

app.use('/api-docs', cargarSwaggerSpec, swaggerUi.serve, swaggerUi.setup(null, {
  customSiteTitle: 'API Agua Potable v2.0',
  customCss: `
    .swagger-ui .topbar { background-color: #198754; }
    .topbar-wrapper span { color: #fff !important; font-weight: bold; }
    .swagger-ui .info .title { font-size: 2em; color: #198754; }
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


console.log('🚀 Sistemas inicializados:');
console.log('   - SSE (v2): ✅ ACTIVO');
console.log('   - API v2: ✅ ACTIVA');
console.log('   - Cron Deudores: ✅ ACTIVO (Diario 3:00 AM)');

export default server;
