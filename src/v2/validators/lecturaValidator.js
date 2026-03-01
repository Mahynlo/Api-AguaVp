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
    .min(0.001, 'El consumo debe ser mayor a cero')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v > 0, 'El consumo debe ser mayor a cero')),
  
  fecha_lectura: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  
  periodo: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de período inválido (YYYY-MM)')
    .optional(),
  
  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional() // Ignorado: siempre se toma de req.usuario.id en el controlador
}).strict();

// Esquema para actualizar una lectura
export const actualizarLecturaSchema = z.object({
  medidor_id: z.number()
    .int('El ID del medidor debe ser un número entero')
    .positive('El ID del medidor debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional(),
  
  consumo_m3: z.number()
    .min(0.001, 'El consumo debe ser mayor a cero')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v > 0, 'El consumo debe ser mayor a cero'))
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

