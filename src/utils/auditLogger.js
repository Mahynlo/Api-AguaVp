/**
 * Helper de Auditoría de Seguridad
 * 
 * File: src/utils/auditLogger.js
 * 
 * Descripción: Utilidad para registrar eventos de seguridad
 * en la tabla auditoria_seguridad
 * 
 * Uso:
 * import { logSecurityEvent } from '../utils/auditLogger.js';
 * await logSecurityEvent('login', { usuario_id: 1, ip: '127.0.0.1', exitoso: true });
 */

import dbTurso from "../database/db-sqlite.js";

/**
 * Tipos de eventos de seguridad
 */
export const EVENTOS = {
    // Autenticación
    LOGIN: 'login',
    LOGOUT: 'logout',
    FAILED_LOGIN: 'failed_login',
    LOGIN_BLOQUEADO: 'login_bloqueado',
    
    // Registro
    REGISTRO_USUARIO: 'registro_usuario',
    REGISTRO_APP: 'registro_app',
    
    // Tokens
    TOKEN_GENERADO: 'token_generado',
    TOKEN_RECUPERADO: 'token_recuperado',
    TOKEN_REVOCADO: 'token_revocado',
    TOKEN_EXPIRADO: 'token_expirado',
    
    // Contraseñas
    CAMBIO_PASSWORD: 'cambio_password',
    RESET_PASSWORD: 'reset_password',
    PASSWORD_DEBIL: 'password_debil',
    
    // Sesiones
    SESION_CREADA: 'sesion_creada',
    SESION_CERRADA: 'sesion_cerrada',
    SESION_EXPIRADA: 'sesion_expirada',
    MULTIPLES_SESIONES: 'multiples_sesiones',
    
    // Accesos
    ACCESO_DENEGADO: 'acceso_denegado',
    ACCESO_NO_AUTORIZADO: 'acceso_no_autorizado',
    ACCESO_RECURSO_RESTRINGIDO: 'acceso_recurso_restringido',
    
    // Seguridad
    INTENTO_FUERZA_BRUTA: 'intento_fuerza_bruta',
    IP_SOSPECHOSA: 'ip_sospechosa',
    PATRON_ATAQUE: 'patron_ataque',
    RATE_LIMIT_EXCEDIDO: 'rate_limit_excedido',
    
    // Administración
    CAMBIO_ROL: 'cambio_rol',
    USUARIO_BLOQUEADO: 'usuario_bloqueado',
    USUARIO_DESBLOQUEADO: 'usuario_desbloqueado',
    APP_DESACTIVADA: 'app_desactivada'
};

/**
 * Niveles de severidad
 */
export const SEVERIDAD = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Registra un evento de seguridad en la base de datos
 * 
 * @param {string} evento - Tipo de evento (usar constantes de EVENTOS)
 * @param {Object} datos - Datos del evento
 * @param {number} datos.usuario_id - ID del usuario (opcional)
 * @param {string} datos.app_id - ID de la aplicación (opcional)
 * @param {string} datos.ip - Dirección IP del cliente
 * @param {string} datos.dispositivo - Información del dispositivo
 * @param {string} datos.user_agent - User agent (opcional)
 * @param {boolean} datos.exitoso - Si el evento fue exitoso (default: true)
 * @param {string} datos.detalles - Detalles adicionales en formato JSON
 * @param {string} datos.severidad - Nivel de severidad (default: 'info')
 * 
 * @returns {Promise<number>} - ID del registro de auditoría creado
 */
export async function logSecurityEvent(evento, datos = {}) {
    try {
        const {
            usuario_id = null,
            app_id = null,
            ip = null,
            dispositivo = null,
            user_agent = null,
            exitoso = true,
            detalles = null,
            severidad = SEVERIDAD.INFO
        } = datos;

        // Convertir detalles a JSON si es un objeto
        let detallesJson = detalles;
        if (typeof detalles === 'object' && detalles !== null) {
            detallesJson = JSON.stringify(detalles);
        }

        const query = `
            INSERT INTO auditoria_seguridad 
            (evento, usuario_id, app_id, ip, dispositivo, user_agent, exitoso, detalles, severidad)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const result = await dbTurso.execute({
            sql: query,
            args: [
                evento,
                usuario_id,
                app_id,
                ip,
                dispositivo,
                user_agent,
                exitoso ? 1 : 0,
                detallesJson,
                severidad
            ]
        });

        return Number(result.lastInsertRowid);

    } catch (error) {
        // No fallar la operación principal si falla el logging
        console.error('[AUDIT ERROR] Error registrando evento de seguridad:', error);
        console.error('[AUDIT ERROR] Evento:', evento, 'Datos:', datos);
        return null;
    }
}

/**
 * Obtiene eventos de auditoría con filtros
 * 
 * @param {Object} filtros - Filtros de búsqueda
 * @param {string} filtros.evento - Tipo de evento
 * @param {number} filtros.usuario_id - ID del usuario
 * @param {string} filtros.ip - IP del cliente
 * @param {string} filtros.severidad - Nivel de severidad
 * @param {number} filtros.limit - Límite de resultados (default: 100)
 * @param {number} filtros.offset - Offset para paginación (default: 0)
 * 
 * @returns {Promise<Array>} - Array de eventos de auditoría
 */
export async function getAuditEvents(filtros = {}) {
    try {
        const {
            evento = null,
            usuario_id = null,
            ip = null,
            severidad = null,
            limit = 100,
            offset = 0
        } = filtros;

        let query = 'SELECT * FROM auditoria_seguridad WHERE 1=1';
        const args = [];

        if (evento) {
            query += ' AND evento = ?';
            args.push(evento);
        }

        if (usuario_id) {
            query += ' AND usuario_id = ?';
            args.push(usuario_id);
        }

        if (ip) {
            query += ' AND ip = ?';
            args.push(ip);
        }

        if (severidad) {
            query += ' AND severidad = ?';
            args.push(severidad);
        }

        query += ' ORDER BY fecha DESC LIMIT ? OFFSET ?';
        args.push(limit, offset);

        const result = await dbTurso.execute({
            sql: query,
            args: args
        });

        return result.rows;

    } catch (error) {
        console.error('[AUDIT ERROR] Error obteniendo eventos:', error);
        return [];
    }
}

/**
 * Cuenta intentos fallidos de login para un usuario o IP
 * 
 * @param {Object} filtro - Filtro de búsqueda
 * @param {number} filtro.usuario_id - ID del usuario
 * @param {string} filtro.ip - IP del cliente
 * @param {number} filtro.minutos - Ventana de tiempo en minutos (default: 15)
 * 
 * @returns {Promise<number>} - Cantidad de intentos fallidos
 */
export async function contarIntentosFallidos(filtro, minutos = 15) {
    try {
        const { usuario_id = null, ip = null } = filtro;

        if (!usuario_id && !ip) {
            return 0;
        }

        let query = `
            SELECT COUNT(*) as count 
            FROM auditoria_seguridad 
            WHERE evento = ? 
            AND exitoso = 0
            AND fecha > datetime('now', '-${minutos} minutes')
        `;
        const args = [EVENTOS.FAILED_LOGIN];

        if (usuario_id) {
            query += ' AND usuario_id = ?';
            args.push(usuario_id);
        }

        if (ip) {
            query += ' AND ip = ?';
            args.push(ip);
        }

        const result = await dbTurso.execute({
            sql: query,
            args: args
        });

        return result.rows[0]?.count || 0;

    } catch (error) {
        console.error('[AUDIT ERROR] Error contando intentos fallidos:', error);
        return 0;
    }
}

/**
 * Detecta patrones sospechosos de una IP
 * 
 * @param {string} ip - Dirección IP
 * @param {number} minutos - Ventana de tiempo en minutos (default: 60)
 * 
 * @returns {Promise<Object>} - Estadísticas de la IP
 */
export async function analizarPatronIP(ip, minutos = 60) {
    try {
        const query = `
            SELECT 
                COUNT(*) as total_eventos,
                SUM(CASE WHEN exitoso = 0 THEN 1 ELSE 0 END) as eventos_fallidos,
                COUNT(DISTINCT usuario_id) as usuarios_intentados,
                COUNT(DISTINCT evento) as tipos_evento
            FROM auditoria_seguridad 
            WHERE ip = ? 
            AND fecha > datetime('now', '-${minutos} minutes')
        `;

        const result = await dbTurso.execute({
            sql: query,
            args: [ip]
        });

        const stats = result.rows[0];

        // Calcular score de riesgo (0-100)
        let riesgo = 0;
        if (stats.total_eventos > 50) riesgo += 30;
        if (stats.eventos_fallidos > 10) riesgo += 40;
        if (stats.usuarios_intentados > 5) riesgo += 20;
        if (stats.tipos_evento > 5) riesgo += 10;

        return {
            ip,
            total_eventos: stats.total_eventos || 0,
            eventos_fallidos: stats.eventos_fallidos || 0,
            usuarios_intentados: stats.usuarios_intentados || 0,
            tipos_evento: stats.tipos_evento || 0,
            score_riesgo: Math.min(riesgo, 100),
            nivel_riesgo: riesgo > 70 ? 'alto' : riesgo > 40 ? 'medio' : 'bajo'
        };

    } catch (error) {
        console.error('[AUDIT ERROR] Error analizando patrón de IP:', error);
        return null;
    }
}

export default {
    logSecurityEvent,
    getAuditEvents,
    contarIntentosFallidos,
    analizarPatronIP,
    EVENTOS,
    SEVERIDAD
};
