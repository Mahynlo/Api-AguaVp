-- Custom SQL migration file: Corregir triggers de cliente_medidor_historial para contemplar NULL
-- ============================================================================
-- Al liberar un medidor (cliente_id pasa a NULL) o asignarlo desde NULL,
-- la comparación NULL != valor en SQL estándar evaluaba como NULL (falso),
-- impidiendo que el trigger cerrara el historial anterior o abriera el nuevo.
-- ============================================================================

DROP TRIGGER IF EXISTS cerrar_historial_asignacion_anterior;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS cerrar_historial_asignacion_anterior
BEFORE UPDATE OF cliente_id ON medidores
FOR EACH ROW
WHEN OLD.cliente_id IS NOT NULL AND (NEW.cliente_id IS NULL OR NEW.cliente_id != OLD.cliente_id)
BEGIN
  UPDATE cliente_medidor_historial
  SET fecha_fin = date('now')
  WHERE medidor_id = OLD.id AND fecha_fin IS NULL;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS registrar_historial_asignacion;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registrar_historial_asignacion
AFTER UPDATE OF cliente_id ON medidores
FOR EACH ROW
WHEN NEW.cliente_id IS NOT NULL AND (OLD.cliente_id IS NULL OR NEW.cliente_id != OLD.cliente_id)
BEGIN
  INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio)
  VALUES (NEW.cliente_id, NEW.id, date('now'));
END;
