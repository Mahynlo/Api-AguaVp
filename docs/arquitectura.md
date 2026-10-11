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
├── utils/                 # logger, errores, timezone, tarifaUtils, generateToken, passwordValidator
└── v2/
    ├── index.js           # Router /api/v2
    ├── routes/            # Endpoints por dominio: URL + cadena de middlewares
    ├── validators/        # Esquemas Zod + middleware validate()
    ├── middlewares/       # appKeyMiddleware, authMiddleware, rateLimiter
    ├── controllers/       # Capa HTTP
    ├── services/          # Lógica de negocio y acceso a datos (reports/: un archivo por reporte)
    ├── openapi/           # Documentación Swagger separada de las rutas (app, oauth, reports, rutas)
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

Eventos que emite `AguaVPServer`: `log`, `error`, `sync-log`, `api-log`, `starting`, `started`, `stopping`, `stopped`.

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
| `/api-docs` | Swagger UI (generado de las anotaciones en `src/v2/routes/*.js` y `src/v2/openapi/*.js`) |

Módulos de `/api/v2`: `app`, `auth`, `users`, `clientes`, `medidores`, `tarifas`, `lecturas`, `facturas`, `pagos`, `rutas`, `events` (SSE), `dashboard`, `reports`, `deudores`, `oauth`, `sync`. Los contratos están en [endpoints/](endpoints/).

## Flujo de una petición

```
Ruta (v2/routes) → rateLimiter → appKeyMiddleware → authMiddleware → validate(zod)
   → controller (v2/controllers) → service (v2/services) → db-sqlite.js
   → notificationManager (SSE) si hay que avisar a clientes conectados
```

## Estructura de un módulo

Estándar que siguen los módulos ya ordenados (`app`, `users`, `oauth`, `rutas`, `reports`, `deudores`: cortes y convenios). Para agregar o modificar un módulo, copia uno de ellos:

| Archivo | Qué contiene | Qué no contiene |
|---|---|---|
| `v2/routes/<modulo>.js` | URL, middlewares y controller de cada endpoint | lógica, SQL |
| `v2/openapi/<modulo>.js` | Comentarios `@swagger` (solo si son largos; si son cortos pueden quedar junto a la ruta) | código |
| `v2/controllers/<modulo>Controller.js` | Leer `req`, validar entrada, logs, avisos SSE y forma de la respuesta | SQL, imports de `db-sqlite.js` |
| `v2/services/<modulo>Service.js` | Reglas de negocio y consultas; lanza `crearError(msg, status)` | `req`/`res` |
| `test/http/<modulo>.test.js` | Tests HTTP contra la app real con una base temporal | mocks de la base |

En el controller, los errores de negocio lanzados por el service se responden con:

```js
} catch (error) {
    if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error); // status + { error, ...datos }
    console.error('...', error);
    res.status(500).json({ error: '...' });
}
```

Swagger lee los archivos de `routes/` y `openapi/` ordenados por módulo (`archivosSwagger()` en `src/server.js`), así que mover la documentación de un módulo a `openapi/` no cambia lo que muestra `/api-docs`.

Módulos todavía sin ordenar (SQL o lógica en archivos grandes): `facturas`, `pagos`, `lecturas`, `tarifas`, `clientes`, `medidores`. Son críticos para cobro; se ordenan solo con tests de caracterización previos.

## Verificar que un cambio no altera el comportamiento

1. `npm test`: incluye los tests HTTP de `test/http/` (usan `test/helpers/servidor-prueba.js` y los datos fijos de `test/helpers/datos-prueba.js`).
2. `node scripts/dev/comparar-versiones/index.mjs [refA=HEAD] [refB=actual]`: ejecuta los mismos escenarios contra dos versiones del código y compara todas las respuestas y todas las tablas.
3. `npm run lint`.

## Seguridad

- **App key** (`x-app-key: AppKey <token>`): identifica la instalación. El primer token se obtiene con `APPKEY_INICIAL` en `POST /api/v2/app/registrarApp`.
- **JWT** (`Authorization: Bearer <token>`): identifica al usuario. Hay access token y refresh token, con revocación.
- **Permisos**: roles `superadmin`, `administrador` y `operador`, más permisos por usuario (`src/v2/config/permissions.js`).
- **Sync**: `/api/v2/sync/*` exige el header `x-aguavp-internal-key` (secreto de la app de escritorio).

Más detalle en [guias/autenticacion.md](guias/autenticacion.md) y [endpoints/auth-headers.md](endpoints/auth-headers.md).

## Tiempo real (SSE)

Los clientes se conectan a `GET /api/v2/events/stream`. Los controladores publican eventos con el `notificationManager` (`req.app.get('notificationManager')`).

## Logs

Para código nuevo o refactorizado, usa `createLogger` de [`src/utils/logger.js`](../src/utils/logger.js) en lugar de `console.*`:

```js
import { createLogger } from '../../utils/logger.js';
const log = createLogger('lecturas');
log.info('Lectura registrada', id);   // = console.log(...)
log.error('Error al registrar:', err); // = console.error(...)
```

- La consola recibe exactamente los mismos argumentos que con `console.*`, así que la salida no cambia.
- Además, cada mensaje se emite como evento `api-log` de `AguaVPServer` (`{ nivel, modulo, mensaje }`). Electron puede escucharlo para mostrarlo en su visor de logs.
- No registres tokens, contraseñas ni datos personales.

## Manejo de errores

[`src/utils/errores.js`](../src/utils/errores.js) evita repetir el mismo `try/catch` en cada controller:

```js
import { manejarErrores, crearError } from '../../utils/errores.js';

// En el service: lanzar errores con código HTTP
if (!cliente) throw crearError('Cliente no encontrado', 404);

// En el controller: sin try/catch
obtenerCliente: manejarErrores(async (req, res) => {
    res.json(await obtenerCliente(req.params.id));
}, { mensaje: 'Error al obtener cliente', log: 'Error obteniendo cliente v2:' }),
```

Respuesta de error según opciones (las mismas que usan hoy los controllers):

| Opciones | Respuesta |
|---|---|
| `{ mensaje }` | `status(err.status || 500)` + `{ error: err.message || mensaje }` |
| `{ mensaje, exponerMensaje: false, statusDelError: false }` | `status(500)` + `{ error: mensaje }` |
| `{ mensaje, formato: 'success' }` | `status(err.status || 500)` + `{ success: false, message: err.message || mensaje }` |

Al migrar un controller, hay que elegir las opciones que reproducen su `catch` actual. Los casos con campos extra (`cliente`, `detalles`…) se quedan con su `catch` propio. No hay un middleware global de errores a propósito: los errores no atrapados se siguen respondiendo como hasta ahora.

## Tareas programadas

| Job | `EXECUTION_MODE=LOCAL` (Electron) | `EXECUTION_MODE=SERVER` |
|---|---|---|
| Deudores (`procesarDeudores`) | al iniciar y cada hora | diario 3:00 AM |
| Convenios (`verificarConvenios`) | cada hora | diario 2:00 AM |

## Sincronización con Turso Cloud

La base SQLite local es la única que escribe. Turso funciona como copia espejo para respaldo y restauración. Especificación completa: [SINCRONIZACION_TURSO_CLOUD.md](SINCRONIZACION_TURSO_CLOUD.md).
