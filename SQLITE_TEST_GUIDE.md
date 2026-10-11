# Guía de Prueba: SQLite con Drizzle

## Archivos Creados

1. **`src/database/db-sqlite.js`** - Configuración de SQLite con Drizzle ORM
2. **`drizzle.config.sqlite.ts`** - Config de Drizzle para SQLite
3. **`src/database/test-sqlite-migration.js`** - Script de prueba de migraciones

## Pasos para Probar

### 1. Generar Migraciones para SQLite

```bash
# Usar el config de SQLite para generar migraciones
npx drizzle-kit generate --config=drizzle.config.sqlite.ts
```

Este comando:
- Lee tu schema de `src/database/schema/`
- Genera archivos SQL en `src/database/migrations/`
- Usa el dialect de SQLite

### 2. Ejecutar Prueba de Migración

```bash
# Ejecutar el script de prueba
node src/database/test-sqlite-migration.js
```

Este script:
- ✅ Crea una base de datos de prueba (`test-migration.db`)
- ✅ Aplica todas las migraciones
- ✅ Verifica que las tablas se crearon correctamente
- ✅ Muestra la estructura de las tablas
- ✅ Valida foreign keys

### 3. Inspeccionar la Base de Datos (Opcional)

```bash
# Abrir la DB con SQLite CLI
sqlite3 src/database/test-migration.db

# Comandos útiles en SQLite:
.tables                    # Ver todas las tablas
.schema clientes          # Ver estructura de tabla
SELECT * FROM clientes;   # Consultar datos
.quit                     # Salir
```

O usar Drizzle Studio:

```bash
# Abrir Drizzle Studio con config de SQLite
npx drizzle-kit studio --config=drizzle.config.sqlite.ts
```

## Qué Esperar

### ✅ Resultado Exitoso

```
🧪 Iniciando prueba de migración SQLite...

📁 Base de datos de prueba: .../test-migration.db
✅ Conexión SQLite establecida

🔄 Aplicando migraciones...
✅ Migraciones aplicadas exitosamente

📊 Verificando tablas creadas:

   Total de tablas: 15
   1. apps
   2. clientes
   3. cliente_medidor_historial
   4. configuracion_servicio
   5. convenios_pago
   ...

🔍 Estructura de tabla "clientes":
   Columnas:
   - id (INTEGER) [PK] NOT NULL
   - nombre (TEXT) NOT NULL
   - direccion (TEXT) NOT NULL
   ...

✅ Prueba completada exitosamente
```

### ❌ Posibles Errores

**Error: "Cannot find module 'better-sqlite3'"**
- Solución: `npm install better-sqlite3`

**Error: "SQLITE_ERROR: no such table"**
- Las migraciones no se aplicaron correctamente
- Verificar que los archivos SQL estén en `src/database/migrations/`

**Error: "foreign key constraint failed"**
- Problema en el orden de las migraciones
- Revisar dependencias entre tablas

## Siguiente Paso

Si la prueba es exitosa, puedes:

1. **Usar SQLite en desarrollo:**
   ```javascript
   // En tu código
   import db from './database/db-sqlite.js';
   ```

2. **Actualizar el servidor para usar SQLite:**
   ```javascript
   // src/server.js
   import db from './database/db-sqlite.js'; // En lugar de db-turso.js
   ```

3. **Continuar con el plan de empaquetado en Electron**

## Notas Importantes

- 📝 La DB de prueba se crea en `src/database/test-migration.db`
- 🗑️ Puedes borrarla y volver a ejecutar el test cuando quieras
- 🔄 Las migraciones se aplican en orden numérico (0000_, 0001_, etc.)
- 🔒 Foreign keys están habilitadas por defecto
