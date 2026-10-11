# Headers de Autenticación

Todos los endpoints de la API requieren autenticación mediante tokens JWT.

## Headers Requeridos

### 1. API Key (x-api-key)
Identifica la aplicación cliente que hace la petición.

```http
x-api-key: app_123456789
```

**Cuándo usar:**
- Registro de aplicación
- Obtención de tokens OAuth

---

### 2. Bearer Token (Authorization)
Token JWT que identifica al usuario autenticado.

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Cuándo usar:**
- Todos los endpoints protegidos (CRUD de clientes, facturas, pagos, etc.)
- El token se obtiene mediante el endpoint `/api/v2/oauth/token`

---

## Flujo de Autenticación

### 1. Registrar Aplicación
```http
POST /api/v2/apps/register
x-api-key: your-master-api-key

{
  "nombre": "AguaVP Electron",
  "plataforma": "electron",
  "version_app": "1.0.0",
  "scopes": "read:all write:all"
}
```

**Response:**
```json
{
  "app_id": "app_123456",
  "token": "secret_token_abc",
  "client_secret": "client_secret_xyz"
}
```

---

### 2. Obtener Token de Usuario (Login)
```http
POST /api/v2/oauth/token
x-api-key: app_123456

{
  "grant_type": "password",
  "username": "admin",
  "contraseña": "password123",
  "scope": "read:all write:all"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "read:all write:all"
}
```

---

### 3. Usar Token en Peticiones
```http
GET /api/v2/clientes
x-api-key: app_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### 4. Renovar Token (cuando expire)
```http
POST /api/v2/oauth/token
x-api-key: app_123456

{
  "grant_type": "refresh_token",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Scopes Disponibles

| Scope | Descripción |
|-------|-------------|
| `read:all` | Lectura de todos los recursos |
| `write:all` | Escritura en todos los recursos |
| `read:clientes` | Lectura de clientes |
| `write:clientes` | Escritura de clientes |
| `read:facturas` | Lectura de facturas |
| `write:facturas` | Escritura de facturas |
| `read:pagos` | Lectura de pagos |
| `write:pagos` | Escritura de pagos |

---

## Errores de Autenticación

### 401 Unauthorized
```json
{
  "error": "Token inválido o expirado"
}
```

**Solución:** Renovar token usando refresh_token

---

### 403 Forbidden
```json
{
  "error": "No tienes permisos para esta acción"
}
```

**Solución:** Verificar que el token tenga los scopes necesarios

---

### 400 Bad Request
```json
{
  "error": "API key inválida"
}
```

**Solución:** Verificar que x-api-key sea correcta

---

## Ejemplo Completo

```javascript
// 1. Login
const loginResponse = await fetch('http://localhost:3000/api/v2/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'app_123456'
  },
  body: JSON.stringify({
    grant_type: 'password',
    username: 'admin',
    contraseña: 'password123',
    scope: 'read:all write:all'
  })
});

const { access_token, refresh_token } = await loginResponse.json();

// 2. Usar token en peticiones
const clientesResponse = await fetch('http://localhost:3000/api/v2/clientes', {
  headers: {
    'x-api-key': 'app_123456',
    'Authorization': `Bearer ${access_token}`
  }
});

const clientes = await clientesResponse.json();
```
