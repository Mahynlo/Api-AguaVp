# API Agua-VP v2 🚰

## Descripción

Esta es la versión 2.0 de la API de gestión de agua potable, que incluye mejoras significativas en la arquitectura y tecnologías utilizadas.

## 🆕 Cambios principales en v2

### 1. **WebSockets → Server-Sent Events (SSE)**
- Reemplazado el sistema de WebSockets por Server-Sent Events
- Mejores notificaciones en tiempo real
- Menor complejidad de conexión
- Soporte nativo en navegadores

### 2. **SQLite3 → Turso Database**
- Migración completa a Turso (@libsql/client)
- Base de datos distribuida y escalable
- Mejor rendimiento y confiabilidad
- Mantiene compatibilidad SQL

### 3. **Arquitectura mejorada**
- Mantenimiento de controladores y middlewares existentes
- Integración transparente con el sistema SSE
- Compatibilidad con la v1 (ambas versiones coexisten)

## 🚀 Endpoints principales

### Base URL: `/api/v2`

- **Autenticación**: `/api/v2/auth`
- **Clientes**: `/api/v2/clientes`
- **Medidores**: `/api/v2/medidores`
- **Lecturas**: `/api/v2/lecturas`
- **Facturas**: `/api/v2/facturas`
- **Pagos**: `/api/v2/pagos`
- **Tarifas**: `/api/v2/tarifas`
- **Rutas**: `/api/v2/rutas`
- **Eventos SSE**: `/api/v2/events` ⭐ **NUEVO**

## 📡 Server-Sent Events (SSE)

### Conexión
```bash
curl -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v2/events/stream
```

### Eventos disponibles
- `welcome` - Mensaje de bienvenida
- `heartbeat` - Latido del corazón del servidor
- `cliente_creado` - Cliente nuevo registrado
- `cliente_modificado` - Cliente modificado
- `medidor_registrado` - Medidor nuevo
- `lectura_registrada` - Nueva lectura
- `factura_generada` - Factura creada
- `pago_registrado` - Pago registrado
- `alerta_sistema` - Alertas del sistema
- `mantenimiento_sistema` - Notificaciones de mantenimiento

### Health Check SSE
```bash
curl http://localhost:3000/api/v2/events/health
```

### Estadísticas SSE
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v2/events/stats
```

## 🔧 Base de datos

### Configuración Turso
Asegúrate de tener las variables de entorno configuradas:

```env
TURSO_DATABASE_URL=your_turso_database_url
TURSO_AUTH_TOKEN=your_turso_auth_token
```

### Migración desde SQLite3
La v2 utiliza el archivo `db-turso.js` para la conexión a la base de datos Turso. El esquema de base de datos se mantiene igual que en la v1.

## 🔄 Compatibilidad

### Con v1
- La v1 y v2 coexisten en la misma aplicación
- Los endpoints de v1 siguen funcionando normalmente
- La v2 está disponible en `/api/v2/*`
- La documentación incluye ambas versiones

### Migración
Para migrar de v1 a v2:
1. Cambia la base URL de `/api/v1` a `/api/v2`
2. Reemplaza conexiones WebSocket por SSE
3. Las respuestas y estructura de datos se mantienen igual

## 📊 Monitoreo

### Health Check
```bash
curl http://localhost:3000/api/v2/app/status
```

### Información de versión
```bash
curl http://localhost:3000/api/v2/app/version
```

## 🧪 Pruebas

### Probar SSE en JavaScript
```javascript
const eventSource = new EventSource('http://localhost:3000/api/v2/events/stream?token=YOUR_TOKEN');

eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('Evento recibido:', data);
};

eventSource.addEventListener('cliente_creado', function(event) {
    const data = JSON.parse(event.data);
    console.log('Nuevo cliente:', data);
});
```

### Enviar notificación de prueba
```bash
curl -X POST http://localhost:3000/api/v2/events/test
```

## 📋 Estados de implementación

### ✅ Completado
- [x] Sistema SSE base
- [x] Migración de autenticación a Turso
- [x] Controlador de clientes con SSE
- [x] Middlewares adaptados
- [x] Configuración de versiones
- [x] Documentación Swagger

### 🚧 En desarrollo
- [ ] Controladores de medidores, lecturas, facturas, pagos, tarifas, rutas
- [ ] Pruebas unitarias
- [ ] Optimizaciones de rendimiento

## 🔧 Configuración de desarrollo

1. **Instalar dependencias** (ya están instaladas):
   ```bash
   npm install
   ```

2. **Configurar variables de entorno**:
   ```env
   TURSO_DATABASE_URL=your_database_url
   TURSO_AUTH_TOKEN=your_auth_token
   JWT_SECRET=your_jwt_secret
   SECRET_APP_KEY=your_app_key
   ```

3. **Iniciar el servidor**:
   ```bash
   npm run dev
   ```

4. **Probar la API**:
   - v1: http://localhost:3000/api/v1
   - v2: http://localhost:3000/api/v2
   - SSE: http://localhost:3000/api/v2/events/stream
   - Docs: http://localhost:3000/api-docs

## 📚 Documentación adicional

- [Swagger UI](http://localhost:3000/api-docs) - Documentación interactiva
- [Versiones disponibles](http://localhost:3000/api/versions)
- [Health Check](http://localhost:3000/api/health)

---

**Nota**: Esta es la versión 2.0 que coexiste con la v1. Ambas versiones están completamente funcionales y pueden usarse según las necesidades del proyecto.
