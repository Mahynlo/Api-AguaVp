# Facturas - Endpoints

## Autenticación Requerida
```http
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## POST /api/v2/facturas

**Generar factura**

### Request
```json
{
  "lectura_id": 1,
  "cliente_id": 1,
  "tarifa_id": 1,
  "consumo_m3": 25,
  "fecha_emision": "2026-01-15",
  "modificado_por": 1
}
```

### Response 201
```json
{
  "mensaje": "Factura generada exitosamente",
  "factura_id": 1,
  "total_calculado": 387.50,
  "detalles": {
    "consumo_m3": 25,
    "total": 387.50,
    "fecha_vencimiento": "2026-02-14"
  }
}
```

---

## GET /api/v2/facturas

**Listar facturas**

### Query Params
- `periodo` (string, opcional) - Formato: YYYY-MM
- `estado` (string, opcional) - Pendiente, Pagado, Parcial, Vencida
- `cliente_id` (number, opcional)
- `limit` (number, opcional)
- `offset` (number, opcional)

### Response 200
```json
{
  "facturas": [
    {
      "id": 1,
      "cliente_id": 1,
      "cliente_nombre": "Juan Pérez",
      "lectura_id": 1,
      "tarifa_id": 1,
      "tarifa_nombre": "Residencial",
      "consumo_m3": 25,
      "total": 387.50,
      "saldo_pendiente": 0,
      "estado": "Pagado",
      "fecha_emision": "2026-01-15",
      "fecha_vencimiento": "2026-02-14",
      "periodo": "2026-01"
    }
  ],
  "total": 1,
  "estadisticas": {
    "total_facturado": 387.50,
    "total_pendiente": 0,
    "facturas_pendientes": 0
  }
}
```

---

## GET /api/v2/facturas/:id

**Obtener factura**

### Response 200
```json
{
  "id": 1,
  "cliente_nombre": "Juan Pérez",
  "medidor_numero": "MED-001",
  "consumo_m3": 25,
  "total": 387.50,
  "saldo_pendiente": 0,
  "estado": "Pagado",
  "fecha_emision": "2026-01-15",
  "fecha_vencimiento": "2026-02-14",
  "periodo": "2026-01"
}
```

---

## PUT /api/v2/facturas/:id

**Actualizar factura**

### Request
```json
{
  "estado": "Vencida",
  "modificado_por": 1
}
```

### Response 200
```json
{
  "mensaje": "Factura actualizada exitosamente"
}
```

---

## PUT /api/v2/facturas/:id/estado

**Cambiar estado**

### Request
```json
{
  "estado": "Pagado",
  "modificado_por": 1
}
```

### Response 200
```json
{
  "mensaje": "Estado actualizado a Pagado"
}
```
