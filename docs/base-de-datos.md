# Base de datos y migraciones

## Conexión

Toda la API usa **una sola conexión**: [`src/database/db-sqlite.js`](../src/database/db-sqlite.js).

- Motor: SQLite con `better-sqlite3`. Drizzle ORM se usa como envoltura.
- Ruta: `process.env.DB_PATH`. Si no está definida, `src/database/agua-vp-local.db` (solo en desarrollo).
  - En Electron, `AguaVPServer` fija `DB_PATH` a `%APPDATA%/aguavp/agua-vp.db` antes de cargar el servidor.
- PRAGMAs: `foreign_keys = ON` y `journal_mode = WAL`.
- Registra la función SQL `unaccent()` para búsquedas sin acentos.
- Exporta un wrapper con interfaz `execute({ sql, args })` / `execute(sql)`, que devuelve `{ rows, rowsAffected, lastInsertRowid }`. Es la misma forma que tiene `@libsql/client`, y por eso los servicios llaman a la variable `dbTurso`.

`@libsql/client` solo se usa para conectarse a **Turso Cloud** durante la sincronización ([SINCRONIZACION_TURSO_CLOUD.md](SINCRONIZACION_TURSO_CLOUD.md)).

## Migraciones

```
src/database/
├── schema/            # Esquema Drizzle: fuente para generar migraciones
├── migrations/
│   ├── 0000_*.sql … 0022_*.sql
│   └── meta/
│       ├── _journal.json   # Orden y timestamp ("when") de cada migración
│       └── NNNN_snapshot.json
└── sqlite-migrator.js # customMigrate()
```

### Cómo se aplican

`customMigrate(db, migrationsFolder)` (en `sqlite-migrator.js`):

1. Crea `__drizzle_migrations` si no existe (el mismo formato que usa Drizzle).
2. Lee `meta/_journal.json` y aplica, en orden, cada entrada cuyo `when` sea mayor que el último `created_at` registrado.
3. Ejecuta cada migración en una transacción. Las sentencias `ALTER COLUMN` que genera drizzle-kit (SQLite no las soporta) se traducen a recreación de tabla.
4. Al final ejecuta `ensureCoreTriggers()`, que recrea los triggers de negocio por si la base vino restaurada desde Turso.

Se usa en dos lugares:
- `AguaVPServer.start()`, en cada arranque de Electron.
- `npm run migrate`, para la base de desarrollo ([scripts/migrate.js](../scripts/migrate.js)).

### Reglas

- **Nunca edites, renombres ni borres una migración ya publicada.** Las instalaciones ya la tienen registrada; cambiarla deja las bases desincronizadas.
- **No uses `drizzle-kit push` ni `drizzle-kit migrate`** contra una base real. No pasan por `customMigrate`: no traducen `ALTER COLUMN`, no recrean triggers y `push` no deja registro.
- Que falten algunos `snapshot.json` (0013, 0015, 0018–0020, 0022) es normal: son migraciones escritas a mano.

### Crear una migración nueva

**Cambio de esquema (tablas/columnas):**

1. Edita `src/database/schema/*.js`.
2. `npm run db:generate`. Crea `NNNN_nombre.sql`, su snapshot y la entrada en el journal.
3. Revisa el SQL generado.
4. `npm run migrate` y luego `npm test`.

**SQL a mano (triggers, vistas, correcciones de datos):**

1. `npx drizzle-kit generate --custom --name=descripcion_corta`. Crea un `.sql` vacío y su entrada en el journal con el `when` correcto.
2. Escribe el SQL y separa las sentencias con `--> statement-breakpoint`.
3. `npm run migrate` y luego `npm test`. `test/unit/core-triggers.test.js` aplica todas las migraciones sobre una base limpia.

> No agregues entradas al journal a mano: si el `when` es menor que el de la última migración aplicada, el migrador la salta.

## Herramientas

| Comando | Uso |
|---|---|
| `npm run migrate` | Aplica migraciones pendientes a `DB_PATH` (o a la base local de desarrollo) |
| `npm run db:generate` | Genera una migración a partir de los cambios en `schema/` |
| `npm run db:studio` | Abre Drizzle Studio sobre la base local |
| `node scripts/dev/check-db-state.cjs` | Conteos por tabla y estado de facturas (usa `DB_PATH` o la base de Electron) |
| `node scripts/dev/seed-deudores-test.cjs [--revert]` | Datos de prueba para el módulo de deudores |
