# Clientes - Endpoints

## Autenticación Requerida
```http
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## POST /api/v2/clientes

**Crear cliente**

### Request
```json
{
  "nombre": "Juan Pérez",
  "direccion": "Calle Principal 123",
  "telefono": "555-0001",
  "correo": "juan@example.com",
  "ciudad": "Ciudad Test",
  "estado_cliente": "Activo",
  "tarifa_id": 1
}
```

### Response 201
```json
{
  "mensaje": "Cliente registrado exitosamente",
  "cliente_id": 1
}
```

---

## GET /api/v2/clientes

**Listar clientes**

### Query Params
- `nombre` (string, opcional)
- `ciudad` (string, opcional)
- `limit` (number, opcional)
- `offset` (number, opcional)

### Response 200
```json
{
  "clientes": [
    {
      "id": 1,
      "nombre": "Juan Pérez",
      "direccion": "Calle Principal 123",
      "telefono": "555-0001",
      "correo": "juan@example.com",
      "ciudad": "Ciudad Test",
      "tarifa_id": 1,
      "tarifa_nombre": "Residencial",
      "medidor_id": 1,
      "medidor_numero": "MED-001",
      "estado_servicio": "Activo",
      "fecha_creacion": "2026-01-15T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

---

## GET /api/v2/clientes/:id

**Obtener cliente**

### Response 200
```json
{
  "id": 1,
  "nombre": "Juan Pérez",
  "direccion": "Calle Principal 123",
  "telefono": "555-0001",
  "correo": "juan@example.com",
  "ciudad": "Ciudad Test",
  "tarifa_id": 1,
  "medidor_id": 1,
  "fecha_creacion": "2026-01-15T10:30:00.000Z"
}
```

---

## PUT /api/v2/clientes/:id

**Actualizar cliente**

### Request
```json
{
  "nombre": "Juan Pérez García",
  "telefono": "555-0002",
  "medidor_id": 2
}
```

### Response 200
```json
{
  "mensaje": "Cliente actualizado exitosamente"
}
```

---

## DELETE /api/v2/clientes/:id

**Eliminar cliente**

### Response 200
```json
{
  "mensaje": "Cliente eliminado exitosamente"
}
```
