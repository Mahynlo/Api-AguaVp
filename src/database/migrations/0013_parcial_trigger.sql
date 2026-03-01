-- Custom SQL migration file, put your code below! --
-- ============================================================================
-- TRIGGER: Estado 'Parcial' para facturas con pago incompleto
-- ============================================================================
-- El estado 'Parcial' nunca se asignaba porque `actualizar_estado_factura`
-- (migración 0002) solo cubre el caso saldo = 0 → 'Pagado'.
-- Este trigger cubre el caso: pago realizado pero queda saldo pendiente.
--
-- FLUJO COMPLETO de estados de factura tras este trigger:
--   Pendiente  → (primer pago parcial) → Parcial
--   Parcial    → (pago completa saldo) → Pagado
--   Pendiente  → (pago total)          → Pagado
--   Pendiente/Parcial → (job diario)   → Vencida
--   Vencida    → (convenio)            → En Convenio
-- ============================================================================

DROP TRIGGER IF EXISTS actualizar_estado_factura_parcial;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS actualizar_estado_factura_parcial
AFTER UPDATE OF saldo_pendiente ON facturas
FOR EACH ROW
WHEN NEW.saldo_pendiente > 0
  AND NEW.saldo_pendiente < NEW.total
  AND NEW.estado NOT IN ('En Convenio', 'Pagado')
BEGIN
    UPDATE facturas
    SET estado = 'Parcial'
    WHERE id = NEW.id;
END;
