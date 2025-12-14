# WORKFLOW AUTOMÁTICO CON DRIZZLE
# =================================

## CONFIGURACIÓN INICIAL (Solo una vez)
## -------------------------------------

# Paso 1: Introspeccionar base de datos existente
npm run db:pull

# Paso 2: Generar snapshot baseline (sin cambios)
npm run db:generate

# Paso 3: Marcar baseline como aplicada
node mark-baseline.js


## USO DIARIO (Cada vez que hagas cambios)
## ----------------------------------------

# 1. Modificar esquema en src/database/schema/*.js
# Ejemplo: Agregar campo 'activo' a usuarios

# 2. Generar migración automáticamente
npm run db:generate
# ↳ Crea: 0002_nombre_automatico.sql con solo los ALTER TABLE

# 3. Aplicar migración
npm run db:migrate
# ↳ Drizzle aplica automáticamente solo los cambios nuevos


## ALTERNATIVA RÁPIDA (Sin historial)
## -----------------------------------

# 1. Modificar esquema
# 2. Aplicar directamente
npm run db:push
# ↳ Sincroniza automáticamente sin crear archivos de migración
