# Servicio de Sincronización Espejo con Turso Cloud (Backend API v2)

Especificación técnica del subsistema de copia de seguridad en Turso Cloud integrado en `@aguavp/api-server`.

> Versión documentada: **1.0.11**. Guía operativa para usuarios/administradores: `AguaVP/docs/sincronizacion-turso-cloud.md` (app). Plan de mejoras: `AguaVP/docs/plan-sincronizacion-turso.md`.

**Regla principal:** el SQLite local es el único escritor y ninguna operación puede dejar la nube con menos datos válidos de los que tenía.

---

## 1. Arquitectura del Servicio

| Archivo | Responsabilidad |
|---|---|
| `src/v2/services/tursoSyncCore.js` | Lógica **sin estado ni conexiones propias**: recibe `local` (SQLite síncrono: better-sqlite3 o `node:sqlite`) y `remote` (`@libsql/client`). Identidad, integridad, guarda anti-sobrescritura, registro de cambios, esquema remoto, copia, borrado por diferencia, verificación y reparación. Se prueba sin Turso. |
| `src/v2/services/tursoSyncService.js` | Estado del servicio (cliente Turso, temporizador, `inProgress`, conflicto, verificación), coordinación de carga semilla e incremental, estado persistente. |
| `src/v2/controllers/syncController.js` | Respuestas HTTP (409 en conflicto). |
| `src/v2/routes/sync.js` | Rutas y control de acceso. |
| `src/database/sqlite-migrator.js` | `CORE_TRIGGERS` + `ensureCoreTriggers()` (recrea triggers de negocio en bases descargadas de la nube). |
| `src/api-module.js` | Configura el servicio al arrancar si hay credenciales (`tursoDatabaseUrl`, `tursoAuthToken`, `tursoAutoSync`, `tursoSyncIntervalMs`). |

```
App Electron (apiManager)                       Turso Cloud
   │  header x-aguavp-internal-key                   ▲
   ▼                                                 │ @libsql/client
/api/v2/sync/* ──► syncController ──► tursoSyncService ──► tursoSyncCore
                                           │
                                           ▼
                                    SQLite local (maestro)
                                    └─ triggers _sync_* → sync_cambios
```

### Tablas de control y exclusiones

| Tabla | Dónde | Contenido | Se sincroniza |
|---|---|---|---|
| `sync_estado` (`clave`, `valor`) | Local | `instancia_id`, `last_sync`, `last_sync_url`, `cambios_cursor`, `requiere_carga_completa`, `ultima_verificacion_completa` | No |
| `sync_cambios` (`id`, `tabla`, `registro_id`, `operacion` I/U/D) | Local | Registro de cambios pendientes de subir | No |
| `_aguavp_sync_meta` (`clave`, `valor`) | Nube | `instancia_id`, `last_sync`, `ultima_migracion`, `conteos` (JSON) | No (solo se escribe en la nube) |

* `LOCAL_ONLY_TABLES` = las tres anteriores. Se crean bajo demanda (`CREATE TABLE IF NOT EXISTS`), sin migración.
* `EXCLUDED_TABLES` = `sesiones`, `refresh_tokens`, `tokens_revocados`, `password_recovery_tokens`: no se copian, no se registran y, si una copia anterior las subió, la carga semilla vacía sus filas en la nube. Motivo: credenciales de vida corta, innecesarias para restaurar, que además cambian en cada renovación de sesión (romperían el "cero red en reposo").
* `GUARD_TABLES` = `clientes`, `medidores`, `lecturas`, `facturas`, `pagos`, `tarifas`, `usuarios`.

---

## 2. Endpoints y Control de Acceso

Montados en `/api/v2/sync`. Cada petición debe cumplir **una** de estas condiciones (`requireSyncAccess`):

* Header `x-aguavp-internal-key` igual a `SECRET_APP_KEY` (comparación en tiempo constante). Es la vía de la app de escritorio; el secreto lo genera la app y se lo entrega a la API al arrancar.
* `Authorization: Bearer <JWT>` válido (`authMiddleware`) con rol `administrador` o `superadmin`.

Sin credenciales → `401`; rol insuficiente → `403`.

| Método | Endpoint | Descripción | Body | Respuestas |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/status` | Estado del servicio | — | `200 { success, status }` |
| `POST` | `/test` | Prueba conectividad y latencia | `{ tursoUrl, tursoToken }` | `200` / `400` |
| `POST` | `/configure` | Reconfigura en caliente (URL vacía = desvincular) | `{ tursoUrl, tursoToken, autoSync, syncIntervalMs }` | `200 { status }` |
| `POST` | `/seed` | Carga completa protegida | `{ force?: boolean }` | `200 { data }` / `409 { conflict, motivos, comparacion }` / `500` |
| `POST` | `/now` | Ciclo incremental (delega en la carga completa si hace falta) | — | `200 { data }` / `409` (igual que `/seed`) |
| `GET` | `/restore/preview` | Resumen de la copia para confirmar una restauración | — | `200 { data: { disponible, lastSyncNube, mismaBase, tablas, comparacion } }` |
| `POST` | `/restore/prepare` | Construye y valida una base restaurada en un archivo nuevo (no toca la base en uso) | — | `200 { data: { archivo, totalRegistros, tablas, triggers, instanciaId, fkViolaciones } }` / `500` |

`status` incluye: `configured`, `tursoUrl`, `autoSync`, `inProgress`, `lastSync`, `lastSyncSuccess`, `lastError`, `totalRecordsSynced`, `conflicto` (`{ motivos, comparacion, fecha }` o `null`), `verificacion` (`{ ok, diferencias, reparadas, conservadas, fecha, completa }` o `null`), `cambiosPendientes`.

---

## 3. Configuración y Registro de Cambios

* **`configure` con credenciales:** crea el cliente, activa el temporizador y ejecuta `ensureChangeTracking`, que crea `sync_cambios` y los triggers `AFTER INSERT/UPDATE/DELETE` llamados `_sync_<tabla>_ins|upd|del` en cada tabla sincronizada con columna `id`. Si tuvo que crear algún trigger (primera vez, actualización desde ≤ 1.0.7 o tabla nueva tras una migración), marca `requiere_carga_completa = 1`: los cambios anteriores a esos triggers no están registrados.
* **`configure` sin credenciales (desvincular):** `disableChangeTracking` quita los triggers `_sync_*`, vacía `sync_cambios` y marca `requiere_carga_completa = 1` para cuando se vuelva a vincular.
* Los triggers registran también los cambios producidos por triggers de negocio y por `ON DELETE CASCADE`. Un `UPDATE` que cambie el `id` registra el id nuevo (U) y el anterior (D).
* No alteran `last_insert_rowid()` ni `changes()` de las sentencias de la app (SQLite restaura ambos al terminar el trigger), verificado con la API real.

---

## 4. Carga Semilla Protegida (`seedDatabase` → `seedRemote`)

Se ejecuta cuando no hay `last_sync` para la URL actual, cuando `requiere_carga_completa = 1`, cuando la nube no tiene la identidad de esta base, o manualmente.

1. **Integridad local** (`checkLocalIntegrity`): `PRAGMA quick_check` debe devolver `ok`; si no, **lanza error** y no toca la nube (ni con `force`). `PRAGMA foreign_key_check` solo se reporta como aviso.
2. **Identidad local** (`getOrCreateInstanciaId`): lee `sync_estado.instancia_id`; si no existe y la base trae `_aguavp_sync_meta` (base descargada de la nube con `.dump`), **hereda** ese id; si no, genera un UUID.
3. **Guarda anti-sobrescritura** (`checkSeedSafety`):
   * `instancia`: la nube tiene un `instancia_id` distinto.
   * `conteo`: en alguna `GUARD_TABLES` la nube tiene **más** registros que la local.
   * `columnas`: la nube tiene columnas que la base local no tiene (`remoteExtraColumns`); un `INSERT OR REPLACE` las dejaría en NULL. Ocurre si la base local se recreó con un esquema que no incluye columnas de migraciones antiguas. El incremental también lo detecta cuando cambia la versión de esquema (`needsSeed: 'remote_columns'`).
   * Con motivos y sin `force` → **no se toca la nube**; devuelve `{ success: false, conflict: true, motivos, comparacion }`.
   * Una nube sin `_aguavp_sync_meta` (copias anteriores a 1.0.7) se adopta si pasa la regla de conteos.
4. **Registro de cambios** activado y cursor de inicio = `MAX(sync_cambios.id)`, **antes** de leer los datos: lo que cambie durante la copia queda para el siguiente incremental (re-subir es idempotente).
5. **Esquema remoto** (`reconcileRemoteSchema`): crea tablas faltantes; agrega con `ALTER TABLE … ADD COLUMN "col" TIPO` las columnas que falten; índices y vistas best-effort.
6. **Triggers remotos** eliminados y **tablas excluidas** vaciadas en la nube.
7. **Copia** en orden de dependencias (`TABLE_SYNC_ORDER`, luego el resto alfabético) con `upsertBatch` en lotes atómicos de 100.

> **`upsertBatch` actualiza en su lugar** (`INSERT … ON CONFLICT(id) DO UPDATE`). Hasta 1.0.10 usaba `INSERT OR REPLACE`, que SQLite ejecuta como borrar + insertar; Turso aplica las llaves foráneas a ese borrado, así que subir un usuario vaciaba `user_permission_overrides.updated_by` (ON DELETE SET NULL) y borraba sus permisos individuales, subir una tarifa borraba sus `rangos_tarifas`, una ruta sus `rutas_puntos` y el catálogo de permisos los permisos de roles (ON DELETE CASCADE). Si un lote choca con otro índice UNIQUE (p. ej. intercambio de `orden` en una ruta), se reintenta fila por fila y se borran en la nube solo las filas obsoletas que ocupan esa clave con otro id; en ese caso el ciclo verifica todas las tablas.
8. **Borrado por diferencia** (`pruneRemoteRows`), de hijas a padres: solo los `id` que ya no existen en local. **Nunca `DELETE FROM tabla` completo** (salvo tablas excluidas).
9. **Metadatos remotos**, `commitChanges(cursor de inicio)`, `last_sync`, `requiere_carga_completa = 0`.
10. **Verificación** de todas las tablas (`verifyRemote`), registrada como verificación completa.

`POST /seed { "force": true }` omite solo el paso 3 (lo registra en consola) y reescribe `instancia_id` en la nube. La app lo envía únicamente tras doble confirmación del administrador.

---

## 5. Sincronización Incremental (`syncIncremental` → `incrementalRemote`)

Cada `syncIntervalMs` (15 min) o a petición:

1. Sin `last_sync` válido o con `requiere_carga_completa = 1` → carga semilla protegida.
2. `ensureChangeTracking`: si crea triggers (tabla nueva) → `needsSeed: 'tracking_installed'` → carga semilla.
3. `readPendingChanges`: registros distintos (`tabla`, `registro_id`) en `sync_cambios` con `id > cambios_cursor`.
4. **Sin cambios y sin verificación diaria pendiente → 0 llamadas de red.**
5. Lee `_aguavp_sync_meta`; si `instancia_id` no coincide → `needsSeed: 'remote_identity'` → carga semilla protegida.
6. Si `ultima_migracion` difiere → `reconcileRemoteSchema`.
7. `pushChanges`: para cada tabla (padres → hijas) lee el **estado actual** de los ids registrados; los que existen se suben con `upsertBatch` (actualización en su lugar); los que ya no existen se borran en la nube (hijas → padres).
8. `commitChanges(maxId)`: guarda el cursor y elimina del registro lo subido. Si algo falla antes, el registro queda intacto y se reintenta.
9. **Verificación** (`verifyRemote`): `COUNT(*)` y `MAX(id)` local vs nube de las tablas tocadas; de **todas** si pasaron 24 h desde la última verificación completa correcta. Las tablas con diferencias (y sin cambios nuevos registrados durante el ciclo) se reparan con `repairTables`: re-subida completa + borrado por diferencia, **excepto** en `GUARD_TABLES` con más registros en la nube, que se conservan y se reportan en `verificacion.conservadas`.
10. Metadatos remotos y `last_sync`.

Limitación: la verificación compara cantidades e ids, no el contenido de cada fila. Las ediciones las garantiza el registro de cambios.

---

## 6. Restauración desde la Nube (`prepareRestore` → `restoreRemoteInto`)

La API **no reemplaza** la base en uso (su conexión `db-sqlite` permanece abierta mientras corre el proceso y, en modo WAL, copiar un archivo encima corrompe o deshace el cambio). Solo construye un archivo validado; el reemplazo lo hace la app al reiniciar.

1. `prepareRestore` crea `<dir de DB_PATH>/restauraciones/nube-<fecha>.db` (`journal_mode = DELETE`) y ejecuta `customMigrate` con las migraciones del paquete: **esquema actual + triggers de negocio** (vía `ensureCoreTriggers`).
2. `restoreRemoteInto(target, remote)`:
   * Falla si la nube no tiene copia (`describeRemoteCopy().disponible`).
   * Guarda y elimina los triggers del destino; `foreign_keys = OFF`.
   * **Conserva lo que esta versión no conoce:** tablas de la nube inexistentes en el esquema actual se crean con su definición de la nube (`tablasConservadas`) y columnas de la nube inexistentes se agregan con nombre y tipo (`columnasConservadas`).
   * Por cada tabla sincronizable presente en la nube (excepto `__drizzle_migrations`): vacía la tabla destino (las migraciones pueden haber sembrado filas), copia en una transacción las **columnas comunes** paginando por `id` (1000 filas); las columnas que la nube no tiene toman su `DEFAULT`. BLOB (`ArrayBuffer`) → `Buffer`.
   * Restaura los triggers; `foreign_keys = ON`.
   * `sync_estado`: `instancia_id` de la nube, `requiere_carga_completa = 1`, `restaurada_desde_nube`.
   * Valida: `quick_check`, registros por tabla iguales a la nube y mismo número de triggers. Cualquier fallo lanza error y se borra el archivo.
3. La app (`apiManager.restoreFromCloud`) mueve el archivo a `agua-vp.db.restaurar` (`stageRestore`, que repite `integrity_check`) y reinicia. Al arrancar, antes de abrir la base, `applyPendingRestore` respalda la base actual con `VACUUM INTO` (incluye el WAL; si el respaldo falla no se restaura), reemplaza el archivo y elimina `-wal`/`-shm` de la base anterior.
4. Al volver a sincronizar: carga semilla protegida (misma identidad, mismos conteos → sin conflicto) y verificación completa.

Tablas excluidas quedan vacías: los usuarios vuelven a iniciar sesión.

---

## 7. Triggers en Bases Restauradas (`ensureCoreTriggers`)

La nube no tiene triggers (rechazarían pagos históricos o recalcularían saldos ya consolidados). Al arrancar, después de las migraciones, `ensureCoreTriggers(db, log)` crea los que falten de `CORE_TRIGGERS`:

`validar_pago_contra_saldo`, `validar_pago_parcialidad`, `validar_tipo_pago`, `actualizar_saldo_factura`, `actualizar_estado_factura`, **`actualizar_estado_factura_parcial`**, `registrar_cambios_facturas`, `cerrar_historial_asignacion_anterior`, `registrar_historial_asignacion`.

* Cada definición es **idéntica a la última versión en `src/database/migrations`** (incluye las correcciones de 0018 y 0022).
* `src/test/unit/core-triggers.test.js` reconstruye el estado final de los triggers desde el journal de migraciones y falla si `CORE_TRIGGERS` difiere. **Al modificar o agregar un trigger en una migración, actualizar `CORE_TRIGGERS`.**
* Solo se crean triggers ausentes (por nombre); no se reemplazan los existentes.
* Los triggers `_sync_*` no son de negocio: los gestiona el servicio de sincronización (sección 3).

---

## 8. Resiliencia

* Errores del ciclo automático: `console.warn`, el servidor sigue atendiendo, se reintenta en el siguiente ciclo sin perder cambios (siguen en `sync_cambios`).
* `syncState.inProgress` evita ejecuciones simultáneas.
* La carga semilla bloqueada por conflicto no lanza error: devuelve el conflicto y deja la nube intacta.

---

## 9. Pruebas

```bash
npm run test:sync
```

Con `node:test` (no Jest), usando `node:sqlite` en memoria como base local y un archivo libsql como "nube" (sin internet ni cuenta de Turso):

* `src/test/unit/turso-sync-core.test.js`
  * Protección: primera carga sin triggers remotos; base local vacía y respaldo antiguo bloqueados (nube intacta); reemplazo forzado; borrado por diferencia; tabla protegida con faltantes; columna nueva; adopción de copia sin identidad; herencia de identidad.
  * Registro de cambios: tablas excluidas; cero red sin cambios; altas/ediciones/borrados de cualquier tabla; cambios de triggers de negocio y cascadas; reparación por verificación; registros extra conservados en tablas protegidas; carga completa requerida ante otra base o tabla nueva; desvincular; base dañada nunca se sube.
  * Restauración: ida y vuelta local → nube → base nueva (conteos, fila sembrada reemplazada, saldos tal cual, columna nueva con DEFAULT, triggers activos, identidad heredada, tablas excluidas vacías); re-vinculación sin conflicto; nube vacía; resumen sin tablas internas.
* `src/test/unit/core-triggers.test.js`: `CORE_TRIGGERS` igual a las migraciones y comportamiento (estado "Parcial"/"Pagado", rechazo de sobrepago, historial al asignar/retirar medidor).

Las suites `node:test` aparecen como fallidas si se ejecutan con Jest (`npm test`); usar su script.
