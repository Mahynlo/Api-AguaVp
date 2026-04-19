/**
 * Exportación centralizada de validadores - V2
 * 
 * File: src/v2/validators/index.js
 * 
 * Descripción: Punto de entrada para todos los validadores de la API v2
 * usando Zod para validación de esquemas
 */

export * from './clienteValidator.js';
export * from './medidorValidator.js';
export * from './authValidator.js';
export * from './facturaValidator.js';
export * from './pagoValidator.js';
export * from './tarifaValidator.js';
export * from './lecturaValidator.js';
export * from './userPermissionsValidator.js';
export * from './validationMiddleware.js';
