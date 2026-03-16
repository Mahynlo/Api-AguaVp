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
import { format, parseISO, addMonths, addDays, getDay, getYear, getMonth, getDate } from 'date-fns';

const TIMEZONE = 'America/Hermosillo'; // GMT-7

// ─── Feriados Oficiales de México (Ley Federal del Trabajo Art. 74) ───

/**
 * Obtiene los feriados oficiales de México para un año dado.
 * Incluye feriados fijos y feriados con "puente" (lunes más cercano).
 * @param {number} anio - Año para calcular feriados
 * @returns {string[]} Array de fechas en formato 'YYYY-MM-DD'
 */
export function obtenerFeriadosMexico(anio) {
    const feriados = [];

    // Feriados fijos
    feriados.push(`${anio}-01-01`); // Año Nuevo
    feriados.push(`${anio}-05-01`); // Día del Trabajo
    feriados.push(`${anio}-09-16`); // Independencia de México
    feriados.push(`${anio}-12-25`); // Navidad

    // Feriados con "puente" (lunes más cercano)
    // Primer lunes de febrero - Constitución (5 de febrero)
    feriados.push(obtenerNesimoLunes(anio, 1, 1));
    // Tercer lunes de marzo - Natalicio de Benito Juárez (21 de marzo)
    feriados.push(obtenerNesimoLunes(anio, 2, 3));
    // Tercer lunes de noviembre - Revolución Mexicana (20 de noviembre)
    feriados.push(obtenerNesimoLunes(anio, 10, 3));

    // Transmisión del Poder Ejecutivo Federal (cada 6 años: 2024, 2030, 2036...)
    if (anio >= 2024 && (anio - 2024) % 6 === 0) {
        feriados.push(`${anio}-10-01`);
    }

    return feriados;
}

/**
 * Obtiene el N-ésimo lunes de un mes dado
 * @param {number} anio
 * @param {number} mes - 0-indexed (0=enero, 11=diciembre)
 * @param {number} n - Número de lunes (1=primero, 2=segundo, etc.)
 * @returns {string} Fecha en formato 'YYYY-MM-DD'
 */
function obtenerNesimoLunes(anio, mes, n) {
    let fecha = new Date(anio, mes, 1);
    let contadorLunes = 0;
    while (contadorLunes < n) {
        if (fecha.getDay() === 1) contadorLunes++;
        if (contadorLunes < n) fecha.setDate(fecha.getDate() + 1);
    }
    return format(fecha, 'yyyy-MM-dd');
}

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
 * Parsea una fecha string 'YYYY-MM-DD' como fecha calendario local (sin offset UTC).
 * Evita el bug donde parseISO('2026-03-06') crea midnight UTC y al
 * formatear a GMT-7 pierde un día.
 * @param {string|Date} fecha
 * @returns {Date}
 */
function parseLocalDate(fecha) {
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const [y, m, d] = fecha.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    if (typeof fecha === 'string') {
        return toZonedTime(parseISO(fecha), TIMEZONE);
    }
    return fecha instanceof Date ? fecha : new Date(fecha);
}

/**
 * Calcula la fecha de vencimiento (fecha + días calendario)
 * @param {number} dias - Días a agregar
 * @param {string|Date} fechaBase - Fecha base (default: hoy en GMT-7)
 * @returns {string} Fecha de vencimiento en formato 'YYYY-MM-DD'
 */
export function calcularVencimiento(dias, fechaBase) {
    const fecha = fechaBase ? parseLocalDate(fechaBase) : toZonedTime(new Date(), TIMEZONE);
    const resultado = addDays(fecha, dias);
    return format(resultado, 'yyyy-MM-dd');
}

/**
 * Calcula la fecha de vencimiento asegurando que caiga en día hábil.
 * Si la fecha calculada cae en fin de semana o feriado, avanza al siguiente día hábil.
 * @param {number} dias - Días calendario a agregar
 * @param {string|Date} fechaBase - Fecha base (default: hoy)
 * @returns {string} Fecha de vencimiento en día hábil, formato 'YYYY-MM-DD'
 */
export function calcularVencimientoHabil(dias, fechaBase) {
    const fecha = fechaBase ? parseLocalDate(fechaBase) : toZonedTime(new Date(), TIMEZONE);
    const resultado = addDays(fecha, dias);
    return siguienteDiaHabil(resultado);
}

/**
 * Verifica si una fecha es día hábil (no fin de semana ni feriado mexicano)
 * @param {string|Date} fecha - Fecha a verificar
 * @returns {boolean} true si es día hábil
 */
export function esDiaHabil(fecha) {
    const fechaObj = parseLocalDate(fecha);
    const diaSemana = getDay(fechaObj);
    // Sábado (6) o Domingo (0)
    if (diaSemana === 0 || diaSemana === 6) return false;
    // Verificar feriados
    const anio = getYear(fechaObj);
    const fechaStr = format(fechaObj, 'yyyy-MM-dd');
    const feriados = obtenerFeriadosMexico(anio);
    return !feriados.includes(fechaStr);
}

/**
 * Si la fecha no es hábil, avanza al siguiente día hábil
 * @param {string|Date} fecha - Fecha a evaluar
 * @returns {string} Fecha en día hábil, formato 'YYYY-MM-DD'
 */
export function siguienteDiaHabil(fecha) {
    let fechaObj = parseLocalDate(fecha);
    while (!esDiaHabil(fechaObj)) {
        fechaObj = addDays(fechaObj, 1);
    }
    return format(fechaObj, 'yyyy-MM-dd');
}

/**
 * Suma N días hábiles a una fecha (solo cuenta días laborables)
 * @param {number} diasHabiles - Días hábiles a agregar
 * @param {string|Date} fechaBase - Fecha base
 * @returns {string} Fecha resultante en formato 'YYYY-MM-DD'
 */
export function sumarDiasHabiles(diasHabiles, fechaBase = new Date()) {
    let fechaObj = typeof fechaBase === 'string' ? parseISO(fechaBase) : new Date(fechaBase);
    let contador = 0;
    while (contador < diasHabiles) {
        fechaObj = addDays(fechaObj, 1);
        if (esDiaHabil(fechaObj)) contador++;
    }
    return formatInTimeZone(fechaObj, TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Obtiene los límites del mes actual y anterior en GMT-7
 * Útil para dashboard y reportes comparativos
 * @returns {{ inicioMesActual: string, inicioMesSiguiente: string, inicioMesAnterior: string, finMesAnterior: string }}
 */
export function limitesMensuales() {
    const ahora = toZonedTime(new Date(), TIMEZONE);
    const anio = getYear(ahora);
    const mes = getMonth(ahora);

    const inicioMesActual = format(new Date(anio, mes, 1), 'yyyy-MM-dd');
    const inicioMesSiguiente = format(new Date(anio, mes + 1, 1), 'yyyy-MM-dd');
    const inicioMesAnterior = format(new Date(anio, mes - 1, 1), 'yyyy-MM-dd');

    return {
        inicioMesActual,
        inicioMesSiguiente,
        inicioMesAnterior,
        finMesAnterior: inicioMesActual // exclusivo
    };
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
    calcularVencimientoHabil,
    esDiaHabil,
    siguienteDiaHabil,
    sumarDiasHabiles,
    obtenerFeriadosMexico,
    limitesMensuales,
    estaVencida,
    inicioDia,
    finDia,
    obtenerFeriadosMexico,
    esDiaHabil,
    siguienteDiaHabil,
    TIMEZONE
};
