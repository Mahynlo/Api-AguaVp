# Project Guidelines (api-AguaVP)

## Code Style
- Use JavaScript ES modules and preserve current folder boundaries (`v2`, `database`, `utils`, `jobs`, `routes`, `controllers`).
- Prefer extending existing validators/controllers/services/routes rather than introducing parallel patterns.
- Keep endpoint naming and controller organization consistent with current domain files.

## Build, Run, and Tests
- Install dependencies: `npm install`
- Apply migrations to the local dev DB: `npm run migrate`
- Dev server: `npm run dev` / production start: `npm start`
- Tests (node:test): `npm test` — subsets: `npm run test:v2`, `npm run test:sync`
- Legacy Jest suites: `npm run test:jest` (several are outdated)
- Drizzle Kit (dev only):
  - Generate a migration from the schema: `npm run db:generate`
  - Open studio: `npm run db:studio`
- Never use `drizzle-kit push`/`migrate` against a client DB: migrations are applied by `customMigrate` (`src/database/sqlite-migrator.js`).

## Architecture
- The package entry point is `src/api-module.js` (`AguaVPServer`), embedded by the Electron app.
- The only API is `v2` (`/api/v2/*`). `/api/v1` returns 503; v1 code lives in git tag `v1-final`.
- Request flow:
  1. Route definition in `src/v2/routes/**`
  2. Input validation in `src/v2/validators/**` + middleware
  3. HTTP handling in `src/v2/controllers/**`, business logic in `src/v2/services/**`
  4. Data access through `src/database/db-sqlite.js`
- Real-time updates use SSE (`src/v2/sse/**`).
- Migrations live in `src/database/migrations/` (Drizzle journal). Never edit or rename an applied migration.

## Security and Validation Conventions
- Keep dual access model in mind: app key (`x-app-key`) + JWT auth middleware.
- New input surfaces must use Zod schemas in `src/v2/validators/**`.
- Reuse timezone helpers in `src/utils/timezone.js` for date-window calculations.
- Do not add sensitive tokens or user credential data to logs.

## Key Files to Check First
- `README.md`
- `docs/arquitectura.md`, `docs/base-de-datos.md`
- `src/api-module.js`, `src/server.js`, `src/routes/index.js`
- `src/v2/index.js`, `src/v2/routes/**`, `src/v2/services/**`

## Link, Do Not Duplicate
- Docs index: `docs/README.md`
- Endpoint contracts: `docs/endpoints/**`
- Guides (auth, validation, timezone, rate limiter): `docs/guias/**`
- Turso sync spec: `docs/SINCRONIZACION_TURSO_CLOUD.md`
- Past proposals/plans: `docs/historial/**`

## Cross-Repo Context
- This API is consumed by sibling Electron app `AguaVP` (`../Agua_vp_Actualizacion/AguaVP`) as `@aguavp/api-server` (tgz built with `npm pack`).
- Electron unpacks `node_modules/@aguavp/api-server/src/database/migrations/**` from asar: keep that path.
- Backward compatibility changes to response shapes should be coordinated with the Electron renderer and `src/main/api-client/**`.
