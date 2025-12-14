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

/**
 * Rate limiter para login de usuarios
 * 8 intentos cada 15 minutos
 */
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 8, // 8 intentos
    message: {
        error: 'Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos.'
    },
    standardHeaders: true, // Retorna info de rate limit en headers `RateLimit-*`
    legacyHeaders: false, // Deshabilita headers `X-RateLimit-*`
    // Handler personalizado cuando se excede el límite
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Login excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Demasiados intentos de inicio de sesión',
            mensaje: 'Has excedido el límite de intentos. Intenta de nuevo en 15 minutos.',
            retry_after: '15 minutos'
        });
    }
});

/**
 * Rate limiter para registro de aplicaciones
 * 8 intentos cada 1 hora
 */
export const registroAppLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 8, // 8 intentos
    message: {
        error: 'Demasiados intentos de registro de aplicación. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Registro de app excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Demasiados intentos de registro',
            mensaje: 'Has excedido el límite de registros de aplicación. Intenta de nuevo en 1 hora.',
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
    max: 4, // 4 intentos
    message: {
        error: 'Demasiados intentos de recuperación de token. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Recuperación de token excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Demasiados intentos de recuperación',
            mensaje: 'Has excedido el límite de recuperaciones de token. Intenta de nuevo en 1 hora.',
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
    max: 10, // 10 intentos
    message: {
        error: 'Demasiados intentos de registro de usuario. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Registro de usuario excedido - IP: ${req.ip}`);
        res.status(429).json({
            error: 'Demasiados intentos de registro',
            mensaje: 'Has excedido el límite de registros de usuario. Intenta de nuevo en 1 hora.',
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
    max: 100, // 100 requests
    message: {
        error: 'Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.warn(`[RATE LIMIT] Rate limit general excedido - IP: ${req.ip} - Ruta: ${req.path}`);
        res.status(429).json({
            error: 'Demasiadas solicitudes',
            mensaje: 'Has excedido el límite de solicitudes. Intenta de nuevo en unos minutos.',
            retry_after: '15 minutos'
        });
    }
});

export default {
    loginLimiter,
    registroAppLimiter,
    recuperarTokenLimiter,
    registroUsuarioLimiter,
    generalLimiter
};
