# 🛡️ Sistema de Validación con Zod - API AguaVP v2

## 📋 Descripción

Sistema completo de validación de datos implementado con **Zod** para la API v2 de AguaVP. Proporciona validación de esquemas robusta, mensajes de error descriptivos y transformación automática de datos.

---

## 🎯 Características

### ✅ Validaciones Implementadas

- **Tipos de datos** - Validación estricta de tipos (string, number, date, email, etc.)
- **Rangos y límites** - Mínimos, máximos, longitudes
- **Formatos específicos** - Emails, teléfonos, URLs, fechas (YYYY-MM-DD, YYYY-MM)
- **Enumeraciones** - Estados, roles, métodos de pago, etc.
- **Validaciones personalizadas** - Lógica de negocio específica
- **Transformaciones** - Conversión automática de tipos (string → number, uppercase, trim)
- **Mensajes de error** - Descriptivos y personalizados en español

### 🔐 Validación Automática

- Integrada en todas las rutas de la API v2
- Validación de `req.body`, `req.params`, `req.query`
- Respuestas de error estandarizadas
- Sin código de validación duplicado en controladores

---

## 📂 Estructura del Sistema

```
src/v2/validators/
├── index.js                    # Exportación centralizada
├── validationMiddleware.js     # Middleware genérico de validación
├── authValidator.js            # Validadores de autenticación
├── clienteValidator.js         # Validadores de clientes
├── medidorValidator.js         # Validadores de medidores
├── facturaValidator.js         # Validadores de facturas
├── pagoValidator.js            # Validadores de pagos
├── tarifaValidator.js          # Validadores de tarifas
└── lecturaValidator.js         # Validadores de lecturas
```

---

## 🚀 Uso

### 1. En Rutas (Recomendado)

```javascript
import { validate, crearClienteSchema, clienteIdParamSchema } from '../validators/index.js';

// Validar body
router.post('/clientes', 
  authMiddleware, 
  validate(crearClienteSchema), 
  clientesController.crear
);

// Validar params
router.put('/clientes/:id', 
  authMiddleware,
  validate(clienteIdParamSchema, 'params'),
  validate(actualizarClienteSchema),
  clientesController.actualizar
);

// Validar query
router.get('/clientes',
  authMiddleware,
  validate(buscarClienteSchema, 'query'),
  clientesController.listar
);
```

### 2. En Controladores (Manual)

```javascript
import { validateData, crearClienteSchema } from '../validators/index.js';

async function crearCliente(req, res) {
  const { success, data, errors } = validateData(crearClienteSchema, req.body);
  
  if (!success) {
    return res.status(400).json({ 
      error: 'Datos inválidos', 
      detalles: errors 
    });
  }
  
  // Usar data validado y transformado
  // ...
}
```

---

## 📝 Ejemplos de Validadores

### Cliente

```javascript
// Crear cliente
{
  nombre: "Juan Pérez",           // string, 3-100 chars, solo letras
  telefono: "3001234567",         // string, exactamente 10 dígitos
  correo: "juan@email.com",       // email válido (opcional)
  ciudad: "Bogotá",               // string, 3-50 chars
  tarifa_id: 1                    // number positivo o string numérico
}

// Actualizar cliente
{
  nombre: "Juan Carlos Pérez",    // opcional
  estado_cliente: "Activo"        // enum: Activo, Inactivo, Suspendido
}
```

### Autenticación

```javascript
// Login
{
  correo: "admin@aguavp.com",     // email válido
  contraseña: "SecureP@ss123",    // string, min 1 char
  dispositivo: "Chrome/Windows"   // opcional, max 100 chars
}

// Registro
{
  nombre: "Admin Usuario",
  correo: "admin@aguavp.com",
  contraseña: "SecureP@ss123",    // Min 8, 1 mayús, 1 minús, 1 num, 1 especial
  confirmar_contraseña: "SecureP@ss123",
  rol: "admin"                    // enum: admin, operador, lecturista
}
```

### Factura

```javascript
{
  cliente_id: 1,
  lectura_id: 10,
  periodo: "2026-01",             // YYYY-MM
  consumo_m3: 15.5,
  monto_base: 45000,
  cargo_fijo: 5000,
  recargos: 0,
  descuentos: 0,
  total: 50000,                   // Debe coincidir con cálculo
  fecha_vencimiento: "2026-02-15" // YYYY-MM-DD
}
```

### Lectura

```javascript
{
  medidor_id: 5,
  lectura_anterior: 1000,
  lectura_actual: 1015,           // Debe ser >= lectura_anterior
  periodo: "2026-01",
  fecha_lectura: "2026-01-25",
  observaciones: "Lectura normal", // opcional, max 500 chars
  foto_url: "https://..."         // opcional, URL válida
}
```

---

## 🔍 Respuestas de Error

### Error de Validación

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
    }
  ],
  "code": "VALIDATION_ERROR"
}
```

### Transformaciones Automáticas

```javascript
// Entrada
{
  telefono: "  3001234567  ",
  numero_serie: "abc-123",
  tarifa_id: "5"
}

// Salida transformada
{
  telefono: "3001234567",         // trim()
  numero_serie: "ABC-123",        // toUpperCase()
  tarifa_id: 5                    // string → number
}
```

---

## 🛠️ Validadores Disponibles

### Auth Validators
- `loginSchema` - Login de usuario
- `registrarUsuarioSchema` - Registro de usuario
- `cambiarContraseñaSchema` - Cambio de contraseña
- `actualizarPerfilSchema` - Actualizar perfil
- `usuarioIdParamSchema` - Validar ID en params

### Cliente Validators
- `crearClienteSchema` - Crear cliente
- `actualizarClienteSchema` - Actualizar cliente
- `eliminarClienteSchema` - Soft delete con razón
- `cambiarEstadoClienteSchema` - Cambiar estado
- `clienteIdParamSchema` - Validar ID
- `buscarClienteSchema` - Query params búsqueda

### Medidor Validators
- `crearMedidorSchema` - Crear medidor
- `actualizarMedidorSchema` - Actualizar medidor
- `cambiarEstadoMedidorSchema` - Cambiar estado
- `cambiarEstadoServicioSchema` - Cortar/reconectar
- `coordenadasGPSSchema` - Validar coordenadas
- `medidorIdParamSchema` - Validar ID

### Factura Validators
- `crearFacturaSchema` - Generar factura
- `actualizarFacturaSchema` - Actualizar factura
- `aplicarRecargosSchema` - Aplicar recargos
- `aplicarDescuentosSchema` - Aplicar descuentos
- `facturaIdParamSchema` - Validar ID
- `buscarFacturaSchema` - Query params

### Pago Validators
- `registrarPagoSchema` - Registrar pago
- `actualizarPagoSchema` - Actualizar pago
- `anularPagoSchema` - Anular pago con motivo
- `pagoIdParamSchema` - Validar ID
- `buscarPagoSchema` - Query params

### Tarifa Validators
- `crearTarifaSchema` - Crear tarifa
- `actualizarTarifaSchema` - Actualizar tarifa
- `crearRangoTarifaSchema` - Crear rango
- `actualizarRangoTarifaSchema` - Actualizar rango
- `tarifaIdParamSchema` - Validar ID
- `calcularCostoConsumoSchema` - Calcular costo

### Lectura Validators
- `registrarLecturaSchema` - Registrar lectura
- `actualizarLecturaSchema` - Actualizar lectura
- `registrarLecturaAnomaliaSchema` - Lectura con anomalía
- `registrarLecturasMasivasSchema` - Lecturas masivas
- `lecturaIdParamSchema` - Validar ID
- `buscarLecturaSchema` - Query params

---

## ✨ Ventajas del Sistema

### 🎯 Para Desarrolladores

- ✅ **Código limpio** - Sin validaciones manuales en controladores
- ✅ **Reutilizable** - Esquemas compartidos entre rutas
- ✅ **Type-safe** - Transformación automática de tipos
- ✅ **Mantenible** - Validaciones centralizadas
- ✅ **Testeable** - Fácil de probar unitariamente

### 🔒 Para la Aplicación

- ✅ **Seguridad** - Previene inyecciones y datos malformados
- ✅ **Consistencia** - Mismo formato de errores en toda la API
- ✅ **Performance** - Validación rápida antes de llegar a BD
- ✅ **UX mejorado** - Mensajes de error claros en español
- ✅ **Menos bugs** - Datos siempre en el formato esperado

---

## 📚 Recursos

- [Documentación Zod](https://zod.dev/)
- [Validación de Contraseñas](./passwordValidator.js)
- [Middlewares Auth](../middlewares/)

---

## 🔄 Migración desde V1

Las rutas de V1 NO tienen validación automática. La validación se implementó completamente en V2.

### Antes (V1)
```javascript
async function crearCliente(req, res) {
  const { nombre, telefono } = req.body;
  
  if (!nombre || nombre.length < 3) {
    return res.status(400).json({ error: 'Nombre inválido' });
  }
  
  if (!telefono || !/^\d{10}$/.test(telefono)) {
    return res.status(400).json({ error: 'Teléfono inválido' });
  }
  
  // ... lógica
}
```

### Después (V2)
```javascript
// En la ruta
router.post('/clientes', validate(crearClienteSchema), controller.crear);

// En el controlador
async function crearCliente(req, res) {
  // req.body ya está validado y transformado
  const { nombre, telefono } = req.body;
  
  // ... solo lógica de negocio
}
```

---

## 🧪 Testing

```javascript
import { crearClienteSchema } from './validators/clienteValidator.js';

describe('Cliente Validator', () => {
  it('debe validar cliente correcto', () => {
    const data = {
      nombre: 'Juan Pérez',
      telefono: '3001234567',
      ciudad: 'Bogotá',
      direccion: 'Calle 123',
      tarifa_id: 1
    };
    
    const result = crearClienteSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
  
  it('debe rechazar teléfono inválido', () => {
    const data = { /* ... */, telefono: '123' };
    
    const result = crearClienteSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
```

---

## 📞 Soporte

Para dudas o problemas con validaciones:
- Revisar [validationMiddleware.js](./validationMiddleware.js)
- Consultar ejemplos en cada validador
- Ver logs de errores en desarrollo

---

**Última actualización:** Enero 2026  
**Versión:** 2.0.0  
**Autor:** Sistema AguaVP
