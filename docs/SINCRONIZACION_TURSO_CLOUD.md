# Servicio de Sincronización Espejo con Turso Cloud (Backend API v2)

Especificación técnica del subsistema de copia de seguridad en Turso Cloud integrado en `@aguavp/api-server`.

> Versión documentada: **1.0.7**. Guía operativa para usuarios/administradores: `AguaVP/docs/sincronizacion-turso-cloud.md` (app). Plan de mejoras: `AguaVP/docs/plan-sincronizacion-turso.md`.

**Regla principal:** el SQLite local es el único escritor y ninguna operación puede dejar la nube con menos datos válidos de los que tenía.

---

## 1. Arquitectura del Servicio

| Archivo | Responsabilidad |
|---|---|
| `src/v2/services/tursoSyncCore.js` | Lógica **sin estado ni conexiones propias**: recibe `local` (SQLite síncrono: better-sqlite3 o `node:sqlite`) y `remote` (`@libsql/client`). Identidad, guarda anti-sobrescritura, esquema remoto, copia y borrado por diferencia. Se prueba sin Turso. |
| `src/v2/services/tursoSyncService.js` | Estado del servicio (cliente Turso, temporizador, `inProgress`, conflicto), carga semilla, sincronización incremental, estado persistente. |
| `src/v2/controllers/syncController.js` | Respuestas HTTP (409 en conflicto). |
| `src/v2/routes/sync.js` | Rutas y control de acceso. |
| `src/database/sqlite-migrator.js` | `CORE_TRIGGERS` + `ensureCoreTriggers()` (recrea triggers en bases descargadas de la nube). |
| `src/api-module.js` | Configura el servicio al arrancar si hay credenciales (`tursoDatabaseUrl`, `tursoAuthToken`, `tursoAutoSync`, `tursoSyncIntervalMs`). |

```
App Electron (apiManager)                       Turso Cloud
   │  header x-aguavp-internal-key                   ▲
   ▼                                                 │ @libsql/client
/api/v2/sync/* ──► syncController ──► tursoSyncService ──► tursoSyncCore
                                           │
                                           ▼
                                    SQLite local (maestro)
```

### Tablas de control

| Tabla | Dónde | Contenido | Se sincroniza |
|---|---|---|---|
| `sync_estado` (`clave`, `valor`) | Local | `instancia_id`, `last_sync`, `last_sync_url` | No |
| `_aguavp_sync_meta` (`clave`, `valor`) | Nube | `instancia_id`, `last_sync`, `ultima_migracion`, `conteos` (JSON) | No (solo se escribe en la nube) |

Ambas se excluyen de la copia (`LOCAL_ONLY_TABLES`). `sync_estado` se crea bajo demanda (`CREATE TABLE IF NOT EXISTS`), sin migración.

---

## 2. Endpoints y Control de Acceso

Montados en `/api/v2/sync`. Cada petición debe cumplir **una** de estas condiciones (`requireSyncAccess`):

* Header `x-aguavp-internal-key` igual a `SECRET_APP_KEY` (comparación en tiempo constante). Es la vía que usa la app de escritorio; el secreto lo genera la app y se lo entrega a la API al arrancar.
* `Authorization: Bearer <JWT>` válido (`authMiddleware`) con rol `administrador` o `superadmin`.

Sin credenciales → `401`; rol insuficiente → `403`.

| Método | Endpoint | Descripción | Body | Respuestas |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/status` | Estado del servicio | — | `200 { success, status }` |
| `POST` | `/test` | Prueba conectividad y latencia | `{ tursoUrl, tursoToken }` | `200` / `400` |
| `POST` | `/configure` | Reconfigura en caliente | `{ tursoUrl, tursoToken, autoSync, syncIntervalMs }` | `200 { status }` |
| `POST` | `/seed` | Carga completa protegida | `{ force?: boolean }` | `200 { data }` / `409 { conflict, motivos, comparacion }` / `500` |
| `POST` | `/now` | Sincronización incremental (delega en la carga completa si hace falta) | — | `200 { data }` / `409` (igual que `/seed`) |

`status` incluye: `configured`, `tursoUrl`, `autoSync`, `inProgress`, `lastSync` (leído de `sync_estado`), `lastSyncSuccess`, `lastError`, `totalRecordsSynced`, `conflicto` (`{ motivos, comparacion, fecha }` o `null`).

---

## 3. Carga Semilla Protegida (`seedDatabase` → `seedRemote`)

Se ejecuta cuando no hay `last_sync` para la URL actual (primera vez, otra base vinculada, base local nueva), cuando la nube no tiene la identidad de esta base, o manualmente.

### Secuencia
1. **Identidad local** (`getOrCreateInstanciaId`): lee `sync_estado.instancia_id`; si no existe y la base trae `_aguavp_sync_meta` (base descargada de la nube con `.dump`), **hereda** ese id; si no, genera un UUID.
2. **Guarda anti-sobrescritura** (`checkSeedSafety`):
   * `instancia`: la nube tiene un `instancia_id` distinto.
   * `conteo`: en alguna tabla de `GUARD_TABLES` (`clientes`, `medidores`, `lecturas`, `facturas`, `pagos`, `tarifas`, `usuarios`) la nube tiene **más** registros que la local.
   * Si hay motivos y no se pidió `force`, **no se toca la nube**: se devuelve `{ success: false, conflict: true, motivos, comparacion }` y se guarda en `syncState.conflicto`.
   * Una nube sin `_aguavp_sync_meta` (copias de versiones anteriores) se adopta si pasa la regla de conteos.
3. **Esquema remoto** (`reconcileRemoteSchema`): crea tablas faltantes; agrega con `ALTER TABLE … ADD COLUMN "col" TIPO` las columnas locales que falten en la nube (solo nombre y tipo; las reglas se validan en local); índices y vistas en modo best-effort.
4. **Triggers remotos** eliminados (`dropAllRemoteTriggers`).
5. **Copia** en orden de dependencias (`TABLE_SYNC_ORDER`, luego el resto alfabético) con `INSERT OR REPLACE` en lotes atómicos de 100.
6. **Borrado por diferencia** (`pruneRemoteRows`), de hijas a padres: elimina en la nube los `id` que ya no existen en local. **Nunca se ejecuta `DELETE FROM tabla` completo.**
7. **Metadatos remotos** (`writeRemoteMeta`) y `last_sync` / `last_sync_url` en `sync_estado`.

Un corte de red a mitad deja la nube con sus datos previos más parte de los nuevos; la siguiente ejecución la completa.

### Reemplazo forzado
`POST /seed { "force": true }` omite la guarda (lo registra en consola) y reescribe `instancia_id` en la nube. La app solo lo envía tras doble confirmación del administrador.

---

## 4. Sincronización Incremental (`syncIncremental`)

Cada `syncIntervalMs` (15 min por defecto) o a petición:

1. Sin `last_sync` para la URL actual → carga semilla protegida.
2. Detección local de cambios desde `last_sync`:
   * **Modificaciones:** `historial_cambios` (operaciones distintas de `DELETE`/`HARD_DELETE`).
   * **Altas:** columnas de fecha en `usuarios`, `rutas`, `clientes`, `medidores`, `lecturas`, `facturas`, `convenios_pago`, `pagos`, `cortes_servicio`, `cliente_medidor_historial`, `historial_cambios`, `auditoria_seguridad`; además parcialidades de convenios nuevos o pagadas, y puntos de rutas nuevas.
   * **Catálogos** (`configuracion_servicio`, `tarifas`, `rangos_tarifas`): completos si aparecen en `historial_cambios`.
   * **Borrados físicos:** `historial_cambios` con `HARD_DELETE`/`DELETE`.
3. **Sin cambios → 0 llamadas de red**; se actualiza `last_sync`.
4. Con cambios:
   * Se lee `_aguavp_sync_meta`. Si `instancia_id` no coincide (nube recreada, otra base, copia anterior a 1.0.7) → **carga semilla protegida**.
   * Si `ultima_migracion` difiere de la local → `reconcileRemoteSchema` antes de copiar.
   * Se eliminan triggers remotos, se suben las filas (`INSERT OR REPLACE`), se aplican los borrados y se actualizan los metadatos remotos y `last_sync`.

`last_sync` se fija con la hora de **inicio** del ciclo para que los cambios hechos durante la subida entren en el siguiente.

### Limitación conocida (Paso 2 del plan)
No se detectan aún: altas y ediciones de tarifas/rangos/configuración que no pasen por `historial_cambios`, rutas nuevas (`rutas.fecha_creacion` es `DATE('now')`, sin hora), ediciones de rutas, usuarios, convenios, cortes y lecturas, ni borrados de `rutas_puntos`, usuarios o permisos. Una carga semilla los corrige. El Paso 2 sustituye la detección por fechas por un registro de cambios alimentado por triggers locales (`sync_cambios`).

---

## 5. Triggers en Bases Restauradas (`ensureCoreTriggers`)

La nube no tiene triggers (rechazarían pagos históricos o recalcularían saldos ya consolidados). Al arrancar, después de las migraciones, `ensureCoreTriggers(db, log)` crea los que falten de `CORE_TRIGGERS`:

`validar_pago_contra_saldo`, `validar_pago_parcialidad`, `validar_tipo_pago`, `actualizar_saldo_factura`, `actualizar_estado_factura`, **`actualizar_estado_factura_parcial`**, `registrar_cambios_facturas`, `cerrar_historial_asignacion_anterior`, `registrar_historial_asignacion`.

* Cada definición es **idéntica a la última versión en `src/database/migrations`** (incluye las correcciones de 0018 y 0022).
* `src/test/unit/core-triggers.test.js` reconstruye el estado final de los triggers desde el journal de migraciones y falla si `CORE_TRIGGERS` difiere. **Al modificar o agregar un trigger en una migración, actualizar `CORE_TRIGGERS`.**
* Solo se crean triggers ausentes (por nombre); no se reemplazan los existentes.

> Hasta 1.0.6, `CORE_TRIGGERS` omitía `actualizar_estado_factura_parcial` y tenía versiones antiguas de `validar_pago_parcialidad` y de los dos triggers de historial de medidores.

---

## 6. Resiliencia

* Errores del ciclo automático: se registran con `console.warn` y el servidor sigue atendiendo; se reintenta en el siguiente ciclo.
* `syncState.inProgress` evita ejecuciones simultáneas.
* La carga semilla bloqueada por conflicto no lanza error: devuelve el conflicto y deja la nube intacta.

---

## 7. Pruebas

```bash
npm run test:sync
```

Ejecuta con `node:test` (no Jest), usando `node:sqlite` en memoria como base local y un archivo libsql como "nube" (sin internet ni cuenta de Turso):

* `src/test/unit/turso-sync-core.test.js`: primera carga sin triggers remotos; base local vacía y respaldo antiguo bloqueados (nube intacta); reemplazo forzado; borrado por diferencia sin vaciar; columna nueva; adopción de copia sin identidad; herencia de identidad en base descargada.
* `src/test/unit/core-triggers.test.js`: `CORE_TRIGGERS` igual a las migraciones y comportamiento (estado "Parcial"/"Pagado", rechazo de sobrepago, historial al asignar/retirar medidor).

Las suites `node:test` aparecen como fallidas si se ejecutan con Jest (`npm test`); usar su script.
