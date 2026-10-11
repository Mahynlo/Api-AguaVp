# 🚰 API Agua-VP (`@aguavp/api-server`)

API REST para la gestión de un sistema de agua potable: clientes, medidores, rutas, tarifas, lecturas, facturación, pagos, deudores y convenios.

Se distribuye como paquete npm y va **embebida en la app de escritorio AguaVP (Electron)**. También se puede ejecutar sola para desarrollo.

- **Stack:** Node.js · Express 5 · SQLite (better-sqlite3 + Drizzle) · Zod · JWT · SSE
- **API activa:** `/api/v2` (la v1 se retiró; su código está en el tag git `v1-final`)
- **Respaldo en la nube:** sincronización espejo opcional con Turso Cloud

## Uso desde Electron

```js
const { default: AguaVPServer } = await import('@aguavp/api-server');

const api = new AguaVPServer({
  port: 3000,
  dbPath,                    // p. ej. %APPDATA%/aguavp/agua-vp.db
  jwtSecret, secretAppKey, appKeyInicial,   // requeridos
  tursoDatabaseUrl, tursoAuthToken,         // opcional (sincronización)
  autoMigrate: true,
});

api.on('log', console.log);
await api.start();   // aplica migraciones, crea admin inicial si no hay usuarios y escucha
```

Al arrancar por primera vez se crea el usuario `admin@aguavp.com` / `Admin123!`, que debe cambiar su contraseña en el primer inicio de sesión.

## Desarrollo

```bash
npm install
cp .env.example .env        # completar secretos
npm run migrate             # crea/actualiza src/database/agua-vp-local.db
npm run dev                 # http://localhost:3000  ·  Swagger en /api-docs
```

| Script | Descripción |
|---|---|
| `npm run dev` / `npm start` | Servidor standalone (con / sin nodemon) |
| `npm run migrate` | Aplica migraciones pendientes a la base local |
| `npm test` | Pruebas `node:test` (unitarias y de triggers/sincronización) |
| `npm run test:v2` · `npm run test:sync` | Subconjuntos de pruebas |
| `npm run test:jest` | Suites Jest antiguas (varias desactualizadas) |
| `npm run db:generate` | Genera una migración desde `src/database/schema` |
| `npm run db:studio` | Drizzle Studio sobre la base local |

### Publicar una versión para Electron

1. Sube `version` en `package.json`.
2. `npm pack` genera `aguavp-api-server-X.Y.Z.tgz`. La CI de Electron lo hace sola desde este repo.
3. En el proyecto Electron, apunta la dependencia `@aguavp/api-server` al nuevo `.tgz`.

## Estructura

```
api-AguaVP/
├── src/                # Código publicado en el paquete
│   ├── api-module.js   # AguaVPServer (entrada del paquete)
│   ├── server.js       # App Express
│   ├── database/       # Conexión, migrador, esquema y migraciones
│   ├── v2/             # Rutas, validadores, middlewares, controladores, servicios, SSE
│   ├── routes/ · controllers/   # Router raíz y health check
│   ├── jobs/ · utils/ · config/
├── test/               # unit/, integration/, manual/
├── scripts/            # migrate.js y utilidades de desarrollo (dev/)
└── docs/               # Documentación
```

## Documentación

Índice completo en [docs/README.md](docs/README.md). Para empezar:

- [Arquitectura](docs/arquitectura.md)
- [Base de datos y migraciones](docs/base-de-datos.md)
- [Sincronización con Turso Cloud](docs/SINCRONIZACION_TURSO_CLOUD.md)
- [Endpoints](docs/endpoints/)

## Licencia

ISC
