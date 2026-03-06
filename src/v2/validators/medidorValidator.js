/**
 * Validadores para el módulo de Medidores - V2
 * 
 * File: src/v2/validators/medidorValidator.js
 * 
 * Descripción: Esquemas de validación Zod para operaciones CRUD de medidores
 */

import { z } from 'zod';

// Esquema base para medidor
const medidorBaseSchema = {
  numero_serie: z.string()
    .min(5, 'El número de serie debe tener al menos 5 caracteres')
    .max(50, 'El número de serie no puede exceder 50 caracteres')
    .transform(val => val.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'El número de serie solo puede contener letras mayúsculas, números y guiones')),
  
  marca: z.string()
    .min(2, 'La marca debe tener al menos 2 caracteres')
    .max(100, 'La marca no puede exceder 100 caracteres')
    .nullable()
    .optional(),
  
  modelo: z.string()
    .min(1, 'El modelo debe tener al menos 1 carácter')
    .max(100, 'El modelo no puede exceder 100 caracteres')
    .nullable()
    .optional(),
  
  ubicacion: z.string()
    .min(5, 'La ubicación debe tener al menos 5 caracteres')
    .max(200, 'La ubicación no puede exceder 200 caracteres'),
  
  fecha_instalacion: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .or(z.date().transform(d => d.toISOString().split('T')[0])),
  
  latitud: z.number()
    .min(-90, 'La latitud debe estar entre -90 y 90')
    .max(90, 'La latitud debe estar entre -90 y 90')
    .or(z.string().regex(/^-?\d+\.?\d*$/).transform(Number)),
  
  longitud: z.number()
    .min(-180, 'La longitud debe estar entre -180 y 180')
    .max(180, 'La longitud debe estar entre -180 y 180')
    .or(z.string().regex(/^-?\d+\.?\d*$/).transform(Number)),
  
  estado_medidor: z.enum(['Activo', 'Inactivo', 'Retirado', 'No instalado'], {
    errorMap: () => ({ message: 'Estado debe ser: Activo, Inactivo, Retirado o No instalado' })
  }).default('Activo'),
  
  estado_servicio: z.enum(['Activo', 'Cortado'], {
    errorMap: () => ({ message: 'Estado del servicio debe ser: Activo o Cortado' })
  }).default('Activo')
};

// Esquema para crear un medidor
export const crearMedidorSchema = z.object({
  cliente_id: z.number()
    .int('El ID del cliente debe ser un número entero')
    .positive('El ID del cliente debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .nullable()
    .optional(),
  
  ...medidorBaseSchema,

  // Campos para sistema de lecturas reales (migración 0016)
  lectura_base: z.number()
    .min(0, 'La lectura base no puede ser negativa')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v >= 0))
    .nullable()
    .optional(),
  capacidad_maxima: z.number()
    .positive('La capacidad máxima debe ser positiva')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v > 0))
    .nullable()
    .optional()
}).strict();

// Esquema para actualizar un medidor
export const actualizarMedidorSchema = z.object({
  cliente_id: z.number()
    .int('El ID del cliente debe ser un número entero')
    .positive('El ID del cliente debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .nullable()
    .optional(),
  
  numero_serie: medidorBaseSchema.numero_serie.optional(),
  marca: medidorBaseSchema.marca,
  modelo: medidorBaseSchema.modelo,
  ubicacion: medidorBaseSchema.ubicacion.optional(),
  fecha_instalacion: medidorBaseSchema.fecha_instalacion.optional(),
  latitud: medidorBaseSchema.latitud.optional(),
  longitud: medidorBaseSchema.longitud.optional(),
  estado_medidor: medidorBaseSchema.estado_medidor.optional(),
  estado_servicio: medidorBaseSchema.estado_servicio.optional(),
  fecha_corte: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .nullable()
    .optional(),
  // Campos para sistema de lecturas reales (migración 0016)
  lectura_base: z.number()
    .min(0, 'La lectura base no puede ser negativa')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v >= 0))
    .nullable()
    .optional(),
  capacidad_maxima: z.number()
    .positive('La capacidad máxima debe ser positiva')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v > 0))
    .nullable()
    .optional()
}).strict().refine(
  data => Object.keys(data).length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);

// Esquema para parámetros de ID
export const medidorIdParamSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, 'El ID debe ser un número válido')
    .transform(Number)
});

// Esquema para búsqueda de medidores
export const buscarMedidorSchema = z.object({
  cliente_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  estado_medidor: z.enum(['Activo', 'Inactivo', 'Retirado', 'No instalado']).optional(),
  estado_servicio: z.enum(['Activo', 'Cortado']).optional(),
  numero_serie: z.string().optional(),
  search: z.string().optional(),
  ubicacion: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional()
});

// Esquema para cambiar estado del medidor
export const cambiarEstadoMedidorSchema = z.object({
  estado_medidor: z.enum(['Activo', 'Inactivo', 'Retirado', 'No instalado'], {
    errorMap: () => ({ message: 'Estado debe ser: Activo, Inactivo, Retirado o No instalado' })
  })
});

// Esquema para cortar/reconectar servicio
export const cambiarEstadoServicioSchema = z.object({
  estado_servicio: z.enum(['Activo', 'Cortado'], {
    errorMap: () => ({ message: 'Estado del servicio debe ser: Activo o Cortado' })
  }),
  
  motivo: z.string()
    .min(10, 'El motivo debe tener al menos 10 caracteres')
    .max(200, 'El motivo no puede exceder 200 caracteres')
    .optional(),
  
  fecha_corte: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional()
});

// Esquema para validar coordenadas GPS
export const coordenadasGPSSchema = z.object({
  latitud: z.number()
    .min(-90, 'La latitud debe estar entre -90 y 90')
    .max(90, 'La latitud debe estar entre -90 y 90')
    .or(z.string().regex(/^-?\d+\.?\d*$/).transform(Number)),
  
  longitud: z.number()
    .min(-180, 'La longitud debe estar entre -180 y 180')
    .max(180, 'La longitud debe estar entre -180 y 180')
    .or(z.string().regex(/^-?\d+\.?\d*$/).transform(Number))
}).refine(
  data => {
    // Validar que las coordenadas no sean (0,0) a menos que sea intencional
    return !(data.latitud === 0 && data.longitud === 0);
  },
  { message: 'Las coordenadas (0,0) no son válidas. Verifique la ubicación.' }
);

// Esquema para cambiar cliente de un medidor
export const reasignarMedidorSchema = z.object({
  nuevo_cliente_id: z.number()
    .int('El ID del cliente debe ser un número entero')
    .positive('El ID del cliente debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),
  
  fecha_cambio: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional()
    .default(new Date().toISOString().split('T')[0]),
  
  motivo: z.string()
    .min(10, 'El motivo debe tener al menos 10 caracteres')
    .max(300, 'El motivo no puede exceder 300 caracteres')
});
