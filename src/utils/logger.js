/**
 * Logger de la API
 *
 * File: src/utils/logger.js
 *
 * - Escribe en consola exactamente lo mismo que console.log / console.warn / console.error
 *   (mismos argumentos, mismo orden), así que reemplazar un console.* por el logger no
 *   cambia la salida.
 * - Si hay un receptor registrado (AguaVPServer lo conecta a su evento 'api-log'),
 *   además le reenvía cada mensaje como texto: { nivel, modulo, mensaje }.
 *
 * Uso:
 *   import { createLogger } from '../../utils/logger.js';
 *   const log = createLogger('lecturas');
 *   log.info('Lectura registrada', id);
 *   log.error('Error al registrar lectura:', err);
 *
 * No registrar tokens, contraseñas ni datos personales sensibles.
 */

let receptor = null;

/**
 * Registra (o quita, con null) la función que recibe cada mensaje.
 * @param {((nivel: 'info'|'warn'|'error', modulo: string, mensaje: string) => void) | null} fn
 */
export function setLogReceptor(fn) {
    receptor = typeof fn === 'function' ? fn : null;
}

// Convierte los argumentos a un solo texto para el receptor (la consola recibe los originales)
function aTexto(args) {
    return args.map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.message;
        if (a === undefined) return 'undefined';
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
}

function reenviar(nivel, modulo, args) {
    if (!receptor) return;
    try { receptor(nivel, modulo, aTexto(args)); } catch { /* un receptor con error nunca debe romper la API */ }
}

/**
 * Crea un logger para un módulo.
 * @param {string} modulo Nombre corto del módulo (p. ej. 'lecturas', 'cron', 'auth')
 */
export function createLogger(modulo) {
    return {
        info: (...args) => { console.log(...args); reenviar('info', modulo, args); },
        warn: (...args) => { console.warn(...args); reenviar('warn', modulo, args); },
        error: (...args) => { console.error(...args); reenviar('error', modulo, args); },
    };
}
