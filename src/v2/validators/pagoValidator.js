/**
 * Validadores para el módulo de Pagos - V2
 * 
 * File: src/v2/validators/pagoValidator.js
 * 
 * Descripción: Esquemas de validación Zod para operaciones de pagos
 */

import { z } from 'zod';

// Helper para validar y transformar método de pago (insensible a mayúsculas/minúsculas)
const metodoPagoSchema = z.string()
  .transform(val => val.charAt(0).toUpperCase() + val.slice(1).toLowerCase())
  .pipe(z.enum(['Efectivo', 'Tarjeta', 'Transferencia', 'Cheque'], {
    errorMap: () => ({ message: 'Método de pago debe ser: Efectivo, Tarjeta, Transferencia o Cheque' })
  }));

// Helper para validar y transformar fecha de pago (acepta YYYY-MM-DD o ISO strings)
const fechaPagoSchema = z.string()
  .transform(val => {
    // Si es formato ISO completo (YYYY-MM-DDTHH:mm:ss.sssZ), extraer solo la fecha
    if (val.includes('T')) {
      return val.split('T')[0];
    }
    return val;
  })
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'));

// Esquema para registrar un pago (basado en registrarPago del controlador)
export const registrarPagoSchema = z.object({
  factura_id: z.number()
    .int('El ID de la factura debe ser un número entero')
    .positive('El ID de la factura debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  fecha_pago: fechaPagoSchema,

  cantidad_entregada: z.number()
    .positive('La cantidad entregada debe ser mayor a cero')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),

  metodo_pago: metodoPagoSchema,

  comentario: z.string()
    .max(500, 'El comentario no puede exceder 500 caracteres')
    .nullable() // Permitir null
    .optional()
    .transform(val => val || undefined), // Convertir null/empty a undefined para DB

  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional()
});

// Esquema para registrar un pago distribuido FIFO por cliente
export const registrarPagoDistribuidoSchema = z.object({
  cliente_id: z.number()
    .int('El ID del cliente debe ser un número entero')
    .positive('El ID del cliente debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  fecha_pago: fechaPagoSchema,

  cantidad_entregada: z.number()
    .positive('La cantidad entregada debe ser mayor a cero')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),

  metodo_pago: metodoPagoSchema,

  comentario: z.string()
    .max(500, 'El comentario no puede exceder 500 caracteres')
    .nullable()
    .optional()
    .transform(val => val || undefined),

  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional()
});

// Esquema para actualizar un pago (basado en modificarPago - TODOS los campos requeridos)
export const actualizarPagoSchema = z.object({
  fecha_pago: fechaPagoSchema,

  monto: z.number()
    .positive('El monto debe ser mayor a cero')
    .or(z.string().regex(/^\d+\.?\d*$/).transform(Number)),

  metodo_pago: metodoPagoSchema,

  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional()
});

// Esquema para parámetros de ID
export const pagoIdParamSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, 'El ID debe ser un número válido')
    .transform(Number)
});

// Esquema para búsqueda de pagos
export const buscarPagoSchema = z.object({
  factura_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  cliente_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  metodo_pago: metodoPagoSchema.optional(),
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

// Esquema para anular un pago
export const anularPagoSchema = z.object({
  motivo: z.string()
    .min(10, 'El motivo debe tener al menos 10 caracteres')
    .max(300, 'El motivo no puede exceder 300 caracteres')
}).strict();

// Esquema para registrar pago parcial
export const pagosParcialSchema = z.object({
  factura_id: z.number()
    .int('El ID de la factura debe ser un número entero')
    .positive('El ID de la factura debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  pagos: z.array(
    z.object({
      monto: z.number().positive('El monto debe ser mayor a cero'),
      metodo_pago: metodoPagoSchema,
      referencia: z.string().max(100).nullable().optional(),
      fecha_pago: fechaPagoSchema.optional()
    })
  ).min(1, 'Debe proporcionar al menos un pago')
}).strict();
