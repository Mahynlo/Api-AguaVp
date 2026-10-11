# Arquitectura de la API

`@aguavp/api-server` es una API REST (Express 5) con base de datos SQLite local. Su uso principal es ir **embebida en la app de escritorio AguaVP (Electron)**, que la importa como paquete y la arranca en `http://localhost:3000`.

## Estructura de `src/`

```
src/
├── api-module.js          # Punto de entrada del paquete: clase AguaVPServer (lo que importa Electron)
├── index.js               # Arranque standalone para desarrollo (npm run dev / npm start)
├── server.js              # App Express: middlewares, SSE, cron jobs, rutas y Swagger
├── config/
│   └── versions.js        # Información de versiones expuesta en /api y /api/versions
├── routes/
│   ├── index.js           # Router raíz montado en /api (health, v1→503, v2, versions)
│   └── health.js          # /api/health (sin versión)
├── controllers/
│   └── healthController.js
├── database/
│   ├── db-sqlite.js       # Conexión única (better-sqlite3 + Drizzle) con interfaz execute()
│   ├── sqlite-migrator.js # Migrador (customMigrate) + triggers base
│   ├── schema/            # Esquema Drizzle (solo para generar migraciones con drizzle-kit)
│   └── migrations/        # Migraciones SQL + meta/_journal.json
├── jobs/
│   ├── procesarDeudores.js   # Detección de candidatos a corte
│   └── verificarConvenios.js # Vencimiento de parcialidades de convenios
├── utils/                 # timezone, tarifaUtils, generateToken, passwordValidator
└── v2/
    ├── index.js           # Router /api/v2
    ├── routes/            # Endpoints por dominio (+ anotaciones Swagger)
    ├── validators/        # Esquemas Zod + middleware validate()
    ├── middlewares/       # appKeyMiddleware, authMiddleware, rateLimiter
    ├── controllers/       # Capa HTTP
    ├── services/          # Lógica de negocio y acceso a datos
    ├── sse/               # Server-Sent Events (sseManager, notificationManager)
    └── config/
        └── permissions.js # Catálogo de permisos y permisos por rol
```

Fuera de `src/` (no se publican en el paquete): `test/`, `scripts/`, `docs/`.

## Ciclo de arranque (Electron)

Electron hace `new AguaVPServer({...}).start()`. `start()` ejecuta, en orden:

1. Crea el directorio de la base de datos si no existe.
2. Copia la configuración recibida a `process.env` (`DB_PATH`, `JWT_SECRET`, `SECRET_APP_KEY`, `APPKEY_INICIAL`, Turso…).
3. **Migraciones**: abre la base con better-sqlite3 y ejecuta `customMigrate()` sobre `src/database/migrations`. Después crea el superadmin por defecto si no hay usuarios y repara la trazabilidad de medidores.
4. Importa `server.js` de forma dinámica. Tiene que ser después del paso 2, porque `db-sqlite.js` lee `DB_PATH` al cargarse.
5. `listen()` y emite `started`.
6. Si hay credenciales de Turso, configura la sincronización (`tursoSyncService`).

Eventos que emite `AguaVPServer`: `log`, `error`, `sync-log`, `starting`, `started`, `stopping`, `stopped`.

> Electron desempaqueta `node_modules/@aguavp/api-server/src/database/migrations/**` del asar. No hay que mover esa carpeta.

## Rutas

| Ruta | Descripción |
|---|---|
| `/api` | Información general y versiones |
| `/api/versions` | Detalle de versiones |
| `/api/health/simple`, `/api/health/status` | Health check público |
| `/api/health`, `/api/health/database`, `/api/health/system` | Health check protegido (app key + JWT) |
| `/api/v1/*` | Responde 503 (la v1 se retiró; su código está en el tag git `v1-final`) |
| `/api/v2/*` | API activa (ver abajo) |
| `/api-docs` | Swagger UI (generado de las anotaciones en `src/v2/routes/*.js`) |

Módulos de `/api/v2`: `app`, `auth`, `users`, `clientes`, `medidores`, `tarifas`, `lecturas`, `facturas`, `pagos`, `rutas`, `events` (SSE), `dashboard`, `reports`, `deudores`, `oauth`, `sync`. Los contratos están en [endpoints/](endpoints/).

## Flujo de una petición

```
Ruta (v2/routes) → rateLimiter → appKeyMiddleware → authMiddleware → validate(zod)
   → controller (v2/controllers) → service (v2/services) → db-sqlite.js
   → notificationManager (SSE) si hay que avisar a clientes conectados
```

## Seguridad

- **App key** (`x-app-key: AppKey <token>`): identifica la instalación. El primer token se obtiene con `APPKEY_INICIAL` en `POST /api/v2/app/registrarApp`.
- **JWT** (`Authorization: Bearer <token>`): identifica al usuario. Hay access token y refresh token, con revocación.
- **Permisos**: roles `superadmin`, `administrador` y `operador`, más permisos por usuario (`src/v2/config/permissions.js`).
- **Sync**: `/api/v2/sync/*` exige el header `x-aguavp-internal-key` (secreto de la app de escritorio).

Más detalle en [guias/autenticacion.md](guias/autenticacion.md) y [endpoints/auth-headers.md](endpoints/auth-headers.md).

## Tiempo real (SSE)

Los clientes se conectan a `GET /api/v2/events/stream`. Los controladores publican eventos con el `notificationManager` (`req.app.get('notificationManager')`).

## Tareas programadas

| Job | `EXECUTION_MODE=LOCAL` (Electron) | `EXECUTION_MODE=SERVER` |
|---|---|---|
| Deudores (`procesarDeudores`) | al iniciar y cada hora | diario 3:00 AM |
| Convenios (`verificarConvenios`) | cada hora | diario 2:00 AM |

## Sincronización con Turso Cloud

La base SQLite local es la única que escribe. Turso funciona como copia espejo para respaldo y restauración. Especificación completa: [SINCRONIZACION_TURSO_CLOUD.md](SINCRONIZACION_TURSO_CLOUD.md).
