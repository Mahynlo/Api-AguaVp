# 📚 Rutas API v2 - Endpoints

> Documentación de endpoints con parámetros y body requeridos

---

## 📱 APP - Gestión de Aplicación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/app/registrarApp` | Registrar nueva aplicación |
| POST | `/api/v2/app/recuperarToken` | Recuperar token expirado |
| GET | `/api/v2/app/version` | Información de versión API |
| GET | `/api/v2/app/status` | Estado de aplicación y servicios |

### POST /registrarApp
```json
{
  "nombre": "Sistema de Agua Potable"
}
```

### POST /recuperarToken
- Requiere header `x-app-key`
- Sin body

### GET /version
- Requiere header `x-app-key`
- Sin body

### GET /status
- Requiere header `x-app-key`
- Sin body

---

## 🔐 AUTH - Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/auth/login` | Iniciar sesión |
| POST | `/api/v2/auth/register` | Registrar usuario |
| POST | `/api/v2/auth/logout` | Cerrar sesión actual |
| GET | `/api/v2/auth/sesionesActivas/:usuarioId` | Obtener sesiones activas |
| POST | `/api/v2/auth/refresh` | Renovar access token |
| POST | `/api/v2/auth/revoke` | Revocar refresh token |
| DELETE | `/api/v2/auth/sesiones/:sesionId` | Cerrar sesión específica por ID |
| DELETE | `/api/v2/auth/sesiones/usuario/:usuarioId/todas` | Cerrar todas las sesiones del usuario |

### POST /login
```json
{
  "correo": "admin@aguavp.com",
  "contraseña": "Password123!@#",
  "dispositivo": "Chrome/Windows"
}
```

### POST /register
```json
{
  "correo": "nuevo@email.com",
  "nombre": "Juan Pérez",
  "contrasena": "Password123!@#",
  "username": "jperez",
  "rol": "operador" // superadmin | administrador | operador
}
```

### POST /logout
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..." //de acceso
}
```

### GET /sesionesActivas/:usuarioId
- Parámetro de ruta: `usuarioId`
- Requiere header `x-app-key`

### POST /refresh
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### POST /revoke
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### DELETE /sesiones/:sesionId
- Parámetro de ruta: `sesionId`
- Requiere headers: `x-app-key`, `Authorization: Bearer <token>`
- Sin body

### DELETE /sesiones/usuario/:usuarioId/todas
- Parámetro de ruta: `usuarioId`
- Query opcional: `?excepto_actual=true`
- Requiere headers: `x-app-key`, `Authorization: Bearer <token>`
- Sin body

---

## 👥 CLIENTES - Gestión de Clientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/clientes/registrar` | Registrar nuevo cliente |
| GET | `/api/v2/clientes/listar` | Listar todos los clientes |
| PUT | `/api/v2/clientes/modificar/:id` | Modificar cliente existente |
| PUT | `/api/v2/clientes/:id/asignar-tarifa` | Asignar tarifa a cliente |
| GET | `/api/v2/clientes/estadisticas` | Estadísticas y analíticas |
| DELETE | `/api/v2/clientes/:id/eliminar` | Eliminar cliente (soft delete) |
| PUT | `/api/v2/clientes/:id/restaurar` | Restaurar cliente eliminado |
| GET | `/api/v2/clientes/eliminados` | Obtener clientes eliminados |

### POST /registrar
```json
{
  "nombre": "Juan Carlos",
  "apellido": "García López",
  "correo": "juan.garcia@email.com",
  "telefono": "+57 300 123 4567",
  "direccion": "Calle 123 #45-67",
  "ciudad": "Bogotá",
  "estado_cliente": "activo", // activo | inactivo | suspendido | moroso
  "modificado_por": "admin"
}
```

### PUT /modificar/:id
- Parámetro de ruta: `id`
```json
{
  "nombre": "Juan Carlos", // opcional
  "apellido": "García López", // opcional
  "correo": "nuevo@email.com", // opcional
  "telefono": "+57 300 999 9999", // opcional
  "direccion": "Nueva Calle 456", // opcional
  "ciudad": "Medellín", // opcional
  "estado_cliente": "suspendido", // opcional
  "modificado_por": "admin"
}
```

### PUT /:id/asignar-tarifa
- Parámetro de ruta: `id`
```json
{
  "tarifa_id": 5
}
```

### DELETE /:id/eliminar
- Parámetro de ruta: `id`
```json
{
  "razon": "Cliente duplicado" // opcional
}
```

### PUT /:id/restaurar
- Parámetro de ruta: `id`
- Sin body

---

## 📡 EVENTS - Server-Sent Events

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v2/events/stream` | Establecer conexión SSE |
| GET | `/api/v2/events/health` | Health check del sistema SSE |
| GET | `/api/v2/events/stats` | Estadísticas del sistema SSE |
| POST | `/api/v2/events/notify` | Enviar notificación manual |
| POST | `/api/v2/events/test` | Probar conexión SSE |

---

## 📄 FACTURAS - Gestión de Facturas

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/facturas/generar` | Generar nueva factura |
| GET | `/api/v2/facturas/listar` | Listar todas las facturas |
| GET | `/api/v2/facturas/listar/:id` | Obtener factura específica |
| PUT | `/api/v2/facturas/modificar/:id` | Modificar factura existente |

### POST /generar
```json
{
  "lectura_id": 123,
  "cliente_id": 45,
  "medidor_id": 67,
  "periodo": "2024-01",
  "consumo_m3": 15.5,
  "generado_por": "admin",
  "tarifa_id": 2, // opcional
  "observaciones": "Consumo normal" // opcional
}
```

### PUT /modificar/:id
- Parámetro de ruta: `id`
```json
{
  "consumo_m3": 16.0, // opcional
  "estado_factura": "pagada", // opcional: pendiente | pagada | vencida | anulada
  "fecha_vencimiento": "2024-02-15", // opcional
  "observaciones": "Pago confirmado", // opcional
  "modificado_por": "admin"
}
```

---

## 📊 LECTURAS - Gestión de Lecturas

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/lecturas/registrar` | Registrar nueva lectura |
| GET | `/api/v2/lecturas/listar` | Listar todas las lecturas |
| GET | `/api/v2/lecturas/listar/:id` | Obtener lectura específica |
| PUT | `/api/v2/lecturas/modificar/:id` | Modificar lectura existente |
| GET | `/api/v2/lecturas/por-ruta` | Lecturas por ruta y período |
| POST | `/api/v2/lecturas/generar-facturas-masivo` | Generar facturas masivas |
| GET | `/api/v2/lecturas/medidor/:id` | Historial completo del medidor |
| GET | `/api/v2/lecturas/cliente/:id` | Todas las lecturas del cliente |

### POST /registrar
```json
{
  "medidor_id": 67,
  "cliente_id": 45,
  "lectura_actual": 1520.5,
  "fecha_lectura": "2024-01-15",
  "ruta_id": 3,
  "tomada_por": "operador1",
  "observaciones": "Lectura normal", // opcional
  "periodo": "2024-01" // opcional
}
```

### PUT /modificar/:id
- Parámetro de ruta: `id`
```json
{
  "lectura_actual": 1521.0, // opcional
  "fecha_lectura": "2024-01-16", // opcional
  "observaciones": "Corrección", // opcional
  "modificado_por": "admin", // opcional
  "estado_lectura": "verificada" // opcional
}
```

### GET /por-ruta
- Query params: `?ruta_id=3&periodo=2024-01`

### POST /generar-facturas-masivo
```json
{
  "periodo": "2024-01", // opcional
  "ruta_id": 3, // opcional
  "limite_procesamiento": 100, // opcional
  "generado_por": "admin"
}
```

---

## 💧 MEDIDORES - Gestión de Medidores

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/medidores/registrar` | Registrar nuevo medidor |
| GET | `/api/v2/medidores/listar` | Listar todos los medidores |
| PUT | `/api/v2/medidores/modificar/:id` | Modificar medidor existente |

### POST /registrar
```json
{
  "numero_medidor": "MED-2024-001",
  "marca": "AquaTech",
  "modelo": "AT-500",
  "fecha_instalacion": "2024-01-10",
  "estado_medidor": "activo", // activo | inactivo | mantenimiento | dañado
  "ubicacion": "Sector Norte", // opcional
  "lectura_inicial": 1000.0, // opcional
  "cliente_asignado": 45, // opcional
  "registrado_por": "admin",
  "observaciones": "Instalación nueva" // opcional
}
```

### PUT /modificar/:id
- Parámetro de ruta: `id`
```json
{
  "marca": "AquaTech Pro", // opcional
  "modelo": "AT-600", // opcional
  "estado_medidor": "inactivo", // opcional
  "ubicacion": "Sector Sur", // opcional
  "cliente_asignado": 50, // opcional
  "observaciones": "Actualizado", // opcional
  "modificado_por": "admin"
}
```

---

## 💰 PAGOS - Gestión de Pagos

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/pagos/registrar` | Registrar nuevo pago |
| GET | `/api/v2/pagos/listar` | Listar todos los pagos |
| GET | `/api/v2/pagos/listar/:id` | Obtener pago específico |
| PUT | `/api/v2/pagos/modificar/:id` | Modificar pago existente |

### POST /registrar
```json
{
  "factura_id": 123,
  "cliente_id": 45,
  "monto_pagado": 85000,
  "metodo_pago": "efectivo", // efectivo | transferencia | tarjeta | cheque
  "fecha_pago": "2024-01-20",
  "recibido_por": "cajero1",
  "numero_referencia": "REF-001", // opcional
  "observaciones": "Pago completo" // opcional
}
```

### PUT /modificar/:id
- Parámetro de ruta: `id`
```json
{
  "monto_pagado": 90000, // opcional
  "metodo_pago": "transferencia", // opcional
  "fecha_pago": "2024-01-21", // opcional
  "numero_referencia": "REF-002", // opcional
  "observaciones": "Ajuste", // opcional
  "modificado_por": "admin", // opcional
  "estado_pago": "verificado" // opcional: pendiente | completado | verificado | rechazado
}
```

---

## 🗺️ RUTAS - Gestión de Rutas de Distribución

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/rutas/crear` | Crear nueva ruta distribución |
| POST | `/api/v2/rutas/agregar-medidor` | Agregar medidor a ruta |
| GET | `/api/v2/rutas/:ruta_id/medidores` | Ruta con medidores asignados |
| GET | `/api/v2/rutas/listar` | Listar todas las rutas |
| PUT | `/api/v2/rutas/:ruta_id` | Modificar información de ruta |
| DELETE | `/api/v2/rutas/:ruta_id/medidores/:medidor_id` | Eliminar medidor de ruta |
| PUT | `/api/v2/rutas/:ruta_id/reordenar` | Reordenar medidores en ruta |
| GET | `/api/v2/rutas/:ruta_id/progreso` | Obtener progreso y estadísticas |

### POST /crear
```json
{
  "nombre": "Ruta Norte 1",
  "descripcion": "Zona residencial norte",
  "creado_por": 10,
  "distancia_km": 8.5,
  "ruta_calculada": [
    { "lat": 4.6097, "lng": -74.0817 },
    { "lat": 4.6105, "lng": -74.0825 }
  ],
  "instrucciones": [
    "Girar a la derecha en Calle 45",
    "Continuar 2km por Carrera 30"
  ],
  "puntos": [
    { "id": 67 },
    { "id": 68 },
    { "id": 69 }
  ]
}
```
**Nota**: Valida que los medidores no estén en otra ruta antes de crear.

### POST /agregar-medidor
```json
{
  "ruta_id": 3,
  "medidor_id": 67,
  "orden": 5
}
```
**Nota**: Valida que el medidor no esté en otra ruta. Retorna error 409 si ya está asignado.

### GET /:ruta_id/medidores
- Parámetro de ruta: `ruta_id`
- Requiere header `x-app-key`
- Sin body

**Respuesta**:
```json
{
  "ruta": {
    "ruta_id": 3,
    "nombre": "Ruta Norte 1",
    "descripcion": "Zona residencial norte",
    "puntos": [
      {
        "orden": 1,
        "medidor_id": 67,
        "numero_serie": "MED-001",
        "ubicacion": "Calle 45 #30-25",
        "latitud": 4.6097,
        "longitud": -74.0817,
        "estado_medidor": "activo",
        "cliente_id": 45,
        "cliente_nombre": "Juan Pérez",
        "cliente_direccion": "Calle 45 #30-25",
        "cliente_telefono": "+57 300 123 4567",
        "estado_cliente": "activo"
      }
    ]
  }
}
```

### GET /listar
- Query opcional: `?periodo=2025-12`
- Requiere header `x-app-key`
- Sin body

**Respuesta**:
```json
{
  "periodo": "2025-12",
  "rutas": [
    {
      "id": 3,
      "nombre": "Ruta Norte 1",
      "descripcion": "Zona residencial norte",
      "fecha_creacion": "2025-12-10T10:30:00Z",
      "distancia_km": 8.5,
      "creado_por": 10,
      "total_puntos": 120,
      "completadas": 95,
      "faltantes": 25,
      "porcentaje_completado": 79,
      "numeros_serie": ["MED-001", "MED-002", "..."],
      "medidores_completados": ["MED-001", "MED-005", "..."],
      "medidores_faltantes": ["MED-002", "MED-008", "..."],
      "periodo_mostrado": "2025-12"
    }
  ]
}
```

### PUT /:ruta_id
- Parámetro de ruta: `ruta_id`
```json
{
  "nombre": "Ruta Norte 1 - Actualizada",
  "descripcion": "Nueva descripción de la zona",
  "distancia_km": 9.2,
  "ruta_calculada": [
    { "lat": 4.6097, "lng": -74.0817 },
    { "lat": 4.6110, "lng": -74.0830 }
  ],
  "instrucciones": [
    "Nueva instrucción 1",
    "Nueva instrucción 2"
  ],
  "puntos": [
    { "id": 70 },
    { "id": 68 },
    { "id": 67 }
  ]
}
```
**Nota**: 
- Todos los campos son opcionales. Solo se actualizan los campos enviados.
- Si envías `puntos`, se **reemplazan TODOS** los medidores de la ruta con los nuevos.
- El orden se asigna automáticamente según el orden del array (1, 2, 3...).
- Ideal para cuando recalculas la ruta completa en la app y necesitas actualizar todo de una vez.
- Valida que los medidores no estén en otra ruta (retorna error 409 si hay conflicto).
Respuesta:
{
  "success": true,
  "mensaje": "Ruta actualizada correctamente",
  "ruta_id": 3,
  "medidores_actualizados": 3
}

### DELETE /:ruta_id/medidores/:medidor_id
- Parámetros de ruta: `ruta_id`, `medidor_id`
- Requiere headers: `x-app-key`, `Authorization: Bearer <token>`
- Sin body

**Respuesta**:
```json
{
  "success": true,
  "mensaje": "Medidor eliminado de la ruta y orden actualizado",
  "ruta_id": 3,
  "medidor_id": 67
}
```
**Nota**: Automáticamente reordena los medidores restantes para mantener orden consecutivo.

### PUT /:ruta_id/reordenar
- Parámetro de ruta: `ruta_id`
```json
{
  "orden": [
    { "medidor_id": 70, "orden": 1 },
    { "medidor_id": 68, "orden": 2 },
    { "medidor_id": 67, "orden": 3 },
    { "medidor_id": 69, "orden": 4 }
  ]
}
```
**Nota**: Debe incluir todos los medidores que se desean reordenar. Valida que pertenezcan a la ruta.

**Respuesta**:
```json
{
  "success": true,
  "mensaje": "Orden de medidores actualizado correctamente",
  "ruta_id": 3,
  "medidores_actualizados": 4
}
```

### GET /:ruta_id/progreso
- Parámetro de ruta: `ruta_id`
- Query opcional: `?periodo=2025-12`
- Requiere headers: `x-app-key`, `Authorization: Bearer <token>`
- Sin body

**Respuesta**:
```json
{
  "ruta": {
    "id": 3,
    "nombre": "Ruta Norte 1",
    "descripcion": "Zona residencial norte"
  },
  "periodo": "2025-12",
  "resumen": {
    "total_medidores": 120,
    "medidores_leidos": 95,
    "medidores_pendientes": 25,
    "porcentaje_completado": 79,
    "porcentaje_pendiente": 21
  },
  "detalle": {
    "medidores_leidos": [
      {
        "medidor_id": 67,
        "numero_serie": "MED-001",
        "ubicacion": "Calle 45 #30-25",
        "orden": 1,
        "cliente_nombre": "Juan Pérez",
        "estado": "Leído",
        "consumo": 15.3,
        "fecha_lectura": "2025-12-05T08:30:00Z"
      }
    ],
    "medidores_pendientes": [
      {
        "medidor_id": 68,
        "numero_serie": "MED-002",
        "ubicacion": "Calle 46 #31-10",
        "orden": 2,
        "cliente_nombre": "María García",
        "estado": "Pendiente",
        "consumo": null,
        "fecha_lectura": null
      }
    ]
  },
  "todos_los_medidores": [
    {
      "medidor_id": 67,
      "numero_serie": "MED-001",
      "ubicacion": "Calle 45 #30-25",
      "orden": 1,
      "cliente_nombre": "Juan Pérez",
      "estado": "Leído",
      "consumo": 15.3,
      "fecha_lectura": "2025-12-05T08:30:00Z"
    },
    {
      "medidor_id": 68,
      "numero_serie": "MED-002",
      "ubicacion": "Calle 46 #31-10",
      "orden": 2,
      "cliente_nombre": "María García",
      "estado": "Pendiente",
      "consumo": null,
      "fecha_lectura": null
    }
  ]
}
```

---

## 💵 TARIFAS - Gestión de Tarifas

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v2/tarifas/registrar` | Registrar tarifa básica |
| POST | `/api/v2/tarifas/registrar-rangos` | Registrar tarifa con rangos |
| GET | `/api/v2/tarifas/listar` | Listar tarifas activas |
| GET | `/api/v2/tarifas/listarHistorico` | Historial completo de tarifas |
| PUT | `/api/v2/tarifas/modificar/:id` | Modificar tarifa específica |
| PUT | `/api/v2/tarifas/modificar-rangos/:id` | Modificar rangos de tarifa |
| GET | `/api/v2/tarifas/:id` | Obtener tarifa por ID |
| GET | `/api/v2/tarifas/activas/listar` | Tarifas vigentes |
| GET | `/api/v2/tarifas/:id/historial` | Historial de cambios de precios |

### POST /registrar
```json
{
  "nombre": "Tarifa Residencial",
  "descripcion": "Tarifa para uso doméstico",
  "precio_base": 5000,
  "tipo": "residencial",
  "estado": "activa", // opcional
  "fecha_vigencia": "2024-01-01",
  "usuario_id": 1
}
```

### POST /registrar-rangos
```json
{
  "tarifa": {
    "nombre": "Tarifa Escalonada",
    "descripcion": "Tarifa por rangos de consumo",
    "tipo": "residencial",
    "fecha_vigencia": "2024-01-01",
    "usuario_id": 1
  },
  "rangos": [
    {
      "rango_desde": 0,
      "rango_hasta": 10,
      "precio_m3": 3000,
      "descripcion": "Consumo básico"
    },
    {
      "rango_desde": 11,
      "rango_hasta": 20,
      "precio_m3": 4500,
      "descripcion": "Consumo medio"
    },
    {
      "rango_desde": 21,
      "rango_hasta": null,
      "precio_m3": 6000,
      "descripcion": "Consumo alto"
    }
  ]
}
```

### PUT /modificar/:id
- Parámetro de ruta: `id`
```json
{
  "nombre": "Tarifa Residencial Plus", // opcional
  "descripcion": "Nueva descripción", // opcional
  "precio_base": 5500, // opcional
  "estado": "inactiva", // opcional
  "fecha_fin": "2024-12-31" // opcional
}
```

### PUT /modificar-rangos/:id
- Parámetro de ruta: `id`
```json
{
  "rangos": [
    {
      "rango_desde": 0,
      "rango_hasta": 15,
      "precio_m3": 3500,
      "descripcion": "Consumo básico actualizado"
    },
    {
      "rango_desde": 16,
      "rango_hasta": null,
      "precio_m3": 5500,
      "descripcion": "Consumo alto"
    }
  ]
}
```

---

## 📝 Notas Generales

### Headers Requeridos
```http
x-app-key: AppKey eyJhbGciOiJIUzI1NiIs...
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

### Estados Comunes
- **Clientes**: `activo`, `inactivo`, `suspendido`, `moroso`
- **Medidores**: `activo`, `inactivo`, `mantenimiento`, `dañado`
- **Facturas**: `pendiente`, `pagada`, `vencida`, `anulada`
- **Pagos**: `pendiente`, `completado`, `verificado`, `rechazado`
- **Rutas**: `activa`, `inactiva`
- **Tarifas**: `activa`, `inactiva`

### Métodos de Pago
- `efectivo`, `transferencia`, `tarjeta`, `cheque`

### Roles de Usuario
- `superadmin`, `administrador`, `operador`, `usuario`

---

**Base URL Producción**: `https://api-aguavp.onrender.com`

**Base URL Desarrollo**: `http://localhost:3000`

**Versión API**: 2.0.0
