# Project Guidelines (api-AguaVP)

## Code Style
- Use JavaScript ES modules and preserve current folder boundaries (`v1`, `v2`, `database`, `utils`, `jobs`).
- Prefer extending existing validators/controllers/routes rather than introducing parallel patterns.
- Keep endpoint naming and controller organization consistent with current domain files.

## Build, Run, and Tests
- Install dependencies: `npm install`
- Dev server: `npm run dev`
- Production start: `npm start`
- Build bundle: `npm run build`
- Run tests: `npm run test`
- Password validator tests: `npm run test:password`
- Drizzle operations:
  - Generate migrations: `npm run db:generate`
  - Apply migrations: `npm run db:push`
  - Apply triggers/views: `npm run db:triggers`
  - Open studio: `npm run db:studio`

## Architecture
- Active API is `v2` (`/api/v2/*`) with modular routes/controllers/validators.
- `v1` exists for legacy compatibility but is currently not the primary implementation path.
- Request flow should remain:
  1. Route definition in `src/v2/routes/**`
  2. Input validation in `src/v2/validators/**` + middleware
  3. Business logic in `src/v2/controllers/**`
  4. Data access through `src/database/**`
- Real-time updates in v2 use SSE (`src/v2/sse/**`), not WebSockets.

## Security and Validation Conventions
- Keep dual access model in mind: app key (`x-app-key`) + JWT auth middleware.
- New input surfaces must use Zod schemas in `src/v2/validators/**`.
- Reuse timezone helpers in `src/utils/timezone.js` for date-window calculations.
- Do not add sensitive tokens or user credential data to logs.

## Key Files to Check First
- `README.md`
- `src/README.md`
- `src/server.js`
- `src/routes/index.js`
- `src/v2/routes/**`
- `src/v2/controllers/**`
- `src/v2/validators/**`
- `drizzle.config.ts`

## Link, Do Not Duplicate
- Security roadmap: `docs/PLAN_SEGURIDAD_PRODUCCION.md`
- Endpoint contracts: `docs/**/endpoints.md`
- Auth details: `docs/auth/**`
- Validation documentation: `docs/validacion/**` and `src/v2/validators/README.md`
- SQLite local test flow: `SQLITE_TEST_GUIDE.md`

## Cross-Repo Context
- This API is consumed by sibling Electron app `AguaVP` through a local package tarball.
- Backward compatibility changes to response shapes should be coordinated with `../AguaVP/src/preload/index.js` and renderer consumers.
