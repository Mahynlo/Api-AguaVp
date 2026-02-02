# Lecturas - Endpoints

## Autenticación Requerida
```http
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## POST /api/v2/lecturas

**Registrar lectura**

### Request
```json
{
  "medidor_id": 1,
  "fecha_lectura": "2026-01-15",
  "consumo_m3": 25,
  "periodo": "2026-01",
  "observaciones": "Lectura normal",
  "modificado_por": 1
}
```

### Response 201
```json
{
  "mensaje": "Lectura registrada exitosamente",
  "lectura_id": 1
}
```

---

## GET /api/v2/lecturas

**Listar lecturas**

### Query Params
- `medidor_id` (number, opcional)
- `periodo` (string, opcional) - YYYY-MM
- `fecha_inicio` (string, opcional) - YYYY-MM-DD
- `fecha_fin` (string, opcional) - YYYY-MM-DD
- `limit` (number, opcional)
- `offset` (number, opcional)

### Response 200
```json
{
  "lecturas": [
    {
      "id": 1,
      "medidor_id": 1,
      "medidor_numero": "MED-001",
      "cliente_nombre": "Juan Pérez",
      "fecha_lectura": "2026-01-15",
      "consumo_m3": 25,
      "periodo": "2026-01",
      "observaciones": "Lectura normal"
    }
  ],
  "total": 1
}
```

---

## GET /api/v2/lecturas/:id

**Obtener lectura**

### Response 200
```json
{
  "id": 1,
  "medidor_id": 1,
  "fecha_lectura": "2026-01-15",
  "consumo_m3": 25,
  "periodo": "2026-01",
  "observaciones": "Lectura normal"
}
```

---

## PUT /api/v2/lecturas/:id

**Actualizar lectura**

### Request
```json
{
  "consumo_m3": 26,
  "observaciones": "Lectura corregida",
  "modificado_por": 1
}
```

### Response 200
```json
{
  "mensaje": "Lectura actualizada exitosamente"
}
```

---

## DELETE /api/v2/lecturas/:id

**Eliminar lectura**

### Response 200
```json
{
  "mensaje": "Lectura eliminada exitosamente"
}
```
