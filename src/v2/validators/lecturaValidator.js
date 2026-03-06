/**
 * Validadores para el módulo de Lecturas - V2
 * 
 * File: src/v2/validators/lecturaValidator.js
 * 
 * Descripción: Esquemas de validación Zod para operaciones de lecturas de medidores
 */

import { z } from 'zod';

// Esquema para registrar una lectura (basado en registrarLectura del controlador)
export const registrarLecturaSchema = z.object({
  medidor_id: z.union([
    z.number().int('El ID del medidor debe ser un número entero').positive(),
    z.string().regex(/^\d+$/).transform(Number)
  ]),

  ruta_id: z.union([
    z.number().int('El ID de la ruta debe ser un número entero').positive(),
    z.string().regex(/^\d+$/).transform(Number)
  ]),

  // --- Flujo nuevo (recomendado) ---
  // El operador ingresa la lectura real del totalizador del medidor.
  // El backend calcula consumo_m3 = lectura_actual - lectura_anterior.
  lectura_actual: z.union([
    z.number().min(0, 'La lectura actual no puede ser negativa'),
    z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v >= 0)
  ]).optional(),

  // Flag para "vuelta a cero" (rollover): el medidor llegó al máximo y reinició.
  vuelta_cero: z.boolean().optional().default(false),

  // --- Flujo legacy (compatibilidad retroactiva) ---
  consumo_m3: z.union([
    z.number().min(0, 'El consumo no puede ser negativo'),
    z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v >= 0)
  ]).optional(),

  fecha_lectura: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),

  periodo: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de período inválido (YYYY-MM)')
    .optional(),

  modificado_por: z.union([
    z.number().int().positive(),
    z.string().regex(/^\d+$/).transform(Number)
  ]).nullable().optional()
}).refine(
  data => data.lectura_actual !== undefined || data.consumo_m3 !== undefined,
  { message: 'Debe proporcionar lectura_actual (flujo nuevo) o consumo_m3 (flujo legacy)' }
);

// Esquema para actualizar una lectura
export const actualizarLecturaSchema = z.object({
  medidor_id: z.union([
    z.number().int().positive(),
    z.string().regex(/^\d+$/).transform(Number)
  ]).optional(),

  // Lectura actual del medidor (flujo nuevo — rectificación)
  lectura_actual: z.union([
    z.number().min(0, 'La lectura actual no puede ser negativa'),
    z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v >= 0)
  ]).optional(),

  // Consumo calculado (flujo legacy o calculado en frontend)
  consumo_m3: z.union([
    z.number().min(0, 'El consumo no puede ser negativo'),
    z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v >= 0)
  ]).optional(),

  fecha_lectura: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional(),

  periodo: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de período inválido (YYYY-MM)')
    .optional(),

  modificado_por: z.union([
    z.number().int().positive(),
    z.string().regex(/^\d+$/).transform(Number)
  ]).nullable().optional()
}).refine(
  data => Object.keys(data).filter(k => k !== 'modificado_por').length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);

// Esquema para parámetros de ID
export const lecturaIdParamSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, 'El ID debe ser un número válido')
    .transform(Number)
});

// Esquema para búsqueda de lecturas
export const buscarLecturaSchema = z.object({
  medidor_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  cliente_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  fecha_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fecha_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional()
}).refine(
  data => {
    if (data.fecha_desde && data.fecha_hasta) {
      return new Date(data.fecha_desde) <= new Date(data.fecha_hasta);
    }
    return true;
  },
  { message: 'La fecha desde debe ser anterior o igual a la fecha hasta' }
);

