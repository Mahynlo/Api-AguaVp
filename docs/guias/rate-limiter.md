# Rate Limiter - Documentación V2

## 📋 Descripción

Sistema de rate limiting implementado para proteger los endpoints críticos de la API V2 contra:
- Ataques de fuerza bruta
- Abuso de endpoints
- Spam de registros
- Sobrecarga del servidor

## 🔧 Limiters Implementados

### 1. Login Limiter
**Ruta:** `/api/v2/auth/login`
- **Límite:** 8 intentos cada 15 minutos
- **Propósito:** Prevenir ataques de fuerza bruta en inicio de sesión
- **Respuesta 429:**
```json
{
  "error": "Demasiados intentos de inicio de sesión",
  "mensaje": "Has excedido el límite de intentos. Intenta de nuevo en 15 minutos.",
  "retry_after": "15 minutos"
}
```

### 2. Registro de App Limiter
**Ruta:** `/api/v2/app/registrarApp`
- **Límite:** 8 intentos cada 1 hora
- **Propósito:** Prevenir registro masivo de aplicaciones no autorizadas
- **Respuesta 429:**
```json
{
  "error": "Demasiados intentos de registro",
  "mensaje": "Has excedido el límite de registros de aplicación. Intenta de nuevo en 1 hora.",
  "retry_after": "1 hora"
}
```

### 3. Recuperar Token Limiter
**Ruta:** `/api/v2/app/recuperarToken`
- **Límite:** 4 intentos cada 1 hora
- **Propósito:** Prevenir abuso de recuperación de tokens
- **Respuesta 429:**
```json
{
  "error": "Demasiados intentos de recuperación",
  "mensaje": "Has excedido el límite de recuperaciones de token. Intenta de nuevo en 1 hora.",
  "retry_after": "1 hora"
}
```

### 4. Registro de Usuario Limiter
**Ruta:** `/api/v2/auth/register`
- **Límite:** 10 intentos cada 1 hora
- **Propósito:** Prevenir spam de registro de usuarios
- **Respuesta 429:**
```json
{
  "error": "Demasiados intentos de registro",
  "mensaje": "Has excedido el límite de registros de usuario. Intenta de nuevo en 1 hora.",
  "retry_after": "1 hora"
}
```

### 5. General Limiter
**Uso:** Endpoints no críticos
- **Límite:** 100 requests cada 15 minutos
- **Propósito:** Protección general contra abuso

## 📊 Headers de Rate Limit

Todas las respuestas incluyen headers estándar:

```
RateLimit-Limit: 8           # Límite máximo
RateLimit-Remaining: 5       # Intentos restantes
RateLimit-Reset: 1234567890  # Timestamp de reset
```

## 🔍 Identificación de Clientes

Los limiters identifican clientes por:
1. Header `x-forwarded-for` (si está detrás de un proxy/load balancer)
2. `req.ip` (IP directa)

## 🚨 Logs de Seguridad

Cuando se excede un límite, se registra en consola:
```
[RATE LIMIT] Login excedido - IP: 192.168.1.100
[RATE LIMIT] Registro de app excedido - IP: 10.0.0.5
```

## 💡 Uso en Código

### Importación
```javascript
import { 
  loginLimiter, 
  registroAppLimiter,
  recuperarTokenLimiter,
  registroUsuarioLimiter,
  generalLimiter 
} from '../middlewares/rateLimiter.js';
```

### Aplicación en Rutas
```javascript
// Aplicar a ruta específica
router.post('/login', loginLimiter, appKeyMiddleware, authController.login);

// Aplicar a múltiples rutas
router.use(generalLimiter);
```

## 🛠️ Configuración

Para modificar los límites, editar `src/v2/middlewares/rateLimiter.js`:

```javascript
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // Cambiar ventana de tiempo
    max: 8,                     // Cambiar número de intentos
    // ...
});
```

## 🧪 Testing

### Probar Rate Limiter
```bash
# Hacer múltiples requests rápidas
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/v2/auth/login \
    -H "x-app-key: AppKey YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"correo":"test@test.com","contraseña":"wrong"}'
done
```

Después del intento 8, deberías recibir:
```json
{
  "error": "Demasiados intentos de inicio de sesión",
  "mensaje": "Has excedido el límite de intentos. Intenta de nuevo en 15 minutos.",
  "retry_after": "15 minutos"
}
```

## 📈 Monitoreo

### Endpoints Protegidos

| Endpoint | Limiter | Límite | Ventana |
|----------|---------|---------|---------|
| `/api/v2/auth/login` | loginLimiter | 8 | 15 min |
| `/api/v2/auth/register` | registroUsuarioLimiter | 10 | 1 hora |
| `/api/v2/app/registrarApp` | registroAppLimiter | 8 | 1 hora |
| `/api/v2/app/recuperarToken` | recuperarTokenLimiter | 4 | 1 hora |

## 🔐 Mejores Prácticas

1. **No aumentar límites sin análisis**: Los límites actuales son seguros para uso normal
2. **Monitorear logs**: Revisar frecuentemente logs de `[RATE LIMIT]`
3. **Whitelist IPs confiables**: Si necesitas excluir IPs específicas (ej: tests automatizados)
4. **Combinar con otros middlewares**: El rate limiter se ejecuta ANTES de la autenticación

## 🎯 Próximas Mejoras

- [ ] Almacenar límites en Redis (para múltiples instancias)
- [ ] Sistema de whitelist/blacklist de IPs
- [ ] Límites dinámicos basados en rol de usuario
- [ ] Dashboard de monitoreo de rate limiting
- [ ] Alertas automáticas por abuso detectado

## 📞 Troubleshooting

### Problema: "Demasiados intentos" en desarrollo
**Solución:** Reinicia el servidor o espera el tiempo de ventana

### Problema: No funciona detrás de proxy
**Solución:** Configura `trust proxy` en Express:
```javascript
app.set('trust proxy', 1);
```

### Problema: Necesito excluir una IP
**Solución:** Agregar skip function:
```javascript
export const loginLimiter = rateLimit({
    // ...
    skip: (req) => {
        const trustedIPs = ['127.0.0.1', '::1'];
        return trustedIPs.includes(req.ip);
    }
});
```
