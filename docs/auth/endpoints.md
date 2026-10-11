# Autenticación - Endpoints

## POST /api/v2/oauth/token

**Obtener token (Login)**

### Request (Password Grant)
```json
{
  "grant_type": "password",
  "username": "admin",
  "contraseña": "password123",
  "scope": "read:all write:all"
}
```

### Response 200
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

## POST /api/v2/oauth/token

**Renovar token**

### Request (Refresh Token Grant)
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Response 200
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## POST /api/v2/apps/register

**Registrar aplicación**

### Request
```json
{
  "nombre": "AguaVP Electron",
  "plataforma": "electron",
  "version_app": "1.0.0",
  "scopes": "read:all write:all",
  "redirect_uris": "http://localhost:3000/callback"
}
```

### Response 201
```json
{
  "mensaje": "App registrada exitosamente",
  "app_id": "app_123456",
  "token": "secret_token_123",
  "client_secret": "client_secret_abc"
}
```

---

## Headers Requeridos

### API Key (Registro de App)
```
x-api-key: your-api-key
```

### Bearer Token (Endpoints protegidos)
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
