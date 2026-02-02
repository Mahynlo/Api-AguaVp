/**
 * Validadores para el módulo de Autenticación - V2
 * 
 * File: src/v2/validators/authValidator.js
 * 
 * Descripción: Esquemas de validación Zod para autenticación y gestión de usuarios
 */

import { z } from 'zod';

// Validación de contraseña segura
const passwordSchema = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede exceder 128 caracteres')
  .regex(/[a-z]/, 'La contraseña debe contener al menos una letra minúscula')
  .regex(/[A-Z]/, 'La contraseña debe contener al menos una letra mayúscula')
  .regex(/[0-9]/, 'La contraseña debe contener al menos un número')
  .regex(/[@$!%*?&#]/, 'La contraseña debe contener al menos un carácter especial (@$!%*?&#)');

// Esquema para login
export const loginSchema = z.object({
  correo: z.string()
    .email('Formato de correo electrónico inválido')
    .toLowerCase()
    .trim(),

  contraseña: z.string()
    .min(1, 'La contraseña es requerida'),

  dispositivo: z.string()
    .max(100, 'El nombre del dispositivo no puede exceder 100 caracteres')
    .optional()
    .default('unknown')
});

// Esquema para registro de usuario
// Esquema para registro de usuario
export const registrarUsuarioSchema = z.object({
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .regex(/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.]+$/, 'El nombre solo puede contener letras, números, puntos y espacios'),

  correo: z.string()
    .email('Formato de correo electrónico inválido')
    .toLowerCase()
    .trim(),

  contrasena: passwordSchema,

  confirmar_contrasena: z.string(),

  username: z.string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(20, 'El usuario no puede exceder 20 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'El usuario solo puede contener letras, números y guiones bajos'),

  rol: z.enum(['admin', 'operador', 'lecturista', 'superadmin', 'administrador', 'usuario'], {
    errorMap: () => ({ message: 'Rol inválido' })
  }).default('operador'),

  telefono: z.string()
    .regex(/^\d{10}$/, 'El teléfono debe tener exactamente 10 dígitos')
    .optional(),

  departamento: z.string()
    .max(50, 'El departamento no puede exceder 50 caracteres')
    .optional()
}).strict().refine(
  data => data.contrasena === data.confirmar_contrasena,
  {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar_contrasena']
  }
);

// Esquema para cambiar contraseña
export const cambiarContraseñaSchema = z.object({
  contraseña_actual: z.string()
    .min(1, 'La contraseña actual es requerida'),

  contraseña_nueva: passwordSchema,

  confirmar_contraseña_nueva: z.string()
}).strict().refine(
  data => data.contraseña_nueva === data.confirmar_contraseña_nueva,
  {
    message: 'Las contraseñas nuevas no coinciden',
    path: ['confirmar_contraseña_nueva']
  }
).refine(
  data => data.contraseña_actual !== data.contraseña_nueva,
  {
    message: 'La nueva contraseña debe ser diferente a la actual',
    path: ['contraseña_nueva']
  }
);

// Esquema para restablecer contraseña (por admin)
export const restablecerContraseñaSchema = z.object({
  usuario_id: z.number()
    .int('El ID del usuario debe ser un número entero')
    .positive('El ID del usuario debe ser positivo')
    .or(z.string().regex(/^\d+$/).transform(Number)),

  contraseña_nueva: passwordSchema,

  confirmar_contraseña_nueva: z.string()
}).strict().refine(
  data => data.contraseña_nueva === data.confirmar_contraseña_nueva,
  {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar_contraseña_nueva']
  }
);

// Esquema para refresh token
export const refreshTokenSchema = z.object({
  refreshToken: z.string()
    .min(1, 'El refresh token es requerido')
}).strict();

// Esquema para logout
export const logoutSchema = z.object({
  revocar_todos: z.boolean()
    .optional()
    .default(false)
}).strict();

// Esquema para actualizar perfil de usuario
export const actualizarPerfilSchema = z.object({
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo puede contener letras y espacios')
    .optional(),

  telefono: z.string()
    .regex(/^\d{10}$/, 'El teléfono debe tener exactamente 10 dígitos')
    .optional(),

  departamento: z.string()
    .max(50, 'El departamento no puede exceder 50 caracteres')
    .optional()
}).strict().refine(
  data => Object.keys(data).length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);

// Esquema para actualizar usuario (admin)
export const actualizarUsuarioSchema = z.object({
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo puede contener letras y espacios')
    .optional(),

  correo: z.string()
    .email('Formato de correo electrónico inválido')
    .toLowerCase()
    .trim()
    .optional(),

  rol: z.enum(['admin', 'operador', 'lecturista'], {
    errorMap: () => ({ message: 'Rol debe ser: admin, operador o lecturista' })
  }).optional(),

  telefono: z.string()
    .regex(/^\d{10}$/, 'El teléfono debe tener exactamente 10 dígitos')
    .optional(),

  departamento: z.string()
    .max(50, 'El departamento no puede exceder 50 caracteres')
    .optional(),

  activo: z.boolean()
    .optional()
}).strict().refine(
  data => Object.keys(data).length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);

// Esquema para parámetros de ID de usuario
export const usuarioIdParamSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, 'El ID debe ser un número válido')
    .transform(Number)
});

// Esquema para verificar correo
export const verificarCorreoSchema = z.object({
  token: z.string()
    .min(1, 'El token de verificación es requerido')
}).strict();

// Esquema para solicitar recuperación de contraseña
export const solicitarRecuperacionSchema = z.object({
  correo: z.string()
    .email('Formato de correo electrónico inválido')
    .toLowerCase()
    .trim()
}).strict();

// Esquema para recuperar contraseña con token
export const recuperarContraseñaSchema = z.object({
  token: z.string()
    .min(1, 'El token de recuperación es requerido'),

  contraseña_nueva: passwordSchema,

  confirmar_contraseña_nueva: z.string()
}).strict().refine(
  data => data.contraseña_nueva === data.confirmar_contraseña_nueva,
  {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar_contraseña_nueva']
  }
);
