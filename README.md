# 🚰 API REST para Agua-VP

API REST completa para la gestión integral de servicios de agua potable, desarrollada para trabajar en conjunto con la aplicación de escritorio Agua-VP (Electron). Sistema moderno con arquitectura escalable y comunicación en tiempo real.

## 📋 Descripción

Esta API proporciona un backend robusto y completo para la gestión de servicios de agua potable, incluyendo:

### 🏢 **Gestión Empresarial**
- Sistema completo de clientes y medidores
- Control avanzado de lecturas y facturación automática
- Sistema dinámico de tarifas por rangos de consumo
- Registro y seguimiento de pagos
- Gestión de rutas de lectura optimizadas

### 🔐 **Seguridad y Autenticación**
- Autenticación JWT con roles diferenciados (superadmin, administrador, operador)
- Middleware de validación de API Key para aplicaciones
- Sistema de permisos basado en roles
- Autenticación dual para WebSockets (App Key + User Token)

### 📡 **Comunicación en Tiempo Real**
- **WebSockets avanzados** con Socket.IO
- Sistema de notificaciones inteligente
- Salas (rooms) organizadas por roles y permisos
- Comunicación bidireccional para operadores de campo
- Dashboard en tiempo real para administradores

### 📊 **Monitoreo y Analytics**
- Métricas automáticas del sistema
- Seguimiento de eventos y estadísticas
- Health checks y monitoreo de conexiones
- Dashboard de control para administradores

## 🚀 Características Principales

- **API RESTful versionada** (v1.0) con endpoints completos
- **Base de datos SQLite** optimizada para rendimiento local
- **Sistema de WebSockets mejorado** con gestión avanzada de conexiones
- **Autenticación JWT multinivel** con roles y permisos
- **Documentación Swagger** automática y completa
- **Sistema de notificaciones** inteligente y contextual
- **Arquitectura modular** preparada para escalabilidad
- **Gestión de sesiones** con desconexión automática por inactividad
- **Sistema de emergencias** con broadcast inmediato

## 🛠️ Tecnologías Utilizadas

### **Backend Core**
- **Node.js** (v18+) - Runtime de JavaScript de alto rendimiento
- **Express.js** (v5.1.0) - Framework web minimalista y flexible
- **SQLite3** (v5.1.7) - Base de datos embebida y optimizada

### **Comunicación en Tiempo Real**
- **Socket.IO** (v4.8.1) - WebSockets con fallbacks automáticos
- **Sistema de Rooms** - Organización por roles y permisos
- **Notificaciones Push** - Sistema de alertas contextual

### **Seguridad y Autenticación**
- **JWT** (v9.0.2) - Tokens seguros con expiración
- **bcrypt** (v6.0.0) - Hashing seguro de contraseñas
- **CORS** (v2.8.5) - Control de acceso cross-origin
- **UUID** (v11.1.0) - Identificadores únicos universales

### **Documentación y Desarrollo**
- **Swagger UI** (v5.0.1) - Interfaz interactiva de documentación
- **Swagger JSDoc** (v6.2.8) - Generación automática de docs
- **Nodemon** (v3.1.10) - Desarrollo con recarga automática
- **dotenv** (v16.5.0) - Gestión de variables de entorno

## 📁 Estructura del Proyecto

```
api-AguaVP/
├── � package.json                # Dependencias y scripts
├── 📄 README.md                   # Este archivo
├── �📁 public/                     # Recursos estáticos
│   └── assets/
│       ├── icons/                 # Iconos de la aplicación
│       │   └── icon.ico
│       └── images/                # Imágenes del sistema
│           └── icon.png
├── 📁 src/                        # Código fuente principal
│   ├── 📄 index.js                # Punto de entrada principal
│   ├── 📄 server.js               # Configuración del servidor Express y tiempo real
│   ├── 📁 config/                 # Configuración global y versionado
│   │   └── versions.js            # Gestión de versiones de API
│   ├── 📁 controllers/            # Controladores globales (ej: health)
│   │   └── healthController.js    # Health checks del sistema
│   ├── 📁 database/               # Persistencia y conexión a BD
│   │   ├── app.db                # Base de datos SQLite principal
│   │   ├── db.js                 # Configuración y conexión DB
│   │   ├── db-local.js           # Conexión local
│   │   └── db-turso.js           # Conexión Turso (v2)
│   ├── 📁 routes/                 # Enrutado principal y health checks
│   │   ├── api-router.js         # Router principal de API
│   │   ├── health.js             # Rutas de salud del sistema
│   │   ├── index.js              # Agregador de rutas
│   │   └── v1/                   # Rutas de la versión 1.0
│   ├── 📁 utils/                  # Utilidades compartidas
│   │   └── generateToken.js      # Generación de tokens JWT
│   ├── 📁 v1/                     # Versión 1.0 de la API (MVC clásico, WebSockets)
│   │   ├── 📁 controllers/        # Lógica de negocio v1
│   │   ├── 📁 middlewares/        # Middlewares v1
│   │   ├── 📁 routes/             # Endpoints RESTful v1
│   │   ├── 📁 sockets/            # WebSocket y notificaciones
│   │   │   ├── socket.js
│   │   │   └── enhanced/
│   │   │       ├── socketManager.js
│   │   │       ├── notificationManager.js
│   │   │       └── controllerIntegration.js
│   │   └── index.js              # Router principal v1
│   └── 📁 v2/                     # Versión 2.0 de la API (arquitectura moderna, SSE, Turso)
│       ├── 📁 controllers/        # Lógica de negocio v2 (Turso, SSE)
│       ├── 📁 middlewares/        # Seguridad y validaciones v2
│       ├── 📁 routes/             # Endpoints RESTful v2
│       ├── 📁 sse/                # Server-Sent Events y notificaciones
│       │   ├── notificationManager.js
│       │   ├── sseManager.js
│       │   └── ...
│       └── index.js              # Router principal v2
```
## 🏃‍♂️ Instalación y Configuración

### ✅ Prerrequisitos
- **Node.js** (versión 18.0 o superior) - [Descargar](https://nodejs.org/)
- **npm** (incluido con Node.js) o **yarn**
- **Git** (para clonar el repositorio)

### 1️⃣ Clonar el repositorio
```powershell
git clone [URL_DEL_REPOSITORIO]
cd api-AguaVP
```

### 2️⃣ Instalar dependencias
```powershell
npm install
```

### 3️⃣ Configurar variables de entorno
Crear un archivo `.env` en la raíz del proyecto:
```env
# Configuración del servidor
PORT=3000
NODE_ENV=development

# Seguridad JWT
JWT_SECRET=tu_jwt_secret_super_seguro_aqui_2024
SECRET_APP_KEY=tu_app_key_super_segura_aqui_2024

# Base de datos
DB_PATH=./src/database/app.db

# WebSocket Configuration
SOCKET_CORS_ORIGIN=http://localhost:*
SOCKET_PING_TIMEOUT=60000
SOCKET_PING_INTERVAL=25000

# Configuración de sesiones
SESSION_TIMEOUT=1800000
INACTIVE_TIMEOUT=1800000

# Logs y Debug
DEBUG_MODE=true
LOG_LEVEL=info
```

### 4️⃣ Ejecutar la aplicación

#### 🔧 Modo desarrollo (con nodemon y recarga automática)
```powershell
npm run dev
```

#### 🚀 Modo producción
```powershell
npm start
```

#### 🧪 Ejecutar pruebas
```powershell
npm test
```

### 🌐 URLs de Acceso
- **API REST**: `http://localhost:3000/api/v1`
- **Documentación Swagger**: `http://localhost:3000/api-docs`
- **Health Check**: `http://localhost:3000/api/health`
- **WebSocket**: `ws://localhost:3000` (Socket.IO)

## 📚 Documentación de la API

### 🔗 Acceso a la Documentación
La documentación interactiva completa está disponible mediante **Swagger UI**:
- **URL**: `http://localhost:3000/api-docs`
- **Formato**: OpenAPI 3.0 / Swagger 2.0
- **Características**: Pruebas en vivo, ejemplos, esquemas de datos

### 📖 Documentación Adicional
- **Arquitectura**: `/src/README.md` - Descripción técnica completa
- **API v1.0**: `/src/v1/README.md` - Documentación específica de la versión
- **WebSockets**: `/examples/websocket-usage-example.js` - Ejemplos de uso

## 🔗 Endpoints Principales de la API v1.0

### 🌐 Base URL: `/api/v1`

#### 🔐 **Autenticación y Seguridad**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `POST` | `/auth/login` | Iniciar sesión de usuario | ❌ | - |
| `POST` | `/auth/register` | Registrar nuevo usuario | ❌ | - |
| `POST` | `/auth/refresh` | Renovar token JWT | ✅ | Cualquiera |
| `POST` | `/auth/logout` | Cerrar sesión | ✅ | Cualquiera |

#### 👥 **Gestión de Clientes**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `GET` | `/clientes/listar` | Obtener todos los clientes | ✅ | Operador+ |
| `GET` | `/clientes/buscar/:id` | Buscar cliente específico | ✅ | Operador+ |
| `POST` | `/clientes/registrar` | Registrar nuevo cliente | ✅ | Administrador+ |
| `PUT` | `/clientes/actualizar/:id` | Actualizar datos del cliente | ✅ | Administrador+ |
| `DELETE` | `/clientes/eliminar/:id` | Eliminar cliente | ✅ | Superadmin |

#### 📊 **Gestión de Medidores**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `GET` | `/medidores/listar` | Obtener todos los medidores | ✅ | Operador+ |
| `GET` | `/medidores/cliente/:clienteId` | Medidores por cliente | ✅ | Operador+ |
| `POST` | `/medidores/registrar` | Registrar nuevo medidor | ✅ | Administrador+ |
| `PUT` | `/medidores/actualizar/:id` | Actualizar medidor | ✅ | Administrador+ |
| `DELETE` | `/medidores/eliminar/:id` | Eliminar medidor | ✅ | Superadmin |

#### � **Gestión de Lecturas**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `GET` | `/lecturas/listar` | Obtener todas las lecturas | ✅ | Operador+ |
| `GET` | `/lecturas/cliente/:clienteId` | Lecturas por cliente | ✅ | Operador+ |
| `GET` | `/lecturas/pendientes/:rutaId` | Lecturas pendientes por ruta | ✅ | Operador+ |
| `POST` | `/lecturas/registrar` | Registrar nueva lectura | ✅ | Operador+ |
| `PUT` | `/lecturas/actualizar/:id` | Actualizar lectura | ✅ | Operador+ |
| `DELETE` | `/lecturas/eliminar/:id` | Eliminar lectura | ✅ | Administrador+ |

#### 🧾 **Gestión de Facturas**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `GET` | `/facturas/listar` | Obtener todas las facturas | ✅ | Operador+ |
| `GET` | `/facturas/cliente/:clienteId` | Facturas por cliente | ✅ | Operador+ |
| `GET` | `/facturas/pendientes` | Facturas pendientes de pago | ✅ | Operador+ |
| `POST` | `/facturas/generar` | Generar nueva factura | ✅ | Administrador+ |
| `PUT` | `/facturas/actualizar/:id` | Actualizar factura | ✅ | Administrador+ |
| `DELETE` | `/facturas/eliminar/:id` | Eliminar factura | ✅ | Superadmin |

#### 💰 **Gestión de Pagos**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `GET` | `/pagos/listar` | Obtener todos los pagos | ✅ | Operador+ |
| `GET` | `/pagos/cliente/:clienteId` | Pagos por cliente | ✅ | Operador+ |
| `GET` | `/pagos/factura/:facturaId` | Pagos de una factura | ✅ | Operador+ |
| `POST` | `/pagos/registrar` | Registrar nuevo pago | ✅ | Operador+ |
| `PUT` | `/pagos/actualizar/:id` | Actualizar pago | ✅ | Administrador+ |
| `DELETE` | `/pagos/eliminar/:id` | Eliminar pago | ✅ | Superadmin |

#### 💲 **Gestión de Tarifas**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `GET` | `/tarifas/listar` | Obtener todas las tarifas | ✅ | Operador+ |
| `GET` | `/tarifas/activas` | Obtener tarifas activas | ✅ | Operador+ |
| `POST` | `/tarifas/registrar` | Registrar nueva tarifa | ✅ | Administrador+ |
| `PUT` | `/tarifas/actualizar/:id` | Actualizar tarifa | ✅ | Administrador+ |
| `DELETE` | `/tarifas/eliminar/:id` | Eliminar tarifa | ✅ | Superadmin |

#### 🗺️ **Gestión de Rutas**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `GET` | `/rutas/listar` | Obtener todas las rutas | ✅ | Operador+ |
| `GET` | `/rutas/detalle/:id` | Detalle de ruta específica | ✅ | Operador+ |
| `POST` | `/rutas/crear` | Crear nueva ruta | ✅ | Administrador+ |
| `POST` | `/rutas/agregar-medidor` | Agregar medidor a ruta | ✅ | Administrador+ |
| `PUT` | `/rutas/actualizar/:id` | Actualizar ruta | ✅ | Administrador+ |
| `DELETE` | `/rutas/eliminar/:id` | Eliminar ruta | ✅ | Superadmin |

#### 🏥 **Health Check y Monitoreo**
| Método | Endpoint | Descripción | Auth | Rol Requerido |
|--------|----------|-------------|------|---------------|
| `GET` | `/health` | Estado de la API | ❌ | - |
| `GET` | `/health/detailed` | Estado detallado del sistema | ✅ | Administrador+ |

## 🔒 Autenticación y Seguridad

La API implementa un **sistema de seguridad de doble capa** robusto y escalable:

### 🛡️ **Sistema de Autenticación Dual**

#### 1️⃣ **API Key Middleware (Capa de Aplicación)**
```http
x-api-key: your-application-api-key-here
```
- **Propósito**: Validar que la aplicación cliente está autorizada
- **Formato**: JWT Token con información de la aplicación
- **Validación**: `SECRET_APP_KEY` del archivo `.env`

#### 2️⃣ **JWT Authentication (Capa de Usuario)**
```http
Authorization: Bearer your-jwt-user-token-here
```
- **Propósito**: Autenticación y autorización de usuarios
- **Formato**: JWT Token con información del usuario y roles
- **Validación**: `JWT_SECRET` del archivo `.env`

### 👤 **Sistema de Roles y Permisos**

| Rol | Código | Permisos | Descripción |
|-----|--------|----------|-------------|
| **Superadmin** | `superadmin` | `full_access` | Control total del sistema |
| **Administrador** | `administrador` | `read, write, delete, broadcast, reports` | Gestión completa excepto sistema |
| **Operador** | `operador` | `read, write, field_operations` | Operaciones de campo y básicas |

### 📡 **Autenticación WebSocket**

Para conectarse a los WebSockets, se requieren **ambos tokens**:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'usuario-jwt-token',      // Token de sesión de usuario
    appKey: 'aplicacion-api-key'     // Token de aplicación
  }
});
```

### 🔐 **Headers Requeridos para API REST**

```http
Content-Type: application/json
x-api-key: [TU_APPLICATION_API_KEY]
Authorization: Bearer [TU_USER_JWT_TOKEN]
```

### ⚡ **Ejemplo de Uso Completo**

```javascript
// Configuración de headers para requests
const headers = {
  'Content-Type': 'application/json',
  'x-api-key': process.env.APP_API_KEY,
  'Authorization': `Bearer ${userToken}`
};

// Realizar request autenticado
const response = await fetch('http://localhost:3000/api/v1/clientes/listar', {
  method: 'GET',
  headers: headers
});
```

## 📡 **Sistema WebSocket Avanzado**

### 🏠 **Salas (Rooms) por Rol**

| Rol | Salas Asignadas |
|-----|-----------------|
| **superadmin** | `superadmins, administradores, operadores, global, lecturas, facturas, pagos, clientes, medidores, dashboard, system_management, user_management` |
| **administrador** | `administradores, global, lecturas, facturas, pagos, clientes, medidores, dashboard, reports` |
| **operador** | `operadores, lecturas, facturas, rutas, field_operations, clientes` |

### 📤 **Eventos Disponibles**

#### **Eventos Básicos**
- `health_check` - Verificar estado de conexión
- `ping/pong` - Latencia y conectividad
- `get_room_stats` - Estadísticas de salas

#### **Eventos de Negocio**
- `solicitar_lecturas_pendientes` - Obtener lecturas pendientes
- `confirmar_lectura` - Confirmar lectura completada
- `send_operator_message` - Enviar mensaje a operadores
- `emergency_broadcast` - Broadcast de emergencia

#### **Eventos de Monitoreo** (Solo Admins)
- `request_dashboard_metrics` - Solicitar métricas del dashboard
- `manage_user_connection` - Gestionar conexiones de usuarios

### 🔔 **Sistema de Notificaciones**

```javascript
// Ejemplo de notificación automática
socket.on('lectura_completada', (data) => {
  console.log(`Lectura ${data.lectura_id} completada por ${data.operador}`);
});

// Notificación de emergencia
socket.on('emergency_notification', (emergency) => {
  alert(`EMERGENCIA: ${emergency.message}`);
});
```

## 🔧 **Configuración Avanzada**

### 📊 **Variables de Entorno Completas**

```env
# === CONFIGURACIÓN DEL SERVIDOR ===
PORT=3000
NODE_ENV=development
DEBUG_MODE=true

# === SEGURIDAD Y AUTENTICACIÓN ===
JWT_SECRET=super_secret_jwt_key_2024_agua_vp
SECRET_APP_KEY=super_secret_app_key_2024_agua_vp
SESSION_TIMEOUT=1800000
INACTIVE_TIMEOUT=1800000

# === BASE DE DATOS ===
DB_PATH=./src/database/app.db
DB_BACKUP_ENABLED=true
DB_BACKUP_INTERVAL=86400000

# === WEBSOCKET CONFIGURACIÓN ===
SOCKET_CORS_ORIGIN=http://localhost:*
SOCKET_PING_TIMEOUT=60000
SOCKET_PING_INTERVAL=25000
SOCKET_MAX_CONNECTIONS=1000

# === LOGS Y MONITOREO ===
LOG_LEVEL=info
LOG_FILE=./logs/agua-vp-api.log
METRICS_ENABLED=true
METRICS_INTERVAL=30000

# === NOTIFICACIONES ===
NOTIFICATIONS_ENABLED=true
NOTIFICATION_RETRY_ATTEMPTS=3
NOTIFICATION_TIMEOUT=5000
```

## 🚨 **Códigos de Error Comunes**

| Código | Descripción | Solución |
|--------|-------------|----------|
| `401` | Token inválido o expirado | Renovar token de autenticación |
| `403` | Permisos insuficientes | Verificar rol de usuario |
| `429` | Demasiadas peticiones | Implementar rate limiting |
| `500` | Error interno del servidor | Verificar logs del servidor |

## 📊 **Monitoreo y Métricas**

### 🔍 **Health Checks**
- **Básico**: `GET /api/health` - Estado general
- **Detallado**: `GET /api/v1/health/detailed` - Métricas completas
- **WebSocket**: Evento `health_check` - Estado de conexión

### 📈 **Métricas Disponibles**
- Usuarios conectados por rol
- Eventos por tipo y frecuencia
- Estadísticas de salas WebSocket
- Tiempo de actividad del servidor
- Rendimiento de base de datos

## 🛠️ **Desarrollo y Contribución**

### 🔄 **Scripts Disponibles**

```powershell
# Desarrollo con recarga automática
npm run dev

# Producción
npm start

# Ejecutar pruebas (cuando estén implementadas)
npm test

# Linting y formato de código
npm run lint
npm run format
```

### 📂 **Flujo de Desarrollo**

1. **Fork** del repositorio
2. **Crear** rama para nueva característica: `git checkout -b feature/nueva-caracteristica`
3. **Desarrollar** siguiendo los patrones existentes
4. **Probar** exhaustivamente los cambios
5. **Commit** con mensajes descriptivos: `git commit -m "feat: añadir nueva funcionalidad"`
6. **Push** a tu fork: `git push origin feature/nueva-caracteristica`
7. **Pull Request** con descripción detallada

### 🏗️ **Arquitectura del Código**

- **Controladores**: Lógica de negocio pura
- **Middlewares**: Validaciones y transformaciones
- **Rutas**: Definición de endpoints y validaciones
- **Servicios**: Comunicación con base de datos
- **Utils**: Funciones auxiliares reutilizables

## 🐛 **Resolución de Problemas**

### ❓ **Problemas Comunes**

#### **Error de Conexión a Base de Datos**
```powershell
# Verificar permisos del archivo
ls -la src/database/app.db

# Recrear base de datos si es necesario
rm src/database/app.db
npm run dev  # Se recreará automáticamente
```

#### **Error de Puertos en Uso**
```powershell
# Verificar qué proceso usa el puerto 3000
netstat -ano | findstr :3000

# Terminar proceso si es necesario
taskkill /PID <PID> /F

# O cambiar puerto en .env
PORT=3001
```

#### **Problemas con WebSockets**
```javascript
// Verificar configuración de CORS
SOCKET_CORS_ORIGIN=http://localhost:*

// Verificar tokens de autenticación
const socket = io('http://localhost:3000', {
  auth: {
    token: 'valid-jwt-token',
    appKey: 'valid-app-key'
  }
});
```

### 📋 **Logs y Debug**

```powershell
# Habilitar modo debug
DEBUG_MODE=true npm run dev

# Ver logs específicos
tail -f logs/agua-vp-api.log

# Logs de WebSocket
DEBUG=socket.io* npm run dev
```

## 📜 **Changelog y Versiones**

### 🔖 **Versión 1.0.0** (Actual)
- ✅ Sistema completo de autenticación JWT
- ✅ API REST completa con todas las entidades
- ✅ WebSockets avanzados con roles y permisos
- ✅ Sistema de notificaciones en tiempo real
- ✅ Base de datos SQLite optimizada
- ✅ Documentación Swagger completa
- ✅ Middleware de seguridad robusto
- ✅ Sistema de roles (superadmin, administrador, operador)

### 🚀 **Próximas Versiones (Roadmap)**
- **v1.1.0**: Sistema de backup automático de BD
- **v1.2.0**: API de reportes avanzados
- **v1.3.0**: Integración con servicios de pago
- **v2.0.0**: Migración a PostgreSQL (opcional)

## 📞 **Soporte y Contacto**

### 🆘 **Obtener Ayuda**
- **Documentación**: Revisar este README y los docs en `/src/`
- **Ejemplos**: Revisar `/examples/websocket-usage-example.js`
- **Issues**: Crear issue en el repositorio para bugs o mejoras
- **Swagger**: Usar `http://localhost:3000/api-docs` para probar endpoints

### 🤝 **Contribuir**
Las contribuciones son bienvenidas. Por favor:
1. Revisar issues existentes
2. Seguir las convenciones de código
3. Añadir pruebas para nuevas funcionalidades
4. Actualizar documentación según sea necesario

## 📄 **Licencia**

Este proyecto está bajo la Licencia ISC. Ver el archivo `LICENSE` para más detalles.

---

## 🎯 **Resumen Rápido**

```powershell
# Instalación rápida
git clone [REPO_URL]
cd api-AguaVP
npm install
cp .env.example .env  # Configurar variables
npm run dev

# URLs importantes
# API: http://localhost:3000/api/v1
# Docs: http://localhost:3000/api-docs
# Health: http://localhost:3000/api/health
```

**🚰 API Agua-VP** - Sistema completo de gestión de agua potable con WebSockets en tiempo real, autenticación JWT, roles y permisos, y documentación interactiva completa.

---

*Desarrollado con ❤️ para la gestión eficiente de servicios de agua potable*

## 🌐 WebSockets

La API incluye soporte para WebSockets que permite:
- Comunicación en tiempo real
- Actualizaciones automáticas de datos
- Notificaciones instantáneas

Conexión: `ws://localhost:3000`

## 🗄️ Base de Datos

La aplicación utiliza SQLite como base de datos local con las siguientes tablas principales:

- **clientes** - Información de clientes
- **medidores** - Datos de medidores
- **lecturas** - Registros de lecturas
- **facturas** - Facturas generadas
- **pagos** - Registros de pagos
- **tarifas** - Estructura de tarifas
- **rutas** - Rutas de lectura
- **usuarios** - Usuarios del sistema

## 📝 Scripts Disponibles

- `npm start` - Ejecutar en modo producción
- `npm run dev` - Ejecutar en modo desarrollo con nodemon
- `npm test` - Ejecutar tests (pendiente implementación)

## 🤝 Integración con Aplicación Electron

Esta API está diseñada específicamente para trabajar con la aplicación de escritorio Agua-VP desarrollada en Electron, proporcionando:

- Sincronización de datos en tiempo real
- Operaciones offline/online
- Backup automático de datos
- Interface consistente entre plataformas

## 🔧 Configuración Adicional

### CORS
La API está configurada para aceptar peticiones desde cualquier origen. Para producción, modificar la configuración en `src/server.js`:

```javascript
app.use(cors({
  origin: 'http://tu-dominio.com'
}));
```

### Puerto
El puerto por defecto es 3000, pero puede modificarse mediante la variable de entorno `PORT`.


**Desarrollado para la gestión eficiente de servicios de agua potable** 🚰


