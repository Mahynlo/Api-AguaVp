/**
 * Controlador para el Dashboard Principal - V2
 * File: src/v2/controllers/dashboardController.js
 * 
 * Descripción: Proporciona datos agregados para el dashboard principal:
 * - Tarjetas de resumen (Consumo, Clientes, Medidores, Pagos) con comparativas mensuales.
 * - Datos para gráficos (Consumo histórico, Distribución por ruta).
 */

import dbTurso from "../../database/db-sqlite.js";

const dashboardController = {

    getDashboardStats: async (req, res) => {
        try {
            // Fechas para cálculos comparativos (Mes actual vs Mes anterior)
            const now = new Date();
            const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];
            
            const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
            const endOfPreviousMonth = startOfCurrentMonth; // El inicio del mes actual es el fin del anterior (exclusivo)

            // --- 1. Resumen de Consumo (lecturas) ---
            // Mes Actual
            const consumoActualQuery = `
                SELECT COALESCE(SUM(consumo_m3), 0) as total 
                FROM lecturas 
                WHERE date(fecha_lectura) >= ? AND date(fecha_lectura) < ?
            `;
            const consumoActualResult = await dbTurso.execute({ 
                sql: consumoActualQuery, 
                args: [startOfCurrentMonth, startOfNextMonth] 
            });
            const consumoActual = Number(consumoActualResult.rows[0].total);

            // Mes Anterior
            const consumoAnteriorQuery = `
                SELECT COALESCE(SUM(consumo_m3), 0) as total 
                FROM lecturas 
                WHERE date(fecha_lectura) >= ? AND date(fecha_lectura) < ?
            `;
            const consumoAnteriorResult = await dbTurso.execute({ 
                sql: consumoAnteriorQuery, 
                args: [startOfPreviousMonth, endOfPreviousMonth] 
            });
            const consumoAnterior = Number(consumoAnteriorResult.rows[0].total);
            const crecimientoConsumo = calcularCrecimiento(consumoActual, consumoAnterior);


            // --- 2. Resumen de Clientes ---
            // Total Clientes (Activos/No eliminados)
            const totalClientesQuery = `SELECT COUNT(*) as total FROM clientes WHERE estado_cliente != 'Eliminado'`;
            const totalClientesResult = await dbTurso.execute({ sql: totalClientesQuery });
            const totalClientes = Number(totalClientesResult.rows[0].total);

            // Crecimiento (Nuevos registros este mes vs mes anterior)
            const clientesNuevosActualQuery = `
                SELECT COUNT(*) as total 
                FROM clientes 
                WHERE date(fecha_creacion) >= ? AND date(fecha_creacion) < ?
            `;
            const clientesNuevosActualResult = await dbTurso.execute({ 
                sql: clientesNuevosActualQuery, 
                args: [startOfCurrentMonth, startOfNextMonth] 
            });
            const clientesNuevosActual = Number(clientesNuevosActualResult.rows[0].total);

            const clientesNuevosAnteriorQuery = `
                SELECT COUNT(*) as total 
                FROM clientes 
                WHERE date(fecha_creacion) >= ? AND date(fecha_creacion) < ?
            `;
            const clientesNuevosAnteriorResult = await dbTurso.execute({ 
                sql: clientesNuevosAnteriorQuery, 
                args: [startOfPreviousMonth, endOfPreviousMonth] 
            });
            const clientesNuevosAnterior = Number(clientesNuevosAnteriorResult.rows[0].total);
            const crecimientoClientes = calcularCrecimiento(clientesNuevosActual, clientesNuevosAnterior);


            // --- 3. Resumen de Medidores ---
            // Total Medidores
            const totalMedidoresQuery = `SELECT COUNT(*) as total FROM medidores WHERE estado_medidor != 'Retirado'`;
            const totalMedidoresResult = await dbTurso.execute({ sql: totalMedidoresQuery });
            const totalMedidores = Number(totalMedidoresResult.rows[0].total);

            // Crecimiento (Nuevos este mes)
            const medidoresNuevosActualQuery = `
                SELECT COUNT(*) as total 
                FROM medidores 
                WHERE date(fecha_creacion) >= ? AND date(fecha_creacion) < ?
            `;
            const medidoresNuevosActualResult = await dbTurso.execute({ 
                sql: medidoresNuevosActualQuery, 
                args: [startOfCurrentMonth, startOfNextMonth] 
            });
            const medidoresNuevosActual = Number(medidoresNuevosActualResult.rows[0].total);

            const medidoresNuevosAnteriorQuery = `
                SELECT COUNT(*) as total 
                FROM medidores 
                WHERE date(fecha_creacion) >= ? AND date(fecha_creacion) < ?
            `;
            const medidoresNuevosAnteriorResult = await dbTurso.execute({ 
                sql: medidoresNuevosAnteriorQuery, 
                args: [startOfPreviousMonth, endOfPreviousMonth] 
            });
            const medidoresNuevosAnterior = Number(medidoresNuevosAnteriorResult.rows[0].total);
            const crecimientoMedidores = calcularCrecimiento(medidoresNuevosActual, medidoresNuevosAnterior);


            // --- 4. Resumen de Pagos ---
            // Mes Actual
            const pagosActualQuery = `
                SELECT COALESCE(SUM(monto), 0) as total 
                FROM pagos 
                WHERE date(fecha_pago) >= ? AND date(fecha_pago) < ?
            `;
            const pagosActualResult = await dbTurso.execute({ 
                sql: pagosActualQuery, 
                args: [startOfCurrentMonth, startOfNextMonth] 
            });
            const pagosActual = Number(pagosActualResult.rows[0].total);

            // Mes Anterior
            const pagosAnteriorQuery = `
                SELECT COALESCE(SUM(monto), 0) as total 
                FROM pagos 
                WHERE date(fecha_pago) >= ? AND date(fecha_pago) < ?
            `;
            const pagosAnteriorResult = await dbTurso.execute({ 
                sql: pagosAnteriorQuery, 
                args: [startOfPreviousMonth, endOfPreviousMonth] 
            });
            const pagosAnterior = Number(pagosAnteriorResult.rows[0].total);
            const crecimientoPagos = calcularCrecimiento(pagosActual, pagosAnterior);


            // --- 5. Gráfico: Consumo Histórico (Últimos 6 meses) ---
            const historicoConsumoQuery = `
                SELECT 
                    strftime('%Y-%m', fecha_lectura) as mes,
                    SUM(consumo_m3) as total
                FROM lecturas
                WHERE date(fecha_lectura) >= date('now', '-6 months')
                GROUP BY mes
                ORDER BY mes ASC
            `;
            const historicoResult = await dbTurso.execute({ sql: historicoConsumoQuery });
            const historicoConsumo = historicoResult.rows.map(row => ({
                mes: row.mes,
                consumo: Number(row.total)
            }));

            // --- 6. Gráfico: Distribución por Ruta/Pueblo (Pie Chart) ---
            // Suponemos que "Pueblo" es equivalente a la "Ruta" o que la dirección contiene el pueblo. 
            // Basándonos en el schema, 'rutas' parece ser la agrupación geográfica más lógica ligada a lecturas.
            const consumoPorRutaQuery = `
                SELECT 
                    r.nombre as ruta,
                    COALESCE(SUM(l.consumo_m3), 0) as consumo_total
                FROM lecturas l
                LEFT JOIN rutas r ON l.ruta_id = r.id
                WHERE date(l.fecha_lectura) >= ? AND date(l.fecha_lectura) < ?
                GROUP BY r.id, r.nombre
                ORDER BY consumo_total DESC
            `;
            const consumoPorRutaResult = await dbTurso.execute({ 
                sql: consumoPorRutaQuery,
                args: [startOfCurrentMonth, startOfNextMonth] // Consumo del mes actual distribuido
            });
            
            // Calcular porcentaje para Pie Chart
            const consumoTotalMes = consumoPorRutaResult.rows.reduce((acc, row) => acc + Number(row.consumo_total), 0);
            
            const consumoPorRuta = consumoPorRutaResult.rows.map(row => ({
                nombre: row.ruta || 'Sin Ruta',
                valor: Number(row.consumo_total),
                porcentaje: consumoTotalMes > 0 
                    ? parseFloat(((Number(row.consumo_total) / consumoTotalMes) * 100).toFixed(2))
                    : 0
            }));


            // Respuesta consolidad
            res.json({
                tarjetas: {
                    consumo: {
                        actual: consumoActual,
                        anterior: consumoAnterior,
                        crecimiento: crecimientoConsumo,
                        unidad: 'm3'
                    },
                    clientes: {
                        total: totalClientes,
                        nuevos_este_mes: clientesNuevosActual,
                        crecimiento_nuevos: crecimientoClientes// Comparación de tasa de adquisición
                    },
                    medidores: {
                        total: totalMedidores,
                        nuevos_este_mes: medidoresNuevosActual,
                        crecimiento_nuevos: crecimientoMedidores
                    },
                    pagos: {
                        actual: pagosActual,
                        anterior: pagosAnterior,
                        crecimiento: crecimientoPagos,
                        unidad: 'GTQ' // O la moneda que sea
                    }
                },
                graficos: {
                    linea_historico: historicoConsumo,
                    pie_distribucion: consumoPorRuta
                },
                meta: {
                    mes_actual: startOfCurrentMonth.substring(0, 7), // YYYY-MM
                    mes_anterior: startOfPreviousMonth.substring(0, 7)
                }
            });

        } catch (error) {
            console.error("Error obteniendo datos del dashboard:", error);
            res.status(500).json({ error: "Error interno al obtener datos del dashboard" });
        }
    }
};

/**
 * Calcula el porcentaje de crecimiento entre dos valores
 */
function calcularCrecimiento(actual, anterior) {
    if (anterior === 0) {
        return actual > 0 ? 100 : 0; // Si no hubo anterior y ahora sí, 100% crecimiento (o infinito tecnicamente)
    }
    return parseFloat((((actual - anterior) / anterior) * 100).toFixed(2));
}

export default dashboardController;
