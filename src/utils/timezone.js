/**
 * Timezone Helper - America/Hermosillo (GMT-7)
 * 
 * File: src/utils/timezone.js
 * 
 * Descripción:
 * Centraliza el manejo de fechas y horas en la zona horaria de México (GMT-7).
 * La base de datos guarda en UTC, este helper convierte a/desde la zona local.
 * 
 * Uso:
 * - now() - Fecha/hora actual en GMT-7 (formato SQL)
 * - nowDate() - Solo fecha actual en GMT-7
 * - toLocalTime() - Convierte UTC a GMT-7
 * - formatDate() - Formatea fecha en GMT-7
 */

import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { format, parseISO } from 'date-fns';

const TIMEZONE = 'America/Hermosillo'; // GMT-7

/**
 * Retorna la fecha y hora actual en formato SQL para la zona horaria de México
 * @returns {string} Formato: 'YYYY-MM-DD HH:mm:ss'
 */
export function now() {
    return formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Retorna solo la fecha actual (sin hora) en la zona horaria de México
 * @returns {string} Formato: 'YYYY-MM-DD'
 */
export function nowDate() {
    return formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Convierte una fecha UTC a la zona horaria de México
 * @param {string|Date} utcDate - Fecha en UTC
 * @returns {Date} Fecha convertida a GMT-7
 */
export function toLocalTime(utcDate) {
    const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
    return toZonedTime(date, TIMEZONE);
}

/**
 * Formatea una fecha en la zona horaria de México
 * @param {string|Date} date - Fecha a formatear
 * @param {string} formatStr - Formato deseado (default: 'yyyy-MM-dd HH:mm:ss')
 * @returns {string} Fecha formateada
 */
export function formatDate(date, formatStr = 'yyyy-MM-dd HH:mm:ss') {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return formatInTimeZone(dateObj, TIMEZONE, formatStr);
}

/**
 * Formatea una fecha para mostrar al usuario (formato legible)
 * @param {string|Date} date - Fecha a formatear
 * @returns {string} Formato: 'DD/MM/YYYY HH:mm'
 */
export function formatForDisplay(date) {
    return formatDate(date, 'dd/MM/yyyy HH:mm');
}

/**
 * Formatea solo la fecha para mostrar al usuario
 * @param {string|Date} date - Fecha a formatear
 * @returns {string} Formato: 'DD/MM/YYYY'
 */
export function formatDateForDisplay(date) {
    return formatDate(date, 'dd/MM/yyyy');
}

/**
 * Calcula la fecha de vencimiento (fecha + días)
 * @param {number} dias - Días a agregar
 * @param {Date} fechaBase - Fecha base (default: hoy)
 * @returns {string} Fecha de vencimiento en formato SQL
 */
export function calcularVencimiento(dias, fechaBase = new Date()) {
    const fecha = new Date(fechaBase);
    fecha.setDate(fecha.getDate() + dias);
    return formatInTimeZone(fecha, TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Verifica si una fecha está vencida
 * @param {string|Date} fecha - Fecha a verificar
 * @returns {boolean} true si está vencida
 */
export function estaVencida(fecha) {
    const fechaObj = typeof fecha === 'string' ? parseISO(fecha) : fecha;
    const ahora = toZonedTime(new Date(), TIMEZONE);
    return fechaObj < ahora;
}

/**
 * Obtiene el inicio del día actual en GMT-7
 * @returns {string} Formato: 'YYYY-MM-DD 00:00:00'
 */
export function inicioDia() {
    return formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd') + ' 00:00:00';
}

/**
 * Obtiene el fin del día actual en GMT-7
 * @returns {string} Formato: 'YYYY-MM-DD 23:59:59'
 */
export function finDia() {
    return formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd') + ' 23:59:59';
}

export default {
    now,
    nowDate,
    toLocalTime,
    formatDate,
    formatForDisplay,
    formatDateForDisplay,
    calcularVencimiento,
    estaVencida,
    inicioDia,
    finDia,
    TIMEZONE
};
