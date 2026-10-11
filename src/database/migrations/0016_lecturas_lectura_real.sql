-- Migración 0016: Sistema de lecturas reales de medidor
-- Descripción:
--   Cambia el modelo de toma de lecturas del sistema:
--   ANTES: el operador calculaba manualmente el consumo y lo ingresaba directamente.
--   AHORA: el operador ingresa la lectura actual del medidor (m³ acumulados en el
--           totalizador físico) y el sistema calcula el consumo automáticamente,
--           registrando además la lectura anterior para auditoría y trazabilidad.
--
-- Edge cases contemplados:
--   - Vuelta a cero (rollover): flag vuelta_cero + capacidad_maxima en medidores.
--     Consumo = (capacidad_maxima - lectura_anterior) + lectura_actual
--   - Cambio de medidor: al setear lectura_base en el nuevo medidor, el próximo
--     ciclo lo tomará como punto de partida.
--
-- Columnas añadidas (todas nullable para compatibilidad con histórico):
--   lecturas.lectura_anterior  — valor del último periodo (auto-resuelto por el backend)
--   lecturas.lectura_actual    — valor físico leído en el medidor este periodo
--   lecturas.vuelta_cero       — flag booleano (0/1), bypass de validación rollover
--   medidores.lectura_base     — lectura al instalar el medidor / inicio del sistema
--   medidores.capacidad_maxima — límite del totalizador antes del rollover (default 99999.99)
--
-- Impacto en relaciones: NINGUNO. Solo columnas nullable en tablas existentes.
-- consumo_m3 sigue siendo la fuente de verdad para facturación.

-- ============================================================================
-- 1. Columnas en tabla lecturas
-- ============================================================================
ALTER TABLE `lecturas` ADD `lectura_anterior` numeric;--> statement-breakpoint
ALTER TABLE `lecturas` ADD `lectura_actual` numeric;--> statement-breakpoint
ALTER TABLE `lecturas` ADD `vuelta_cero` integer NOT NULL DEFAULT 0;--> statement-breakpoint

-- ============================================================================
-- 2. Columnas en tabla medidores
-- ============================================================================
ALTER TABLE `medidores` ADD `lectura_base` numeric;--> statement-breakpoint
ALTER TABLE `medidores` ADD `capacidad_maxima` numeric;--> statement-breakpoint

-- ============================================================================
-- 3. Índices para consultas de historial por medidor
-- ============================================================================
CREATE INDEX IF NOT EXISTS `idx_lecturas_medidor_fecha` ON `lecturas` (`medidor_id`, `fecha_lectura` DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_lecturas_medidor_periodo` ON `lecturas` (`medidor_id`, `periodo`);--> statement-breakpoint
