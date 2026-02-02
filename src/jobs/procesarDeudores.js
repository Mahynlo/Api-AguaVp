/**
 * Job: Procesar Deudores
 * 
 * File: src/jobs/procesarDeudores.js
 * 
 * Descripción:
 * Cron job diario que analiza la cartera vencida.
 * - Detecta candidatos a corte según configuración.
 * - Genera métricas para dashboard/reportes.
 * - NO ejecuta acciones destructivas (cortes) automáticamente.
 * - Envía notificaciones al sistema (Alertas admin).
 */

import cron from 'node-cron';
import dbTurso from '../database/db-sqlite.js';

let notificationManager = null;

export const setNotificationManager = (manager) => {
    notificationManager = manager;
};

/**
 * Lógica principal del análisis
 */
export const analizarCarteraVencida = async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Job] Iniciando análisis de cartera: ${timestamp}`);

    try {
        // 1. Obtener reglas de configuración
        const configQuery = `SELECT * FROM configuracion_servicio ORDER BY id DESC LIMIT 1`;
        const configRes = await dbTurso.execute({ sql: configQuery, args: [] });
        const umbralCorte = configRes.rows.length > 0 ? configRes.rows[0].facturas_para_corte : 4;
        const diasGracia = configRes.rows.length > 0 ? (configRes.rows[0].dias_gracia || 0) : 0;

        // 2. Contar candidatos a corte (CORREGIDO: Vincula factura → lectura → medidor)
        const candidatosQuery = `
            SELECT COUNT(*) as total
            FROM (
                SELECT m.id
                FROM medidores m
                JOIN lecturas l ON l.medidor_id = m.id
                JOIN facturas f ON f.lectura_id = l.id
                LEFT JOIN convenios_pago cp ON cp.medidor_id = m.id AND cp.estado = 'Activo'
                WHERE f.saldo_pendiente > 0 
                AND f.estado = 'Vencida'
                AND f.fecha_vencimiento <= date('now', '-' || ? || ' days') -- Período de gracia
                AND m.estado_servicio = 'Activo'
                AND cp.id IS NULL -- Excluir convenios activos
                GROUP BY m.id
                HAVING COUNT(f.id) >= ?
            )
        `;
        const candidatosRes = await dbTurso.execute({ sql: candidatosQuery, args: [diasGracia, umbralCorte] });
        const numCandidatos = candidatosRes.rows[0]?.total || 0;

        // 3. Obtener deuda total vencida
        const deudaQuery = `SELECT SUM(saldo_pendiente) as total FROM facturas WHERE estado = 'Vencida'`;
        const deudaRes = await dbTurso.execute({ sql: deudaQuery, args: [] });
        const deudaTotal = deudaRes.rows[0]?.total || 0;

        console.log(`[Job] Candidatos a corte detectados: ${numCandidatos}`);
        console.log(`[Job] Deuda total vencida: $${deudaTotal}`);

        // 4. Generar Alerta/Notificación al Admin (vía SSE)
        if (notificationManager) {
            notificationManager.alertaSistema(
                `Análisis diario completado`,
                'info',
                {
                    tipo: 'analisis_cartera',
                    candidatos_corte: numCandidatos,
                    deuda_vencida: deudaTotal,
                    umbral_aplicado: umbralCorte
                }
            );

            if (numCandidatos > 0) {
                notificationManager.alertaSistema(
                    `⚠️ ${numCandidatos} medidores candidatos a corte`,
                    'warning',
                    { link: '/deudores/candidatos' }
                );
            }
        }

        return { numCandidatos, deudaTotal };

    } catch (error) {
        console.error('[Job] Error analizando cartera:', error);
    }
};

/**
 * Inicializar Cron Job
 * Soporta dos modos de ejecución:
 * - SERVER: Ejecuta a las 3:00 AM (tradicional, para servidores 24/7)
 * - LOCAL: Ejecuta al inicio + cada hora (para apps locales que se abren/cierran)
 */
export const initDeudoresJob = () => {
    const executionMode = process.env.EXECUTION_MODE || 'SERVER';

    if (executionMode === 'LOCAL') {
        // MODO LOCAL: Para aplicaciones Electron empaquetadas
        console.log('[Cron] Modo LOCAL activado');

        // Ejecutar 1 minuto después del inicio
        setTimeout(async () => {
            console.log('[Cron] Ejecutando análisis de deudores (inicio)...');
            try {
                await analizarCarteraVencida();
            } catch (error) {
                console.error('[Cron] Error en ejecución inicial:', error);
            }
        }, 60000);

        // Respaldo cada hora
        cron.schedule('0 * * * *', async () => {
            console.log('[Cron] Verificando análisis (respaldo horario)...');
            try {
                await analizarCarteraVencida();
            } catch (error) {
                console.error('[Cron] Error en ejecución horaria:', error);
            }
        }, {
            timezone: "America/Mexico_City"
        });

        console.log('[Cron] Configuración LOCAL:');
        console.log('   - Ejecución al inicio: 1 minuto después del arranque');
        console.log('   - Respaldo: Cada hora');

    } else {
        // MODO SERVER: Para servidores tradicionales 24/7
        console.log('[Cron] Modo SERVER activado');

        cron.schedule('0 3 * * *', async () => {
            await analizarCarteraVencida();
        }, {
            timezone: "America/Mexico_City"
        });

        console.log('[Cron] Job programado para las 3:00 AM');
    }
};
