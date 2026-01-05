
## 🗳️ DASHBOARD - Panel de Control

Descripción general del estado del sistema.

### Headers Requeridos
Todas las peticiones a estos endpoints requieren autenticación de aplicación y usuario:
```http
x-app-key: AppKey <TOKEN_APP_KEY>
Authorization: Bearer <TOKEN_JWT_USUARIO>
Content-Type: application/json
```

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v2/dashboard/stats` | Estadísticas generales y gráficos |

### GET /stats
- **Descripción**: Retorna métricas clave para la pantalla principal.
- **Headers**: `Authorization: Bearer <token>`
- **Query Params**: Ninguno
- **Respuesta (JSON)**:
```json
{
  "tarjetas": {
    "consumo": {
        "actual": 1500, // número (m3)
        "anterior": 1450, // número
        "variacion": 3.4 // número (%)
    },
    "clientes": {
        "total": 500, // número
        "nuevos": 5,
        "activos": 480
    },
    "recaudo": {
        "actual": 25000,
        "anterior": 20000,
        "variacion": 25.0
    },
    "medidores": {
        "total": 1500,
        "nuevos_este_mes": 10,
        "crecimiento_nuevos": 5.0
    }
  },
  "graficos": {
    "consumo_mensual": [
        { "mes": "2024-01", "total": 1200 },
        { "mes": "2024-02", "total": 1300 }
    ],
    "estado_clientes": [
        { "estado": "Activo", "cantidad": 450 },
        { "estado": "Suspendido", "cantidad": 50 }
    ]
  },
  "meta": {
    "mes_actual": "2024-03",
    "mes_anterior": "2024-02"
  }
}
``` No devulve bien el grafico

---

## 📈 REPORTES - Reportes y Recibos

### Headers Requeridos
Todas las peticiones a estos endpoints requieren autenticación de aplicación y usuario:
```http
x-app-key: AppKey <TOKEN_APP_KEY>
Authorization: Bearer <TOKEN_JWT_USUARIO>
Content-Type: application/json
```
Generación de datos para impresión y análisis.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v2/reports/recibos` | Datos masivos para impresión de recibos |
| GET | `/api/v2/reports/financiero` | Ingresos, facturación y métodos de pago |
| GET | `/api/v2/reports/deudores` | Análisis detallado de cartera vencida |
| GET | `/api/v2/reports/lecturas` | Lista de lecturas por localidad (con coordenadas) |

### GET /recibos
### Headers Requeridos
Todas las peticiones a estos endpoints requieren autenticación de aplicación y usuario:
```http
x-app-key: AppKey <TOKEN_APP_KEY>
Authorization: Bearer <TOKEN_JWT_USUARIO>
Content-Type: application/json
```
Generación de datos para impresión y análisis.
- **Query Params**: `mes` (YYYY-MM, Requerido), `ruta_id` (Opcional), `estado_pago` (Opcional)
- **Ejemplo**: `?mes=2024-12&ruta_id=1`
- **Respuesta**:
```json
{
  "periodo": "2024-12",
  "total_recibos": 100,
  "recibos": [
    {
      "folio_factura": 12345,
      "datos_cliente": {
        "nombre": "Juan Pérez",
        "direccion": "Calle 123",
        "pueblo": "Nacori Grande"
      },
      "informacion_servicio": {
        "numero_medidor": "MED-001",
        "consumo_mes_m3": 15,
        "lectura_anterior": 100,
        "lectura_actual": 115
      },
      "detalle_facturacion": {
        "total_mes": 250.00,
        "saldo_pendiente_mes": 250.00,
        "deuda_acumulada_anterior": 50.00,
        "total_a_pagar": 300.00 // Suma total + anterior
      },
      "informacion_consumo": {
        "consumo_actual": 15,
        "consumo_anterior": 14,
        "variacion_porcentaje": 7.1
      }
    }
  ]
}
``` si ya esta pagado no lo muestra para cuando se reimorima por alguna razon 

### GET /financiero
- **Query Params**: `fecha_inicio` (YYYY-MM-DD), `fecha_fin` (YYYY-MM-DD)
- **Ejemplo**: `?fecha_inicio=2024-01-01&fecha_fin=2024-01-31`
- **Respuesta**:
```json
{
  "rango": { "inicio": "2024-01-01", "fin": "2024-01-31" },
  "resumen": {
    "total_facturado": 50000.00,
    "total_ingresos": 45000.00,
    "eficiencia_recaudo": "90.0%"
  },
  "ingresos_detalle": [
    { "metodo": "Efectivo", "total": 20000, "transacciones": 50 },
    { "metodo": "Transferencia", "total": 25000, "transacciones": 30 }
  ],
  "graficos": {
    "metodos_pago": {
        "labels": ["Efectivo", "Transferencia"],
        "data": [20000, 25000]
    }
  }
}
```

### GET /deudores
- **Descripción**: Dashboard de cobranza.
- **Respuesta**:
```json
{
  "resumen": {
    "deuda_vencida": 15000.00, // Total cartera vencida
    "clientes_morosos": 25, // Cantidad clientes
    "cortes_activos": 5, // Servicios cortados actualmente
    "convenios_activos": 3
  },
  "top_deudores": [
    {
      "id": 10,
      "nombre": "Pedro Infante",
      "numero_serie": "MED-999",
      "deuda_total": 5000.00,
      "facturas_vencidas": 8,
      "fecha_mas_antigua": "2023-05-01"
    }
  ],
  "antiguedad_deuda": [
    { "rango": "0-30 días", "total": 2000 },
    { "rango": "+90 días", "total": 8000 }
  ],
  "operatividad_mes": {
    "cortes": 2, // Cortes ejecutados este mes
    "reconexiones": 1
  }
}
```

### GET /lecturas
- **Descripción**: Genera lista para toma de lecturas, agrupada por localidad.
- **Query Params**: `mes` (YYYY-MM), `localidad` (Opcional).
- **Respuesta**:
```json
{
  "periodo_solicitado": "2024-03",
  "periodo_lectura_anterior": "2024-02",
  "total_general": 150,
  "datos": [
    {
      "localidad": "Nacori Grande",
      "total_clientes": 100,
      "clientes": [
        {
          "cliente": "Pedro Páramo",
          "medidor": {
            "serie": "MED-001",
            "ubicacion": "Entrada principal",
            "coordenadas": { "lat": 29.1234, "lng": -110.1234 }
          },
          "lectura_anterior": {
            "periodo": "2024-02",
            "valor": 1050, 
            "consumo_registrado": 15
          }
        }
      ]
    }
  ]
}
```

---

## ✂️ CORTES Y DEUDORES - Gestión de Servicio

Endpoints para gestionar cortes, reconexiones y convenios.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v2/deudores/configuracion` | Ver reglas de corte |
| POST | `/api/v2/deudores/configuracion` | Modificar reglas de corte |
| GET | `/api/v2/deudores/candidatos` | Listar medidores candidatos a corte |
| POST | `/api/v2/deudores/cortar` | Ejecutar corte de servicio |
| POST | `/api/v2/deudores/reconectar` | Registrar reconexión |
| POST | `/api/v2/deudores/convenios` | Crear convenio de pago |

### GET /configuracion
- **Descripción**: Obtiene las reglas actuales para cortes y avisos.
- **Respuesta**:
```json
{
  "id": 1,
  "facturas_para_primer_aviso": 1,
  "facturas_para_segundo_aviso": 2,
  "facturas_para_tercer_aviso": 3,
  "facturas_para_corte": 4,
  "dias_gracia": 0,
  "activo": 1
}
```

### POST /configuracion
- **Descripción**: Actualiza las reglas del sistema (crea nuevo registro de historial).
- **Body**:
```json
{
  "facturas_para_primer_aviso": 1,
  "facturas_para_corte": 3
}
```
- **Respuesta**:
```json
{
  "message": "Configuración actualizada exitosamente",
  "id": 2
}
```

### GET /candidatos
- **Descripción**: Lista medidores que superan el umbral de facturas vencidas y **NO tienen convenio activo**.
- **Respuesta**:
```json
{
  "umbral_corte": 3,
  "total_candidatos": 5,
  "candidatos": [
    {
      "cliente": { "id": 1, "nombre": "Luis Miguel" },
      "medidor": { "id": 55, "serial": "ABC-001", "estado": "Activo" },
      "deuda": { "facturas_vencidas": 4, "total": 1200.00 },
      "accion_sugerida": "Corte de Servicio"
    }
  ]
}
```

### POST /cortar
- **Body**:
```json
{
  "medidor_id": 55,
  "motivo": "Falta de pago",
  "observaciones": "Cliente notificado ayer"
}
```
- **Respuesta**:
```json
{
  "success": true,
  "message": "Corte ejecutado correctamente",
  "medidor_id": 55
}
```

### POST /reconectar
- **Body**:
```json
{
  "medidor_id": 55,
  "observaciones": "Pago total realizado"
}
```
- **Respuesta**:
```json
{
  "success": true,
  "message": "Servicio reconectado exitosamente. Estado: Activo",
  "nuevo_estado": "Activo"
}
```

### POST /convenios
- **Body**:
```json
{
  "medidor_id": 55,
  "monto_inicial": 500.00,
  "numero_parcialidades": 6,
  "periodicidad": "mensual", // Opcional: mensual (default) | quincenal
  "observaciones": "Convenio autorizado por gerencia"
}
```
- **Respuesta**:
```json
{
  "success": true,
  "message": "Convenio creado exitosamente",
  "convenio_id": 101,
  "detalle": {
    "deuda_original": 1200.00,
    "pago_inicial": 500.00,
    "saldo_diferido": 700.00,
    "cuotas": 6
  }
}
```
