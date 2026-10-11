/**
 * Middleware de validación genérico usando Zod
 * 
 * File: src/v2/validators/validationMiddleware.js
 * 
 * Descripción: Middleware reutilizable que valida req.body, req.query y req.params
 * contra esquemas de Zod
 */

import { z } from 'zod';

/**
 * Middleware para validar datos usando esquemas de Zod
 * @param {z.ZodSchema} schema - Esquema de Zod para validar
 * @param {string} source - Fuente de datos: 'body', 'query', 'params'
 * @returns {Function} Middleware de Express
 */
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      // Validar los datos según la fuente especificada
      const dataToValidate = req[source];
      
      // Parse y validación con Zod
      const validatedData = schema.parse(dataToValidate);
      
      // Reemplazar los datos originales con los validados y transformados
      req[source] = validatedData;
      
      next();
    } catch (error) {
      // Si es un error de Zod, formatear la respuesta
      if (error instanceof z.ZodError) {
        const formattedErrors = error.issues.map(err => ({
          campo: err.path.join('.'),
          mensaje: err.message,
          codigo: err.code
        }));
        
        return res.status(400).json({
          error: 'Validación fallida',
          detalles: formattedErrors,
          code: 'VALIDATION_ERROR'
        });
      }
      
      // Error inesperado
      console.error('Error inesperado en validación:', error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        code: 'INTERNAL_ERROR'
      });
    }
  };
};

/**
 * Middleware para validar múltiples fuentes a la vez
 * @param {Object} schemas - Objeto con esquemas para body, query y/o params
 * @returns {Function} Middleware de Express
 */
export const validateMultiple = (schemas) => {
  return (req, res, next) => {
    try {
      const errors = [];
      
      // Validar cada fuente si existe el esquema
      for (const [source, schema] of Object.entries(schemas)) {
        if (schema && req[source]) {
          try {
            req[source] = schema.parse(req[source]);
          } catch (error) {
            if (error instanceof z.ZodError) {
              errors.push(...error.issues.map(err => ({
                fuente: source,
                campo: err.path.join('.'),
                mensaje: err.message,
                codigo: err.code
              })));
            }
          }
        }
      }
      
      // Si hay errores, responder con todos
      if (errors.length > 0) {
        return res.status(400).json({
          error: 'Validación fallida',
          detalles: errors,
          code: 'VALIDATION_ERROR'
        });
      }
      
      next();
    } catch (error) {
      console.error('Error inesperado en validación múltiple:', error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        code: 'INTERNAL_ERROR'
      });
    }
  };
};

/**
 * Helper para validación manual en controladores
 * @param {z.ZodSchema} schema - Esquema de Zod
 * @param {any} data - Datos a validar
 * @returns {Object} { success: boolean, data?: any, errors?: array }
 */
export const validateData = (schema, data) => {
  // Usar safeParse en lugar de parse para manejo manual de errores
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    // result.error es el ZodError con la estructura correcta
    const formattedErrors = result.error.issues.map(err => ({
      campo: err.path ? err.path.join('.') : 'unknown',
      mensaje: err.message || 'Error de validación',
      codigo: err.code || 'unknown'
    }));
    return { success: false, errors: formattedErrors };
  }
};
