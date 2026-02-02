/**
 * Controlador de Convenios de Pago - V2
 * 
 * File: src/v2/controllers/conveniosController.js
 * 
 * Descripción: 
 * Gestiona la creación y seguimiento de acuerdos de pago por parcialidades.
 */

import dbTurso from "../../database/db-sqlite.js";
import { addMonths, format, parseISO } from 'date-fns';

const conveniosController = {

    /**
     * Crear Nuevo Convenio
     * POST /api/v2/convenios/crear
     * Body: { medidor_id, monto_inicial, numero_parcialidades, periodicidad, observaciones }
     */
    crearConvenio: async (req, res) => {
        try {
            const {
                medidor_id,
                monto_inicial,
                numero_parcialidades,
                periodicidad,
                observaciones
            } = req.body;

            const autorizado_por = req.usuario?.id;

            if (!medidor_id || !monto_inicial || !numero_parcialidades) {
                return res.status(400).json({ error: "Faltan datos requeridos" });
            }

            // 1. Obtener Cliente y Deuda Total
            const infoQuery = `SELECT cliente_id FROM medidores WHERE id = ?`;
            const infoRes = await dbTurso.execute({ sql: infoQuery, args: [medidor_id] });

            if (infoRes.rows.length === 0) return res.status(404).json({ error: "Medidor no encontrado" });
            const cliente_id = infoRes.rows[0].cliente_id;

            const deudaQuery = `
                SELECT SUM(saldo_pendiente) as total 
                FROM facturas 
                WHERE cliente_id = ? AND estado != 'Pagado'
            `;
            const deudaRes = await dbTurso.execute({ sql: deudaQuery, args: [cliente_id] });
            const deudaTotal = Number(deudaRes.rows[0]?.total || 0);

            if (deudaTotal <= 0) {
                return res.status(400).json({ error: "El cliente no tiene deuda pendiente para generar convenio" });
            }

            // 2. Validar Monto Inicial (Debe ser > 0, aunque podría ser 0 si es política)
            // Lógica: Saldo a diferir = Deuda Total - Monto Inicial
            const saldoDiferir = deudaTotal - Number(monto_inicial);

            if (saldoDiferir < 0) {
                return res.status(400).json({ error: "El monto inicial supera la deuda total" });
            }

            // 3. Crear Registro de Convenio
            const fechaInicio = new Date();
            // Calcular fecha fin estimada (simple: meses)
            const mesesSumar = periodicidad === 'quincenal' ? Math.ceil(numero_parcialidades / 2) : numero_parcialidades;
            const fechaFin = addMonths(fechaInicio, mesesSumar);

            const insertQuery = `
                INSERT INTO convenios_pago (
                    cliente_id, medidor_id, monto_total, monto_inicial,
                    saldo_restante, numero_parcialidades, periodicidad,
                    estado, fecha_inicio, fecha_fin, autorizado_por, observaciones
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo', ?, ?, ?, ?)
            `;

            const args = [
                cliente_id,
                medidor_id,
                deudaTotal,
                Number(monto_inicial),
                saldoDiferir,
                numero_parcialidades,
                periodicidad || 'mensual',
                format(fechaInicio, 'yyyy-MM-dd'),
                format(fechaFin, 'yyyy-MM-dd'),
                autorizado_por,
                observaciones
            ];

            const result = await dbTurso.execute({ sql: insertQuery, args });
            const convenioId = Number(result.lastInsertRowid);

            // 4. Marcar facturas como "En Convenio" para prevenir doble pago
            console.log(`Marcando facturas del cliente ${cliente_id} como "En Convenio"...`);
            const updateFacturasQuery = `
                UPDATE facturas 
                SET convenio_id = ?, estado = 'En Convenio'
                WHERE cliente_id = ? 
                AND estado IN ('Pendiente', 'Vencida')
                AND saldo_pendiente > 0
            `;
            const facturasResult = await dbTurso.execute({
                sql: updateFacturasQuery,
                args: [convenioId, cliente_id]
            });
            console.log(`${facturasResult.rowsAffected} facturas marcadas como "En Convenio"`);

            // 5. Actualizar Estado del Medidor (Reconexión administrativa)
            // Ya NO se usa 'En Convenio', se pasa a 'Activo' si estaba cortado.
            // Si ya estaba activo, se mantiene activo.

            // Validar estado actual antes de cambiar
            const medidorCheck = await dbTurso.execute({ sql: `SELECT estado_servicio FROM medidores WHERE id = ?`, args: [medidor_id] });
            if (medidorCheck.rows.length > 0 && medidorCheck.rows[0].estado_servicio === 'Cortado') {
                await dbTurso.execute({
                    sql: `UPDATE medidores SET estado_servicio = 'Activo' WHERE id = ?`,
                    args: [medidor_id]
                });
            }

            // 5. Generar Parcialidades Automáticamente
            const montoPorParcialidad = saldoDiferir / numero_parcialidades;
            const parcialidades = [];

            for (let i = 1; i <= numero_parcialidades; i++) {
                // Calcular fecha de vencimiento según periodicidad
                let fechaVencimiento;
                if (periodicidad === 'quincenal') {
                    // Cada 15 días
                    fechaVencimiento = new Date(fechaInicio);
                    fechaVencimiento.setDate(fechaVencimiento.getDate() + (i * 15));
                } else {
                    // Mensual por defecto
                    fechaVencimiento = addMonths(fechaInicio, i);
                }

                const insertParcialidad = `
                    INSERT INTO parcialidades_convenio (
                        convenio_id, numero_parcialidad, monto_esperado, 
                        fecha_vencimiento, estado
                    ) VALUES (?, ?, ?, ?, 'Pendiente')
                `;

                await dbTurso.execute({
                    sql: insertParcialidad,
                    args: [
                        convenioId,
                        i,
                        montoPorParcialidad,
                        format(fechaVencimiento, 'yyyy-MM-dd')
                    ]
                });

                parcialidades.push({
                    numero: i,
                    monto: montoPorParcialidad,
                    vencimiento: format(fechaVencimiento, 'yyyy-MM-dd')
                });
            }

            res.status(201).json({
                success: true,
                message: "Convenio creado exitosamente",
                convenio_id: convenioId,
                detalle: {
                    deuda_original: deudaTotal,
                    pago_inicial: monto_inicial,
                    saldo_diferido: saldoDiferir,
                    cuotas: numero_parcialidades,
                    monto_por_cuota: montoPorParcialidad
                },
                parcialidades: parcialidades
            });

        } catch (error) {
            console.error("Error creando convenio:", error);
            res.status(500).json({ error: "Error interno creando convenio" });
        }
    },

    /**
     * Pagar Parcialidad de Convenio
     * POST /api/v2/convenios/pagar-parcialidad
     * Body: { parcialidad_id, cantidad_entregada, metodo_pago, comentario }
     */
    pagarParcialidad: async (req, res) => {
        try {
            console.log('=== PAGAR PARCIALIDAD ===');
            console.log('Body recibido:', req.body);
            console.log('Usuario:', req.usuario);

            const {
                parcialidad_id,
                cantidad_entregada,
                metodo_pago,
                comentario
            } = req.body;

            const modificado_por = req.usuario?.id || null;

            console.log('Datos extraídos:', { parcialidad_id, cantidad_entregada, metodo_pago, modificado_por });

            // Validaciones
            if (!parcialidad_id || !cantidad_entregada || !metodo_pago) {
                console.log('Validación fallida - Datos faltantes');
                return res.status(400).json({ error: 'Faltan datos requeridos' });
            }

            // 1. Obtener parcialidad y convenio
            const parcialidadQuery = `
                SELECT p.*, c.saldo_restante, c.cliente_id, c.medidor_id
                FROM parcialidades_convenio p
                JOIN convenios_pago c ON p.convenio_id = c.id
                WHERE p.id = ?
            `;
            const parcialidadRes = await dbTurso.execute({
                sql: parcialidadQuery,
                args: [parcialidad_id]
            });

            if (parcialidadRes.rows.length === 0) {
                return res.status(404).json({ error: 'Parcialidad no encontrada' });
            }

            const parcialidad = parcialidadRes.rows[0];

            // 2. Validar estado
            if (parcialidad.estado === 'Pagada') {
                return res.status(400).json({
                    error: 'Esta parcialidad ya fue pagada',
                    fecha_pago: parcialidad.fecha_pago
                });
            }

            // 3. Calcular monto y cambio
            const montoEsperado = Number(parcialidad.monto_esperado);
            const cantidadEntregada = Number(cantidad_entregada);
            const monto = Math.min(montoEsperado, cantidadEntregada);
            const cambio = cantidadEntregada - monto;

            console.log(`Pagando parcialidad ${parcialidad_id}: Monto ${monto}, Cambio ${cambio}`);

            // 4. Registrar pago en tabla pagos (con parcialidad_id)
            const insertPagoQuery = `
                INSERT INTO pagos (
                    parcialidad_id, monto, cantidad_entregada, cambio,
                    metodo_pago, fecha_pago, comentario, modificado_por
                ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)
            `;

            const pagoResult = await dbTurso.execute({
                sql: insertPagoQuery,
                args: [parcialidad_id, monto, cantidadEntregada, cambio,
                    metodo_pago, comentario, modificado_por]
            });

            const pagoId = Number(pagoResult.lastInsertRowid);

            // 5. Actualizar parcialidad
            await dbTurso.execute({
                sql: `UPDATE parcialidades_convenio 
                      SET estado = 'Pagada', 
                          monto_pagado = ?,
                          fecha_pago = datetime('now'),
                          pago_id = ?
                      WHERE id = ?`,
                args: [monto, pagoId, parcialidad_id]
            });

            // 6. Actualizar saldo_restante del convenio
            const nuevoSaldo = Number(parcialidad.saldo_restante) - monto;
            await dbTurso.execute({
                sql: `UPDATE convenios_pago 
                      SET saldo_restante = ?
                      WHERE id = ?`,
                args: [nuevoSaldo, parcialidad.convenio_id]
            });

            console.log(`Convenio ${parcialidad.convenio_id}: Nuevo saldo ${nuevoSaldo}`);

            // 7. Si convenio completado, marcar facturas como pagadas
            if (nuevoSaldo <= 0) {
                console.log(`Convenio ${parcialidad.convenio_id} COMPLETADO - Marcando facturas como pagadas`);

                await dbTurso.execute({
                    sql: `UPDATE convenios_pago 
                          SET estado = 'Finalizado'
                          WHERE id = ?`,
                    args: [parcialidad.convenio_id]
                });

                // Marcar facturas como pagadas
                const updateFacturasResult = await dbTurso.execute({
                    sql: `UPDATE facturas 
                          SET estado = 'Pagado', saldo_pendiente = 0
                          WHERE convenio_id = ?`,
                    args: [parcialidad.convenio_id]
                });

                console.log(`${updateFacturasResult.rowsAffected} facturas marcadas como pagadas`);
            }

            return res.status(201).json({
                mensaje: 'Parcialidad pagada exitosamente',
                pago_id: pagoId,
                monto_aplicado: monto,
                cambio: cambio,
                saldo_restante_convenio: nuevoSaldo,
                convenio_completado: nuevoSaldo <= 0
            });

        } catch (error) {
            console.error('Error pagando parcialidad:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Obtener Convenio con Parcialidades
     * GET /api/v2/convenios/:id
     */
    obtenerConvenio: async (req, res) => {
        try {
            const { id } = req.params;

            // Obtener convenio
            const convenioQuery = `
                SELECT c.*, cl.nombre as cliente_nombre, m.numero_serie
                FROM convenios_pago c
                JOIN clientes cl ON c.cliente_id = cl.id
                JOIN medidores m ON c.medidor_id = m.id
                WHERE c.id = ?
            `;
            const convenioRes = await dbTurso.execute({ sql: convenioQuery, args: [id] });

            if (convenioRes.rows.length === 0) {
                return res.status(404).json({ error: 'Convenio no encontrado' });
            }

            const convenio = convenioRes.rows[0];

            // Obtener parcialidades
            const parcialidadesQuery = `
                SELECT * FROM parcialidades_convenio
                WHERE convenio_id = ?
                ORDER BY numero_parcialidad ASC
            `;
            const parcialidadesRes = await dbTurso.execute({
                sql: parcialidadesQuery,
                args: [id]
            });

            // Calcular progreso
            const totalPagado = Number(convenio.monto_total) - Number(convenio.saldo_restante);
            const porcentaje = (totalPagado / Number(convenio.monto_total)) * 100;

            return res.json({
                convenio: {
                    ...convenio,
                    id: Number(convenio.id),
                    cliente_id: Number(convenio.cliente_id),
                    medidor_id: Number(convenio.medidor_id)
                },
                parcialidades: parcialidadesRes.rows.map(p => ({
                    ...p,
                    id: Number(p.id),
                    convenio_id: Number(p.convenio_id)
                })),
                progreso: {
                    total: Number(convenio.monto_total),
                    pagado: totalPagado,
                    pendiente: Number(convenio.saldo_restante),
                    porcentaje: Math.round(porcentaje * 100) / 100
                }
            });

        } catch (error) {
            console.error('Error obteniendo convenio:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
};

export default conveniosController;
