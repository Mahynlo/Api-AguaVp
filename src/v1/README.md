# 🔖 API Agua-VP - Versión 1.0

## 📋 Descripción General

La **Versión 1.0** es la primera versión estable y de producción de la API REST para el sistema de gestión integral de agua potable. Esta versión proporciona todas las funcionalidades esenciales para la administración completa de clientes, medidores, lecturas, facturación automática, pagos y un robusto sistema de WebSockets en tiempo real.

## 🎯 Características Principales de la v1.0

### ✅ **Funcionalidades Core Implementadas**
- 👥 **CRUD Completo de Clientes** con validaciones robustas
- 📊 **Gestión Avanzada de Medidores** con estados y ubicaciones
- 📈 **Sistema de Lecturas** con validación automática y seguimiento de operadores
- 🧾 **Facturación Automática** basada en rangos de consumo y tarifas
- 💰 **Control de Pagos** con múltiples métodos y estados
- 💲 **Sistema de Tarifas Escalonadas** con rangos configurables
- 🗺️ **Gestión de Rutas de Lectura** optimizadas

### 🔐 **Seguridad Empresarial**
- 🔑 **Doble Autenticación**: API Key (aplicación) + JWT (usuario)
- 👤 **Sistema de Roles**: superadmin, administrador, operador
- 🛡️ **Middleware de Seguridad** en cada endpoint
- 🔒 **Permisos Granulares** por recurso y operación

### 📡 **Comunicación en Tiempo Real**
- ⚡ **WebSockets Avanzados** con Socket.IO
- 🏠 **Salas por Roles** para comunicación segmentada
- 🔔 **Sistema de Notificaciones** inteligente y contextual
- 📊 **Dashboard en Tiempo Real** para administradores

## 🏗️ Arquitectura de la Versión 1.0

```
src/v1/
├── 📁 controllers/        # 🎮 Lógica de negocio por entidad
│   ├── appController.js     # Controlador principal de aplicación
│   ├── authController.js    # 🔐 Autenticación y gestión de sesiones
│   ├── clientesController.js # 👥 Operaciones CRUD de clientes
│   ├── facturasController.js # 🧾 Generación y gestión de facturas
│   ├── healthController.js  # 🏥 Health checks y monitoreo específico
│   ├── lecturasController.js # 📈 Registro y validación de lecturas
│   ├── medidorController.js # 📊 Administración de medidores
│   ├── pagosController.js   # 💰 Registro y seguimiento de pagos
│   ├── rutasController.js   # 🗺️ Gestión de rutas de lectura
│   └── tarifasController.js # 💲 Configuración de tarifas escalonadas
├── 📁 middlewares/        # 🛡️ Middleware de seguridad específicos v1
│   ├── appKeyMiddleware.js  # 🔑 Validación de clave de aplicación
│   └── authMiddleware.js    # 🔒 Validación y decodificación JWT
├── 📁 routes/             # 🛣️ Definición de endpoints RESTful
│   ├── appRoutes.js        # Rutas principales de la aplicación
│   ├── authroutes.js       # 🔐 Endpoints de autenticación
│   ├── clientes.js         # 👥 Endpoints CRUD de clientes
│   ├── facturas.js         # 🧾 Endpoints de facturación
│   ├── health.js           # 🏥 Endpoints de health check v1
│   ├── index.js            # 📋 Agregador de todas las rutas v1
│   ├── lecturas.js         # 📈 Endpoints de lecturas
│   ├── medidores.js        # 📊 Endpoints de medidores
│   ├── pagos.js            # 💰 Endpoints de pagos
│   ├── rutas.js            # 🗺️ Endpoints de rutas
│   └── tarifas.js          # 💲 Endpoints de tarifas
└── 📄 index.js            # 🔗 Router principal de la versión 1.0
```

## 🎯 **Endpoints Disponibles - Documentación Completa**

### 🌐 **Base URL**: `/api/v1`

---

### 🔐 **Autenticación y Seguridad**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Validaciones |
|--------|----------|-------------|------|---------------|--------------|
| `POST` | `/auth/login` | Iniciar sesión de usuario | ❌ | - | Email válido, contraseña |
| `POST` | `/auth/register` | Registrar nuevo usuario (admin only) | ✅ | Superadmin | Datos completos, email único |
| `POST` | `/auth/refresh` | Renovar token JWT expirado | ✅ | Cualquiera | Token válido previo |
| `POST` | `/auth/logout` | Cerrar sesión activa | ✅ | Cualquiera | Token activo |
| `GET` | `/auth/profile` | Obtener perfil del usuario actual | ✅ | Cualquiera | - |

**Ejemplo de Login:**
```javascript
// Request
POST /api/v1/auth/login
{
  "email": "admin@aguavp.com",
  "password": "securePassword123"
}

// Response
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "admin@aguavp.com",
      "role": "administrador",
      "name": "Administrator"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "24h"
  }
}
```

---

### 👥 **Gestión de Clientes**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Params/Body |
|--------|----------|-------------|------|---------------|-------------|
| `GET` | `/clientes/listar` | Obtener todos los clientes | ✅ | Operador+ | Query: page, limit, search |
| `GET` | `/clientes/buscar/:id` | Buscar cliente específico por ID | ✅ | Operador+ | Param: id (integer) |
| `GET` | `/clientes/cedula/:cedula` | Buscar cliente por cédula | ✅ | Operador+ | Param: cedula (string) |
| `POST` | `/clientes/registrar` | Registrar nuevo cliente | ✅ | Administrador+ | Body: cliente completo |
| `PUT` | `/clientes/actualizar/:id` | Actualizar datos del cliente | ✅ | Administrador+ | Param: id + Body: datos |
| `DELETE` | `/clientes/eliminar/:id` | Eliminar cliente (soft delete) | ✅ | Superadmin | Param: id (integer) |
| `GET` | `/clientes/:id/historial` | Historial completo del cliente | ✅ | Operador+ | Param: id (integer) |

**Ejemplo de Registro de Cliente:**
```javascript
// Request
POST /api/v1/clientes/registrar
{
  "cedula": "1234567890",
  "nombres": "Juan Carlos",
  "apellidos": "Pérez González",
  "telefono": "0991234567",
  "direccion": "Av. Principal 123, Sector Norte",
  "email": "juan.perez@email.com",
  "observaciones": "Cliente preferencial"
}

// Response
{
  "success": true,
  "data": {
    "id": 15,
    "cedula": "1234567890",
    "nombres": "Juan Carlos",
    "apellidos": "Pérez González",
    "nombre_completo": "Juan Carlos Pérez González",
    "telefono": "0991234567",
    "direccion": "Av. Principal 123, Sector Norte",
    "email": "juan.perez@email.com",
    "estado": "activo",
    "fecha_registro": "2025-07-31T10:30:00.000Z"
  },
  "message": "Cliente registrado exitosamente"
}
```

---

### 📊 **Gestión de Medidores**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Params/Body |
|--------|----------|-------------|------|---------------|-------------|
| `GET` | `/medidores/listar` | Obtener todos los medidores | ✅ | Operador+ | Query: estado, cliente_id |
| `GET` | `/medidores/cliente/:clienteId` | Medidores de un cliente específico | ✅ | Operador+ | Param: clienteId |
| `GET` | `/medidores/numero/:numero` | Buscar medidor por número | ✅ | Operador+ | Param: numero |
| `POST` | `/medidores/registrar` | Registrar nuevo medidor | ✅ | Administrador+ | Body: datos del medidor |
| `PUT` | `/medidores/actualizar/:id` | Actualizar medidor existente | ✅ | Administrador+ | Param: id + Body |
| `DELETE` | `/medidores/eliminar/:id` | Eliminar medidor | ✅ | Superadmin | Param: id (integer) |
| `PUT` | `/medidores/:id/estado` | Cambiar estado del medidor | ✅ | Administrador+ | Body: {estado: "activo/inactivo"} |

---

### 📈 **Gestión de Lecturas**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Params/Body |
|--------|----------|-------------|------|---------------|-------------|
| `GET` | `/lecturas/listar` | Obtener todas las lecturas | ✅ | Operador+ | Query: fecha, medidor_id |
| `GET` | `/lecturas/cliente/:clienteId` | Lecturas por cliente | ✅ | Operador+ | Param: clienteId |
| `GET` | `/lecturas/medidor/:medidorId` | Lecturas por medidor | ✅ | Operador+ | Param: medidorId |
| `GET` | `/lecturas/pendientes/:rutaId` | Lecturas pendientes por ruta | ✅ | Operador+ | Param: rutaId |
| `POST` | `/lecturas/registrar` | Registrar nueva lectura | ✅ | Operador+ | Body: datos de lectura |
| `PUT` | `/lecturas/actualizar/:id` | Actualizar lectura existente | ✅ | Operador+ | Param: id + Body |
| `DELETE` | `/lecturas/eliminar/:id` | Eliminar lectura | ✅ | Administrador+ | Param: id (integer) |
| `GET` | `/lecturas/estadisticas/:medidorId` | Estadísticas de consumo | ✅ | Operador+ | Param: medidorId |

**Ejemplo de Registro de Lectura:**
```javascript
// Request
POST /api/v1/lecturas/registrar
{
  "medidor_id": 5,
  "lectura_actual": 1245.75,
  "fecha_lectura": "2025-07-31",
  "operador_id": 3,
  "observaciones": "Lectura normal, medidor en buen estado",
  "foto_medidor": "base64_encoded_image_optional"
}

// Response
{
  "success": true,
  "data": {
    "id": 127,
    "medidor_id": 5,
    "lectura_anterior": 1198.50,
    "lectura_actual": 1245.75,
    "consumo_m3": 47.25,
    "fecha_lectura": "2025-07-31",
    "operador": "Juan Operador",
    "observaciones": "Lectura normal, medidor en buen estado",
    "estado": "registrada"
  },
  "message": "Lectura registrada exitosamente"
}
```

---

### 🧾 **Gestión de Facturas**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Params/Body |
|--------|----------|-------------|------|---------------|-------------|
| `GET` | `/facturas/listar` | Obtener todas las facturas | ✅ | Operador+ | Query: estado, cliente_id |
| `GET` | `/facturas/cliente/:clienteId` | Facturas por cliente | ✅ | Operador+ | Param: clienteId |
| `GET` | `/facturas/periodo/:periodo` | Facturas por período | ✅ | Operador+ | Param: periodo (YYYY-MM) |
| `GET` | `/facturas/pendientes` | Facturas pendientes de pago | ✅ | Operador+ | Query: dias_vencimiento |
| `POST` | `/facturas/generar` | Generar nueva factura | ✅ | Administrador+ | Body: datos de facturación |
| `POST` | `/facturas/generar-masivo` | Generar facturas masivas | ✅ | Administrador+ | Body: criterios de generación |
| `PUT` | `/facturas/actualizar/:id` | Actualizar factura existente | ✅ | Administrador+ | Param: id + Body |
| `DELETE` | `/facturas/eliminar/:id` | Eliminar factura | ✅ | Superadmin | Param: id (integer) |
| `GET` | `/facturas/:id/pdf` | Descargar factura en PDF | ✅ | Operador+ | Param: id (integer) |

---

### 💰 **Gestión de Pagos**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Params/Body |
|--------|----------|-------------|------|---------------|-------------|
| `GET` | `/pagos/listar` | Obtener todos los pagos | ✅ | Operador+ | Query: fecha, cliente_id |
| `GET` | `/pagos/cliente/:clienteId` | Pagos por cliente | ✅ | Operador+ | Param: clienteId |
| `GET` | `/pagos/factura/:facturaId` | Pagos de una factura específica | ✅ | Operador+ | Param: facturaId |
| `GET` | `/pagos/metodo/:metodo` | Pagos por método de pago | ✅ | Operador+ | Param: metodo |
| `POST` | `/pagos/registrar` | Registrar nuevo pago | ✅ | Operador+ | Body: datos del pago |
| `PUT` | `/pagos/actualizar/:id` | Actualizar pago existente | ✅ | Administrador+ | Param: id + Body |
| `DELETE` | `/pagos/eliminar/:id` | Eliminar pago | ✅ | Superadmin | Param: id (integer) |
| `GET` | `/pagos/reporte-diario/:fecha` | Reporte de pagos del día | ✅ | Administrador+ | Param: fecha (YYYY-MM-DD) |

---

### � **Gestión de Tarifas**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Params/Body |
|--------|----------|-------------|------|---------------|-------------|
| `GET` | `/tarifas/listar` | Obtener todas las tarifas | ✅ | Operador+ | Query: activas |
| `GET` | `/tarifas/activas` | Obtener solo tarifas activas | ✅ | Operador+ | - |
| `GET` | `/tarifas/calcular` | Calcular costo por consumo | ✅ | Operador+ | Query: consumo_m3 |
| `POST` | `/tarifas/registrar` | Registrar nueva tarifa | ✅ | Administrador+ | Body: datos de tarifa |
| `PUT` | `/tarifas/actualizar/:id` | Actualizar tarifa existente | ✅ | Administrador+ | Param: id + Body |
| `DELETE` | `/tarifas/eliminar/:id` | Eliminar tarifa | ✅ | Superadmin | Param: id (integer) |
| `PUT` | `/tarifas/:id/activar` | Activar/desactivar tarifa | ✅ | Administrador+ | Param: id + Body: {activa: boolean} |

---

### �️ **Gestión de Rutas**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Params/Body |
|--------|----------|-------------|------|---------------|-------------|
| `GET` | `/rutas/listar` | Obtener todas las rutas | ✅ | Operador+ | Query: activas |
| `GET` | `/rutas/detalle/:id` | Detalle completo de una ruta | ✅ | Operador+ | Param: id (integer) |
| `GET` | `/rutas/:id/medidores` | Medidores asignados a una ruta | ✅ | Operador+ | Param: id (integer) |
| `POST` | `/rutas/crear` | Crear nueva ruta | ✅ | Administrador+ | Body: datos de ruta |
| `POST` | `/rutas/agregar-medidor` | Agregar medidor a ruta | ✅ | Administrador+ | Body: {ruta_id, medidor_id} |
| `PUT` | `/rutas/actualizar/:id` | Actualizar ruta existente | ✅ | Administrador+ | Param: id + Body |
| `DELETE` | `/rutas/eliminar/:id` | Eliminar ruta | ✅ | Superadmin | Param: id (integer) |
| `POST` | `/rutas/:id/optimizar` | Optimizar orden de ruta | ✅ | Administrador+ | Param: id (integer) |

---

### 🏥 **Health Check y Monitoreo**
| Método | Endpoint | Descripción | Auth | Rol Requerido | Response |
|--------|----------|-------------|------|---------------|----------|
| `GET` | `/health` | Estado básico de la API v1 | ❌ | - | Status simple |
| `GET` | `/health/detailed` | Estado detallado del sistema | ✅ | Administrador+ | Métricas completas |
| `GET` | `/health/database` | Estado específico de la BD | ✅ | Administrador+ | Conectividad DB |
| `GET` | `/health/websockets` | Estado del sistema WebSocket | ✅ | Administrador+ | Conexiones activas |

## 🔒 **Sistema de Autenticación y Seguridad**

### 🛡️ **Arquitectura de Seguridad Dual**

La API v1.0 implementa un sistema de **doble autenticación** para máxima seguridad:

#### **1. API Key Authentication (Nivel de Aplicación)**
```http
x-api-key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBfaWQiOiJhZ3VhLXZwLWVsZWN0cm9uIiwiaWF0IjoxNjQzNzIzNDAwfQ...
```

#### **2. JWT Token Authentication (Nivel de Usuario)**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBhZ3VhdnAuY29tIiwicm9sZSI6ImFkbWluaXN0cmFkb3IifQ...
```

### 👤 **Sistema de Roles y Permisos**

```javascript
const ROLES_HIERARCHY = {
  superadmin: {
    level: 3,
    permissions: ['full_access', 'manage_system', 'manage_users', 'all_operations'],
    description: 'Acceso total al sistema'
  },
  administrador: {
    level: 2, 
    permissions: ['read', 'write', 'delete', 'manage_users', 'reports', 'billing'],
    description: 'Gestión completa excepto configuración de sistema'
  },
  operador: {
    level: 1,
    permissions: ['read', 'write', 'field_operations', 'basic_reports'],
    description: 'Operaciones de campo y consultas básicas'
  }
};
```

### 🎫 **Formato del JWT Token**
```javascript
{
  "id": 1,
  "email": "admin@aguavp.com",
  "role": "administrador",
  "name": "Administrator User",
  "permissions": ["read", "write", "delete", "reports"],
  "iat": 1643723400,    // Issued at
  "exp": 1643809800     // Expires at (24 horas)
}
```

### 🔑 **Headers Requeridos para Requests Autenticados**
```http
Content-Type: application/json
x-api-key: your_application_api_key_here
Authorization: Bearer your_user_jwt_token_here
```

## 📝 **Middleware Stack Detallado**

### 🛡️ **Pipeline de Middleware**

```javascript
// 1. CORS y Body Parser (Global)
app.use(cors())
app.use(express.json())

// 2. Request ID y Logging
app.use(requestId())
app.use(requestLogger())

// 3. App Key Validation (Por ruta protegida)
router.use(appKeyMiddleware)

// 4. JWT Authentication (Por ruta protegida)  
router.use(authMiddleware)

// 5. Role Authorization (Por endpoint específico)
router.use(roleCheck(['administrador', 'superadmin']))

// 6. Input Validation (Por endpoint)
router.use(validateInput(clienteSchema))

// 7. Controller Logic
router.get('/clientes/listar', clientesController.listar)
```

### 🔑 **App Key Middleware**
```javascript
// src/v1/middlewares/appKeyMiddleware.js
const appKeyMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'API_KEY_REQUIRED',
        message: 'Header x-api-key es requerido',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  try {
    // Validar JWT App Key
    const decoded = jwt.verify(apiKey, process.env.SECRET_APP_KEY);
    
    // Verificar que sea una aplicación autorizada
    if (!decoded.app_id || !AUTHORIZED_APPS.includes(decoded.app_id)) {
      throw new Error('Aplicación no autorizada');
    }
    
    req.appData = decoded;
    next();
    
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'API Key inválida: ' + error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
};
```

### 🔒 **Auth Middleware**
```javascript
// src/v1/middlewares/authMiddleware.js  
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_REQUIRED',
        message: 'Token JWT requerido en formato: Bearer <token>',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  const token = authHeader.slice(7); // Remover 'Bearer '
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validar que el rol sea permitido
    const validRoles = ['superadmin', 'administrador', 'operador'];
    if (!validRoles.includes(decoded.role)) {
      throw new Error('Rol de usuario no válido');
    }
    
    // Verificar que el token no esté en blacklist (logout)
    if (await isTokenBlacklisted(token)) {
      throw new Error('Token ha sido revocado');
    }
    
    req.user = decoded;
    req.token = token;
    next();
    
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_INVALID',
        message: 'Token JWT inválido: ' + error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
};
```



## 🚀 **Ejemplos de Uso Completos**

### 🔐 **1. Autenticación Completa**
```javascript
const axios = require('axios');

class AguaVPApiClient {
  constructor(baseURL = 'http://localhost:3000/api/v1') {
    this.baseURL = baseURL;
    this.apiKey = process.env.AGUA_VP_API_KEY;
    this.token = null;
  }
  
  // Login y obtener token
  async login(email, password) {
    try {
      const response = await axios.post(`${this.baseURL}/auth/login`, {
        email,
        password
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data.success) {
        this.token = response.data.data.token;
        console.log('✅ Login exitoso:', response.data.data.user.name);
        return response.data;
      }
    } catch (error) {
      console.error('❌ Error en login:', error.response?.data || error.message);
      throw error;
    }
  }
  
  // Headers para requests autenticados
  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'Authorization': `Bearer ${this.token}`
    };
  }
}

// Uso del cliente
const client = new AguaVPApiClient();
await client.login('admin@aguavp.com', 'securePassword123');
```

### 👥 **2. Gestión Completa de Clientes**
```javascript
// Listar clientes con paginación
const listarClientes = async (page = 1, limit = 10, search = '') => {
  try {
    const response = await axios.get(`${client.baseURL}/clientes/listar`, {
      headers: client.getAuthHeaders(),
      params: { page, limit, search }
    });
    
    console.log('📋 Clientes:', response.data.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error listando clientes:', error.response?.data);
  }
};

// Registrar nuevo cliente
const registrarCliente = async (clienteData) => {
  try {
    const response = await axios.post(`${client.baseURL}/clientes/registrar`, {
      cedula: '1234567890',
      nombres: 'Juan Carlos',
      apellidos: 'Pérez González',
      telefono: '0991234567',
      direccion: 'Av. Principal 123, Sector Norte',
      email: 'juan.perez@email.com',
      observaciones: 'Cliente preferencial'
    }, {
      headers: client.getAuthHeaders()
    });
    
    if (response.data.success) {
      console.log('✅ Cliente registrado:', response.data.data);
      return response.data.data;
    }
  } catch (error) {
    console.error('❌ Error registrando cliente:', error.response?.data);
    throw error;
  }
};

// Buscar cliente por cédula
const buscarClientePorCedula = async (cedula) => {
  try {
    const response = await axios.get(`${client.baseURL}/clientes/cedula/${cedula}`, {
      headers: client.getAuthHeaders()
    });
    
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('ℹ️ Cliente no encontrado');
      return null;
    }
    throw error;
  }
};
```

### 📈 **3. Registro de Lecturas con Validación**
```javascript
// Registrar lectura con validaciones
const registrarLectura = async (lecturaData) => {
  try {
    // Validar datos antes del envío
    if (!lecturaData.medidor_id || !lecturaData.lectura_actual) {
      throw new Error('Medidor ID y lectura actual son requeridos');
    }
    
    const response = await axios.post(`${client.baseURL}/lecturas/registrar`, {
      medidor_id: lecturaData.medidor_id,
      lectura_actual: parseFloat(lecturaData.lectura_actual),
      fecha_lectura: lecturaData.fecha_lectura || new Date().toISOString().split('T')[0],
      operador_id: lecturaData.operador_id,
      observaciones: lecturaData.observaciones || '',
      foto_medidor: lecturaData.foto_medidor // Base64 opcional
    }, {
      headers: client.getAuthHeaders()
    });
    
    if (response.data.success) {
      console.log('✅ Lectura registrada:', response.data.data);
      
      // Verificar si se calculó consumo correctamente
      const consumo = response.data.data.consumo_m3;
      if (consumo > 100) {
        console.warn('⚠️ Consumo alto detectado:', consumo, 'm³');
      }
      
      return response.data.data;
    }
  } catch (error) {
    console.error('❌ Error registrando lectura:', error.response?.data);
    throw error;
  }
};

// Obtener estadísticas de consumo
const obtenerEstadisticasConsumo = async (medidorId) => {
  try {
    const response = await axios.get(`${client.baseURL}/lecturas/estadisticas/${medidorId}`, {
      headers: client.getAuthHeaders()
    });
    
    const stats = response.data.data;
    console.log('📊 Estadísticas de consumo:', {
      consumo_promedio: stats.consumo_promedio_m3,
      consumo_maximo: stats.consumo_maximo_m3,
      total_lecturas: stats.total_lecturas,
      periodo: stats.periodo_analizado
    });
    
    return stats;
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error.response?.data);
  }
};
```

## 📊 **Formato de Respuestas de la API**

### ✅ **Respuesta Exitosa Estándar**
```json
{
  "success": true,
  "data": {
    // Datos solicitados o resultado de la operación
  },
  "message": "Operación completada exitosamente",
  "metadata": {
    "timestamp": "2025-07-31T15:30:00.000Z",
    "version": "1.0.0",
    "total_records": 150,  // Para listados
    "page": 1,             // Para paginación
    "limit": 10
  }
}
```

### ❌ **Respuesta de Error Estándar**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos de entrada inválidos",
    "details": {
      "field": "cedula",
      "issue": "Ya existe un cliente con esta cédula",
      "provided_value": "1234567890"
    },
    "timestamp": "2025-07-31T15:30:00.000Z",
    "path": "/api/v1/clientes/registrar",
    "method": "POST",
    "requestId": "req_123456789"
  }
}
```

### 📋 **Respuesta de Listado con Paginación**
```json
{
  "success": true,
  "data": [
    // Array de elementos
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 15,
    "total_records": 150,
    "per_page": 10,
    "has_next": true,
    "has_previous": false
  },
  "message": "Datos obtenidos exitosamente"
}
```

## 🚨 **Códigos de Error y Soluciones**

### 🔴 **Errores de Autenticación (4xx)**

| Código HTTP | Error Code | Descripción | Solución |
|-------------|------------|-------------|----------|
| `401` | `API_KEY_REQUIRED` | Header x-api-key faltante | Agregar header x-api-key |
| `401` | `INVALID_API_KEY` | API Key inválida o expirada | Verificar/renovar API Key |
| `401` | `TOKEN_REQUIRED` | JWT token faltante | Agregar header Authorization |
| `401` | `TOKEN_INVALID` | JWT token inválido/expirado | Hacer login nuevamente |
| `403` | `INSUFFICIENT_PERMISSIONS` | Permisos insuficientes | Verificar rol de usuario |
| `403` | `ROLE_NOT_AUTHORIZED` | Rol no autorizado para operación | Contactar administrador |

### 🟡 **Errores de Validación (4xx)**

| Código HTTP | Error Code | Descripción | Solución |
|-------------|------------|-------------|----------|
| `400` | `VALIDATION_ERROR` | Datos de entrada inválidos | Verificar formato de datos |
| `400` | `MISSING_REQUIRED_FIELD` | Campo requerido faltante | Agregar campos obligatorios |
| `404` | `RESOURCE_NOT_FOUND` | Recurso no encontrado | Verificar ID del recurso |
| `409` | `DUPLICATE_RESOURCE` | Recurso duplicado | Verificar unicidad (cédula, etc.) |
| `422` | `BUSINESS_RULE_VIOLATION` | Violación de regla de negocio | Revisar lógica del negocio |

### 🔴 **Errores del Servidor (5xx)**

| Código HTTP | Error Code | Descripción | Solución |
|-------------|------------|-------------|----------|
| `500` | `INTERNAL_ERROR` | Error interno del servidor | Revisar logs, contactar soporte |
| `503` | `SERVICE_UNAVAILABLE` | Servicio temporalmente no disponible | Reintentar después |
| `504` | `DATABASE_TIMEOUT` | Timeout de base de datos | Verificar conectividad DB |

## ⚡ **Optimización y Performance**

### 🚀 **Buenas Prácticas Implementadas**

#### **1. Caching de Consultas Frecuentes**
```javascript
// Cache de tarifas activas (se actualiza cada 1 hora)
const tarifasCache = new Map();
const CACHE_TTL = 3600000; // 1 hora

const obtenerTarifasActivas = async () => {
  const cacheKey = 'tarifas_activas';
  const cached = tarifasCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  const tarifas = await db.getTarifasActivas();
  tarifasCache.set(cacheKey, {
    data: tarifas,
    timestamp: Date.now()
  });
  
  return tarifas;
};
```

#### **2. Paginación Eficiente**
```javascript
// Implementación de paginación con LIMIT y OFFSET
const listarClientesPaginado = async (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  
  const [clientes, totalCount] = await Promise.all([
    db.query('SELECT * FROM clientes ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]),
    db.query('SELECT COUNT(*) as total FROM clientes')
  ]);
  
  return {
    data: clientes,
    pagination: {
      current_page: page,
      total_pages: Math.ceil(totalCount[0].total / limit),
      total_records: totalCount[0].total,
      per_page: limit
    }
  };
};
```

#### **3. Validación de Datos con Esquemas**
```javascript
const Joi = require('joi');

const clienteSchema = Joi.object({
  cedula: Joi.string().pattern(/^\d{10}$/).required().messages({
    'string.pattern.base': 'La cédula debe tener exactamente 10 dígitos'
  }),
  nombres: Joi.string().min(2).max(50).required(),
  apellidos: Joi.string().min(2).max(50).required(),
  telefono: Joi.string().pattern(/^[0-9+\-\s()]+$/),
  direccion: Joi.string().min(10).max(200).required(),
  email: Joi.string().email().optional()
});

// Middleware de validación
const validateCliente = (req, res, next) => {
  const { error } = clienteSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.details[0].message,
        details: error.details
      }
    });
  }
  next();
};
```

---

## 🧪 **Testing y Verificación**

### 🔍 **Health Check Testing**
```bash
# Test básico de conectividad
curl -X GET http://localhost:3000/api/v1/health \
  -H "Content-Type: application/json"

# Test con autenticación completa  
curl -X GET http://localhost:3000/api/v1/health/detailed \
  -H "x-api-key: your_api_key" \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json"
```

### 📝 **Script de Prueba de Endpoints**
```bash
#!/bin/bash
# test-api-v1.sh

API_BASE="http://localhost:3000/api/v1"
API_KEY="your_api_key_here"
JWT_TOKEN="your_jwt_token_here"

# Headers comunes
HEADERS="-H 'x-api-key: $API_KEY' -H 'Authorization: Bearer $JWT_TOKEN' -H 'Content-Type: application/json'"

echo "🧪 Probando endpoints de la API v1.0..."

# Test de autenticación
echo "1. Test de login..."
curl -X POST $API_BASE/auth/login \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aguavp.com","password":"password123"}'

# Test de listado de clientes
echo "2. Test de listado de clientes..."
eval "curl -X GET $API_BASE/clientes/listar $HEADERS"

# Test de health check
echo "3. Test de health check..."
eval "curl -X GET $API_BASE/health/detailed $HEADERS"

echo "✅ Pruebas completadas"
```

---

## 🔮 **Roadmap de la Versión 1.x**

### 📅 **Versión 1.1.0** (Próxima)
- ✨ **Filtros avanzados** en listados con múltiples criterios
- 📊 **Reportes básicos** en PDF con gráficos
- 🔍 **Búsqueda full-text** en clientes y medidores
- 📧 **Notificaciones por email** para facturas vencidas
- 🗂️ **Backup automático** de base de datos

### 📅 **Versión 1.2.0** (Futura)
- 📱 **API móvil optimizada** con endpoints específicos
- 🖼️ **Upload de imágenes** para medidores y lecturas
- 🗺️ **Geolocalización** de medidores
- 📈 **Analytics avanzados** de consumo
- 🔐 **Two-factor authentication** (2FA)

---

*Documentación completa de la **API Agua-VP v1.0** - La versión estable y de producción para la gestión integral de servicios de agua potable.*
| `INVALID_API_KEY` | API Key inválida | 401 |
| `TOKEN_EXPIRED` | Token JWT expirado | 401 |
| `RESOURCE_NOT_FOUND` | Recurso no encontrado | 404 |
| `VALIDATION_ERROR` | Error de validación | 400 |
| `DATABASE_ERROR` | Error de base de datos | 500 |

## 📈 Performance

### Optimizaciones Implementadas
- **Conexión persistente** a la base de datos SQLite
- **Índices** en campos frecuentemente consultados
- **Validación** temprana de parámetros
- **Cache** de configuraciones
- **Compresión** de respuestas JSON

### Límites
- **Rate Limiting**: 100 requests/minute por API Key
- **Payload máximo**: 10MB
- **Timeout**: 30 segundos
- **Conexiones simultáneas**: 100

## 🔄 Migración y Compatibilidad

### Versionado Semántico
- **v1.0.x**: Patches y bugfixes
- **v1.1.x**: Nuevas funcionalidades (backward compatible)
- **v2.0.x**: Breaking changes (futura)

### Deprecation Policy
- Funciones deprecadas tendrán **6 meses** de soporte
- Headers de advertencia en respuestas
- Documentación de migración disponible

## 📚 Recursos Adicionales

- **Documentación Swagger**: `/api-docs`
- **Guía de Migración**: `../MIGRATION_GUIDE.md`
- **Arquitectura General**: `../README.md`
- **Changelog**: `../CHANGELOG.md`

---

**Versión**: 1.0.0  
**Fecha**: Julio 2025  
**Estado**: Estable y en producción
