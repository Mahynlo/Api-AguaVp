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
  medidor_id: z.number()
    .int('El ID del medidor debe ser un número entero')
    .positive('El ID del medidor debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),
  
  ruta_id: z.number()
    .int('El ID de la ruta debe ser un número entero')
    .positive('El ID de la ruta debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),
  
  consumo_m3: z.number()
    .min(0, 'El consumo no puede ser negativo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),
  
  fecha_lectura: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  
  periodo: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de período inválido (YYYY-MM)')
    .optional(),
  
  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
}).strict();

// Esquema para actualizar una lectura
export const actualizarLecturaSchema = z.object({
  medidor_id: z.number()
    .int('El ID del medidor debe ser un número entero')
    .positive('El ID del medidor debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional(),
  
  consumo_m3: z.number()
    .min(0, 'El consumo no puede ser negativo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
    .optional(),
  
  fecha_lectura: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional(),
  
  periodo: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de período inválido (YYYY-MM)')
    .optional(),
  
  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional()
}).strict().refine(
  data => Object.keys(data).length > 0,
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

// Esquema para registrar lectura con anomalía
export const registrarLecturaAnomaliaSchema = z.object({
  medidor_id: z.number()
    .int('El ID del medidor debe ser un número entero')
    .positive('El ID del medidor debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),
  
  lectura_anterior: z.number()
    .min(0, 'La lectura anterior no puede ser negativa')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),
  
  lectura_actual: z.number()
    .min(0, 'La lectura actual no puede ser negativa')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),
  
  periodo: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de período inválido (YYYY-MM)'),
  
  tipo_anomalia: z.enum(['medidor_roto', 'fuga', 'consumo_anormal', 'medidor_inaccesible', 'otro'], {
    errorMap: () => ({ message: 'Tipo de anomalía inválido' })
  }),
  
  descripcion_anomalia: z.string()
    .min(10, 'La descripción debe tener al menos 10 caracteres')
    .max(500, 'La descripción no puede exceder 500 caracteres'),
  
  foto_url: z.string()
    .url('La URL de la foto no es válida')
    .optional()
}).strict();

// Esquema para lecturas masivas
export const registrarLecturasMasivasSchema = z.object({
  periodo: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de período inválido (YYYY-MM)'),
  
  lecturas: z.array(
    z.object({
      medidor_id: z.number().int().positive(),
      lectura_anterior: z.number().min(0),
      lectura_actual: z.number().min(0),
      observaciones: z.string().max(500).optional()
    }).refine(
      data => data.lectura_actual >= data.lectura_anterior,
      { message: 'Lectura actual debe ser >= lectura anterior' }
    )
  ).min(1, 'Debe proporcionar al menos una lectura')
}).strict();

// Esquema para validar rango de consumo
export const validarRangoConsumoSchema = z.object({
  medidor_id: z.number()
    .int('El ID del medidor debe ser un número entero')
    .positive('El ID del medidor debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),
  
  consumo_m3: z.number()
    .min(0, 'El consumo no puede ser negativo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),
  
  umbral_alerta: z.number()
    .positive('El umbral debe ser positivo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
    .optional()
    .default(50) // 50% más del promedio
});
