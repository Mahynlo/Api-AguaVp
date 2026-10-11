# Guía de Uso: Timezone Helper (GMT-7)

## Filosofía de Diseño ✅

**Backend (API):** Guarda y envía fechas en **UTC** (estándar ISO 8601)  
**Frontend (Electron):** Convierte UTC a GMT-7 para mostrar al usuario

Este helper es para **uso interno del backend** solamente.

---

## Uso en Backend (Casos Específicos)

### 1. Filtros por Fecha (Reportes, Búsquedas)

Cuando el usuario pide "facturas de hoy", necesitas convertir "hoy GMT-7" a UTC para consultar correctamente:

```javascript
import { inicioDia, finDia } from '../utils/timezone.js';

// Obtener facturas de "hoy" en GMT-7
const query = `
    SELECT * FROM facturas 
    WHERE fecha_emision >= ? AND fecha_emision <= ?
`;

// inicioDia() y finDia() convierten "hoy GMT-7" a UTC
await db.execute({
    sql: query,
    args: [inicioDia(), finDia()]
});
```

### 2. Validaciones de Vencimiento

```javascript
import { estaVencida } from '../utils/timezone.js';

// Verifica si una fecha UTC está vencida según la hora local GMT-7
const factura = await obtenerFactura(id);

if (estaVencida(factura.fecha_vencimiento)) {
    await actualizarEstado(id, 'Vencida');
}
```

### 3. Cálculo de Vencimientos

```javascript
import { calcularVencimiento, nowDate } from '../utils/timezone.js';

// Calcular fecha de vencimiento (30 días desde hoy en GMT-7)
const fechaEmision = nowDate(); // Hoy en GMT-7
const fechaVencimiento = calcularVencimiento(30); // +30 días

// Guardar en BD (se convertirá a UTC automáticamente)
const query = `
    INSERT INTO facturas (fecha_emision, fecha_vencimiento)
    VALUES (?, ?)
`;
```

### 4. Logs y Auditoría

```javascript
import { now } from '../utils/timezone.js';

console.log(`[${now()}] Usuario ${userId} generó factura ${facturaId}`);
// Output: [15/01/2026 14:30:00] Usuario 1 generó factura 123
```

---

## ❌ NO Usar Para

### NO convertir respuestas al frontend
```javascript
// ❌ INCORRECTO
res.json({
    fecha_emision: formatForDisplay(factura.fecha_emision)
});

// ✅ CORRECTO - Enviar UTC, el frontend convierte
res.json({
    fecha_emision: factura.fecha_emision // UTC ISO 8601
});
```

---

## Frontend: Conversión en Electron

En tu app de Electron, usa `date-fns-tz`:

```javascript
// Frontend: src/utils/dateFormatter.js
import { formatInTimeZone } from 'date-fns-tz';

export function formatearFecha(fechaUTC) {
    return formatInTimeZone(
        new Date(fechaUTC),
        'America/Mexico_City',
        'dd/MM/yyyy HH:mm'
    );
}

// Uso en componentes
<p>Fecha: {formatearFecha(factura.fecha_emision)}</p>
```

---

## Funciones Disponibles (Backend)

| Función | Uso | Retorna |
|---------|-----|---------|
| `now()` | Fecha/hora actual GMT-7 para logs | `'2026-01-15 14:30:00'` |
| `nowDate()` | Fecha actual GMT-7 | `'2026-01-15'` |
| `inicioDia()` | Inicio del día GMT-7 (para filtros) | `'2026-01-15 00:00:00'` |
| `finDia()` | Fin del día GMT-7 (para filtros) | `'2026-01-15 23:59:59'` |
| `calcularVencimiento(dias)` | Fecha + N días | `'2026-02-14'` |
| `estaVencida(fecha)` | Verifica vencimiento | `boolean` |
| `toLocalTime(utc)` | Convierte UTC a GMT-7 | `Date` object |
| `formatDate(date, format)` | Formatea fecha | String |

---

## Resumen

✅ **Base de datos:** UTC (estándar)  
✅ **API responses:** UTC (ISO 8601)  
✅ **Frontend:** Convierte a GMT-7  
✅ **Backend helper:** Solo para filtros, validaciones y logs

