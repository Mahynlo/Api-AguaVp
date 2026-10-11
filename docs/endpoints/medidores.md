# Medidores - Endpoints

## Autenticación Requerida
```http
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## POST /api/v2/medidores

**Crear medidor**

### Request
```json
{
  "cliente_id": 1,
  "numero_serie": "MED-001",
  "ubicacion": "Ubicación 1",
  "estado_medidor": "Activo",
  "estado_servicio": "Activo",
  "modificado_por": 1
}
```

### Response 201
```json
{
  "mensaje": "Medidor registrado exitosamente",
  "medidor_id": 1
}
```

---

## GET /api/v2/medidores

**Listar medidores**

### Query Params
- `cliente_id` (number, opcional)
- `estado_servicio` (string, opcional) - Activo, Cortado, Suspendido
- `limit` (number, opcional)
- `offset` (number, opcional)

### Response 200
```json
{
  "medidores": [
    {
      "id": 1,
      "cliente_id": 1,
      "cliente_nombre": "Juan Pérez",
      "numero_serie": "MED-001",
      "ubicacion": "Ubicación 1",
      "estado_medidor": "Activo",
      "estado_servicio": "Activo",
      "fecha_instalacion": "2026-01-15T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

---

## GET /api/v2/medidores/:id

**Obtener medidor**

### Response 200
```json
{
  "id": 1,
  "cliente_id": 1,
  "numero_serie": "MED-001",
  "ubicacion": "Ubicación 1",
  "estado_medidor": "Activo",
  "estado_servicio": "Activo",
  "fecha_instalacion": "2026-01-15T10:30:00.000Z"
}
```

---

## PUT /api/v2/medidores/:id

**Actualizar medidor**

### Request
```json
{
  "ubicacion": "Nueva ubicación",
  "estado_servicio": "Cortado",
  "modificado_por": 1
}
```

### Response 200
```json
{
  "mensaje": "Medidor actualizado exitosamente"
}
```

---

## DELETE /api/v2/medidores/:id

**Eliminar medidor**

### Response 200
```json
{
  "mensaje": "Medidor eliminado exitosamente"
}
```
