// src/database/migrations/drizzle/README.md
# Migraciones Drizzle ORM

Este directorio contiene las migraciones generadas automáticamente por Drizzle Kit.

## Comandos Disponibles

### Generar nueva migración
```bash
npm run db:generate
```

Genera una nueva migración SQL basada en los cambios en el esquema (`src/database/schema/*.js`).

### Aplicar migraciones
```bash
npm run db:migrate
```

Aplica todas las migraciones pendientes a la base de datos Turso.

### Drizzle Studio
```bash
npm run db:studio
```

Abre Drizzle Studio para visualizar y editar la base de datos en el navegador.

## Estructura

```
drizzle/
├── 0000_*.sql       # Migración inicial (esquema base)
├── 0001_*.sql       # Migración de seguridad (auditoria, tokens)
├── 0002_*.sql       # Migración refresh tokens
├── meta/
│   ├── _journal.json     # Historial de migraciones
│   └── 0000_snapshot.json # Snapshots del esquema
```

## Migraciones Manuales Convertidas

Las migraciones SQL manuales previas han sido incorporadas al esquema de Drizzle:

- **001_add_security_fields.sql** → Campos de seguridad en `usuarios`, `sesiones`, `apps` + tablas `auditoria_seguridad`, `tokens_revocados`, `historial_passwords`
- **002_add_refresh_tokens.sql** → Tabla `refresh_tokens` con índices y vistas

## Workflow de Desarrollo

1. Modifica los archivos de esquema en `src/database/schema/*.js`
2. Ejecuta `npm run db:generate` para crear la migración
3. Revisa el archivo SQL generado en `drizzle/`
4. Ejecuta `npm run db:migrate` para aplicarla a Turso
5. Confirma los cambios en Git

## Notas Importantes

- **NO edites manualmente** los archivos `.sql` generados
- Las migraciones se aplican en orden secuencial
- Drizzle Kit detecta automáticamente cambios en el esquema
- Los triggers y vistas deben crearse manualmente después de las migraciones (Turso/LibSQL no los soporta completamente en migraciones automáticas)
