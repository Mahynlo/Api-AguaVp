# 🚀 Guía de Uso de Drizzle ORM

## 📋 Estado Actual

✅ **Drizzle ORM configurado** para gestionar migraciones futuras
✅ **Esquemas definidos** en `src/database/schema/` (archivos modulares .js)
✅ **Triggers aplicados** mediante script personalizado
✅ **Base de datos existente** preservada con todas las tablas y datos

## 🗂️ Estructura de Archivos

```
src/database/
├── schema/
│   ├── index.js           # Exporta todos los esquemas
│   ├── usuarios.js        # Tabla usuarios + seguridad
│   ├── clientes.js        # Tabla clientes + medidores
│   ├── tarifas.js         # Tabla tarifas + rangos
│   ├── lecturas.js        # Tabla lecturas
│   ├── facturas.js        # Tabla facturas
│   ├── rutas.js           # Tabla rutas + puntos
│   └── historial.js       # Tabla historial_cambios
├── migrations/
│   ├── 0000_triggers.sql           # Triggers (aplicados)
│   ├── 0000_acoustic_*.sql         # Migración inicial Drizzle
│   ├── 001_add_security_fields.sql # Migración manual (ya aplicada)
│   ├── 002_add_refresh_tokens.sql  # Migración manual (ya aplicada)
│   ├── applyTriggers.js            # Script para aplicar triggers
│   └── runMigration.js             # Script migraciones antiguas
├── drizzle-client.js      # Conexión Drizzle
├── db.js                  # Conexión SQLite local (desarrollo)
└── db-turso.js           # Conexión Turso directa
```

## 🔧 Comandos Disponibles

### Generar Migraciones (desde cambios en schema/)
```bash
npm run db:generate
```
- Lee los archivos en `src/database/schema/`
- Compara con el estado actual de la BD
- Genera archivos SQL en `src/database/migrations/`

### Aplicar Migraciones
```bash
npm run db:migrate
```
- Ejecuta las migraciones pendientes en Turso
- Actualiza la tabla `__drizzle_migrations`

### Push Directo (sin generar archivos)
```bash
npm run db:push
```
- Sincroniza el esquema directamente con la BD
- Útil para desarrollo rápido
- ⚠️ NO genera archivos de migración

### Drizzle Studio (Interfaz Visual)
```bash
npm run db:studio
```
- Abre una interfaz web en http://localhost:4983
- Explora y edita datos visualmente

### Aplicar Triggers
```bash
npm run db:triggers
```
- Ejecuta el archivo `0000_triggers.sql`
- Aplica todos los triggers a la BD

## 📝 Flujo de Trabajo para Futuras Migraciones

### 1️⃣ Modificar el Esquema

Edita los archivos en `src/database/schema/`. Por ejemplo, agregar una columna a `clientes`:

```javascript
// src/database/schema/clientes.js
export const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  // ... columnas existentes ...
  
  // ✨ NUEVA COLUMNA
  codigo_postal: text('codigo_postal'),
});
```

### 2️⃣ Generar la Migración

```bash
npm run db:generate
```

Drizzle detectará el cambio y generará algo como:
```
src/database/migrations/0001_fluffy_spider.sql
```

### 3️⃣ Revisar la Migración

Abre el archivo generado y verifica que el SQL sea correcto:

```sql
ALTER TABLE `clientes` ADD `codigo_postal` text;
```

### 4️⃣ Aplicar la Migración

```bash
npm run db:migrate
```

### 5️⃣ Si Agregaste Triggers Nuevos

Si tu migración incluye triggers, agrégalos a `0000_triggers.sql` y ejecuta:

```bash
npm run db:triggers
```

## 🎯 Casos de Uso Comunes

### Agregar una Tabla Nueva

**1. Crear el archivo de esquema:**

```javascript
// src/database/schema/notificaciones.js
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './usuarios.js';

export const notificaciones = sqliteTable('notificaciones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  usuario_id: integer('usuario_id').notNull().references(() => usuarios.id),
  mensaje: text('mensaje').notNull(),
  leido: integer('leido', { mode: 'boolean' }).default(false),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
});
```

**2. Exportar en index.js:**

```javascript
// src/database/schema/index.js
export * from './usuarios.js';
export * from './clientes.js';
// ... otros exports ...
export * from './notificaciones.js'; // ✨ NUEVO
```

**3. Generar y aplicar:**

```bash
npm run db:generate
npm run db:migrate
```

### Modificar una Columna

**SQLite no soporta ALTER COLUMN directamente**, pero Drizzle puede:
- Crear tabla nueva
- Copiar datos
- Eliminar tabla vieja
- Renombrar tabla nueva

```javascript
// Cambiar tipo de columna
export const clientes = sqliteTable('clientes', {
  // Antes: text('telefono')
  telefono: integer('telefono').notNull(), // ✨ Cambio a integer
});
```

```bash
npm run db:generate
# Drizzle genera la migración completa
npm run db:migrate
```

### Agregar Índices

```javascript
import { index } from 'drizzle-orm/sqlite-core';

export const clientes = sqliteTable('clientes', {
  // ... columnas ...
}, (table) => ({
  // ✨ Índice en ciudad
  ciudadIdx: index('clientes_ciudad_idx').on(table.ciudad),
  // ✨ Índice compuesto
  nombreTelIdx: index('clientes_nombre_tel_idx').on(table.nombre, table.telefono),
}));
```

## 🔒 Buenas Prácticas

### ✅ HACER:
- Generar migraciones para TODOS los cambios de esquema
- Revisar el SQL generado antes de aplicarlo
- Hacer backup antes de migraciones importantes
- Probar migraciones primero en desarrollo local
- Usar nombres descriptivos en los esquemas

### ❌ EVITAR:
- Modificar archivos de migración ya aplicados
- Usar `db:push` en producción (solo desarrollo)
- Editar directamente la BD en producción
- Eliminar archivos de migración del historial

## 🛠️ Usar Drizzle en el Código

### Queries con Drizzle ORM

```javascript
// Importar el cliente y esquema
import { db } from '../database/drizzle-client.js';
import { clientes, medidores } from '../database/schema/index.js';
import { eq, and, like } from 'drizzle-orm';

// SELECT * FROM clientes WHERE id = 1
const cliente = await db.select()
  .from(clientes)
  .where(eq(clientes.id, 1))
  .get();

// SELECT * FROM clientes WHERE ciudad = 'Madrid'
const clientesMadrid = await db.select()
  .from(clientes)
  .where(eq(clientes.ciudad, 'Madrid'))
  .all();

// JOIN
const clientesConMedidores = await db.select()
  .from(clientes)
  .leftJoin(medidores, eq(clientes.id, medidores.cliente_id))
  .all();

// INSERT
await db.insert(clientes).values({
  nombre: 'Juan Pérez',
  direccion: 'Calle 123',
  telefono: '555-1234',
  ciudad: 'Madrid',
});

// UPDATE
await db.update(clientes)
  .set({ estado_cliente: 'Inactivo' })
  .where(eq(clientes.id, 1));

// DELETE
await db.delete(clientes)
  .where(eq(clientes.id, 1));
```

### Queries SQL Raw (cuando Drizzle no es suficiente)

```javascript
import { rawClient } from '../database/drizzle-client.js';

// Query compleja con SQL directo
const result = await rawClient.execute(`
  SELECT 
    c.nombre,
    COUNT(m.id) as total_medidores,
    SUM(l.consumo_m3) as consumo_total
  FROM clientes c
  LEFT JOIN medidores m ON c.id = m.cliente_id
  LEFT JOIN lecturas l ON m.id = l.medidor_id
  WHERE c.ciudad = ?
  GROUP BY c.id
`, ['Madrid']);
```

## 🆘 Troubleshooting

### Error: "Table already exists"
Si `db:migrate` falla porque las tablas ya existen:
```bash
# Opción 1: Borrar las migraciones generadas y empezar de nuevo
# Opción 2: Marcar como aplicada manualmente en __drizzle_migrations
```

### Los triggers no se aplican
```bash
npm run db:triggers
```

### Ver el estado de las migraciones
```bash
# Ver qué migraciones están pendientes
drizzle-kit status
```

## 📚 Recursos

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Drizzle Kit Docs](https://orm.drizzle.team/kit-docs/overview)
- [SQLite Constraints](https://www.sqlite.org/lang_createtable.html)
- [Turso Docs](https://docs.turso.tech/)

---

## 🎓 Resumen Rápido

```bash
# Flujo completo para una nueva migración:

# 1. Editar esquema en src/database/schema/
# 2. Generar migración
npm run db:generate

# 3. Revisar el archivo SQL generado

# 4. Aplicar migración
npm run db:migrate

# 5. Si hay triggers, aplicarlos
npm run db:triggers

# ✅ ¡Listo!
```
