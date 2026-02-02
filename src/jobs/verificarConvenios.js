/**
 * Job: Verificar Convenios de Pago
 * 
 * File: src/jobs/verificarConvenios.js
 * 
 * Descripción:
 * Cron job diario que verifica el cumplimiento de convenios de pago.
 * - Detecta parcialidades vencidas
 * - Marca convenios como 'Incumplido' si hay atrasos
 * - Envía notificaciones al sistema
 * 
 * MODO DISTRIBUIDO:
 * - Soporta EXECUTION_MODE (LOCAL/SERVER)
 * - LOCAL: Ejecuta al inicio + cada hora
 * - SERVER: Ejecuta a las 2:00 AM
 */

import cron from 'node-cron';
import dbTurso from '../database/db-sqlite.js';

let notificationManager = null;

export const setNotificationManager = (manager) => {
    notificationManager = manager;
};

/**
 * Lógica principal: Verificar convenios
 */
export const verificarConvenios = async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Job] Verificando convenios de pago: ${timestamp}`);

    try {
        // 1. Buscar parcialidades vencidas que aún están pendientes
        const parcialidadesVencidasQuery = `
            SELECT 
                p.id as parcialidad_id,
                p.convenio_id,
                p.numero_parcialidad,
                p.fecha_vencimiento,
                c.cliente_id,
                c.medidor_id,
                cl.nombre as cliente_nombre
            FROM parcialidades_convenio p
            JOIN convenios_pago c ON p.convenio_id = c.id
            JOIN clientes cl ON c.cliente_id = cl.id
            WHERE p.estado = 'Pendiente'
            AND p.fecha_vencimiento < date('now')
            AND c.estado = 'Activo'
        `;

        const vencidasRes = await dbTurso.execute({ sql: parcialidadesVencidasQuery, args: [] });
        const parcialidadesVencidas = vencidasRes.rows;

        if (parcialidadesVencidas.length === 0) {
            console.log('[Job] No hay parcialidades vencidas');
            return { parcialidades_vencidas: 0, convenios_incumplidos: 0 };
        }

        console.log(`[Job] ${parcialidadesVencidas.length} parcialidades vencidas detectadas`);

        // 2. Marcar parcialidades como 'Vencida'
        for (const parcialidad of parcialidadesVencidas) {
            await dbTurso.execute({
                sql: `UPDATE parcialidades_convenio SET estado = 'Vencida' WHERE id = ?`,
                args: [parcialidad.parcialidad_id]
            });
        }

        // 3. Obtener convenios únicos afectados
        const conveniosAfectados = [...new Set(parcialidadesVencidas.map(p => p.convenio_id))];

        // 4. Marcar convenios como 'Incumplido'
        for (const convenioId of conveniosAfectados) {
            await dbTurso.execute({
                sql: `UPDATE convenios_pago SET estado = 'Incumplido' WHERE id = ?`,
                args: [convenioId]
            });
        }

        console.log(`[Job] ${conveniosAfectados.length} convenios marcados como incumplidos`);

        // 5. Enviar notificaciones
        if (notificationManager) {
            notificationManager.alertaSistema(
                `⚠️ ${conveniosAfectados.length} convenios incumplidos`,
                'warning',
                {
                    tipo: 'convenios_incumplidos',
                    total: conveniosAfectados.length,
                    parcialidades_vencidas: parcialidadesVencidas.length
                }
            );
        }

        return {
            parcialidades_vencidas: parcialidadesVencidas.length,
            convenios_incumplidos: conveniosAfectados.length
        };

    } catch (error) {
        console.error('[Job] Error verificando convenios:', error);
        throw error;
    }
};

/**
 * Inicializar Cron Job
 * Soporta dos modos de ejecución:
 * - SERVER: Ejecuta a las 2:00 AM (tradicional)
 * - LOCAL: Ejecuta al inicio + cada hora (para apps locales)
 */
export const initConveniosJob = () => {
    const executionMode = process.env.EXECUTION_MODE || 'SERVER';

    if (executionMode === 'LOCAL') {
        // MODO LOCAL
        console.log('[Cron] Verificación de convenios - Modo LOCAL activado');

        // Ejecutar 2 minutos después del inicio (para no sobrecargar con deudores)
        setTimeout(async () => {
            console.log('[Cron] Verificando convenios (inicio)...');
            try {
                await verificarConvenios();
            } catch (error) {
                console.error('[Cron] Error en verificación inicial:', error);
            }
        }, 120000); // 2 minutos

        // Respaldo cada hora
        cron.schedule('0 * * * *', async () => {
            console.log('[Cron] Verificando convenios (respaldo horario)...');
            try {
                await verificarConvenios();
            } catch (error) {
                console.error('[Cron] Error en verificación horaria:', error);
            }
        }, {
            timezone: "America/Mexico_City"
        });

        console.log('[Cron] Configuración LOCAL (Convenios):');
        console.log('   - Ejecución al inicio: 2 minutos después del arranque');
        console.log('   - Respaldo: Cada hora');

    } else {
        // MODO SERVER
        console.log('[Cron] Verificación de convenios - Modo SERVER activado');

        cron.schedule('0 2 * * *', async () => {
            await verificarConvenios();
        }, {
            timezone: "America/Mexico_City"
        });

        console.log('[Cron] Job programado para las 2:00 AM');
    }
};
