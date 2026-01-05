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
import dbTurso from '../database/db-turso.js';

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
        // 1. Obtener reglas
        const configQuery = `SELECT * FROM configuracion_servicio ORDER BY id DESC LIMIT 1`;
        const configRes = await dbTurso.execute({ sql: configQuery, args: [] });
        const umbralCorte = configRes.rows.length > 0 ? configRes.rows[0].facturas_para_corte : 4;

        // 2. Contar candidatos a corte
        const candidatosQuery = `
            SELECT COUNT(*) as total
            FROM (
                SELECT m.id
                FROM medidores m
                JOIN facturas f ON f.cliente_id = (SELECT cliente_id FROM medidores WHERE id = m.id)
                LEFT JOIN convenios_pago cp ON cp.medidor_id = m.id AND cp.estado = 'Activo'
                WHERE f.saldo_pendiente > 0 
                AND f.estado = 'Vencida' 
                AND m.estado_servicio = 'Activo'
                AND cp.id IS NULL -- Excluir convenios activos
                GROUP BY m.id
                HAVING COUNT(f.id) >= ?
            )
        `;
        const candidatosRes = await dbTurso.execute({ sql: candidatosQuery, args: [umbralCorte] });
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
 * Frecuencia: 3:00 AM todos los días (0 3 * * *)
 */
export const initDeudoresJob = () => {
    // Programar para las 3:00 AM
    cron.schedule('0 3 * * *', async () => {
        await analizarCarteraVencida();
    }, {
        timezone: "America/Mexico_City"
    });

    console.log('[Cron] Job de análisis de deudores programado (03:00 AM)');
};
