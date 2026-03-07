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

/**
 * Retorna los feriados oficiales de México (Art. 74 LFT) para un año dado.
 * Se incluyen también los feriados por decreto presidencial comunes.
 * @param {number} anio
 * @returns {Set<string>} Set de fechas en formato 'YYYY-MM-DD'
 */
export function obtenerFeriadosMexico(anio) {
    const feriados = new Set();

    // Feriados fijos Art. 74 LFT
    feriados.add(`${anio}-01-01`); // Año Nuevo
    feriados.add(`${anio}-05-01`); // Día del Trabajo
    feriados.add(`${anio}-09-16`); // Independencia
    feriados.add(`${anio}-11-20`); // Revolución
    feriados.add(`${anio}-12-25`); // Navidad

    // Transmisión del Poder Ejecutivo (cada 6 años: 2024, 2030...)
    if (anio % 6 === 0) {
        feriados.add(`${anio}-10-01`);
    }

    // Feriados con lunes de puente (se observan el lunes más cercano)
    // Día de la Constitución: primer lunes de febrero
    const constitucion = primerLunesDesMes(anio, 2);
    feriados.add(constitucion);

    // Natalicio de Benito Juárez: tercer lunes de marzo
    const juarez = tercerLunesDeMes(anio, 3);
    feriados.add(juarez);

    return feriados;
}

/** Devuelve el primer lunes del mes (mes: 1-12) en formato 'YYYY-MM-DD' */
function primerLunesDesMes(anio, mes) {
    const d = new Date(anio, mes - 1, 1);
    // getDay: 0=Dom, 1=Lun ... 6=Sáb
    const diaSemana = d.getDay();
    const diasHastaLunes = diaSemana === 1 ? 0 : (8 - diaSemana) % 7;
    d.setDate(1 + diasHastaLunes);
    return d.toISOString().slice(0, 10);
}

/** Devuelve el tercer lunes del mes (mes: 1-12) en formato 'YYYY-MM-DD' */
function tercerLunesDeMes(anio, mes) {
    const d = new Date(anio, mes - 1, 1);
    const diaSemana = d.getDay();
    const diasHastaLunes = diaSemana === 1 ? 0 : (8 - diaSemana) % 7;
    // Primer lunes + 14 días = tercer lunes
    d.setDate(1 + diasHastaLunes + 14);
    return d.toISOString().slice(0, 10);
}

/**
 * Verifica si una fecha es día hábil (no es sábado, domingo ni feriado oficial).
 * @param {string} fechaStr - Fecha en formato 'YYYY-MM-DD'
 * @returns {boolean}
 */
export function esDiaHabil(fechaStr) {
    // Parsear como fecha local (no UTC) para evitar desfase de zona horaria
    const [anio, mes, dia] = fechaStr.split('-').map(Number);
    const fecha = new Date(anio, mes - 1, dia);
    const diaSemana = fecha.getDay(); // 0=Dom, 6=Sáb
    if (diaSemana === 0 || diaSemana === 6) return false;

    const feriados = obtenerFeriadosMexico(anio);
    return !feriados.has(fechaStr);
}

/**
 * Avanza la fecha hasta el siguiente día hábil (inclusive: si ya es hábil, la devuelve).
 * @param {string} fechaStr - Fecha en formato 'YYYY-MM-DD'
 * @returns {string} Fecha hábil en formato 'YYYY-MM-DD'
 */
export function siguienteDiaHabil(fechaStr) {
    let [anio, mes, dia] = fechaStr.split('-').map(Number);
    let fecha = new Date(anio, mes - 1, dia);

    while (!esDiaHabil(fecha.toISOString().slice(0, 10))) {
        fecha.setDate(fecha.getDate() + 1);
    }

    return fecha.toISOString().slice(0, 10);
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
    obtenerFeriadosMexico,
    esDiaHabil,
    siguienteDiaHabil,
    TIMEZONE
};
