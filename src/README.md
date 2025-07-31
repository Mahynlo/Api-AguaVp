# 🏗️ Arquitectura de la API Agua-VP

## 📋 Descripción General

Este documento describe la **arquitectura técnica completa** de la API REST para el sistema de gestión de agua potable, incluyendo el sistema de versionado avanzado, estructura modular de directorios, patrones de diseño aplicados, flujo de datos y el nuevo sistema de WebSockets mejorado.

## 🎯 Principios Arquitectónicos

### � **Patrón MVC Mejorado**
- **Model**: Capa de datos con SQLite3 y esquemas bien definidos
- **View**: Respuestas JSON estructuradas y documentación Swagger
- **Controller**: Lógica de negocio separada por entidades y versiones

### 🏢 **Arquitectura por Capas**
```
┌─────────────────────────────────────┐
│         Presentation Layer          │ ← Routes + Middleware
├─────────────────────────────────────┤
│         Business Logic Layer        │ ← Controllers + Services
├─────────────────────────────────────┤
│         Data Access Layer          │ ← Database + Models
├─────────────────────────────────────┤
│         WebSocket Layer            │ ← Socket.IO + Real-time
└─────────────────────────────────────┘
```

### 🔄 **Versionado Semántico**
- **v1.0**: Versión estable actual con todas las funcionalidades básicas
- **v1.x**: Mejoras incrementales y nuevas características
- **v2.x**: Cambios mayores (futuro - PostgreSQL, microservicios)

## �📁 Estructura Técnica del Proyecto

```
src/
├── 📁 v1/                          # 🔖 Versión 1.0 de la API (Actual)
│   ├── 📁 controllers/             # 🎮 Controladores de lógica de negocio
│   │   ├── 📄 appController.js     # Controlador principal de aplicación
│   │   ├── 📄 authController.js    # 🔐 Autenticación y autorización
│   │   ├── 📄 clientesController.js # 👥 Gestión integral de clientes
│   │   ├── 📄 facturasController.js # 🧾 Gestión y generación de facturas
│   │   ├── 📄 healthController.js   # 🏥 Health checks y monitoreo sistema
│   │   ├── 📄 lecturasController.js # 📈 Operaciones de lecturas de medidores
│   │   ├── 📄 medidorController.js  # 📊 Administración de medidores
│   │   ├── 📄 pagosController.js    # 💰 Registro y control de pagos
│   │   ├── 📄 rutasController.js    # 🗺️ Gestión de rutas de lectura
│   │   └── 📄 tarifasController.js  # 💲 Sistema de tarifas por rangos
│   ├── 📁 middlewares/             # 🛡️ Middleware de seguridad v1
│   │   ├── 📄 appKeyMiddleware.js  # 🔑 Validación de clave de aplicación
│   │   └── 📄 authMiddleware.js    # 🔒 Validación de tokens JWT
│   ├── 📁 routes/                  # 🛣️ Definición de rutas RESTful
│   │   ├── 📄 appRoutes.js        # Rutas principales de la aplicación
│   │   ├── 📄 authroutes.js       # 🔐 Rutas de autenticación y registro
│   │   ├── 📄 clientes.js         # 👥 Endpoints de gestión de clientes  
│   │   ├── 📄 facturas.js         # 🧾 Endpoints de facturación
│   │   ├── 📄 health.js           # 🏥 Endpoints de health check
│   │   ├── 📄 index.js            # 📋 Agregador principal de rutas v1
│   │   ├── 📄 lecturas.js         # 📈 Endpoints de lecturas
│   │   ├── 📄 medidores.js        # 📊 Endpoints de medidores
│   │   ├── 📄 pagos.js            # 💰 Endpoints de pagos
│   │   ├── 📄 rutas.js            # 🗺️ Endpoints de gestión de rutas
│   │   └── 📄 tarifas.js          # 💲 Endpoints de tarifas
│   └── 📄 index.js                # 🔗 Router principal de versión 1.0
├── 📁 config/                     # ⚙️ Configuraciones globales del sistema
│   └── 📄 versions.js             # 🔖 Gestión y control de versiones API
├── 📁 controllers/                # 🎮 Controladores globales del sistema
│   └── 📄 healthController.js     # 🏥 Health check global y métricas  
├── 📁 database/                   # 🗄️ Capa de persistencia de datos
│   ├── 📄 app.db                  # 📊 Base de datos SQLite principal
│   └── 📄 db.js                   # 🔌 Configuración y conexión a BD
├── 📁 routes/                     # 🛣️ Sistema de enrutado versionado
│   ├── 📄 api-router.js          # 🔗 Router principal de toda la API
│   ├── 📄 health.js              # 🏥 Rutas globales de health check
│   ├── 📄 index.js               # 📋 Agregador principal de rutas
│   └── 📁 v1/                    # Rutas específicas de versión 1.0
│       └── 📄 index.js           # Router de la v1.0
├── 📁 sockets/                    # 📡 Sistema WebSocket completo  
│   ├── 📄 socket.js              # ⚡ Configuración básica Socket.IO
│   └── 📁 enhanced/              # 🚀 Sistema WebSocket mejorado
│       ├── 📄 socketManager.js          # 🎛️ Gestor principal de conexiones
│       ├── 📄 notificationManager.js   # 🔔 Sistema inteligente de notificaciones
│       └── 📄 controllerIntegration.js # 🔗 Integración con controladores REST
├── 📁 utils/                      # 🛠️ Utilidades compartidas del sistema
│   └── 📄 generateToken.js       # 🎫 Generación y validación de tokens JWT
├── 📄 index.js                    # 🚀 Punto de entrada principal de la aplicación
└── 📄 server.js                   # 🌐 Configuración del servidor Express + Socket.IO
```


## 🔄 Sistema de Versionado

### Filosofía de Versionado

La API utiliza **versionado semántico por URL** para garantizar compatibilidad hacia atrás y facilitar la migración entre versiones.

### Estructura de Versiones

```
/api/
├── /                    # Información general y redirección
├── /versions           # Información de todas las versiones
├── /health/*          # Health checks (sin versión, para herramientas)
├── /v1/*              # Versión 1.0 (actual)
├── /v2/*              # Versión 2.0 (futuro)
└── /v3/*              # Versión 3.0 (futuro)
```

### Configuración de Versiones

```javascript
// src/config/versions.js
const versions = {
  v1: {
    version: '1.0.0',
    status: 'stable',
    releaseDate: '2025-07-01',
    deprecationDate: null,
    endOfLifeDate: null
  },
  v2: {
    version: '2.0.0',
    status: 'planned',
    releaseDate: '2025-12-01',
    deprecationDate: null,
    endOfLifeDate: null
  }
};
```

## ⚡ Sistema de Versionado Avanzado

### � **Filosofía de Versionado**
La API implementa **versionado semántico por URL** con soporte completo para:
- ✅ **Compatibilidad hacia atrás** garantizada
- ✅ **Migración gradual** entre versiones  
- ✅ **Coexistencia** de múltiples versiones
- ✅ **Deprecación controlada** con fechas definidas

### 🗂️ **Estructura de Versiones**

```
/api/
├── 📍 /                      # Información general y redirección a última versión
├── 📊 /versions             # Metadata de todas las versiones disponibles
├── 🏥 /health/*             # Health checks globales (versionless)
├── 🔖 /v1/*                 # ✅ Versión 1.0 (ESTABLE - Actual)
├── 🔖 /v2/*                 # 🔄 Versión 2.0 (PLANIFICADA)
└── 🔖 /v3/*                 # 📅 Versión 3.0 (FUTURA)
```

### ⚙️ **Configuración de Versiones**

```javascript
// src/config/versions.js
const API_VERSIONS = {
  v1: {
    version: '1.0.0',
    status: 'stable',           // stable | beta | deprecated | end-of-life
    releaseDate: '2025-01-15',
    deprecationDate: null,      // Cuando será deprecated
    endOfLifeDate: null,        // Cuando dejará de funcionar
    features: ['full-crud', 'websockets', 'auth-jwt', 'swagger-docs'],
    breaking_changes: [],
    supported: true
  },
  v2: {
    version: '2.0.0',
    status: 'planned',
    releaseDate: '2025-06-01',
    deprecationDate: '2026-12-01',
    endOfLifeDate: '2027-06-01',
    features: ['postgresql', 'microservices', 'graphql', 'advanced-analytics'],
    breaking_changes: ['database-migration', 'auth-changes'],
    supported: false
  }
};
```

## 🌐 Flujo de Enrutado Avanzado

### 📋 **Pipeline Completo de Request Processing**

```
📥 Request: GET /api/v1/clientes/listar
    ↓
📊 [Express Server] - Puerto 3000
    ↓  
🌐 [CORS + Body Parser] - Middleware global
    ↓
🔗 [API Router] - src/routes/index.js
    ↓
🔍 [Version Detection] - Identifica v1
    ↓
📂 [v1 Router] - src/v1/index.js
    ↓
🛣️ [Route Matching] - /clientes/* → src/v1/routes/clientes.js
    ↓
🔑 [App Key Middleware] - Valida x-api-key header
    ↓
🔒 [Auth JWT Middleware] - Valida Authorization Bearer
    ↓
👥 [Controller] - clientesController.listar()
    ↓
🗄️ [Database Query] - SQLite3 query execution
    ↓
📤 [Response Format] - JSON standardizado
    ↓
✅ [Client Response] - 200 OK con datos
```

### 🔄 **Stack de Middlewares Detallado**

```javascript
// Orden cronológico de ejecución
app.use(cors())                    // 1. CORS handling
app.use(express.json())            // 2. JSON body parsing
app.use('/api', mainRouter)        // 3. Main API router

// Por cada ruta específica:
router.use(appKeyMiddleware)       // 4. App Key validation
router.use(authMiddleware)         // 5. JWT authentication  
router.use(roleCheck)              // 6. Role authorization
router.use(inputValidation)        // 7. Input sanitization
// → Controller execution           // 8. Business logic
// → Response formatting            // 9. JSON response
```

## 🏛️ **Patrón de Arquitectura Modular**

### 🏢 **Arquitectura en Capas (Layered Architecture)**

```
┌─────────────────────────────────────────────────────────────┐
│                 🎨 PRESENTATION LAYER                       │
│        (Routes, Middleware, Input Validation)              │
├─────────────────────────────────────────────────────────────┤
│                 🎮 BUSINESS LOGIC LAYER                     │
│         (Controllers, Services, Business Rules)            │
├─────────────────────────────────────────────────────────────┤
│                 🗄️ DATA ACCESS LAYER                        │
│         (Database, Models, Queries, ORM)                   │
├─────────────────────────────────────────────────────────────┤
│                 📡 REAL-TIME LAYER                          │
│        (WebSockets, Notifications, Events)                 │
├─────────────────────────────────────────────────────────────┤
│                 🛠️ INFRASTRUCTURE LAYER                     │
│      (Config, Utils, External APIs, Logging)               │
└─────────────────────────────────────────────────────────────┘
```

### 🎯 **Responsabilidades por Capa**

#### 1️⃣ **Presentation Layer** 🎨
- **Routes** (`/routes/*.js`): Definición de endpoints y parámetros HTTP
- **Middlewares** (`/middlewares/*.js`): Autenticación, autorización, validación
- **Input Validation**: Sanitización y validación de datos de entrada
- **Response Formatting**: Estructuración estándar de respuestas JSON

#### 2️⃣ **Business Logic Layer** 🎮
- **Controllers** (`/controllers/*.js`): Lógica de negocio y coordinación de procesos
- **Services**: Operaciones complejas y reglas específicas del dominio
- **DTOs**: Transformación y mapeo de objetos de datos
- **Business Rules**: Validaciones específicas del negocio de agua potable

#### 3️⃣ **Data Access Layer** 🗄️
- **Database Connection** (`db.js`): Gestión de conexiones SQLite3
- **Queries**: Consultas SQL optimizadas y seguras
- **Models**: Representación de entidades del dominio
- **Transactions**: Manejo de transacciones complejas

#### 4️⃣ **Real-Time Layer** 📡
- **WebSocket Manager** (`/sockets/enhanced/`): Gestión avanzada de conexiones
- **Notification System**: Sistema inteligente de notificaciones
- **Event Broadcasting**: Distribución de eventos en tiempo real
- **Room Management**: Organización por roles y permisos

#### 5️⃣ **Infrastructure Layer** 🛠️
- **Configuration** (`/config/`): Variables y configuraciones del sistema
- **Utilities** (`/utils/`): Funciones auxiliares reutilizables
- **Logging**: Sistema de logs y auditoría
- **Security**: Tokens, encriptación, y validaciones de seguridad
## 🚀 **Sistema WebSocket Avanzado (Enhanced)**

### 📡 **Arquitectura del Sistema en Tiempo Real**

```
┌─────────────────────────────────────────────────────────────┐
│                🎯 CLIENT APPLICATIONS                       │
│            (Electron App, Mobile, Web)                     │
└─────────────────┬───────────────────────────┬───────────────┘
                  │                           │
    ┌─────────────▼──────────────┐ ┌─────────▼──────────────┐
    │   📡 WebSocket Connection   │ │   🌐 REST API Calls    │
    │      (Socket.IO)           │ │      (HTTP/HTTPS)      │
    └─────────────┬──────────────┘ └─────────┬──────────────┘
                  │                           │
    ┌─────────────▼───────────────────────────▼──────────────┐
    │              🎛️ SOCKET MANAGER                         │
    │  (Authentication, Rooms, Events, Notifications)       │
    └─────────────┬───────────────────────────┬──────────────┘
                  │                           │
    ┌─────────────▼──────────────┐ ┌─────────▼──────────────┐
    │  🔔 Notification Manager   │ │  🔗 Controller Integration│
    │  (Smart notifications)     │ │  (REST + WebSocket sync) │
    └────────────────────────────┘ └────────────────────────┘
```

### 🎛️ **Componentes del Sistema WebSocket**

#### **1. SocketManager** (`/sockets/enhanced/socketManager.js`)
```javascript
class SocketManager {
  // 🔐 Autenticación dual (App Key + JWT)
  authenticateSocket(socket, next)
  
  // 👥 Gestión de usuarios conectados
  handleConnection(socket)
  handleDisconnection(socket)
  
  // 🏠 Sistema de rooms por roles
  assignUserToRooms(socket)
  getUserRooms(role)
  
  // 📊 Métricas y estadísticas en tiempo real
  getDashboardMetrics()
  trackEvent(eventType)
  
  // 🔔 Emisión de eventos
  emitToUser(userId, event, data)
  emitToRoom(room, event, data)
  broadcastToAll(event, data)
}
```

#### **2. NotificationManager** (`/sockets/enhanced/notificationManager.js`)
- 🎯 **Notificaciones inteligentes** basadas en contexto
- 📱 **Push notifications** para eventos críticos
- ⏰ **Notificaciones programadas** y recurrentes
- 🔄 **Retry logic** para notificaciones fallidas

#### **3. ControllerIntegration** (`/sockets/enhanced/controllerIntegration.js`)
- 🔗 **Sincronización** entre REST API y WebSockets
- 📡 **Eventos automáticos** en operaciones CRUD
- 🎮 **Bridge pattern** entre controladores y sockets

### 🏠 **Sistema de Salas (Rooms) Inteligente**

```javascript
const ROLE_ROOMS = {
  superadmin: [
    'superadmins',        // Comunicación entre superadmins
    'administradores',    // Acceso a room de administradores
    'operadores',         // Supervisión de operadores
    'global',             // Canal global del sistema
    'system_management',  // Gestión avanzada del sistema
    'user_management',    // Administración de usuarios
    'dashboard',          // Métricas y analytics
    'lecturas', 'facturas', 'pagos', 'clientes', 'medidores'
  ],
  administrador: [
    'administradores',    // Comunicación entre administradores
    'global',             // Canal global
    'dashboard',          // Dashboard administrativo
    'reports',            // Reportes y estadísticas
    'lecturas', 'facturas', 'pagos', 'clientes', 'medidores'
  ],
  operador: [
    'operadores',         // Comunicación entre operadores
    'field_operations',   // Operaciones de campo
    'lecturas',           // Solo operaciones de lectura
    'facturas',           // Consulta de facturación
    'clientes'            // Información de clientes
  ]
};
```

## 🔐 **Sistema de Seguridad Avanzado**

### 🛡️ **Arquitectura de Seguridad Multi-Capa**

```
🌐 Request Incoming
    ↓
🔒 CORS + Rate Limiting
    ↓
🔑 API Key Validation (Application Level)
    ↓  
🎫 JWT Authentication (User Level)
    ↓
👤 Role-Based Authorization
    ↓
✅ Resource-Level Permissions
    ↓
🎮 Controller Logic
```

### 🔐 **Middleware de Seguridad Implementados**

#### **1. App Key Middleware** 🔑
```javascript
// src/v1/middlewares/appKeyMiddleware.js
const appKeyMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'API_KEY_REQUIRED',
        message: 'Header x-api-key es requerido'
      }
    });
  }
  
  try {
    // Validar JWT App Key Token
    const decoded = jwt.verify(apiKey, process.env.SECRET_APP_KEY);
    req.appData = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'API Key inválida: ' + error.message
      }
    });
  }
};
```

#### **2. Auth Middleware** 🎫
```javascript
// src/v1/middlewares/authMiddleware.js
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_REQUIRED', 
        message: 'Token JWT requerido en el header Authorization'
      }
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validar rol autorizado
    const validRoles = ['superadmin', 'administrador', 'operador'];
    if (!validRoles.includes(decoded.role)) {
      throw new Error('Rol no válido');
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_INVALID',
        message: 'Token JWT inválido o expirado: ' + error.message
      }
    });
  }
};
```

### 🔒 **Sistema de Roles y Permisos**

```javascript
const ROLE_PERMISSIONS = {
  superadmin: {
    permissions: ['read', 'write', 'delete', 'broadcast', 'manage_users', 'manage_system', 'full_access'],
    description: 'Acceso completo al sistema',
    canAccess: ['*']  // Acceso a todos los recursos
  },
  administrador: {
    permissions: ['read', 'write', 'delete', 'broadcast', 'manage_users', 'reports'],
    description: 'Gestión completa excepto configuración del sistema',
    canAccess: ['clientes', 'medidores', 'lecturas', 'facturas', 'pagos', 'tarifas', 'rutas', 'reportes']
  },
  operador: {
    permissions: ['read', 'write', 'field_operations'],
    description: 'Operaciones de campo y consultas básicas',
    canAccess: ['lecturas', 'clientes', 'medidores', 'rutas']
  }
};
```

## 🗄️ **Arquitectura de Base de Datos**

### 📊 **Modelo de Datos Relacional**

```sql
-- 🏢 ENTIDADES PRINCIPALES
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  CLIENTES   │◄──►│  MEDIDORES  │◄──►│  LECTURAS   │
│             │ 1:N│             │ 1:N│             │
│ • id        │    │ • id        │    │ • id        │
│ • cedula    │    │ • numero    │    │ • valor     │
│ • nombres   │    │ • cliente_id│    │ • fecha     │
│ • direccion │    │ • activo    │    │ • medidor_id│
│ • telefono  │    │ • ubicacion │    │ • operador  │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │
       │ 1:N               │ N:1  
       ▼                   ▼
┌─────────────┐    ┌─────────────┐
│  FACTURAS   │    │   RUTAS     │
│             │    │             │
│ • id        │    │ • id        │
│ • cliente_id│    │ • nombre    │
│ • periodo   │    │ • descripcion│
│ • monto     │    │ • activa    │
│ • estado    │    │             │
└─────────────┘    └─────────────┘
       │
       │ 1:N
       ▼
┌─────────────┐    ┌─────────────┐
│   PAGOS     │    │  TARIFAS    │
│             │    │             │
│ • id        │    │ • id        │
│ • factura_id│    │ • desde_m3  │
│ • monto     │    │ • hasta_m3  │
│ • fecha     │    │ • precio    │
│ • metodo    │    │ • activa    │
└─────────────┘    └─────────────┘
```


## 📊 **Sistema de Health Checks y Monitoreo**

### 🏥 **Niveles de Health Check**

```javascript
// src/v1/controllers/healthController.js
class HealthController {
  // 🔓 Health check público (sin autenticación)
  static async simple(req, res) {
    return res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'API Agua-VP v1.0',
      uptime: process.uptime()
    });
  }
  
  // 🔒 Health check protegido (requiere auth)
  static async detailed(req, res) {
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'API Agua-VP v1.0',
      version: process.env.npm_package_version,
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: await this.checkDatabase(),
      websockets: await this.checkWebSockets(),
      external_services: await this.checkExternalServices()
    };
    
    return res.json(healthData);
  }
  
  // 🗄️ Verificación específica de base de datos
  static async checkDatabase() {
    try {
      const startTime = Date.now();
      // Ejecutar query de prueba
      await db.get('SELECT 1 as test');
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        connection: 'active'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connection: 'failed'
      };
    }
  }
}
```

### 📈 **Endpoints de Health Check**

| Endpoint | Auth | Descripción | Response |
|----------|------|-------------|----------|
| `GET /api/health` | ❌ | Estado básico del servicio | `{ status: 'OK', timestamp, uptime }` |
| `GET /api/v1/health/detailed` | ✅ | Verificación completa del sistema | Métricas detalladas del sistema |
| `GET /api/v1/health/database` | ✅ | Estado específico de la BD | Conectividad y performance de DB |
| `GET /api/v1/health/websockets` | ✅ | Estado del sistema WebSocket | Conexiones activas y métricas |

## 🔄 **Manejo Centralizado de Errores**

### 🚨 **Arquitectura de Error Handling**

```javascript
// Estructura estándar de respuesta de error
const standardErrorResponse = {
  success: false,
  error: {
    code: 'ERROR_CODE',                    // Código único identificativo
    message: 'Descripción legible',        // Mensaje para el usuario
    details: {},                           // Información técnica adicional
    timestamp: '2025-07-31T10:00:00.000Z', // Timestamp del error
    path: '/api/v1/endpoint',              // Endpoint donde ocurrió
    method: 'POST',                        // Método HTTP usado
    requestId: 'uuid-request-id'           // ID único del request
  }
};
```

### 🛠️ **Error Middleware Global**

```javascript
// src/middlewares/errorHandler.js
const errorHandler = (error, req, res, next) => {
  // Logging del error con contexto completo
  logger.error({
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    user: req.user?.id || 'unauthenticated',
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
  
  // Determinar código de estado HTTP
  const statusCode = error.statusCode || 500;
  
  // Respuesta estructurada
  res.status(statusCode).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: statusCode === 500 ? 'Error interno del servidor' : error.message,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.id
    }
  });
};
```

## 🚀 **Optimización y Performance**

### ⚡ **Estrategias de Optimización**

#### **1. Caching Strategy**
```javascript
const NodeCache = require('node-cache');

// Cache en memoria para configuraciones
const configCache = new NodeCache({ 
  stdTTL: 600,        // 10 minutos de TTL
  checkperiod: 120    // Verificar expiración cada 2 minutos
});

// Cache para consultas frecuentes
const queryCache = new NodeCache({
  stdTTL: 300,        // 5 minutos de TTL
  maxKeys: 1000       // Máximo 1000 entradas
});

// Implementación en controller
static async listarClientes(req, res) {
  const cacheKey = `clientes_lista_${JSON.stringify(req.query)}`;
  
  // Verificar cache primero
  const cachedResult = queryCache.get(cacheKey);
  if (cachedResult) {
    return res.json(cachedResult);
  }
  
  // Si no está en cache, ejecutar consulta
  const clientes = await db.getAllClientes(req.query);
  
  // Guardar en cache
  queryCache.set(cacheKey, clientes);
  
  return res.json(clientes);
}
```

#### **2. Database Query Optimization**
```sql
-- Índices compuestos para consultas frecuentes
CREATE INDEX idx_lecturas_compuesto ON lecturas(medidor_id, fecha_lectura DESC, estado);
CREATE INDEX idx_facturas_compuesto ON facturas(cliente_id, periodo DESC, estado);

-- Análisis de query performance
EXPLAIN QUERY PLAN SELECT * FROM lecturas WHERE medidor_id = ? ORDER BY fecha_lectura DESC;
```

#### **3. Connection Pooling**
```javascript
// Implementación básica de pool de conexiones para SQLite
class DatabasePool {
  constructor(maxConnections = 5) {
    this.maxConnections = maxConnections;
    this.pool = [];
    this.activeConnections = 0;
  }
  
  async getConnection() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    
    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++;
      return new sqlite3.Database(process.env.DB_PATH);
    }
    
    // Esperar por una conexión disponible
    return new Promise((resolve) => {
      const checkPool = () => {
        if (this.pool.length > 0) {
          resolve(this.pool.pop());
        } else {
          setTimeout(checkPool, 100);
        }
      };
      checkPool();
    });
  }
  
  releaseConnection(connection) {
    this.pool.push(connection);
  }
}
```

## 🔮 **Roadmap y Extensibilidad**

### 📅 **Versiones Futuras Planificadas**

#### **🔖 Versión 1.1.0** (Q3 2025)
- 📊 **Sistema de Reportes Avanzados** con gráficos interactivos
- 🔄 **Backup Automático** de base de datos
- 📱 **API Mobile-Optimized** con endpoints específicos
- 🔍 **Búsqueda Full-Text** en todas las entidades
- 📧 **Sistema de Notificaciones Email** integrado

#### **🔖 Versión 1.2.0** (Q4 2025)  
- 💳 **Integración con Pasarelas de Pago** (Stripe, PayPal)
- 📸 **Upload de Imágenes** para medidores y lecturas
- 🗺️ **Geolocalización** de medidores con mapas
- 📊 **Dashboard Analytics** con métricas avanzadas
- 🔐 **OAuth 2.0** integration para autenticación social

#### **🔖 Versión 2.0.0** (Q1 2026) - **BREAKING CHANGES**
- 🐘 **Migración a PostgreSQL** para mejor escalabilidad
- 🕸️ **GraphQL API** junto con REST
- 🏗️ **Arquitectura de Microservicios** modular
- ☁️ **Cloud-Ready** con soporte Docker/Kubernetes
- 🤖 **ML/AI Features** para predicción de consumos

### 🔧 **Preparación para Escalabilidad**

```javascript
// src/v2/ (estructura futura planificada)
v2/
├── 📁 graphql/              # GraphQL implementation
│   ├── schema/              # GraphQL schemas
│   ├── resolvers/          # GraphQL resolvers
│   └── index.js            # GraphQL server setup
├── 📁 microservices/       # Microservices modules
│   ├── auth-service/       # Authentication microservice
│   ├── billing-service/    # Billing microservice
│   └── notification-service/ # Notification microservice
├── 📁 middleware/          # Enhanced middleware
│   ├── oauth2.js          # OAuth 2.0 middleware
│   ├── rateLimit.js       # Advanced rate limiting
│   └── validation.js      # Schema validation
└── 📁 database/           # Multi-database support
    ├── postgresql/        # PostgreSQL adapter
    ├── mongodb/          # NoSQL support (future)
    └── migrations/       # Database migrations
```

---

## 📚 **Referencias y Documentación Adicional**

### 🔗 **Enlaces Importantes**
- **📖 API Documentation**: `/api-docs` (Swagger UI)
- **🔧 Postman Collection**: `./docs/postman/agua-vp-api.json`
- **📊 Database Schema**: `./docs/database/schema.sql`
- **🏗️ Architecture Diagrams**: `./docs/architecture/`

### 🎯 **Buenas Prácticas Implementadas**
- ✅ **RESTful API Design** siguiendo estándares HTTP
- ✅ **Separation of Concerns** con arquitectura en capas
- ✅ **Security Best Practices** con doble autenticación
- ✅ **Error Handling** centralizado y estructurado
- ✅ **Logging Strategy** con diferentes niveles
- ✅ **Performance Optimization** con caching y índices
- ✅ **Code Documentation** con JSDoc completo
- ✅ **Scalable Architecture** preparada para crecimiento

---

*Documentación técnica de la **API Agua-VP v1.0** - Sistema integral de gestión de agua potable con arquitectura moderna, WebSockets en tiempo real y seguridad empresarial.*

### Plugin Architecture

```javascript
// Sistema de plugins para extensiones futuras
const pluginManager = {
  plugins: new Map(),
  
  register(name, plugin) {
    this.plugins.set(name, plugin);
  },
  
  execute(hook, ...args) {
    for (const plugin of this.plugins.values()) {
      if (plugin[hook]) {
        plugin[hook](...args);
      }
    }
  }
};
```

## 📝 Patrones de Diseño Utilizados

### 1. **MVC Pattern**
- **Models**: Representación de datos (implícito en controllers)
- **Views**: Respuestas JSON estructuradas
- **Controllers**: Lógica de negocio y coordinación

### 2. **Middleware Pattern**
- Cadena de responsabilidad para procesamiento de requests
- Separación de concerns (auth, validation, logging)

### 3. **Factory Pattern**
- Creación de conexiones a base de datos
- Instanciación de servicios

### 4. **Repository Pattern**
- Abstracción de acceso a datos
- Facilita testing y cambio de persistencia

### 5. **Strategy Pattern**
- Diferentes estrategias de autenticación
- Versionado de API

## 🔧 Herramientas de Desarrollo

### Logging
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### Monitoring
```javascript
// Métricas básicas
const metrics = {
  requests: 0,
  errors: 0,
  responseTime: [],
  activeConnections: 0
};
```

---

**Esta arquitectura está diseñada para ser:**
- ✅ **Escalable**: Soporta crecimiento horizontal y vertical
- ✅ **Mantenible**: Código organizado y bien documentado
- ✅ **Testeable**: Separación clara de responsabilidades
- ✅ **Segura**: Múltiples capas de seguridad
- ✅ **Performante**: Optimizaciones de base de datos y caché
- ✅ **Extensible**: Preparada para futuras versiones y funcionalidades
