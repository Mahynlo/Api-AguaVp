# Pagos - Endpoints

## Autenticación Requerida
```http
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## POST /api/v2/pagos

**Registrar pago**

### Request
```json
{
  "factura_id": 1,
  "fecha_pago": "2026-01-20",
  "cantidad_entregada": 400,
  "metodo_pago": "Efectivo",
  "comentario": "Pago completo"
}
```

### Response 201
```json
{
  "mensaje": "Pago registrado exitosamente",
  "pago_id": 1,
  "monto_aplicado": 387.50,
  "cambio": 12.50,
  "nuevo_saldo": 0,
  "estado_factura": "Pagado"
}
```

---

## GET /api/v2/pagos

**Listar pagos**

### Query Params
- `factura_id` (number, opcional)
- `metodo_pago` (string, opcional)
- `fecha_inicio` (string, opcional) - YYYY-MM-DD
- `fecha_fin` (string, opcional) - YYYY-MM-DD
- `limit` (number, opcional)
- `offset` (number, opcional)

### Response 200
```json
{
  "pagos": [
    {
      "id": 1,
      "factura_id": 1,
      "monto": 387.50,
      "metodo_pago": "Efectivo",
      "fecha_pago": "2026-01-20",
      "cantidad_entregada": 400,
      "cambio": 12.50,
      "comentario": "Pago completo",
      "cliente_nombre": "Juan Pérez",
      "fecha_creacion": "2026-01-20T10:30:00.000Z"
    }
  ],
  "total": 1,
  "total_pagado": 387.50
}
```

---

## GET /api/v2/pagos/:id

**Obtener pago**

### Response 200
```json
{
  "id": 1,
  "factura_id": 1,
  "monto": 387.50,
  "metodo_pago": "Efectivo",
  "fecha_pago": "2026-01-20",
  "cantidad_entregada": 400,
  "cambio": 12.50,
  "comentario": "Pago completo"
}
```

---

## PUT /api/v2/pagos/:id

**Actualizar pago**

### Request
```json
{
  "comentario": "Pago actualizado",
  "modificado_por": 1
}
```

### Response 200
```json
{
  "mensaje": "Pago actualizado exitosamente"
}
```

---

## DELETE /api/v2/pagos/:id

**Eliminar pago**

### Response 200
```json
{
  "mensaje": "Pago eliminado exitosamente"
}
```
