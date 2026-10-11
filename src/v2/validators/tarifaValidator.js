/**
 * Validadores para el módulo de Tarifas - V2
 * 
 * File: src/v2/validators/tarifaValidator.js
 * 
 * Descripción: Esquemas de validación Zod para operaciones de tarifas
 */

import { z } from 'zod';

// Esquema para crear una tarifa (basado en registrarTarifa del controlador)
export const crearTarifaSchema = z.object({
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),

  descripcion: z.string()
    .min(5, 'La descripción debe tener al menos 5 caracteres')
    .max(500, 'La descripción no puede exceder 500 caracteres'),

  fecha_inicio: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),

  fecha_fin: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .nullable()
    .optional(),

  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional()
}).refine(
  data => {
    if (data.fecha_fin) {
      return new Date(data.fecha_inicio) <= new Date(data.fecha_fin);
    }
    return true;
  },
  {
    message: 'La fecha de inicio no puede ser mayor a la fecha de fin',
    path: ['fecha_fin']
  }
);

// Esquema para actualizar una tarifa
export const actualizarTarifaSchema = z.object({
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .optional(),

  descripcion: z.string()
    .min(5, 'La descripción debe tener al menos 5 caracteres')
    .max(500, 'La descripción no puede exceder 500 caracteres')
    .optional(),

  fecha_inicio: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional(),

  fecha_fin: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .nullable()
    .optional(),

  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional()
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);

// Esquema para rangos de tarifa (basado en registrarRangosTarifa del controlador)
export const crearRangoTarifaSchema = z.preprocess(
  (data) => {
    // Alias tarifaId -> tarifa_id
    if (data && typeof data === 'object' && data.tarifaId && !data.tarifa_id) {
      return { ...data, tarifa_id: data.tarifaId };
    }
    return data;
  },
  z.object({
    tarifa_id: z.number()
      .int('El ID de la tarifa debe ser un número entero')
      .positive('El ID de la tarifa debe ser positivo')
      .or(z.string().regex(/^\d+$/).transform(Number)),

    rangos: z.array(
      z.object({
        consumo_min: z.number()
          .min(0, 'El consumo mínimo no puede ser negativo')
          .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),

        consumo_max: z.number()
          .min(0, 'El consumo máximo no puede ser negativo')
          .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
          .nullable()
          .optional(),

        precio_por_m3: z.number()
          .positive('El precio por m³ debe ser mayor a cero')
          .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
      }).refine(
        data => {
          if (data.consumo_max !== null && data.consumo_max !== undefined) {
            return data.consumo_min < data.consumo_max;
          }
          return true;
        },
        {
          message: 'El consumo mínimo debe ser menor que el consumo máximo',
          path: ['consumo_max']
        }
      )
    ).min(1, 'Debe proporcionar al menos un rango')
  })
);

// Esquema para actualizar rango de tarifa
export const actualizarRangoTarifaSchema = z.object({
  limite_inferior: z.number()
    .min(0, 'El límite inferior no puede ser negativo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
    .optional(),

  limite_superior: z.number()
    .min(0, 'El límite superior no puede ser negativo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
    .or(z.null())
    .optional(),

  precio_m3: z.number()
    .positive('El precio por m³ debe ser mayor a cero')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
    .optional()
    .optional()
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);

// Esquema para parámetros de ID
export const tarifaIdParamSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, 'El ID debe ser un número válido')
    .transform(Number)
});

// Esquema para búsqueda de tarifas
export const buscarTarifaSchema = z.object({
  tipo: z.enum(['residencial', 'comercial', 'industrial', 'especial']).optional(),
  activo: z.string()
    .regex(/^(true|false|1|0)$/)
    .transform(val => val === 'true' || val === '1')
    .optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional()
});

// Esquema para calcular costo de consumo
export const calcularCostoConsumoSchema = z.object({
  tarifa_id: z.number()
    .int('El ID de la tarifa debe ser un número entero')
    .positive('El ID de la tarifa debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  consumo_m3: z.number()
    .min(0, 'El consumo no puede ser negativo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
});
