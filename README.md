
# 🚰 API REST para Agua-VP

API REST para la gestión integral de servicios de agua potable, diseñada para integrarse con la app de escritorio Agua-VP (Electron). Arquitectura modular, versionada y con soporte para tiempo real.

---

## 📑 Índice

- [Información General](#información-general)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [API v1 – WebSockets y SQLite3](#api-v1--websockets-y-sqlite3)
  - [Características](#características)
  - [Endpoints principales v1](#endpoints-principales-v1)
- [API v2 – SSE y Turso DB](#api-v2--sse-y-turso-db)
  - [Características](#características-1)
  - [Endpoints principales v2](#endpoints-principales-v2)
  - [Seguridad v2](#seguridad-v2)
  - [Notificaciones y SSE](#notificaciones-y-sse)
  - [Ejemplo de uso v2](#ejemplo-de-uso-v2-registro-de-cliente)
  - [Diferencias clave v1 vs v2](#diferencias-clave-v1-vs-v2)
- [Instalación y Configuración](#instalación-y-configuración)
- [Documentación de la API](#documentación-de-la-api)
- [Autenticación y Seguridad](#autenticación-y-seguridad)
- [Sistema WebSocket Avanzado](#sistema-websocket-avanzado)
- [Configuración Avanzada](#configuración-avanzada)
- [Códigos de Error Comunes](#códigos-de-error-comunes)
- [Monitoreo y Métricas](#monitoreo-y-métricas)
- [Desarrollo y Contribución](#desarrollo-y-contribución)
- [Resolución de Problemas](#resolución-de-problemas)
- [Changelog y Versiones](#changelog-y-versiones)
- [Soporte y Contacto](#soporte-y-contacto)
- [Integración con Aplicación Electron](#integración-con-aplicación-electron)

---

## Información General

- **Versionado:** v1 (WebSockets, SQLite3), v2 (SSE, Turso DB)
- **Seguridad:** JWT + API Key, roles, middlewares avanzados
- **Documentación:** Swagger UI (`/api-docs`), README técnicos por versión
- **Integración:** Compatible con Electron y clientes web

## 📁 Estructura del Proyecto

```
api-AguaVP/
├── package.json                # Dependencias y scripts
├── README.md                   # Este archivo
├── public/                     # Recursos estáticos
│   └── assets/
│       ├── icons/
│       └── images/
├── src/                        # Código fuente principal
│   ├── index.js                # Punto de entrada principal
│   ├── server.js               # Configuración Express y tiempo real
│   ├── config/                 # Configuración global y versionado
│   ├── controllers/            # Controladores globales
│   ├── database/               # Persistencia y conexión a BD
│   ├── routes/                 # Enrutado principal y health checks
│   ├── utils/                  # Utilidades compartidas
│   ├── v1/                     # Versión 1.0 (WebSockets, SQLite3)
│   └── v2/                     # Versión 2.0 (SSE, Turso DB)
```

---

## 🟦 API v1 – WebSockets y SQLite3

### Características
- Arquitectura MVC clásica
- WebSockets (Socket.IO) para tiempo real
- Base de datos SQLite3 local
- Seguridad JWT + API Key
- Modularidad parcial

### Endpoints principales v1

**Base URL:** `/api/v1`

...existing code...

---

## 🟩 API v2 – SSE y Turso DB

### Características
- Arquitectura modular avanzada (MVC + SSE)
- Server-Sent Events (SSE) para notificaciones en tiempo real
- Base de datos distribuida Turso DB (@libsql/client)
- Seguridad multicapa: JWT + AppKey, roles y middlewares
- Compatibilidad y migración progresiva desde v1

### Endpoints principales v2

**Base URL:** `/api/v2`

- `/auth` – Autenticación y gestión de usuarios
- `/clientes` – Gestión de clientes
- `/medidores` – Gestión de medidores
- `/lecturas` – Gestión de lecturas
- `/facturas` – Facturación
- `/pagos` – Pagos
- `/tarifas` – Tarifas
- `/rutas` – Rutas de lectura
- `/events` – Server-Sent Events (SSE): notificaciones y eventos en tiempo real
- `/app/status` – Health check v2
- `/app/version` – Versión de la API

### Seguridad v2
- **AppKey:** Header `x-app-key: AppKey <token>`
- **JWT:** Header `Authorization: Bearer <token>`
- **Roles:** superadmin, administrador, operador
- **Protección:** Todos los endpoints críticos requieren autenticación y validación de app key.

### Notificaciones y SSE
- **Conexión SSE:**
```bash
curl -N -H "Accept: text/event-stream" -H "Authorization: Bearer TU_TOKEN" http://localhost:3000/api/v2/events/stream
```
- **Eventos soportados:** `cliente_creado`, `lectura_registrada`, `factura_generada`, `pago_registrado`, `alerta_sistema`, etc.

### Ejemplo de uso v2 (registro de cliente)
```bash
curl -X POST http://localhost:3000/api/v2/clientes/registrar \
  -H "x-app-key: AppKey TU_APP_KEY" \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Juan Perez","direccion":"Calle 123","telefono":"555-1234","ciudad":"Ciudad","tarifa_id":1}'
```

### Diferencias clave v1 vs v2

| Característica         | v1 (actual)         | v2 (moderna)           |
|------------------------|---------------------|------------------------|
| Base de datos          | SQLite3             | Turso DB (@libsql)     |
| Tiempo real            | WebSockets          | Server-Sent Events     |
| Seguridad              | JWT + API Key       | JWT + API Key          |
| Modularidad            | Parcial             | Total (MVC + SSE)      |
| Compatibilidad         | Solo v1             | v1 y v2 coexistentes   |
| Documentación          | Swagger básica      | Swagger + README v2    |

---
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

## 🚀 API v2 – Arquitectura Moderna y Tiempo Real

La versión 2 de la API (v2) está activa y lista para producción. Incorpora mejoras clave:

- **Base de datos distribuida:** Turso DB (@libsql/client), compatible con SQLite pero escalable y cloud-native.
- **Notificaciones en tiempo real:** Server-Sent Events (SSE) reemplaza WebSockets para mayor compatibilidad y simplicidad.
- **Seguridad multicapa:** JWT + AppKey, roles y middlewares avanzados.
- **Arquitectura modular:** Separación estricta de controladores, rutas, middlewares y eventos.
- **Compatibilidad:** v1 y v2 pueden usarse en paralelo, facilitando migraciones graduales.

### 📡 Endpoints principales v2

**Base URL:** `/api/v2`

- `/auth` – Autenticación y gestión de usuarios
- `/clientes` – Gestión de clientes
- `/medidores` – Gestión de medidores
- `/lecturas` – Gestión de lecturas
- `/facturas` – Facturación
- `/pagos` – Pagos
- `/tarifas` – Tarifas
- `/rutas` – Rutas de lectura
- `/events` – Server-Sent Events (SSE): notificaciones y eventos en tiempo real
- `/app/status` – Health check v2
- `/app/version` – Versión de la API

### 🔐 Seguridad v2
- **AppKey:** Header `x-app-key: AppKey <token>`
- **JWT:** Header `Authorization: Bearer <token>`
- **Roles:** superadmin, administrador, operador
- **Protección:** Todos los endpoints críticos requieren autenticación y validación de app key.

### 📡 Notificaciones y SSE
- **Conexión SSE:**
```bash
curl -N -H "Accept: text/event-stream" -H "Authorization: Bearer TU_TOKEN" http://localhost:3000/api/v2/events/stream
```
- **Eventos soportados:** `cliente_creado`, `lectura_registrada`, `factura_generada`, `pago_registrado`, `alerta_sistema`, etc.

### 🧪 Ejemplo de uso v2 (registro de cliente)
```bash
curl -X POST http://localhost:3000/api/v2/clientes/registrar \
   -H "x-app-key: AppKey TU_APP_KEY" \
   -H "Authorization: Bearer TU_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"nombre":"Juan Perez","direccion":"Calle 123","telefono":"555-1234","ciudad":"Ciudad","tarifa_id":1}'
```

### 📊 Diferencias clave v1 vs v2

| Característica         | v1 (actual)         | v2 (moderna)           |
|------------------------|---------------------|------------------------|
| Base de datos          | SQLite3             | Turso DB (@libsql)     |
| Tiempo real            | WebSockets          | Server-Sent Events     |
| Seguridad              | JWT + API Key       | JWT + API Key          |
| Modularidad            | Parcial             | Total (MVC + SSE)      |
| Compatibilidad         | Solo v1             | v1 y v2 coexistentes   |
| Documentación          | Swagger básica      | Swagger + README v2    |

---

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




