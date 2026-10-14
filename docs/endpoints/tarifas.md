# Tarifas - Endpoints

## Autenticación Requerida
```http
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## POST /api/v2/tarifas

**Crear tarifa**

### Request
```json
{
  "nombre": "Residencial",
  "descripcion": "Tarifa para uso residencial",
  "modificado_por": 1
}
```

### Response 201
```json
{
  "mensaje": "Tarifa registrada exitosamente",
  "tarifa_id": 1
}
```

---

## POST /api/v2/tarifas/:id/rangos

**Agregar rango a tarifa**

### Request
```json
{
  "tarifa_id": 1,
  "consumo_min": 0,
  "consumo_max": 50,
  "precio_por_m3": 15.50,
  "modificado_por": 1
}
```

### Response 201
```json
{
  "mensaje": "Rango agregado exitosamente",
  "rango_id": 1
}
```

---

## GET /api/v2/tarifas

**Listar tarifas**

### Response 200
```json
{
  "tarifas": [
    {
      "id": 1,
      "nombre": "Residencial",
      "descripcion": "Tarifa para uso residencial",
      "rangos": [
        {
          "id": 1,
          "consumo_min": 0,
          "consumo_max": 50,
          "precio_por_m3": 15.50
        },
        {
          "id": 2,
          "consumo_min": 51,
          "consumo_max": 100,
          "precio_por_m3": 20.00
        }
      ]
    }
  ],
  "total": 1
}
```

---

## GET /api/v2/tarifas/:id

**Obtener tarifa**

### Response 200
```json
{
  "id": 1,
  "nombre": "Residencial",
  "descripcion": "Tarifa para uso residencial",
  "rangos": [
    {
      "id": 1,
      "consumo_min": 0,
      "consumo_max": 50,
      "precio_por_m3": 15.50
    }
  ]
}
```

---

## PUT /api/v2/tarifas/:id

**Actualizar tarifa**

### Request
```json
{
  "nombre": "Residencial Premium",
  "descripcion": "Tarifa actualizada",
  "modificado_por": 1
}
```

### Response 200
```json
{
  "mensaje": "Tarifa actualizada exitosamente"
}
```

---

## DELETE /api/v2/tarifas/:id

**Eliminar tarifa**

### Response 200
```json
{
  "mensaje": "Tarifa eliminada exitosamente"
}
```
