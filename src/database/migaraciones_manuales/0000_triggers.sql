-- ============================================================================
-- TRIGGERS DE LA BASE DE DATOS
-- ============================================================================
-- Este archivo contiene todos los triggers que no se pueden definir
-- en el esquema de Drizzle ORM y deben aplicarse manualmente
-- ============================================================================

-- 🚀 TRIGGERS PARA HISTORIAL DE MEDIDORES
-- ============================================================================

-- Trigger: Cerrar historial de asignación anterior cuando se cambia el cliente de un medidor
CREATE TRIGGER IF NOT EXISTS cerrar_historial_asignacion_anterior
BEFORE UPDATE OF cliente_id ON medidores
FOR EACH ROW
WHEN OLD.cliente_id IS NOT NULL AND NEW.cliente_id != OLD.cliente_id
BEGIN
  UPDATE cliente_medidor_historial
  SET fecha_fin = date('now')
  WHERE medidor_id = OLD.id AND fecha_fin IS NULL;
END;

-- Trigger: Registrar nuevo historial cuando se asigna un medidor a un cliente
CREATE TRIGGER IF NOT EXISTS registrar_historial_asignacion
AFTER UPDATE OF cliente_id ON medidores
FOR EACH ROW
WHEN NEW.cliente_id IS NOT NULL AND NEW.cliente_id != OLD.cliente_id
BEGIN
  INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio)
  VALUES (NEW.cliente_id, NEW.id, date('now'));
END;


-- 🚀 TRIGGERS PARA PAGOS Y FACTURAS
-- ============================================================================

-- Trigger: Actualizar saldo de factura cuando se registra un pago
CREATE TRIGGER IF NOT EXISTS actualizar_saldo_factura
AFTER INSERT ON pagos
FOR EACH ROW
BEGIN
    UPDATE facturas
    SET saldo_pendiente = ROUND(saldo_pendiente - NEW.monto, 2)
    WHERE id = NEW.factura_id;
END;

-- Trigger: Validar que el pago no exceda el saldo pendiente
CREATE TRIGGER IF NOT EXISTS validar_pago_contra_saldo
BEFORE INSERT ON pagos
FOR EACH ROW
BEGIN
  SELECT 
    CASE 
      WHEN (SELECT ROUND(saldo_pendiente, 2) FROM facturas WHERE id = NEW.factura_id) < ROUND(NEW.monto, 2)
      THEN RAISE(ABORT, 'El monto del pago excede el saldo pendiente de la factura')
    END;
END;

-- Trigger: Actualizar estado de factura cuando se paga completamente
CREATE TRIGGER IF NOT EXISTS actualizar_estado_factura
AFTER UPDATE OF saldo_pendiente ON facturas
FOR EACH ROW
WHEN NEW.saldo_pendiente <= 0
BEGIN
    UPDATE facturas
    SET estado = 'Pagado',
        saldo_pendiente = 0.00 -- fuerza a cero exacto
    WHERE id = NEW.id;
END;


-- 🚀 TRIGGERS PARA AUDITORÍA
-- ============================================================================

-- Trigger: Registrar cambios en facturas para auditoría
CREATE TRIGGER IF NOT EXISTS registrar_cambios_facturas
AFTER UPDATE ON facturas
FOR EACH ROW
BEGIN
    INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
    VALUES (
        'facturas',
        'UPDATE',
        OLD.id,
        NEW.modificado_por,
        'Estado: ' || OLD.estado || ' → ' || NEW.estado || ', Saldo: ' || OLD.saldo_pendiente || ' → ' || NEW.saldo_pendiente
    );
END;
