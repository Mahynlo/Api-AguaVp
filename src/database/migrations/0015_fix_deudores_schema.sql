-- Migración 0015: Corregir schema drift del sistema de Convenios/Deudores
-- Descripción:
--   Las columnas convenio_id (facturas) y parcialidad_id (pagos) estaban
--   declaradas en el schema de Drizzle pero nunca se aplicaron a la BD real.
--   Los triggers de migración 0008 las referencian — funcionan parcialmente
--   porque SQLite evalúa NEW.col_inexistente como NULL en la cláusula WHEN,
--   pero el flujo de convenios/parcialidades está completamente roto.
--
-- Cambios:
--   1. ADD COLUMN facturas.convenio_id → FK a convenios_pago
--   2. ADD COLUMN pagos.parcialidad_id → FK a parcialidades_convenio
--   3. Recrear triggers que referencian parcialidad_id (recompilar limpio)
--   4. Agregar índice en pagos.factura_id para consultas de saldo

-- ============================================================================
-- 1. Agregar columna convenio_id a facturas
-- ============================================================================
ALTER TABLE `facturas` ADD `convenio_id` integer REFERENCES `convenios_pago`(`id`);--> statement-breakpoint

-- ============================================================================
-- 2. Agregar columna parcialidad_id a pagos
-- ============================================================================
ALTER TABLE `pagos` ADD `parcialidad_id` integer REFERENCES `parcialidades_convenio`(`id`);--> statement-breakpoint

-- ============================================================================
-- 3. Recrear trigger: validar_pago_parcialidad
--    (Ahora la columna parcialidad_id existe realmente)
-- ============================================================================
DROP TRIGGER IF EXISTS validar_pago_parcialidad;--> statement-breakpoint

CREATE TRIGGER validar_pago_parcialidad
BEFORE INSERT ON pagos
FOR EACH ROW
WHEN NEW.parcialidad_id IS NOT NULL
BEGIN
  SELECT
    CASE
      WHEN (SELECT ROUND(monto_esperado, 2) FROM parcialidades_convenio WHERE id = NEW.parcialidad_id) < ROUND(NEW.monto, 2)
      THEN RAISE(ABORT, 'El monto del pago excede el monto esperado de la parcialidad')
    END;
END;--> statement-breakpoint

-- ============================================================================
-- 4. Recrear trigger: validar_tipo_pago
--    (Ahora parcialidad_id es una columna real, no undefined)
-- ============================================================================
DROP TRIGGER IF EXISTS validar_tipo_pago;--> statement-breakpoint

CREATE TRIGGER validar_tipo_pago
BEFORE INSERT ON pagos
FOR EACH ROW
BEGIN
  SELECT
    CASE
      WHEN NEW.factura_id IS NOT NULL AND NEW.parcialidad_id IS NOT NULL
      THEN RAISE(ABORT, 'Un pago no puede estar asociado a una factura y una parcialidad al mismo tiempo')
      WHEN NEW.factura_id IS NULL AND NEW.parcialidad_id IS NULL
      THEN RAISE(ABORT, 'Un pago debe estar asociado a una factura o a una parcialidad')
    END;
END;--> statement-breakpoint

-- ============================================================================
-- 5. Índice en pagos.factura_id para optimizar consultas de saldo
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pagos_factura_id ON pagos(factura_id);--> statement-breakpoint

-- ============================================================================
-- 6. Índice en pagos.parcialidad_id para búsquedas de parcialidades pagadas
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pagos_parcialidad_id ON pagos(parcialidad_id);
