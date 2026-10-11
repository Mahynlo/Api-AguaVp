# Documentación de Migración OAuth 2.0

> [!NOTE]
> Esta documentación detalla la implementación del protocolo OAuth 2.0 (Resource Owner Password Credentials) introducida en la versión v2.

## Resumen
Se ha estandarizado la autenticación de la API utilizando **OAuth 2.0**. Esto permite:
- Separar la autenticación de Cliente (`client_id`) de la de Usuario (`username`/`password`).
- Gestionar permisos granulares mediante **Scopes**.
- Unificar la obtención y renovación de tokens en un solo endpoint.

## Endpoints

### POST `/api/v2/oauth/token`
Endpoint único para la emisión de tokens.

**Headers:**
- `Content-Type: application/json`
- `x-app-key: <AppKey>` (Opcional si se envía `client_id` en el body, pero `x-app-key` es el estándar actual para Client Auth).

#### 1. Grant Type: Password (Login)
Obtener un Access Token usando credenciales de usuario.

**Body:**
```json
{
  "grant_type": "password",
  "client_id": "CLIENT_ID_DE_LA_APP", // Opcional si se usa x-app-key
  "username": "admin@aguavp.com",
  "password": "mypassword",
  "scope": "read:reports write:medidores" // Opcional
}
```

**Respuesta (200 OK):**
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 900, // 15 minutos en segundos
  "refresh_token": "a1b2c3d4...",
  "scope": "read:reports write:medidores"
}
```

#### 2. Grant Type: Refresh Token
Renovar un Access Token expirado.

**Body:**
```json
{
  "grant_type": "refresh_token",
  "client_id": "CLIENT_ID_DE_LA_APP",
  "refresh_token": "a1b2c3d4..."
}
```

**Respuesta (200 OK):**
```json
{
  "access_token": "eyJhbGciOi..._nuevo",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "x9y8z7...", // Nuevo refresh token (Rotation)
  "scope": "default"
}
```

## Scopes
El sistema ahora soporta validación de scopes en los endpoints protegidos.

| Scope | Descripción |
|-------|-------------|
| `read:reports` | Acceso de lectura a reportes. |
| `write:medidores` | Crear o modificar medidores. |
| `debtors:manage` | Gestionar cortes y convenios. |
| `admin` | Permisos administrativos completos. |

## Cambios en Base de Datos
- **Tabla `sesiones`**: Nueva columna `app_id` (vincula token a la App).
- **Tabla `apps`**: Nuevas columnas `scopes` (lista de permisos permitidos).

## Migración Frontend
1. Reemplazar llamadas a `/api/v2/auth/login` con `/api/v2/oauth/token` (`grant_type: "password"`).
2. Reemplazar llamadas a `/api/v2/auth/refresh` con `/api/v2/oauth/token` (`grant_type: "refresh_token"`).
3. Asegurar que el header `Authorization: Bearer <token>` se envíe en todas las peticiones a recursos protegidos.

## Guía de Migración (Legacy vs OAuth)

### 1. Inicio de Sesión
**ANTES (Legacy):**
- **Endpoint:** `POST /api/v2/auth/login`
- **Body:** `{ "correo": "...", "contraseña": "..." }`
- **Respuesta:** `{ "token": "...", "usuario": { ... } }`

**AHORA (OAuth 2.0):**
- **Endpoint:** `POST /api/v2/oauth/token`
- **Body:**
  ```json
  {
    "grant_type": "password",
    "username": "...",       // Equivale a 'correo'
    "password": "...",       // Equivale a 'contraseña'
    "client_id": "TU_APP_ID" // Opcional si usas x-app-key
  }
  ```
- **Respuesta:** `{ "access_token": "...", "expires_in": 900, ... }`

### 2. Renovación de Token
**ANTES (Legacy):**
- **Endpoint:** `POST /api/v2/auth/refresh`
- **Body:** `{ "refreshToken": "..." }`

**AHORA (OAuth 2.0):**
- **Endpoint:** `POST /api/v2/oauth/token`
- **Body:**
  ```json
  {
    "grant_type": "refresh_token",
    "refresh_token": "..."
  }
  ```

### 3. Headers en Peticiones
La autenticación en endpoints protegidos (`GET /api/v2/clientes`, etc.) **NO CAMBIA**.
Se sigue utilizando el mismo formato estándar:
- `Authorization: Bearer <access_token>`
- `x-app-key: <app_key>` (Recomendado para identificar el cliente)

> **Compatibilidad**: Ambos sistemas (Legacy y OAuth) conviven actualmente. Recomendamos migrar gradualmente los clientes externos al nuevo endpoint `/oauth/token`.

### 4. Registro de Aplicaciones (Nuevos Campos)
El endpoint para registrar aplicaciones (`POST /api/v2/app/registrarApp`) ha sido actualizado para aceptar metadatos de OAuth:

**Body Request:**
```json
{
  "nombre": "Mi App Cliente",
  "scopes": "read:reports write:medidores", // [NUEVO] Permisos por defecto
  "redirect_uris": "https://myapp.com/callback", // [NUEVO] Para flujos standard
  "client_secret": "..." // [NUEVO] Opcional para apps confidenciales
}
```
Si no se envían `scopes`, se asignará por defecto: `read:reports`.

