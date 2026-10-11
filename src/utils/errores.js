/**
 * Manejo de errores reutilizable para controllers y services
 *
 * File: src/utils/errores.js
 *
 * - crearError(mensaje, status, extra): error con código HTTP para lanzar desde un service
 *   (mismo objeto que los serviceError() locales: un Error con .status).
 * - manejarErrores(handler, opciones): envuelve un handler async y, si lanza, responde
 *   con el MISMO formato que los bloques catch escritos a mano en los controllers.
 *
 * Patrones que reproduce (elige con las opciones):
 *
 *   A (por defecto)
 *     catch (err) { res.status(err.status || 500).json({ error: err.message || mensaje }) }
 *
 *   B  { exponerMensaje: false, statusDelError: false }
 *     catch (err) { res.status(500).json({ error: mensaje }) }
 *
 *   C  { formato: 'success' }
 *     catch (err) { res.status(err.status || 500).json({ success: false, message: err.message || mensaje }) }
 *
 * Con `log`, antes de responder hace lo mismo que `console.error(log, err)` (vía logger).
 *
 * No se registra como middleware global a propósito: los errores no atrapados siguen
 * respondiéndose como hasta ahora (manejador por defecto de Express).
 */

import { createLogger } from './logger.js';

const logger = createLogger('http');

/**
 * Crea un error con código HTTP (y campos extra opcionales) para lanzar desde un service.
 * @param {string} mensaje
 * @param {number} status Código HTTP (404, 400, 409…)
 * @param {object} [extra] Campos adicionales que el controller puede usar (p. ej. { cliente })
 */
export function crearError(mensaje, status, extra) {
    const err = new Error(mensaje);
    err.status = status;
    if (extra) Object.assign(err, extra);
    return err;
}

/**
 * Envuelve un handler (req, res, next) async y responde los errores con un formato fijo.
 * @param {Function} handler
 * @param {object} opciones
 * @param {string} opciones.mensaje Mensaje por defecto (o fijo, con exponerMensaje: false)
 * @param {string} [opciones.log] Si se indica, se registra como console.error(log, err)
 * @param {'error'|'success'} [opciones.formato='error'] Forma del cuerpo de la respuesta
 * @param {boolean} [opciones.exponerMensaje=true] Usar err.message (si existe) en lugar del mensaje fijo
 * @param {boolean} [opciones.statusDelError=true] Usar err.status (si existe) en lugar de 500
 */
export function manejarErrores(handler, { mensaje, log, formato = 'error', exponerMensaje = true, statusDelError = true }) {
    return async (req, res, next) => {
        try {
            return await handler(req, res, next);
        } catch (err) {
            if (log) logger.error(log, err);

            const status = (statusDelError && err?.status) || 500;
            const texto = (exponerMensaje && err?.message) || mensaje;
            const cuerpo = formato === 'success'
                ? { success: false, message: texto }
                : { error: texto };

            return res.status(status).json(cuerpo);
        }
    };
}
