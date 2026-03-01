/**
 * Validadores para el módulo de Facturas - V2
 * 
 * File: src/v2/validators/facturaValidator.js
 * 
 * Descripción: Esquemas de validación Zod para operaciones de facturas
 */

import { z } from 'zod';

// Esquema para crear/generar una factura (basado en generarFactura del controlador)
export const crearFacturaSchema = z.object({
  lectura_id: z.number()
    .int('El ID de la lectura debe ser un número entero')
    .positive('El ID de la lectura debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  cliente_id: z.number()
    .int('El ID del cliente debe ser un número entero')
    .positive('El ID del cliente debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  tarifa_id: z.number()
    .int('El ID de la tarifa debe ser un número entero')
    .positive('El ID de la tarifa debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  consumo_m3: z.number()
    .min(0.001, 'El consumo debe ser mayor a cero')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number).refine(v => v > 0, 'El consumo debe ser mayor a cero')),

  fecha_emision: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),

  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional()
});

// Esquema para actualizar una factura (basado en el controlador)
export const actualizarFacturaSchema = z.object({
  estado: z.enum(['Pagado', 'Pendiente', 'Parcial', 'Vencida'], {
    errorMap: () => ({ message: 'Estado debe ser: Pagado, Pendiente, Parcial o Vencida' })
  }).optional(),

  total: z.number()
    .min(0, 'El total no puede ser negativo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number))
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

// Esquema para parámetros de ID
export const facturaIdParamSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, 'El ID debe ser un número válido')
    .transform(Number)
});

// Esquema para búsqueda de facturas
export const buscarFacturaSchema = z.object({
  cliente_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  estado: z.enum(['Pagado', 'Pendiente', 'Parcial', 'Vencida']).optional(),
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

// Esquema para cambiar estado de factura
export const cambiarEstadoFacturaSchema = z.object({
  estado: z.enum(['Pagado', 'Pendiente', 'Parcial', 'Vencida'], {
    errorMap: () => ({ message: 'Estado debe ser: Pagado, Pendiente, Parcial o Vencida' })
  }),

  motivo: z.string()
    .min(10, 'El motivo debe tener al menos 10 caracteres')
    .max(200, 'El motivo no puede exceder 200 caracteres')
    .optional()
});

// Esquema para aplicar recargos
export const aplicarRecargosSchema = z.object({
  monto_recargo: z.number()
    .positive('El monto del recargo debe ser positivo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),

  motivo: z.string()
    .min(5, 'El motivo debe tener al menos 5 caracteres')
    .max(100, 'El motivo no puede exceder 100 caracteres')
});

// Esquema para aplicar descuentos
export const aplicarDescuentosSchema = z.object({
  monto_descuento: z.number()
    .positive('El monto del descuento debe ser positivo')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),

  motivo: z.string()
    .min(5, 'El motivo debe tener al menos 5 caracteres')
    .max(100, 'El motivo no puede exceder 100 caracteres')
});

// Esquema para generar factura masiva
export const generarFacturasMasivasSchema = z.object({
  periodo: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de período inválido (YYYY-MM)'),

  ciudad: z.string().optional(),

  ruta_id: z.number()
    .int('El ID de la ruta debe ser un número entero')
    .positive('El ID de la ruta debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional(),

  clientes_ids: z.array(z.number().int().positive())
    .optional()
});
