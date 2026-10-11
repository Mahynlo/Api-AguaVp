# Nuevas Operaciones del Controlador de Clientes V2

**Fecha de implementación:** 9 de Diciembre de 2024  
**Versión:** 2.1.0  
**Archivo:** `src/v2/controllers/clientesController.js`

---

## 📋 Resumen de Cambios

Se agregaron **2 nuevas operaciones** al controlador de clientes para complementar las funcionalidades CRUD básicas:

1. **`asignarTarifa`** - Operación UPDATE especializada
2. **`estadisticas`** - Analíticas y métricas de clientes

---

## 🎯 1. Asignar Tarifa a Cliente

### Descripción
Operación especializada para cambiar la tarifa asociada a un cliente. Valida la existencia de ambos registros y previene asignaciones duplicadas.

### Endpoint
```
PUT /api/v2/clientes/:id/asignar-tarifa
```

### Autenticación
✅ **Requiere token JWT** (Bearer Authentication)

### Parámetros

**Path Parameters:**
- `id` (integer, requerido) - ID del cliente

**Body (JSON):**
```json
{
  "tarifa_id": 2
}
```

### Validaciones

✅ **Pre-validaciones:**
- Cliente debe existir
- Tarifa debe existir
- Tarifa no debe estar ya asignada al cliente

### Respuesta Exitosa (200)

```json
{
  "mensaje": "Tarifa asignada exitosamente",
  "cliente_id": 1,
  "tarifa_anterior": 1,
  "tarifa_nueva": 2,
  "tarifa_nombre": "Tarifa Residencial Alta",
  "tarifa_descripcion": "Tarifa para consumo residencial elevado"
}
```

### Casos de Error

| Código | Descripción |
|--------|-------------|
| 400 | `tarifa_id` no proporcionado |
| 400 | Cliente ya tiene esa tarifa asignada |
| 404 | Cliente no encontrado |
| 404 | Tarifa no encontrada |
| 500 | Error interno del servidor |

### Funcionalidades Adicionales

1. **Registro en Historial**
   - Guarda cambio en tabla `historial_cambios`
   - Incluye: tarifa anterior, tarifa nueva, tipo y precio

2. **Notificación SSE**
   - Envía evento en tiempo real
   - Tipo: `alertaSistema`
   - Severidad: `info`

3. **Datos del Cambio**
```json
{
  "cliente_id": 1,
  "cliente_nombre": "Juan Pérez",
  "tarifa_anterior": 1,
  "tarifa_nueva": 2,
  "tarifa_nombre": "Tarifa Residencial Alta",
  "accion": "tarifa_asignada"
}
```

### Ejemplo de Uso

**Solicitud:**
```bash
curl -X PUT http://localhost:3000/api/v2/clientes/1/asignar-tarifa \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tarifa_id": 2}'
```

**Respuesta:**
```json
{
  "mensaje": "Tarifa asignada exitosamente",
  "cliente_id": 1,
  "tarifa_anterior": 1,
  "tarifa_nueva": 2,
  "tarifa_nombre": "Tarifa Residencial Alta",
  "tarifa_descripcion": "Tarifa para consumo residencial elevado"
}
```

---

## 📊 2. Estadísticas y Analíticas de Clientes

### Descripción
Endpoint que retorna métricas completas sobre los clientes del sistema, ideal para dashboards administrativos y reportes gerenciales.

### Endpoint
```
GET /api/v2/clientes/estadisticas
```

### Autenticación
✅ **Requiere token JWT** (Bearer Authentication)

### Respuesta Exitosa (200)

```json
{
  "resumen": {
    "total_clientes": 150,
    "clientes_ultimo_mes": 12,
    "clientes_activos": 140,
    "clientes_inactivos": 10,
    "clientes_con_medidores": 135,
    "clientes_sin_medidores": 15,
    "total_medidores_asignados": 145
  },
  "distribucion": {
    "por_estado": [
      {
        "estado": "Activo",
        "cantidad": 140
      },
      {
        "estado": "Inactivo",
        "cantidad": 10
      }
    ],
    "por_ciudad": [
      {
        "ciudad": "Bogotá",
        "cantidad": 85
      },
      {
        "ciudad": "Medellín",
        "cantidad": 45
      },
      {
        "ciudad": "Cali",
        "cantidad": 20
      }
    ],
    "por_tarifa": [
      {
        "tarifa_nombre": "Tarifa Residencial",
        "tarifa_descripcion": "Tarifa para uso residencial básico",
        "cantidad_clientes": 120
      },
      {
        "tarifa_nombre": "Tarifa Comercial",
        "tarifa_descripcion": "Tarifa para establecimientos comerciales",
        "cantidad_clientes": 25
      },
      {
        "tarifa_nombre": "Sin tarifa",
        "tarifa_descripcion": null,
        "cantidad_clientes": 5
      }
    ]
  },
  "tendencias": {
    "registros_por_mes": [
      {
        "mes": "2024-01",
        "cantidad": 8
      },
      {
        "mes": "2024-02",
        "cantidad": 12
      },
      {
        "mes": "2024-03",
        "cantidad": 15
      }
    ],
    "registros_ano_actual": [
      {
        "mes": "Ene",
        "cantidad": 10
      },
      {
        "mes": "Feb",
        "cantidad": 12
      },
      {
        "mes": "Mar",
        "cantidad": 8
      }
    ]
  },
  "medidores": {
    "clientes_con_medidores": 135,
    "clientes_sin_medidores": 15,
    "total_medidores_asignados": 145,
    "porcentaje_con_medidores": "90.00"
  },
  "fecha_generacion": "2024-12-09T10:30:00.000Z"
}
```

### Métricas Incluidas

#### 📈 Resumen General
- **Total de clientes:** Todos los registros
- **Clientes último mes:** Registrados en los últimos 30 días
- **Clientes activos/inactivos:** Por estado
- **Estadísticas de medidores:** Asignación y cobertura

#### 🗺️ Distribución
1. **Por Estado:**
   - Agrupa clientes por `estado_cliente`
   - Cuenta cantidad por cada estado

2. **Por Ciudad:**
   - Distribución geográfica
   - Ordenado por cantidad (descendente)

3. **Por Tarifa:**
   - Clientes por tipo de tarifa
   - Incluye precio y cantidad

#### 📊 Tendencias Temporales
1. **Registros por Mes (12 meses):**
   - Formato: `YYYY-MM`
   - Últimos 12 meses de data

2. **Registros Año Actual:**
   - Formato: `Ene`, `Feb`, `Mar`...
   - Solo año en curso

#### 🔌 Medidores
- Clientes con/sin medidores
- Total de medidores asignados
- Porcentaje de cobertura

### Casos de Uso

✅ **Dashboards Administrativos**
- Gráficas de crecimiento
- Distribución geográfica en mapas
- Análisis de penetración de medidores

✅ **Reportes Gerenciales**
- KPIs de crecimiento mensual
- Análisis de tarifas más usadas
- Tendencias de registro

✅ **Visualizaciones**
- Gráficos de barras (por ciudad)
- Gráficos de líneas (tendencias)
- Gráficos circulares (estado, tarifa)

### Ejemplo de Uso

**Solicitud:**
```bash
curl -X GET http://localhost:3000/api/v2/clientes/estadisticas \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🔄 Integración con el Sistema

### Archivos Modificados

1. **`src/v2/controllers/clientesController.js`**
   - ✅ Agregada función `asignarTarifa`
   - ✅ Agregada función `estadisticas`

2. **`src/v2/routes/clientes.js`**
   - ✅ Ruta PUT `/:id/asignar-tarifa`
   - ✅ Ruta GET `/estadisticas`
   - ✅ Documentación Swagger completa

### Middlewares Aplicados

- ✅ `configureSSE` - Configuración automática de SSE managers
- ✅ `authMiddleware` - Validación de token JWT

### Dependencias de Base de Datos

**Tablas utilizadas:**
- `clientes` - Datos principales
- `tarifas` - Validación de tarifas
- `medidores` - Estadísticas de asignación
- `historial_cambios` - Registro de modificaciones

---

## 📝 Próximos Pasos

### Controlador de Clientes - Operaciones Pendientes

1. **`obtenerPorId`** - GET individual
2. **`buscarClientes`** - Búsqueda con filtros
3. **`eliminarCliente`** - Soft delete (marcar como eliminado)
4. **`restaurarCliente`** - Recuperar de papelera

### Otros Controladores

Aplicar el mismo patrón a:
- `medidorController.js`
- `lecturasController.js`
- `facturasController.js`
- `pagosController.js`
- `rutasController.js`
- `tarifasController.js`

---

## 🧪 Testing

### Pruebas Requeridas

1. **asignarTarifa:**
   - ✅ Asignación exitosa
   - ✅ Cliente no encontrado (404)
   - ✅ Tarifa no encontrada (404)
   - ✅ Tarifa ya asignada (400)
   - ✅ Sin tarifa_id (400)

2. **estadisticas:**
   - ✅ Respuesta con datos completos
   - ✅ Respuesta con base de datos vacía
   - ✅ Formato de fechas correcto
   - ✅ Cálculos de porcentaje correctos

### Casos de Prueba

```javascript
// Test 1: Asignar tarifa exitosamente
PUT /api/v2/clientes/1/asignar-tarifa
Body: { "tarifa_id": 2 }
Expected: 200, tarifa asignada

// Test 2: Tarifa ya asignada
PUT /api/v2/clientes/1/asignar-tarifa
Body: { "tarifa_id": 2 } // misma tarifa
Expected: 400, "Cliente ya tiene esta tarifa asignada"

// Test 3: Obtener estadísticas
GET /api/v2/clientes/estadisticas
Expected: 200, objeto con resumen, distribucion, tendencias, medidores
```

---

## 📚 Documentación API

La documentación Swagger está disponible en:
```
http://localhost:3000/api-docs
```

Buscar la sección **"Clientes V2"** para ver:
- Todos los endpoints disponibles
- Schemas de request/response
- Códigos de error
- Ejemplos interactivos

---

## ✅ Estado de Implementación

| Operación | Estado | Endpoint |
|-----------|--------|----------|
| Registrar cliente | ✅ V1 | POST `/registrar` |
| Obtener clientes | ✅ V1 | GET `/listar` |
| Modificar cliente | ✅ V1 | PUT `/modificar/:id` |
| **Asignar tarifa** | ✅ **NUEVO** | PUT `/:id/asignar-tarifa` |
| **Estadísticas** | ✅ **NUEVO** | GET `/estadisticas` |
| Obtener por ID | ⏳ Pendiente | GET `/:id` |
| Buscar clientes | ⏳ Pendiente | GET `/buscar` |
| Eliminar cliente | ⏳ Pendiente | DELETE `/:id` |
| Restaurar cliente | ⏳ Pendiente | POST `/restaurar/:id` |

---

## 🎨 Visualización de Datos

### Sugerencias para Frontend

**1. Dashboard de Clientes:**
```javascript
// Gráfico de líneas - Registros por mes
tendencias.registros_por_mes.map(item => ({
  x: item.mes,
  y: item.cantidad
}))

// Gráfico circular - Por ciudad
distribucion.por_ciudad.map(item => ({
  label: item.ciudad,
  value: item.cantidad
}))

// KPI Cards
<KPICard title="Total Clientes" value={resumen.total_clientes} />
<KPICard title="Nuevos (último mes)" value={resumen.clientes_ultimo_mes} />
<KPICard title="% Con Medidores" value={medidores.porcentaje_con_medidores} />
```

**2. Formulario Asignar Tarifa:**
```javascript
// Select de tarifas
const tarifas = await fetch('/api/v2/tarifas/listar');

// Asignación
await fetch(`/api/v2/clientes/${clienteId}/asignar-tarifa`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ tarifa_id: selectedTarifaId })
});
```

---

## 🔧 Configuración

### Variables de Entorno
No se requieren cambios adicionales.

### Base de Datos
Las tablas necesarias ya existen:
- ✅ `clientes`
- ✅ `tarifas`
- ✅ `medidores`
- ✅ `historial_cambios`

---

## 📞 Soporte

Para más información o reportar problemas:
- Revisar logs del servidor
- Verificar documentación Swagger
- Consultar `docs/ANALISIS_OPERACIONES_CRUD.md`

---

**Desarrollado por:** Sistema AguaVP  
**Última actualización:** 9 de Diciembre de 2024  
**Versión del documento:** 1.0.0
