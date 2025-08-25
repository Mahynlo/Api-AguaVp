# 🌊 API Agua-VP – Documentación General

> **Plataforma RESTful para gestión de agua potable, arquitectura modular, versionado avanzado y soporte real-time.**


## 📋 Descripción General

Agua-VP es una API modular y versionada para la gestión integral de agua potable, con soporte para tiempo real, seguridad multicapa y monitoreo avanzado. Permite administrar clientes, medidores, lecturas, facturación, pagos, rutas y tarifas, integrando tecnologías modernas y coexistencia de versiones.

---


## 🏗️ Estructura del Proyecto


```
src/
├── v1/                # Versión 1: WebSockets, SQLite3, MVC clásico
│   ├── controllers/   # Lógica de negocio v1
│   ├── middlewares/   # Seguridad y validaciones v1
│   ├── routes/        # Endpoints RESTful v1
│   ├── sockets/       # WebSocket y notificaciones
│   └── index.js       # Router principal v1
│
├── v2/                # Versión 2: SSE, Turso DB, arquitectura moderna
│   ├── controllers/   # Lógica de negocio v2 (Turso, SSE)
│   ├── middlewares/   # Seguridad y validaciones v2
│   ├── routes/        # Endpoints RESTful v2
│   ├── sse/           # Server-Sent Events y notificaciones
│   └── index.js       # Router principal v2
│
├── config/            # Configuración global y versionado
├── controllers/       # Controladores globales (ej: health)
├── database/          # Conexión y modelos de base de datos (SQLite3 y Turso)
├── routes/            # Enrutado principal y health checks
├── utils/             # Utilidades compartidas (tokens, helpers)
├── server.js          # Configuración de servidor Express, Swagger, sockets/SSE
├── index.js           # Punto de entrada principal
└── README.md          # Documentación general (este archivo)
```

---


## 🚦 Versionado y Filosofía

- **v1**: WebSockets, SQLite3, MVC clásico, endpoints RESTful, seguridad JWT+API Key.
- **v2**: Server-Sent Events (SSE), Turso DB (@libsql/client), modularidad avanzada, notificaciones en tiempo real, seguridad multicapa, compatibilidad total con v1.
- **Versionado por URL**: `/api/v1/*`, `/api/v2/*`
- **Coexistencia**: Ambas versiones pueden usarse en paralelo y comparten parte del core.

---


## ⚙️ Tecnologías y Dependencias

- **Backend**: Node.js, Express
- **Base de datos**: SQLite3 (v1), Turso DB (@libsql/client, v2)
- **Tiempo real**: Socket.IO (v1), Server-Sent Events (SSE, v2)
- **Seguridad**: JWT, API Key, middlewares personalizados, roles
- **Documentación**: Swagger (OpenAPI), README técnicos por versión
- **Utilidades**: bcryptjs, uuid, dotenv

---


## 🔄 Flujo de Petición y Ciclo de Vida

1. **Request** → Llega a `/api/v1/*` o `/api/v2/*`
2. **Middlewares** → Validación de API Key y JWT
3. **Router** → Selección de versión y recurso
4. **Controller** → Lógica de negocio y acceso a base de datos (SQLite3 o Turso)
5. **Notificación** → WebSocket (v1) o SSE (v2) si aplica
6. **Response** → Respuesta JSON estandarizada

---


## 🔐 Seguridad

- **API Key**: Header `x-api-key` o `x-app-key`
- **JWT**: Header `Authorization: Bearer <token>`
- **Roles**: superadmin, administrador, operador
- **Protección de endpoints**: Todos los recursos críticos requieren autenticación y validación de clave de aplicación.
- **Auditoría y logging**: Control de cambios y errores.
- **Seguridad multicapa**: Middlewares para AppKey y JWT, validación de sesiones y roles.

---


## 📡 Tiempo Real y Notificaciones

- **v1**: WebSockets (Socket.IO), rooms por roles, notificaciones inteligentes.
- **v2**: Server-Sent Events (SSE), eventos broadcast, integración directa con controladores.

### Eventos SSE soportados (v2)

- `cliente_creado`, `cliente_modificado`, `medidor_registrado`, `lectura_registrada`, `factura_generada`, `pago_registrado`, `tarifa_actualizada`, `ruta_actualizada`, `alerta_sistema`, `mantenimiento_sistema`, etc.

**Conexión SSE ejemplo:**
```bash
curl -N -H "Accept: text/event-stream" -H "Authorization: Bearer TU_TOKEN" http://localhost:3000/api/v2/events/stream
```

---


## 📊 Monitoreo y Health Checks

- **Endpoints**: `/api/health`, `/api/v1/health`, `/api/v2/app/status`, `/api/v2/events/health`, `/api/v2/events/stats`
- **Métricas**: Estado de API, base de datos, sockets/SSE, memoria, uptime.
- **Swagger UI**: `/api-docs`

---


## 🔄 Diferencias y Migración v1 → v2

| Característica         | v1                | v2 (actual)                |
|------------------------|-------------------|----------------------------|
| Notificaciones         | WebSockets        | Server-Sent Events (SSE)   |
| Base de datos          | SQLite3           | Turso (@libsql/client)     |
| Seguridad              | JWT               | JWT + AppKey               |
| Modularidad            | Parcial           | Total (MVC + SSE)          |
| Compatibilidad         | Solo v1           | v1 y v2 coexisten          |
| Escalabilidad          | Limitada          | Alta (Turso distribuido)   |
| Documentación          | Básica            | Completa (Swagger + README)|

**Migrar:** Cambia la base URL (`/api/v1/` → `/api/v2/`). Si usas tiempo real, adapta de WebSocket a SSE. Consulta ejemplos y documentación de eventos SSE.

---


## 🧪 Ejemplos de Uso

### Registro de cliente (cURL)
```bash
curl -X POST http://localhost:3000/api/v2/clientes/registrar \
  -H "x-app-key: AppKey TU_APP_KEY" \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Juan Perez","direccion":"Calle 123","telefono":"555-1234","ciudad":"Ciudad","tarifa_id":1}'
```

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

---


## 📚 Recursos y Documentación

- [Swagger UI](http://localhost:3000/api-docs)
- [README v1](./v1/README.md)
- [README v2](./v2/README.md)
- [Turso DB](https://turso.tech/)
- [Express](https://expressjs.com/)
- [Server-Sent Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [@libsql/client](https://www.npmjs.com/package/@libsql/client)

---


---

## 🏁 Mejores prácticas y recomendaciones

- Usar siempre **HTTPS** en producción.
- Rotar claves y tokens periódicamente.
- Validar y sanitizar todos los datos de entrada.
- Monitorear eventos SSE para detectar caídas de clientes.
- Extender controladores usando la arquitectura modular.
- Mantener actualizada la documentación y los ejemplos de uso.

---

**Esta arquitectura está diseñada para ser:**
- Escalable y mantenible
- Segura y auditable
- Extensible para futuras versiones (microservicios, GraphQL, etc.)
