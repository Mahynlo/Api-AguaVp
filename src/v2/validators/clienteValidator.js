/**
 * Validadores para el módulo de Clientes - V2
 * 
 * File: src/v2/validators/clienteValidator.js
 * 
 * Descripción: Esquemas de validación Zod para operaciones CRUD de clientes
 */

import { z } from 'zod';

// Esquema base para cliente
const clienteBaseSchema = {
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s\.]+$/, 'El nombre solo puede contener letras y espacios')
    .transform(val => val.trim().replace(/\b\w/g, c => c.toUpperCase())), // Capitalizar

  direccion: z.string()
    .min(5, 'La dirección debe tener al menos 5 caracteres')
    .max(200, 'La dirección no puede exceder 200 caracteres')
    .transform(val => val.trim()),

  telefono: z.string()
    .transform(val => val ? val.toString().replace(/\D/g, '') : '') // Eliminar no digitos
    .refine(val => /^\d{10}$/.test(val), 'El teléfono debe tener exactamente 10 dígitos'),

  ciudad: z.string()
    .min(3, 'La ciudad debe tener al menos 3 caracteres')
    .max(50, 'La ciudad no puede exceder 50 caracteres')
    .transform(val => val.trim()),

  correo: z.string()
    .trim()
    .toLowerCase()
    .email('Formato de correo electrónico inválido')
    .optional()
    .or(z.literal(''))
    .transform(val => (!val || val === '') ? null : val),

  tarifa_id: z.number()
    .int('La tarifa debe ser un número entero')
    .positive('La tarifa debe ser un número positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .nullable()
    .optional()
};

// Esquema para crear un cliente
export const crearClienteSchema = z.object({
  ...clienteBaseSchema,
  estado_cliente: z.enum(['Activo', 'Inactivo', 'Suspendido'], {
    errorMap: () => ({ message: 'Estado debe ser: Activo, Inactivo o Suspendido' })
  }).optional().default('Activo'),
  modificado_por: z.number()
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional() // Opcional porque puede venir del token JWT en req.usuario.id
}); // No permitir campos adicionales

// Esquema para actualizar un cliente (todos los campos opcionales)
export const actualizarClienteSchema = z.object({
  nombre: clienteBaseSchema.nombre.optional(),
  direccion: clienteBaseSchema.direccion.optional(),
  telefono: clienteBaseSchema.telefono.optional(),
  ciudad: clienteBaseSchema.ciudad.optional(),
  correo: clienteBaseSchema.correo.optional(),
  tarifa_id: clienteBaseSchema.tarifa_id.optional(),
  estado_cliente: z.enum(['Activo', 'Inactivo', 'Suspendido'], {
    errorMap: () => ({ message: 'Estado debe ser: Activo, Inactivo o Suspendido' })
  }).optional(),
  modificado_por: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .optional(),
  medidor_id: z.number()
    .positive('El ID del medidor debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number))
    .or(z.array(z.number().int().positive().or(z.string().regex(/^\d+$/).transform(Number))))
    .nullable()
    .optional(),
  medidores_liberados: z.array(
    z.number().int().positive().or(z.string().regex(/^\d+$/).transform(Number))
  ).optional()
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);

// Esquema para parámetros de ID
export const clienteIdParamSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, 'El ID debe ser un número válido')
    .transform(Number)
});

// Esquema para búsqueda de clientes
export const buscarClienteSchema = z.object({
  ciudad: z.string().optional(),
  estado_cliente: z.enum(['Activo', 'Inactivo', 'Suspendido', 'Eliminado']).optional(),
  nombre: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional()
});

// Esquema para soft delete de cliente (basado en eliminarCliente del controlador)
export const eliminarClienteSchema = z.object({
  razon: z.string()
    .min(10, 'La razón de eliminación debe tener al menos 10 caracteres')
    .max(500, 'La razón no puede exceder 500 caracteres')
    .optional()
}).strict();

// Esquema para restaurar cliente (NO requiere body, solo usa modificado_por del token)
export const restaurarClienteSchema = z.object({}).strict();

// Esquema para asignar medidor a cliente
export const asignarMedidorSchema = z.object({
  medidor_id: z.number()
    .int('El ID del medidor debe ser un número entero')
    .positive('El ID del medidor debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  fecha_inicio: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional()
    .or(z.date().transform(d => d.toISOString().split('T')[0]))
});

// Esquema para cambiar estado del cliente
export const cambiarEstadoClienteSchema = z.object({
  estado_cliente: z.enum(['Activo', 'Inactivo', 'Suspendido'], {
    errorMap: () => ({ message: 'Estado debe ser: Activo, Inactivo o Suspendido' })
  }),
  razon: z.string()
    .min(10, 'La razón debe tener al menos 10 caracteres')
    .max(200, 'La razón no puede exceder 200 caracteres')
    .optional()
});

// Esquema para obtener historial
export const historialClienteQuerySchema = z.object({
  tipo: z.enum(['asignaciones', 'facturas', 'pagos', 'lecturas', 'todo'], {
    errorMap: () => ({ message: 'Tipo debe ser: asignaciones, facturas, pagos, lecturas o todo' })
  }).optional().default('todo'),

  fecha_inicio: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional(),

  fecha_fin: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .optional()
}).refine(
  data => {
    if (data.fecha_inicio && data.fecha_fin) {
      return new Date(data.fecha_inicio) <= new Date(data.fecha_fin);
    }
    return true;
  },
  { message: 'La fecha de inicio debe ser anterior o igual a la fecha de fin' }
);
