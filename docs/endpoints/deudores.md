# Deudores - Endpoints

## Autenticación Requerida
```http
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## GET /api/v2/deudores/candidatos

**Detectar candidatos a corte**

### Response 200
```json
{
  "umbral_corte": 4,
  "dias_gracia": 7,
  "total_candidatos": 1,
  "candidatos": [
    {
      "medidor": {
        "id": 1,
        "serial": "MED-001",
        "ubicacion": "Ubicación 1",
        "estado": "Activo"
      },
      "cliente": {
        "id": 1,
        "nombre": "Juan Pérez",
        "direccion": "Calle Principal 123",
        "telefono": "555-0001"
      },
      "deuda": {
        "facturas_vencidas": 5,
        "total": 2500,
        "fecha_mas_antigua": "2025-12-01"
      }
    }
  ]
}
```

---

## POST /api/v2/deudores/cortar

**Ejecutar corte**

### Request
```json
{
  "medidor_id": 1,
  "motivo": "Deuda acumulada - 5 facturas vencidas",
  "observaciones": "Cliente notificado previamente",
  "autorizado_por": 1
}
```

### Response 200
```json
{
  "success": true,
  "message": "Corte ejecutado correctamente",
  "medidor_id": 1,
  "corte_id": 1
}
```

---

## POST /api/v2/deudores/reconectar

**Procesar reconexión**

### Request
```json
{
  "medidor_id": 1,
  "observaciones": "Cliente pagó deuda completa",
  "autorizado_por": 1
}
```

### Response 200
```json
{
  "success": true,
  "message": "Reconexión autorizada - Servicio restablecido",
  "medidor_id": 1
}
```

---

## POST /api/v2/deudores/convenios

**Crear convenio de pago**

### Request
```json
{
  "medidor_id": 1,
  "monto_inicial": 500,
  "numero_parcialidades": 8,
  "periodicidad": "mensual",
  "observaciones": "Cliente solicita convenio",
  "autorizado_por": 1
}
```

### Response 201
```json
{
  "success": true,
  "message": "Convenio creado exitosamente",
  "convenio_id": 1,
  "detalle": {
    "deuda_original": 2500,
    "pago_inicial": 500,
    "saldo_diferido": 2000,
    "cuotas": 8,
    "monto_por_cuota": 250
  },
  "parcialidades": [
    {
      "numero": 1,
      "monto": 250,
      "vencimiento": "2026-02-15"
    }
  ]
}
```
