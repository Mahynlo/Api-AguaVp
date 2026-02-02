-- Migración 0008: Triggers para Sistema de Convenios
-- Archivo: 0008_add_convenio_triggers.sql
-- Descripción: Agrega triggers de validación para el sistema de convenios y parcialidades

-- ============================================================================
-- TRIGGER 1: Validar pago contra saldo de factura (solo para pagos a facturas)
-- ============================================================================
-- Modificar trigger existente para que solo valide pagos a facturas, no a parcialidades
DROP TRIGGER IF EXISTS validar_pago_contra_saldo;--> statement-breakpoint

CREATE TRIGGER validar_pago_contra_saldo
BEFORE INSERT ON pagos
FOR EACH ROW
WHEN NEW.factura_id IS NOT NULL
BEGIN
  SELECT 
    CASE 
      WHEN (SELECT ROUND(saldo_pendiente, 2) FROM facturas WHERE id = NEW.factura_id) < ROUND(NEW.monto, 2)
      THEN RAISE(ABORT, 'El monto del pago excede el saldo pendiente de la factura')
    END;
END;--> statement-breakpoint

-- ============================================================================
-- TRIGGER 2: Validar pago de parcialidad
-- ============================================================================
-- Asegurar que el monto del pago no exceda el monto esperado de la parcialidad
CREATE TRIGGER IF NOT EXISTS validar_pago_parcialidad
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
-- TRIGGER 3: Validar tipo de pago (prevenir pagos ambiguos)
-- ============================================================================
-- Un pago debe estar asociado SOLO a una factura O a una parcialidad, no ambos
CREATE TRIGGER IF NOT EXISTS validar_tipo_pago
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
END;
