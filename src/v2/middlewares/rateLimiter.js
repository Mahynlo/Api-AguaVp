/**
 * Rate Limiter Middleware - V2
 * 
 * File: src/v2/middlewares/rateLimiter.js
 * 
 * Descripción: Middlewares de rate limiting para proteger endpoints críticos
 * contra ataques de fuerza bruta y abuso.
 * 
 * Uso: Aplicar en las rutas que requieren protección contra spam/abuso
 */

import rateLimit from 'express-rate-limit';

const isDevelopment = process.env.NODE_ENV !== 'production';
const DEFAULT_REGISTRO_APP_MAX = 30; // Modificado a 30 por hora
const registroAppMaxFromEnv = Number.parseInt(process.env.RATE_LIMIT_REGISTRO_APP_MAX ?? '', 10);
const REGISTRO_APP_MAX = Number.isFinite(registroAppMaxFromEnv) && registroAppMaxFromEnv > 0
    ? registroAppMaxFromEnv
    : DEFAULT_REGISTRO_APP_MAX;

/**
 * Rate limiter para login de usuarios
 * 8 intentos cada 15 minutos
 */
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // 10 intentos
    message: {
        error: 'Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos.'
    },
    standardHeaders: true, // Retorna info de rate limit en headers `RateLimit-*`
    legacyHeaders: false, // Deshabilita headers `X-RateLimit-*`
    validate: { trustProxy: false }, // Deshabilita validación estricta de trust proxy
    // Handler personalizado cuando se excede el límite
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Login excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Límite de intentos superado',
            mensaje: 'Has superado el límite de 10 intentos de inicio de sesión. Por favor, inténtalo de nuevo en 15 minutos.',
            retry_after: '15 minutos'
        });
    }
});

/**
 * Rate limiter para registro de aplicaciones
 * 8 intentos cada 1 hora (60 en desarrollo)
 */
export const registroAppLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: REGISTRO_APP_MAX,
    message: {
        error: 'Demasiados intentos de registro de aplicación. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Registro de app excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Límite de registros superado',
            mensaje: `Has superado el límite de ${REGISTRO_APP_MAX} registros de aplicación. Por favor, inténtalo de nuevo en 1 hora.`,
            retry_after: '1 hora'
        });
    }
});

/**
 * Rate limiter para recuperación de tokens
 * 4 intentos cada 1 hora
 */
export const recuperarTokenLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 8, // 8 intentos
    message: {
        error: 'Demasiados intentos de recuperación de token. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Recuperación de token excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Límite de recuperación superado',
            mensaje: 'Has superado el límite de 8 recuperaciones de token. Por favor, inténtalo de nuevo en 1 hora.',
            retry_after: '1 hora'
        });
    }
});

/**
 * Rate limiter para registro de usuarios
 * 10 intentos cada 1 hora
 */
export const registroUsuarioLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 30, // 30 intentos
    message: {
        error: 'Demasiados intentos de registro de usuario. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Registro de usuario excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Límite de registros superado',
            mensaje: 'Has superado el límite de 30 registros de usuario. Por favor, inténtalo de nuevo en 1 hora.',
            retry_after: '1 hora'
        });
    }
});

/**
 * Rate limiter para solicitar recuperación de contraseña
 * 5 intentos cada 1 hora
 */
export const solicitarRecuperacionPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
        error: 'Demasiadas solicitudes de recuperación de contraseña. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Solicitud recuperación password excedida - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Límite de solicitudes superado',
            mensaje: 'Has superado el límite de 10 solicitudes de recuperación de contraseña. Por favor, inténtalo de nuevo en 1 hora.',
            retry_after: '1 hora'
        });
    }
});

/**
 * Rate limiter para restablecer contraseña con token
 * 10 intentos cada 1 hora
 */
export const recuperarContrasenaLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: {
        error: 'Demasiados intentos de restablecimiento de contraseña. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Restablecimiento password excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Límite de restablecimientos superado',
            mensaje: 'Has superado el límite de 15 intentos de restablecimiento de contraseña. Por favor, inténtalo de nuevo en 1 hora.',
            retry_after: '1 hora'
        });
    }
});

/**
 * Rate limiter general para endpoints no críticos
 * 100 requests por 15 minutos
 */
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 600, // 600 requests
    message: {
        error: 'Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Rate limit general excedido - IP: ${req.ip} - Ruta: ${req.path}`);
        res.status(429).json({
            error: 'Límite de solicitudes superado',
            mensaje: 'Has superado el límite de 600 solicitudes generales. Por favor, inténtalo de nuevo en 15 minutos.',
            retry_after: '15 minutos'
        });
    }
});

export default {
    loginLimiter,
    registroAppLimiter,
    recuperarTokenLimiter,
    registroUsuarioLimiter,
    solicitarRecuperacionPasswordLimiter,
    recuperarContrasenaLimiter,
    generalLimiter
};
