/**
 * Ejemplos de uso del sistema de validación con Zod
 * 
 * File: src/v2/validators/EJEMPLOS.md
 * 
 * Este archivo muestra casos de uso comunes del sistema de validación
 */

## 🎯 Ejemplo 1: Validación Básica en Ruta

```javascript
// src/v2/routes/ejemplo.js
import express from 'express';
import { validate, crearClienteSchema } from '../validators/index.js';
import clienteController from '../controllers/clienteController.js';

const router = express.Router();

// El middleware validate() intercepta y valida antes del controlador
router.post('/clientes', 
  validate(crearClienteSchema),
  clienteController.crear
);

export default router;
```

**Request válido:**
```bash
curl -X POST http://localhost:3000/api/v2/clientes \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "telefono": "3001234567",
    "direccion": "Calle 123 #45-67",
    "ciudad": "Bogotá",
    "tarifa_id": 1
  }'
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Cliente creado exitosamente",
  "data": { "id": 1, "nombre": "Juan Pérez", ... }
}
```

**Request inválido:**
```bash
curl -X POST http://localhost:3000/api/v2/clientes \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "AB",
    "telefono": "123"
  }'
```

**Respuesta de error:**
```json
{
  "error": "Validación fallida",
  "detalles": [
    {
      "campo": "nombre",
      "mensaje": "El nombre debe tener al menos 3 caracteres",
      "codigo": "too_small"
    },
    {
      "campo": "telefono",
      "mensaje": "El teléfono debe tener exactamente 10 dígitos",
      "codigo": "invalid_string"
    },
    {
      "campo": "direccion",
      "mensaje": "Required",
      "codigo": "invalid_type"
    }
  ],
  "code": "VALIDATION_ERROR"
}
```

---

## 🎯 Ejemplo 2: Validar Múltiples Fuentes (Body + Params)

```javascript
// src/v2/routes/ejemplo.js
import { validate, clienteIdParamSchema, actualizarClienteSchema } from '../validators/index.js';

// Validar tanto los params como el body
router.put('/clientes/:id',
  validate(clienteIdParamSchema, 'params'),  // Valida req.params
  validate(actualizarClienteSchema),          // Valida req.body
  clienteController.actualizar
);
```

**Request:**
```bash
curl -X PUT http://localhost:3000/api/v2/clientes/5 \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Carlos Pérez",
    "estado_cliente": "Activo"
  }'
```

**¿Qué pasa internamente?**
1. Se valida que `params.id` sea un número válido → transformado a `5` (number)
2. Se valida que `body.nombre` y `body.estado_cliente` cumplan las reglas
3. Si todo es válido, el controlador recibe datos limpios y transformados

---

## 🎯 Ejemplo 3: Validar Query Parameters

```javascript
import { validate, buscarClienteSchema } from '../validators/index.js';

router.get('/clientes',
  validate(buscarClienteSchema, 'query'),
  clienteController.buscar
);
```

**Request:**
```bash
curl "http://localhost:3000/api/v2/clientes?ciudad=Bogotá&estado_cliente=Activo&page=1&limit=20"
```

**Query params validados:**
```javascript
{
  ciudad: "Bogotá",           // string opcional
  estado_cliente: "Activo",   // enum: Activo, Inactivo, Suspendido, Eliminado
  page: 1,                    // string → number
  limit: 20                   // string → number
}
```

---

## 🎯 Ejemplo 4: Validación Manual en Controlador

A veces necesitas validar dentro de un controlador (ej: validaciones condicionales):

```javascript
// src/v2/controllers/clienteController.js
import { validateData, crearClienteSchema } from '../validators/index.js';

export const crearClienteCondicional = async (req, res) => {
  // Validación manual
  const { success, data, errors } = validateData(crearClienteSchema, req.body);
  
  if (!success) {
    return res.status(400).json({
      error: 'Datos inválidos',
      detalles: errors
    });
  }
  
  // Ahora 'data' contiene los datos validados y transformados
  const { nombre, telefono, ciudad } = data;
  
  // Validación condicional adicional
  if (ciudad === 'Bogotá' && !data.correo) {
    return res.status(400).json({
      error: 'Para clientes de Bogotá el correo es obligatorio'
    });
  }
  
  // Continuar con la lógica...
};
```

---

## 🎯 Ejemplo 5: Transformaciones Automáticas

Los validadores pueden transformar datos automáticamente:

```javascript
// Request recibido
{
  "numero_serie": "abc-123",     // string minúsculas
  "tarifa_id": "5",              // string
  "telefono": "  3001234567  ",  // con espacios
  "correo": ""                   // string vacío
}

// Después de pasar por crearMedidorSchema
{
  "numero_serie": "ABC-123",     // toUpperCase()
  "tarifa_id": 5,                // string → number
  "telefono": "3001234567",      // trim()
  "correo": null                 // "" → null
}
```

**Definición del validador:**
```javascript
export const crearMedidorSchema = z.object({
  numero_serie: z.string()
    .transform(val => val.toUpperCase()),  // Transformación
  
  tarifa_id: z.string()
    .regex(/^\d+$/)
    .transform(Number),                     // string → number
  
  telefono: z.string()
    .transform(val => val.trim()),          // Eliminar espacios
  
  correo: z.string()
    .optional()
    .or(z.literal(''))
    .transform(val => val === '' ? null : val)  // "" → null
});
```

---

## 🎯 Ejemplo 6: Validaciones Personalizadas (refine)

Validaciones complejas con lógica de negocio:

```javascript
export const crearFacturaSchema = z.object({
  monto_base: z.number().min(0),
  cargo_fijo: z.number().min(0).default(0),
  recargos: z.number().min(0).default(0),
  descuentos: z.number().min(0).default(0),
  total: z.number().min(0)
}).refine(
  data => {
    // Validación personalizada: total debe coincidir con la suma
    const totalCalculado = data.monto_base + data.cargo_fijo + data.recargos - data.descuentos;
    return Math.abs(totalCalculado - data.total) < 0.01;
  },
  {
    message: 'El total no coincide con la suma de montos',
    path: ['total']
  }
);
```

**Request inválido:**
```json
{
  "monto_base": 100,
  "cargo_fijo": 10,
  "recargos": 5,
  "descuentos": 0,
  "total": 120  // ❌ Debería ser 115
}
```

**Error:**
```json
{
  "error": "Validación fallida",
  "detalles": [
    {
      "campo": "total",
      "mensaje": "El total no coincide con la suma de montos",
      "codigo": "custom"
    }
  ]
}
```

---

## 🎯 Ejemplo 7: Validar Fechas y Rangos

```javascript
export const buscarFacturaSchema = z.object({
  fecha_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fecha_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).refine(
  data => {
    if (data.fecha_desde && data.fecha_hasta) {
      return new Date(data.fecha_desde) <= new Date(data.fecha_hasta);
    }
    return true;
  },
  { message: 'La fecha desde debe ser anterior a la fecha hasta' }
);
```

**Request válido:**
```bash
curl "http://localhost:3000/api/v2/facturas?fecha_desde=2026-01-01&fecha_hasta=2026-01-31"
```

**Request inválido:**
```bash
curl "http://localhost:3000/api/v2/facturas?fecha_desde=2026-02-01&fecha_hasta=2026-01-01"
# Error: La fecha desde debe ser anterior a la fecha hasta
```

---

## 🎯 Ejemplo 8: Validar Arrays

```javascript
export const registrarLecturasMasivasSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  lecturas: z.array(
    z.object({
      medidor_id: z.number().int().positive(),
      lectura_anterior: z.number().min(0),
      lectura_actual: z.number().min(0)
    }).refine(
      data => data.lectura_actual >= data.lectura_anterior,
      { message: 'Lectura actual debe ser >= lectura anterior' }
    )
  ).min(1, 'Debe proporcionar al menos una lectura')
});
```

**Request:**
```json
{
  "periodo": "2026-01",
  "lecturas": [
    { "medidor_id": 1, "lectura_anterior": 1000, "lectura_actual": 1015 },
    { "medidor_id": 2, "lectura_anterior": 2000, "lectura_actual": 2020 },
    { "medidor_id": 3, "lectura_anterior": 3000, "lectura_actual": 3010 }
  ]
}
```

---

## 🎯 Ejemplo 9: Contraseñas Seguras

```javascript
const passwordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .max(128, 'Máximo 128 caracteres')
  .regex(/[a-z]/, 'Debe contener al menos una minúscula')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número')
  .regex(/[@$!%*?&#]/, 'Debe contener al menos un carácter especial');

export const cambiarContraseñaSchema = z.object({
  contraseña_actual: z.string(),
  contraseña_nueva: passwordSchema,
  confirmar_contraseña_nueva: z.string()
}).refine(
  data => data.contraseña_nueva === data.confirmar_contraseña_nueva,
  { message: 'Las contraseñas no coinciden', path: ['confirmar_contraseña_nueva'] }
).refine(
  data => data.contraseña_actual !== data.contraseña_nueva,
  { message: 'La nueva contraseña debe ser diferente', path: ['contraseña_nueva'] }
);
```

---

## 🎯 Ejemplo 10: Esquemas Reutilizables

```javascript
// Base común para todos los esquemas de cliente
const clienteBaseSchema = {
  nombre: z.string().min(3).max(100),
  telefono: z.string().regex(/^\d{10}$/),
  ciudad: z.string().min(3).max(50)
};

// Crear (todos los campos requeridos)
export const crearClienteSchema = z.object({
  ...clienteBaseSchema,
  direccion: z.string().min(5),
  tarifa_id: z.number().int().positive()
}).strict();

// Actualizar (todos los campos opcionales)
export const actualizarClienteSchema = z.object({
  nombre: clienteBaseSchema.nombre.optional(),
  telefono: clienteBaseSchema.telefono.optional(),
  ciudad: clienteBaseSchema.ciudad.optional(),
  direccion: z.string().min(5).optional()
}).strict().refine(
  data => Object.keys(data).length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);
```

---

## 📊 Resumen de Casos de Uso

| Caso | Método | Ejemplo |
|------|--------|---------|
| Validar body | `validate(schema)` | Crear, actualizar recursos |
| Validar params | `validate(schema, 'params')` | IDs en URL |
| Validar query | `validate(schema, 'query')` | Filtros, paginación |
| Validar múltiples | Múltiples `validate()` | Body + Params |
| Validar manual | `validateData(schema, data)` | Lógica condicional |
| Transformar datos | `.transform()` | Uppercase, trim, conversiones |
| Validar lógica compleja | `.refine()` | Reglas de negocio |
| Esquemas reutilizables | Base + extends | DRY principle |

---

## 💡 Tips y Mejores Prácticas

1. **Usar .strict()** - Rechaza campos extra no definidos
2. **Transformar temprano** - Convierte tipos en el validador, no en el controlador
3. **Mensajes claros** - Usa mensajes personalizados en español
4. **Validar en capas** - Middleware para formato, controlador para lógica de negocio
5. **Reutilizar esquemas** - Define bases comunes para crear/actualizar
6. **Testear validadores** - Prueba casos válidos e inválidos
7. **Documentar** - Añade ejemplos en comentarios JSDoc

---

**¿Dudas?** Consulta [README.md](./README.md) para más información.
