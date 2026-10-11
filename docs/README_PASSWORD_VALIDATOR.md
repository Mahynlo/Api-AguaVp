# Validador de Contraseñas - Documentación

## 📋 Descripción

Sistema de validación de contraseñas que garantiza que todas las contraseñas cumplan con estándares de seguridad robustos.

## ✅ Requisitos de Contraseña

1. **Mínimo 8 caracteres** (máximo 128)
2. **Al menos 1 letra mayúscula** (A-Z)
3. **Al menos 1 letra minúscula** (a-z)
4. **Al menos 1 número** (0-9)
5. **Al menos 1 carácter especial** (!@#$%^&*()_+-=[]{}|;:,.<>?)
6. **No ser una contraseña común** (lista de 29+ contraseñas bloqueadas)
7. **No contener secuencias obvias** (123, abc, qwerty)
8. **No contener solo números**

## 🚀 Uso

### Importación

```javascript
import { 
  validatePassword, 
  calculatePasswordStrength,
  generateSecurePassword,
  formatValidationErrors 
} from '../utils/passwordValidator.js';
```

### Validar Contraseña

```javascript
const validation = validatePassword('MiPass123!');

if (validation.valid) {
  console.log('Contraseña válida ✓');
} else {
  console.log('Errores:', validation.errors);
}
```

**Respuesta:**
```javascript
{
  valid: true,
  errors: []
}
```

### Contraseña Inválida

```javascript
const validation = validatePassword('123456');

console.log(validation);
// {
//   valid: false,
//   errors: [
//     'La contraseña debe contener al menos una letra mayúscula',
//     'La contraseña debe contener al menos una letra minúscula',
//     'La contraseña debe contener al menos un carácter especial',
//     'Esta contraseña es demasiado común. Por favor, elige una más segura',
//     'La contraseña no puede contener solo números',
//     'La contraseña no puede contener secuencias obvias (ej: 123, abc)'
//   ]
// }
```

### Calcular Fortaleza

```javascript
const strength = calculatePasswordStrength('MyP@ssw0rd2024');

console.log(strength);
// {
//   score: 85,
//   strength: 'Fuerte'
// }
```

**Niveles de fortaleza:**
- `0-29`: Muy débil
- `30-49`: Débil
- `50-69`: Media
- `70-89`: Fuerte
- `90-100`: Muy fuerte

### Generar Contraseña Segura

```javascript
const password = generateSecurePassword(16);

console.log(password);
// Ejemplo: "Kx9#mL2@pQ7!vN5$"
```

### Formatear Errores

```javascript
const validation = validatePassword('weak');
const mensaje = formatValidationErrors(validation.errors);

console.log(mensaje);
// "La contraseña no cumple con los siguientes requisitos:
// 1. La contraseña debe contener al menos una letra mayúscula
// 2. La contraseña debe contener al menos un número
// 3. La contraseña debe contener al menos un carácter especial"
```

## 🔐 Integración en V2

### En authController.js

La validación ya está integrada en el endpoint de registro:

```javascript
// POST /api/v2/auth/register
registrar: async (req, res) => {
    const { contrasena } = req.body;
    
    // Validar contraseña
    const validation = validatePassword(contrasena);
    if (!validation.valid) {
        return res.status(400).json({ 
            error: "Contraseña no válida",
            detalles: validation.errors,
            mensaje: formatValidationErrors(validation.errors)
        });
    }
    
    // Continuar con registro...
}
```

### Respuesta del API

**Contraseña válida:**
```json
{
  "mensaje": "Usuario registrado con éxito",
  "usuario": {
    "id": 1,
    "correo": "user@example.com",
    "nombre": "Usuario",
    "username": "usuario1",
    "rol": "operador"
  }
}
```

**Contraseña inválida:**
```json
{
  "error": "Contraseña no válida",
  "detalles": [
    "La contraseña debe tener al menos 8 caracteres",
    "La contraseña debe contener al menos una letra mayúscula",
    "La contraseña debe contener al menos un número"
  ],
  "mensaje": "La contraseña no cumple con los siguientes requisitos:\n1. La contraseña debe tener al menos 8 caracteres\n2. La contraseña debe contener al menos una letra mayúscula\n3. La contraseña debe contener al menos un número"
}
```

## 🧪 Ejemplos de Contraseñas

### ❌ Contraseñas Rechazadas

```javascript
'123456'        // Común + solo números
'password'      // Común + sin requisitos
'Password'      // Falta número y especial
'Pass123'       // Falta carácter especial y longitud mínima
'12345678'      // Común + solo números + secuencia
'qwerty123'     // Común + secuencia
'abc12345'      // Secuencia
'P@ssword'      // Falta número
```

### ✅ Contraseñas Aceptadas

```javascript
'MyP@ss123'     // Cumple todos los requisitos
'Secur3!Pass'   // Fuerte y válida
'C0mpl3x#2024'  // Excelente
'Tr0ng$Pass'    // Válida
'Valid@123Pass' // Muy buena
```

## 📊 Contraseñas Comunes Bloqueadas

Lista de 29 contraseñas prohibidas:
- `123456`, `password`, `12345678`, `qwerty`
- `123456789`, `12345`, `1234`, `111111`
- `1234567`, `dragon`, `123123`, `baseball`
- `iloveyou`, `1234567890`, `000000`, `password123`
- `abc123`, `qwerty123`, `password1`, `admin`
- `letmein`, `welcome`, `monkey`, `sunshine`
- `master`, `admin123`, `aguavp`, `aguavp123`
- `admin123456`

## 🎯 Detección de Secuencias

Se detectan y rechazan las siguientes secuencias (4+ caracteres):
- **Números:** `0123`, `1234`, `9876`, etc.
- **Alfabeto:** `abcd`, `defg`, `zyxw`, etc.
- **Teclado:** `qwer`, `asdf`, `zxcv`, etc.

## 💡 Mejores Prácticas

### Para Usuarios
1. Usa una combinación de tipos de caracteres
2. Evita información personal (nombre, fecha de nacimiento)
3. No reutilices contraseñas
4. Usa un gestor de contraseñas
5. Considera usar la función `generateSecurePassword()`

### Para Desarrolladores
1. Siempre valida en el backend (nunca confíes solo en frontend)
2. Hashea contraseñas con bcrypt (salt factor 10+)
3. No almacenes contraseñas en texto plano
4. No logues contraseñas ni en desarrollo
5. Implementa rate limiting en endpoints de auth

## 🔄 Actualizar Lista de Contraseñas Comunes

Para agregar más contraseñas prohibidas:

```javascript
// src/utils/passwordValidator.js
const COMMON_PASSWORDS = [
    '123456',
    'password',
    // ... agregar más aquí
    'nuevaProhibida'
];
```

## 🧪 Testing

### Prueba Manual

```bash
# En una ruta de prueba o consola Node
node -e "
import { validatePassword } from './src/utils/passwordValidator.js';
console.log(validatePassword('TestPass123!'));
"
```

### Prueba con API

```bash
curl -X POST http://localhost:3000/api/v2/auth/register \
  -H "x-app-key: AppKey YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "correo": "test@test.com",
    "nombre": "Test User",
    "contrasena": "weak",
    "username": "testuser",
    "rol": "operador"
  }'
```

**Respuesta esperada (400):**
```json
{
  "error": "Contraseña no válida",
  "detalles": [
    "La contraseña debe tener al menos 8 caracteres",
    "La contraseña debe contener al menos una letra mayúscula",
    "La contraseña debe contener al menos un número",
    "La contraseña debe contener al menos un carácter especial"
  ]
}
```

## 📈 Métricas de Seguridad

| Métrica | Valor |
|---------|-------|
| Longitud mínima | 8 caracteres |
| Longitud recomendada | 12+ caracteres |
| Contraseñas comunes bloqueadas | 29 |
| Tipos de caracteres requeridos | 4 (mayúscula, minúscula, número, especial) |
| Secuencias detectadas | 7 tipos |

## 🎯 Roadmap

- [ ] Integrar con servicio de breached passwords (HaveIBeenPwned API)
- [ ] Agregar más contraseñas comunes en español
- [ ] Sistema de historial de contraseñas (no reutilizar últimas 5)
- [ ] Verificación de entropía
- [ ] Sugerencias de contraseñas fuertes
- [ ] Medidor visual de fortaleza para frontend

## 📞 Troubleshooting

### "La contraseña debe contener al menos un carácter especial"
**Solución:** Usa alguno de estos: `!@#$%^&*()_+-=[]{}|;:,.<>?`

### "Esta contraseña es demasiado común"
**Solución:** Evita contraseñas obvias. Usa `generateSecurePassword()` o crea una única

### Contraseña válida pero dice que tiene secuencias
**Solución:** Evita patrones como `1234`, `abcd`, `qwerty` en tu contraseña
