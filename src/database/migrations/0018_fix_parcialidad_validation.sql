-- Migración 0018: Endurecer validación de pagos de parcialidades
-- Objetivo:
-- 1) Evitar subpagos en parcialidades (el pago aplicado debe cubrir la cuota esperada)
-- 2) Mantener validación de sobrepago aplicado en parcialidades

DROP TRIGGER IF EXISTS validar_pago_parcialidad;--> statement-breakpoint

CREATE TRIGGER validar_pago_parcialidad
BEFORE INSERT ON pagos
FOR EACH ROW
WHEN NEW.parcialidad_id IS NOT NULL
BEGIN
  SELECT
    CASE
      WHEN ROUND(NEW.monto, 2) < ROUND((SELECT monto_esperado FROM parcialidades_convenio WHERE id = NEW.parcialidad_id), 2)
      THEN RAISE(ABORT, 'El monto aplicado no puede ser menor al monto esperado de la parcialidad')
      WHEN ROUND(NEW.monto, 2) > ROUND((SELECT monto_esperado FROM parcialidades_convenio WHERE id = NEW.parcialidad_id), 2)
      THEN RAISE(ABORT, 'El monto aplicado no puede exceder el monto esperado de la parcialidad')
    END;
END;
