# Rutas - Endpoints

## Autenticación Requerida
```http
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## POST /api/v2/rutas

**Crear ruta con puntos**

### Request
```json
{
  "nombre": "Ruta Centro",
  "descripcion": "Zona centro de la ciudad",
  "creado_por": 1,
  "distancia_km": 5.2,
  "ruta_calculada": [
    {"lat": 19.4326, "lng": -99.1332},
    {"lat": 19.4330, "lng": -99.1340}
  ],
  "instrucciones": [
    "Girar a la derecha en Calle Principal",
    "Continuar 200m"
  ],
  "puntos": [
    {"id": 1},
    {"id": 2},
    {"id": 3}
  ]
}
```

### Response 201
```json
{
  "mensaje": "✅ Ruta creada correctamente",
  "ruta_id": 1,
  "detalles": {
    "id": 1,
    "nombre": "Ruta Centro",
    "descripcion": "Zona centro de la ciudad",
    "creado_por": 1,
    "distancia_km": 5.2,
    "ruta_calculada": [...],
    "instrucciones": [...],
    "puntos": [
      {"medidor_id": 1, "orden": 1},
      {"medidor_id": 2, "orden": 2},
      {"medidor_id": 3, "orden": 3}
    ],
    "fecha_creacion": "2026-01-18T08:00:00.000Z"
  }
}
```

---

## GET /api/v2/rutas

**Listar rutas con progreso**

### Query Params
- `periodo` (string, opcional) - Formato: YYYY-MM

### Response 200
```json
{
  "periodo": "2026-01",
  "rutas": [
    {
      "id": 1,
      "nombre": "Ruta Centro",
      "descripcion": "Zona centro de la ciudad",
      "fecha_creacion": "2026-01-18T08:00:00.000Z",
      "distancia_km": 5.2,
      "creado_por": 1,
      "total_puntos": 3,
      "completadas": 2,
      "faltantes": 1,
      "porcentaje_completado": 67,
      "numeros_serie": ["MED-001", "MED-002", "MED-003"],
      "medidores_completados": ["MED-001", "MED-002"],
      "medidores_faltantes": ["MED-003"],
      "periodo_mostrado": "2026-01"
    }
  ]
}
```

---

## GET /api/v2/rutas/:ruta_id

**Obtener ruta con medidores ordenados**

### Response 200
```json
{
  "ruta": {
    "ruta_id": 1,
    "nombre": "Ruta Centro",
    "descripcion": "Zona centro de la ciudad",
    "puntos": [
      {
        "orden": 1,
        "medidor_id": 1,
        "numero_serie": "MED-001",
        "ubicacion": "Calle Principal 123",
        "latitud": 19.4326,
        "longitud": -99.1332,
        "estado_medidor": "Activo",
        "cliente_id": 1,
        "cliente_nombre": "Juan Pérez",
        "cliente_direccion": "Calle Principal 123",
        "cliente_telefono": "555-0001",
        "estado_cliente": "Activo"
      }
    ]
  }
}
```

---

## PUT /api/v2/rutas/:ruta_id

**Actualizar ruta**

### Request
```json
{
  "nombre": "Ruta Centro Actualizada",
  "descripcion": "Nueva descripción",
  "distancia_km": 6.0,
  "ruta_calculada": [...],
  "instrucciones": [...],
  "puntos": [
    {"id": 1},
    {"id": 3},
    {"id": 5}
  ]
}
```

### Response 200
```json
{
  "success": true,
  "mensaje": "Ruta actualizada correctamente",
  "ruta_id": 1,
  "medidores_actualizados": 3
}
```

---

## POST /api/v2/rutas/agregar-medidor

**Agregar medidor a ruta**

### Request
```json
{
  "ruta_id": 1,
  "medidor_id": 4,
  "orden": 4
}
```

### Response 201
```json
{
  "mensaje": "Medidor agregado a la ruta"
}
```

---

## DELETE /api/v2/rutas/:ruta_id/medidores/:medidor_id

**Eliminar medidor de ruta**

### Response 200
```json
{
  "success": true,
  "mensaje": "Medidor eliminado de la ruta y orden actualizado",
  "ruta_id": 1,
  "medidor_id": 4
}
```

---

## PUT /api/v2/rutas/:ruta_id/reordenar

**Reordenar medidores**

### Request
```json
{
  "orden": [
    {"medidor_id": 3, "orden": 1},
    {"medidor_id": 1, "orden": 2},
    {"medidor_id": 2, "orden": 3}
  ]
}
```

### Response 200
```json
{
  "success": true,
  "mensaje": "Orden de medidores actualizado correctamente",
  "ruta_id": 1,
  "medidores_actualizados": 3
}
```

---

## GET /api/v2/rutas/:ruta_id/progreso

**Obtener progreso de captura**

### Query Params
- `periodo` (string, opcional) - Formato: YYYY-MM

### Response 200
```json
{
  "ruta_id": 1,
  "nombre": "Ruta Centro",
  "periodo": "2026-01",
  "total_medidores": 3,
  "lecturas_completadas": 2,
  "lecturas_pendientes": 1,
  "porcentaje_completado": 67,
  "medidores": [
    {
      "medidor_id": 1,
      "numero_serie": "MED-001",
      "orden": 1,
      "tiene_lectura": true,
      "fecha_lectura": "2026-01-15"
    }
  ]
}
```

