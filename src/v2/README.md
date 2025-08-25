eventSource.onmessage = function(event) {
eventSource.addEventListener('cliente_creado', function(event) {
# Documentación Técnica Completa – API Agua-VP v2 🚰

## Índice

1. [Introducción y visión general](#introducción-y-visión-general)
2. [Estructura del proyecto y descripción de archivos](#estructura-del-proyecto-y-descripción-de-archivos)
3. [Arquitectura y dependencias](#arquitectura-y-dependencias)
4. [Flujo de la API y ciclo de vida de una petición](#flujo-de-la-api-y-ciclo-de-vida-de-una-petición)
5. [Endpoints principales y rutas](#endpoints-principales-y-rutas)
6. [Notificaciones en tiempo real (SSE)](#notificaciones-en-tiempo-real-sse)
7. [Seguridad y autenticación](#seguridad-y-autenticación)
8. [Configuración y despliegue](#configuración-y-despliegue)
9. [Pruebas y monitoreo](#pruebas-y-monitoreo)
10. [Diferencias clave v1 vs v2](#diferencias-clave-v1-vs-v2)
11. [Mejores prácticas y recomendaciones](#mejores-prácticas-y-recomendaciones)
12. [Ejemplos de uso](#ejemplos-de-uso)
13. [Referencias y recursos](#referencias-y-recursos)

---

## Introducción y visión general

La **API Agua-VP v2** es una plataforma moderna para la gestión de agua potable, diseñada para ser escalable, segura y en tiempo real. Incorpora mejoras arquitectónicas y tecnológicas respecto a la v1, como la migración a una base de datos distribuida (Turso), la adopción de Server-Sent Events (SSE) para notificaciones y una estructura modular y mantenible.

---

## Estructura del proyecto y descripción de archivos

```
src/v2/
│
├── controllers/         # Lógica de negocio y acceso a datos
│   ├── appController.js
│   ├── authController.js
│   ├── clientesController.js
│   ├── facturasController.js
│   ├── lecturasController.js
│   ├── medidorController.js
│   ├── pagosController.js
│   ├── rutasController.js
│   └── tarifasController.js
│
├── middlewares/         # Middlewares de autenticación y validación
│   ├── appKeyMiddleware.js
│   └── authMiddleware.js
│
├── routes/              # Definición de rutas y endpoints
│   ├── appRoutes.js
│   ├── authroutes.js
│   ├── clientes.js
│   ├── facturas.js
│   ├── lecturas.js
│   ├── medidores.js
│   ├── pagos.js
│   ├── rutas.js
│   └── tarifas.js
│
├── sse/                 # Sistema de notificaciones en tiempo real
│   ├── notificationManager.js
│   └── sseManager.js
│
├── index.js             # Router principal de la API v2
└── README.md            # Documentación de la v2 (este archivo)
```

### Descripción de carpetas y archivos clave

- **controllers/**: Implementan la lógica de negocio para cada entidad (clientes, facturas, lecturas, etc.), interactuando con la base de datos y gestionando la lógica de SSE.
- **middlewares/**: Validan la autenticidad de las peticiones (JWT, AppKey) y controlan el acceso a los recursos.
- **routes/**: Definen los endpoints RESTful, aplican middlewares y conectan con los controladores.
- **sse/**: Implementa la infraestructura de Server-Sent Events, gestionando conexiones, eventos y notificaciones.
- **index.js**: Punto de entrada de la API v2, importa y monta todas las rutas.
- **README.md**: Documentación técnica y de uso de la v2.

---

## Arquitectura y dependencias

### Arquitectura general

- **Backend modular**: Separación clara entre rutas, controladores, middlewares y utilidades.
- **Base de datos distribuida**: Turso (@libsql/client), compatible con SQLite, permite escalabilidad y alta disponibilidad.
- **Notificaciones en tiempo real**: Server-Sent Events (SSE) reemplaza WebSockets, simplificando la comunicación y mejorando la compatibilidad.
- **Seguridad multicapa**: Autenticación JWT + AppKey, validación de sesiones y roles.
- **Compatibilidad**: V1 y V2 coexisten, permitiendo migraciones graduales.

### Principales dependencias

- `express`: Framework web principal.
- `@libsql/client`: Cliente para Turso DB.
- `jsonwebtoken`: Manejo de JWT para autenticación.
- `bcryptjs`: Hashing de contraseñas.
- `uuid`: Generación de identificadores únicos.
- `dotenv`: Manejo de variables de entorno.

---

## Flujo de la API y ciclo de vida de una petición

1. **Recepción de la petición**: Llega a una ruta específica (ej. `/api/v2/clientes/registrar`).
2. **Middlewares**: Se valida la AppKey y el JWT (si aplica).
3. **Controlador**: Se ejecuta la lógica de negocio, accediendo a la base de datos Turso.
4. **SSE (opcional)**: Si la operación lo requiere, se emite una notificación en tiempo real.
5. **Respuesta**: Se retorna una respuesta estandarizada al cliente.

---

## Endpoints principales y rutas

**Base URL:** `/api/v2`

- **Autenticación**: `/api/v2/auth`
- **Clientes**: `/api/v2/clientes`
- **Medidores**: `/api/v2/medidores`
- **Lecturas**: `/api/v2/lecturas`
- **Facturas**: `/api/v2/facturas`
- **Pagos**: `/api/v2/pagos`
- **Tarifas**: `/api/v2/tarifas`
- **Rutas**: `/api/v2/rutas`
- **Eventos SSE**: `/api/v2/events`

Cada recurso implementa los endpoints CRUD clásicos y operaciones especializadas, manteniendo compatibilidad con la v1.

---

## Notificaciones en tiempo real (SSE)

- **Gestión centralizada**: `sseManager.js` y `notificationManager.js` gestionan conexiones y eventos.
- **Eventos soportados**: `cliente_creado`, `cliente_modificado`, `medidor_registrado`, `lectura_registrada`, `factura_generada`, `pago_registrado`, `tarifa_actualizada`, `ruta_actualizada`, `alerta_sistema`, `mantenimiento_sistema`, entre otros.
- **Conexión SSE**:
   ```bash
   curl -N -H "Accept: text/event-stream" -H "Authorization: Bearer TU_TOKEN" http://localhost:3000/api/v2/events/stream
   ```
- **Broadcast**: Los controladores disparan eventos SSE tras operaciones relevantes.

---

## Seguridad y autenticación

- **AppKey Middleware**: Valida la clave de aplicación (`x-app-key: AppKey <token>`), asegurando que solo apps autorizadas accedan.
- **Auth Middleware**: Valida el JWT (`Authorization: Bearer <token>`), asegurando sesiones activas y usuarios válidos.
- **Roles y permisos**: El sistema permite extender la lógica para roles y permisos por endpoint.
- **Protección de endpoints**: Todos los endpoints críticos requieren autenticación y validación de app key.

---

## Configuración y despliegue

1. **Variables de entorno**:
    ```
    TURSO_DATABASE_URL=...
    TURSO_AUTH_TOKEN=...
    JWT_SECRET=...
    SECRET_APP_KEY=...
    ```
2. **Instalación de dependencias**:
    ```bash
    npm install
    ```
3. **Inicio del servidor**:
    ```bash
    npm run dev
    ```
4. **Acceso a la documentación interactiva**:
    - [Swagger UI](http://localhost:3000/api-docs)

---

## Pruebas y monitoreo

- **Health check**: `/api/v2/app/status`
- **Versión**: `/api/v2/app/version`
- **SSE health**: `/api/v2/events/health`
- **Estadísticas SSE**: `/api/v2/events/stats`
- **Pruebas unitarias**: (en desarrollo) – se recomienda usar Jest o Mocha para nuevos tests.

---

## Diferencias clave v1 vs v2

| Característica         | v1                | v2 (actual)                |
|------------------------|-------------------|----------------------------|
| Notificaciones         | WebSockets        | Server-Sent Events (SSE)   |
| Base de datos          | SQLite3           | Turso (@libsql/client)     |
| Seguridad              | JWT               | JWT + AppKey               |
| Modularidad            | Parcial           | Total (MVC + SSE)          |
| Compatibilidad         | Solo v1           | v1 y v2 coexisten          |
| Escalabilidad          | Limitada          | Alta (Turso distribuido)   |
| Documentación          | Básica            | Completa (Swagger + README)|

---

## Mejores prácticas y recomendaciones

- **Usar siempre HTTPS** en producción.
- **Rotar claves y tokens** periódicamente.
- **Validar y sanitizar** todos los datos de entrada.
- **Monitorear eventos SSE** para detectar caídas de clientes.
- **Extender controladores** usando la arquitectura modular.
- **Mantener actualizada la documentación** y los ejemplos de uso.

---

## Ejemplos de uso

### Conexión SSE en JavaScript

```js
const eventSource = new EventSource('http://localhost:3000/api/v2/events/stream?token=TU_TOKEN');
eventSource.onmessage = (event) => {
   const data = JSON.parse(event.data);
   console.log('Evento recibido:', data);
};
eventSource.addEventListener('cliente_creado', (event) => {
   const data = JSON.parse(event.data);
   console.log('Nuevo cliente:', data);
});
```

### Registro de cliente (cURL)

```bash
curl -X POST http://localhost:3000/api/v2/clientes/registrar \
   -H "x-app-key: AppKey TU_APP_KEY" \
   -H "Authorization: Bearer TU_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"nombre":"Juan Perez","direccion":"Calle 123","telefono":"555-1234","ciudad":"Ciudad","tarifa_id":1}'
```

---

## Referencias y recursos

- [Swagger UI](http://localhost:3000/api-docs)
- [Turso DB](https://turso.tech/)
- [Documentación oficial Express](https://expressjs.com/)
- [Server-Sent Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [@libsql/client](https://www.npmjs.com/package/@libsql/client)

---


