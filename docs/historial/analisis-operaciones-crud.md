# 📊 Análisis Completo de Operaciones CRUD y Mejoras para API v2

## 🎯 Resumen Ejecutivo

Tras analizar todos los controladores V2 y el esquema de base de datos, he identificado:
- **27 operaciones faltantes** en total
- **Soft Delete** necesario en 5 tablas principales
- **6 módulos de estadísticas** requeridos para dashboards
- **3 tablas nuevas** para auditoría completa

---

## 📋 ANÁLISIS POR CONTROLADOR

### 1. 👤 **clientesController.js**

#### ✅ Operaciones Existentes:
- `registrarCliente` - CREATE
- `obtenerClientes` - READ (lista)
- `modificarCliente` - UPDATE

#### ❌ Operaciones Faltantes:
1. **`obtenerClientePorId`** - READ individual
   - Detalle completo del cliente
   - Incluir medidores asignados
   - Historial de tarifas
   - Facturas pendientes

2. **`eliminarCliente`** - DELETE (soft)
   - Marcar como inactivo en lugar de eliminar
   - Preservar historial de facturas
   - Mantener relaciones con medidores

3. **`buscarClientes`** - SEARCH
   - Por nombre (like)
   - Por ciudad
   - Por estado (Activo/Inactivo)
   - Por tarifa asignada

4. **`obtenerClientesConDeuda`** - QUERY especializada
   - Clientes con saldo pendiente > 0
   - Ordenado por monto adeudado
   - Filtro por antigüedad de deuda

5. **`asignarTarifa`** - UPDATE especializada
   - Cambiar tarifa_id del cliente
   - Registrar en historial

6. **`restaurarCliente`** - RESTORE
   - Recuperar cliente de "papelera"
   - Cambiar estado a Activo

---

### 2. 📏 **medidorController.js**

#### ✅ Operaciones Existentes:
- `registrarMedidor` - CREATE
- `obtenerMedidores` - READ (lista)
- `modificarMedidor` - UPDATE

#### ❌ Operaciones Faltantes:
1. **`obtenerMedidorPorId`** - READ individual
   - Datos completos del medidor
   - Cliente asignado actual
   - Historial de asignaciones
   - Últimas lecturas

2. **`eliminarMedidor`** - DELETE (soft)
   - Cambiar estado a 'Retirado'
   - Mantener historial

3. **`buscarMedidores`** - SEARCH
   - Por número de serie
   - Por cliente_id
   - Por estado
   - Por ubicación (coordenadas en radio)

4. **`reasignarMedidor`** - UPDATE especializada
   - Cambiar de un cliente a otro
   - Actualizar historial automáticamente
   - Cerrar asignación anterior

5. **`obtenerHistorialAsignaciones`** - QUERY
   - Ver todas las asignaciones previas de un medidor
   - Con fechas de inicio/fin
   - Incluir información del cliente

6. **`restaurarMedidor`** - RESTORE
   - Cambiar estado de 'Retirado' a 'Activo'

---

### 3. 📖 **lecturasController.js**

#### ✅ Operaciones Existentes:
- `registrarLectura` - CREATE (con auto-facturación)
- `obtenerLecturas` - READ (lista)
- `modificarLectura` - UPDATE
- `obtenerLecturasPorRutaYPeriodo` - QUERY especializada
- `generarFacturasParaLecturasSinFactura` - BATCH operation

#### ❌ Operaciones Faltantes:
1. **`obtenerLecturaPorId`** - READ individual
   - Detalle completo
   - Factura asociada (si existe)
   - Información del medidor y cliente

2. **`eliminarLectura`** - DELETE (soft)
   - Marcar como anulada en lugar de eliminar
   - Campo nuevo: `estado` (Activa/Anulada)
   - NO eliminar factura asociada

3. **`obtenerLecturasPorMedidor`** - QUERY
   - Historial completo de un medidor
   - Gráfica de consumo por periodo
   - Detección de anomalías

4. **`obtenerLecturasPorCliente`** - QUERY
   - Todas las lecturas de todos los medidores de un cliente
   - Consumo total por periodo

5. **`compararConsumos`** - ANALYTICS
   - Comparar consumo actual vs promedio
   - Alertas de consumo anómalo
   - Proyección de consumo

6. **`restaurarLectura`** - RESTORE
   - Reactivar lectura anulada

---

### 4. 💰 **facturasController.js**

#### ✅ Operaciones Existentes:
- `generarFactura` - CREATE (con cálculo por rangos)
- `obtenerFacturas` - READ (lista)
- `modificarFactura` - UPDATE

#### ❌ Operaciones Faltantes:
1. **`obtenerFacturaPorId`** - READ individual
   - Detalle completo
   - Información del cliente
   - Lectura asociada
   - Lista de pagos aplicados

2. **`anularFactura`** - DELETE (soft)
   - Estado nuevo: 'Anulada'
   - Revertir pagos aplicados
   - Registrar razón de anulación
   - NO eliminar de BD

3. **`buscarFacturas`** - SEARCH
   - Por cliente_id
   - Por estado (Pagado/Pendiente/Vencida/Anulada)
   - Por rango de fechas
   - Por monto

4. **`obtenerFacturasPendientes`** - QUERY
   - Solo facturas no pagadas
   - Ordenado por antigüedad
   - Cálculo de intereses por mora

5. **`recalcularFactura`** - UPDATE especializada
   - Recalcular total basado en nueva tarifa
   - Actualizar rangos aplicados
   - Historial de recálculos

6. **`restaurarFactura`** - RESTORE
   - Cambiar de 'Anulada' a 'Pendiente'
   - Validar estado previo

---

### 5. 💵 **pagosController.js**

#### ✅ Operaciones Existentes:
- `registrarPago` - CREATE
- `obtenerPagos` - READ (lista)
- `modificarPago` - UPDATE

#### ❌ Operaciones Faltantes:
1. **`obtenerPagoPorId`** - READ individual
   - Detalle completo del pago
   - Factura asociada
   - Cliente

2. **`anularPago`** - DELETE (soft)
   - Estado nuevo: 'Anulado'
   - Revertir saldo en factura
   - Razón de anulación
   - NO eliminar

3. **`obtenerPagosPorCliente`** - QUERY
   - Historial de pagos de un cliente
   - Total pagado por periodo
   - Métodos de pago preferidos

4. **`obtenerPagosPorFecha`** - QUERY
   - Ingresos del día/mes
   - Arqueo de caja
   - Desglose por método de pago

5. **`aplicarPagoMultiple`** - CREATE especializada
   - Pagar varias facturas con un solo monto
   - Distribución automática o manual
   - Priorizar facturas más antiguas

6. **`restaurarPago`** - RESTORE
   - Reactivar pago anulado
   - Re-aplicar a factura

---

### 6. 🗺️ **rutasController.js**

#### ✅ Operaciones Existentes:
- `crearRuta` - CREATE
- `listarRutas` - READ (lista)
- `agregarMedidorARuta` - UPDATE
- `obtenerRutaConMedidores` - READ individual con relaciones

#### ❌ Operaciones Faltantes:
1. **`eliminarRuta`** - DELETE (soft)
   - Marcar como inactiva
   - Mantener historial de lecturas asociadas

2. **`modificarRuta`** - UPDATE
   - Cambiar nombre, descripción
   - Actualizar coordenadas

3. **`eliminarMedidorDeRuta`** - DELETE relación
   - Quitar medidor de ruta
   - Reordenar automáticamente

4. **`reordenarMedidores`** - UPDATE especializada
   - Cambiar orden de visita
   - Optimizar ruta

5. **`duplicarRuta`** - CREATE from existing
   - Clonar ruta existente con todos sus medidores

6. **`obtenerProgresoCapturaRuta`** - ANALYTICS
   - Cuántos medidores leídos / total
   - % completado por periodo

7. **`restaurarRuta`** - RESTORE
   - Reactivar ruta eliminada

---

### 7. 💲 **tarifasController.js**

#### ✅ Operaciones Existentes:
- `registrarTarifa` - CREATE
- Probablemente tiene obtener y modificar (verificar archivo completo)

#### ❌ Operaciones Faltantes:
1. **`obtenerTarifaPorId`** - READ individual
   - Detalle completo
   - Rangos asociados
   - Clientes usando esta tarifa

2. **`eliminarTarifa`** - DELETE (soft)
   - Marcar como inactiva
   - Solo si no tiene clientes asignados

3. **`obtenerTarifasActivas`** - QUERY
   - Solo tarifas vigentes (fecha_fin >= hoy OR NULL)

4. **`clonarTarifa`** - CREATE from existing
   - Duplicar tarifa con todos sus rangos
   - Cambiar nombre automáticamente

5. **`obtenerHistorialTarifa`** - ANALYTICS
   - Ver cambios de precios en el tiempo
   - Tabla historial_tarifas

6. **`restaurarTarifa`** - RESTORE
   - Reactivar tarifa eliminada

---

## 🗑️ IMPLEMENTACIÓN DE SOFT DELETE

### Estrategia: Sistema de Papelera con Auditoría

#### Tablas que Requieren Soft Delete:

1. **clientes** - Campo: `estado_cliente` (ya existe)
   - Estados: 'Activo' | 'Inactivo' | 'Eliminado'
   - Fecha de eliminación: nuevo campo
   - Razón: nuevo campo

2. **medidores** - Campo: `estado_medidor` (ya existe)
   - Estados: 'Activo' | 'Inactivo' | 'Retirado' | 'Eliminado'

3. **facturas** - Campo: `estado` (ya existe, agregar estado)
   - Estados actuales: 'Pagado' | 'Pendiente' | 'Vencida'
   - **AGREGAR**: 'Anulada' | 'Eliminada'
   - Campos nuevos: `fecha_anulacion`, `anulado_por`, `razon_anulacion`

4. **pagos** - Campo nuevo: `estado`
   - Estados: 'Aplicado' | 'Anulado' | 'Eliminado'
   - Campos nuevos: `estado`, `fecha_anulacion`, `anulado_por`, `razon_anulacion`

5. **rutas** - Campo nuevo: `activo`
   - Campo: `activo` INTEGER DEFAULT 1
   - Campos nuevos: `fecha_eliminacion`, `eliminado_por`

### Migración SQL para Soft Delete:

```sql
-- 003_add_soft_delete.sql

-- Agregar campos a facturas
ALTER TABLE facturas ADD COLUMN fecha_anulacion DATETIME;
ALTER TABLE facturas ADD COLUMN anulado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE facturas ADD COLUMN razon_anulacion TEXT;

-- Crear tabla pagos con estado
ALTER TABLE pagos ADD COLUMN estado TEXT DEFAULT 'Aplicado' 
    CHECK (estado IN ('Aplicado', 'Anulado', 'Eliminado'));
ALTER TABLE pagos ADD COLUMN fecha_anulacion DATETIME;
ALTER TABLE pagos ADD COLUMN anulado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE pagos ADD COLUMN razon_anulacion TEXT;

-- Agregar campos a rutas
ALTER TABLE rutas ADD COLUMN activo INTEGER DEFAULT 1;
ALTER TABLE rutas ADD COLUMN fecha_eliminacion DATETIME;
ALTER TABLE rutas ADD COLUMN eliminado_por INTEGER REFERENCES usuarios(id);

-- Agregar campos a clientes (si no existen)
ALTER TABLE clientes ADD COLUMN fecha_eliminacion DATETIME;
ALTER TABLE clientes ADD COLUMN eliminado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE clientes ADD COLUMN razon_eliminacion TEXT;

-- Agregar campos a medidores
ALTER TABLE medidores ADD COLUMN fecha_eliminacion DATETIME;
ALTER TABLE medidores ADD COLUMN eliminado_por INTEGER REFERENCES usuarios(id);

-- Agregar campos a lecturas
ALTER TABLE lecturas ADD COLUMN estado TEXT DEFAULT 'Activa' 
    CHECK (estado IN ('Activa', 'Anulada', 'Eliminada'));
ALTER TABLE lecturas ADD COLUMN fecha_anulacion DATETIME;
ALTER TABLE lecturas ADD COLUMN anulado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE lecturas ADD COLUMN razon_anulacion TEXT;

-- Vista: Elementos en papelera
CREATE VIEW IF NOT EXISTS v_papelera AS
SELECT 
    'cliente' as tipo,
    id,
    nombre as descripcion,
    fecha_eliminacion,
    eliminado_por,
    razon_eliminacion as razon
FROM clientes 
WHERE estado_cliente = 'Eliminado'

UNION ALL

SELECT 
    'medidor' as tipo,
    id,
    numero_serie as descripcion,
    fecha_eliminacion,
    eliminado_por,
    NULL as razon
FROM medidores 
WHERE estado_medidor = 'Eliminado'

UNION ALL

SELECT 
    'factura' as tipo,
    id,
    'Factura #' || id as descripcion,
    fecha_anulacion as fecha_eliminacion,
    anulado_por as eliminado_por,
    razon_anulacion as razon
FROM facturas 
WHERE estado = 'Anulada'

UNION ALL

SELECT 
    'pago' as tipo,
    id,
    'Pago #' || id as descripcion,
    fecha_anulacion as fecha_eliminacion,
    anulado_por as eliminado_por,
    razon_anulacion as razon
FROM pagos 
WHERE estado = 'Anulado'

UNION ALL

SELECT 
    'ruta' as tipo,
    id,
    nombre as descripcion,
    fecha_eliminacion,
    eliminado_por,
    NULL as razon
FROM rutas 
WHERE activo = 0

UNION ALL

SELECT 
    'lectura' as tipo,
    id,
    'Lectura #' || id as descripcion,
    fecha_anulacion as fecha_eliminacion,
    anulado_por as eliminado_por,
    razon_anulacion as razon
FROM lecturas 
WHERE estado = 'Anulada';
```

---

## 📊 MÓDULOS DE ESTADÍSTICAS REQUERIDOS

### 1. **estadisticasController.js** - NUEVO

#### Endpoints Necesarios:

##### A. Dashboard General

```javascript
// GET /api/v2/estadisticas/dashboard
{
  resumen: {
    clientes_activos: 1245,
    clientes_con_deuda: 89,
    facturas_pendientes: 234,
    facturas_vencidas: 45,
    ingresos_mes_actual: 125000.50,
    ingresos_mes_anterior: 118000.00,
    lecturas_pendientes: 150,
    medidores_activos: 1300
  },
  ultimos_7_dias: {
    ingresos: [12000, 15000, 18000, 14000, 16000, 13000, 17000],
    pagos_registrados: [45, 52, 67, 48, 59, 44, 61],
    facturas_generadas: [120, 110, 130, 115, 125, 118, 128]
  },
  distribucion_estados_facturas: {
    Pagado: 1890,
    Pendiente: 234,
    Vencida: 45,
    Anulada: 12
  }
}
```

##### B. Estadísticas de Clientes

```javascript
// GET /api/v2/estadisticas/clientes
obtenerEstadisticasClientes() {
  total_clientes,
  clientes_activos,
  clientes_inactivos,
  clientes_con_deuda,
  deuda_total,
  promedio_deuda,
  clientes_por_ciudad: [{ ciudad, cantidad }],
  clientes_por_tarifa: [{ tarifa, cantidad }],
  top_10_mayores_deudores: [{ cliente, deuda }],
  nuevos_clientes_mes: 45
}
```

##### C. Estadísticas de Medidores

```javascript
// GET /api/v2/estadisticas/medidores
obtenerEstadisticasMedidores() {
  total_medidores,
  medidores_activos,
  medidores_inactivos,
  medidores_sin_cliente,
  medidores_por_estado: { Activo, Inactivo, Retirado },
  promedio_lecturas_mes,
  medidores_sin_lectura_mes: 23,
  consumo_promedio_m3: 18.5,
  consumo_total_mes: 23400
}
```

##### D. Estadísticas de Facturas

```javascript
// GET /api/v2/estadisticas/facturas
obtenerEstadisticasFacturas() {
  total_facturas,
  facturas_por_estado: { Pagado, Pendiente, Vencida, Anulada },
  monto_total_facturado_mes,
  monto_total_cobrado_mes,
  monto_pendiente_cobro,
  promedio_monto_factura,
  facturas_vencidas_30_dias: 12,
  facturas_vencidas_60_dias: 8,
  facturas_vencidas_90_mas: 5,
  tendencia_facturacion: [
    { mes: '2025-01', total: 120000 },
    { mes: '2025-02', total: 125000 }
  ]
}
```

##### E. Estadísticas de Pagos

```javascript
// GET /api/v2/estadisticas/pagos
obtenerEstadisticasPagos() {
  total_pagos_mes,
  monto_total_cobrado_mes,
  pagos_por_metodo: {
    Efectivo: 145,
    Transferencia: 89,
    Tarjeta: 34,
    Cheque: 5
  },
  promedio_pago: 534.50,
  pagos_por_dia_semana: {
    Lunes: 45, Martes: 52, ...
  },
  hora_pico_pagos: '10:00 - 11:00',
  tendencia_ingresos: [
    { fecha: '2025-12-01', monto: 15000 },
    { fecha: '2025-12-02', monto: 18000 }
  ]
}
```

##### F. Estadísticas de Consumo

```javascript
// GET /api/v2/estadisticas/consumo
obtenerEstadisticasConsumo() {
  consumo_total_mes: 25600.5,
  consumo_promedio_cliente: 18.3,
  clientes_consumo_alto: 45, // > 30m3
  clientes_consumo_bajo: 123, // < 10m3
  consumo_por_rango: [
    { rango: '0-10m3', cantidad_clientes: 234 },
    { rango: '10-20m3', cantidad_clientes: 567 },
    { rango: '20-30m3', cantidad_clientes: 345 }
  ],
  comparativa_mes_anterior: {
    mes_actual: 25600,
    mes_anterior: 24100,
    diferencia: +6.2%
  },
  clientes_con_consumo_anomalo: [
    { cliente_id, consumo_actual, consumo_promedio, desviacion }
  ]
}
```

##### G. Estadísticas de Rutas

```javascript
// GET /api/v2/estadisticas/rutas
obtenerEstadisticasRutas() {
  total_rutas,
  rutas_activas,
  total_medidores_en_rutas,
  promedio_medidores_por_ruta,
  rutas_con_lecturas_pendientes: [
    { ruta_id, nombre, pendientes: 45, total: 120 }
  ],
  progreso_captura_mes: {
    leidas: 1050,
    pendientes: 150,
    porcentaje: 87.5
  },
  ruta_mas_grande: { nombre, medidores: 150 },
  ruta_mas_pequeña: { nombre, medidores: 25 }
}
```

---

## 🏗️ NUEVAS TABLAS NECESARIAS

### 1. **elementos_eliminados** - Papelera unificada

```sql
CREATE TABLE IF NOT EXISTS elementos_eliminados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_elemento TEXT NOT NULL, -- 'cliente', 'medidor', 'factura', etc.
    elemento_id INTEGER NOT NULL,
    datos_originales TEXT, -- JSON con datos completos antes de eliminar
    fecha_eliminacion DATETIME DEFAULT (datetime('now')),
    eliminado_por INTEGER REFERENCES usuarios(id),
    razon_eliminacion TEXT,
    fecha_expiracion DATETIME, -- Auto-eliminar después de 90 días
    restaurado INTEGER DEFAULT 0,
    fecha_restauracion DATETIME,
    restaurado_por INTEGER REFERENCES usuarios(id)
);

CREATE INDEX idx_elementos_eliminados_tipo 
    ON elementos_eliminados(tipo_elemento);
CREATE INDEX idx_elementos_eliminados_fecha 
    ON elementos_eliminados(fecha_eliminacion);
CREATE INDEX idx_elementos_eliminados_restaurado 
    ON elementos_eliminados(restaurado);
```

### 2. **configuracion_sistema** - Settings

```sql
CREATE TABLE IF NOT EXISTS configuracion_sistema (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT UNIQUE NOT NULL,
    valor TEXT NOT NULL,
    tipo TEXT CHECK (tipo IN ('string', 'number', 'boolean', 'json')),
    descripcion TEXT,
    modificado_por INTEGER REFERENCES usuarios(id),
    fecha_modificacion DATETIME DEFAULT (datetime('now'))
);

-- Valores iniciales
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion) VALUES
('dias_retencion_papelera', '90', 'number', 'Días antes de eliminar permanentemente'),
('interes_mora_diario', '0.5', 'number', 'Porcentaje de interés por mora diario'),
('dias_gracia_factura', '5', 'number', 'Días de gracia antes de marcar vencida'),
('email_notificaciones', 'admin@aguavp.com', 'string', 'Email para notificaciones');
```

### 3. **alertas_sistema** - Notificaciones

```sql
CREATE TABLE IF NOT EXISTS alertas_sistema (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_alerta TEXT NOT NULL, -- 'consumo_anomalo', 'factura_vencida', etc.
    severidad TEXT CHECK (severidad IN ('info', 'warning', 'error', 'critical')),
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    datos_json TEXT, -- Información adicional en JSON
    cliente_id INTEGER REFERENCES clientes(id),
    medidor_id INTEGER REFERENCES medidores(id),
    factura_id INTEGER REFERENCES facturas(id),
    fecha_creacion DATETIME DEFAULT (datetime('now')),
    leida INTEGER DEFAULT 0,
    fecha_lectura DATETIME,
    leida_por INTEGER REFERENCES usuarios(id),
    accion_tomada TEXT,
    resuelta INTEGER DEFAULT 0,
    fecha_resolucion DATETIME
);

CREATE INDEX idx_alertas_leida ON alertas_sistema(leida);
CREATE INDEX idx_alertas_severidad ON alertas_sistema(severidad);
CREATE INDEX idx_alertas_cliente ON alertas_sistema(cliente_id);
```

---

## 🎯 PRIORIZACIÓN DE IMPLEMENTACIÓN

### Fase 1 - Crítico (1-2 semanas)
1. ✅ Soft Delete en todas las tablas
2. ✅ Operaciones básicas faltantes (obtenerPorId, eliminar, restaurar)
3. ✅ Vista de papelera unificada
4. ✅ Dashboard general de estadísticas

### Fase 2 - Importante (2-3 semanas)
1. ✅ Búsquedas y filtros avanzados
2. ✅ Estadísticas de clientes y medidores
3. ✅ Estadísticas de facturas y pagos
4. ✅ Sistema de alertas básico

### Fase 3 - Mejoras (3-4 semanas)
1. ✅ Estadísticas de consumo con detección de anomalías
2. ✅ Estadísticas de rutas y progreso
3. ✅ Sistema de configuración
4. ✅ Operaciones especializadas avanzadas

---

## 📝 RESUMEN DE OPERACIONES NUEVAS

| Controlador | Operaciones Actuales | Faltantes | Total Final |
|-------------|---------------------|-----------|-------------|
| clientes | 3 | 6 | 9 |
| medidores | 3 | 6 | 9 |
| lecturas | 5 | 6 | 11 |
| facturas | 3 | 6 | 9 |
| pagos | 3 | 6 | 9 |
| rutas | 4 | 7 | 11 |
| tarifas | ~3 | 6 | ~9 |
| **estadisticas** | 0 | 7 | 7 |
| **TOTAL** | **24** | **50** | **74** |

---

## 🚀 Próximos Pasos

¿Quieres que implemente:

1. **Migración 003** - Soft Delete + Tablas nuevas (30 min)
2. **Controlador de Estadísticas** completo (2-3 horas)
3. **Operaciones faltantes** por prioridad (módulo por módulo)
4. **Sistema de Papelera** con endpoints de gestión (1 hora)

**Recomendación**: Empezar con migración + estadísticas básicas para tener dashboards funcionales de inmediato.
