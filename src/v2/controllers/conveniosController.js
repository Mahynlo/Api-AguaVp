/**
 * Controlador de Convenios de Pago - V2
 * 
 * File: src/v2/controllers/conveniosController.js
 * 
 * Descripción: 
 * Gestiona la creación y seguimiento de acuerdos de pago por parcialidades.
 */

import dbTurso, { sqlite } from "../../database/db-sqlite.js";
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

            // Deuda calculada SOLO para este medidor (no todo el cliente)
            // Evita bloquear facturas de otros medidores del mismo cliente
            const deudaQuery = `
                SELECT SUM(f.saldo_pendiente) as total
                FROM facturas f
                JOIN lecturas l ON f.lectura_id = l.id
                WHERE l.medidor_id = ? AND f.estado NOT IN ('Pagado', 'En Convenio')
            `;
            const deudaRes = await dbTurso.execute({ sql: deudaQuery, args: [medidor_id] });
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

            // 3-6. OPERACIÓN ATÓMICA: convenio + facturas + medidor + parcialidades.
            // Si falla cualquier paso, SQLite hace rollback completo.
            // Ninguno de los pasos queda a medias en la BD.
            const fechaInicio = new Date();
            const mesesSumar = periodicidad === 'quincenal' ? Math.ceil(numero_parcialidades / 2) : numero_parcialidades;
            const fechaFin = addMonths(fechaInicio, mesesSumar);
            // Redondear a 2 decimales para evitar acumulación de error flotante en las cuotas
            const montoPorParcialidad = Math.round((saldoDiferir / numero_parcialidades) * 100) / 100;

            let convenioId;
            const parcialidades = [];

            const transaccionConvenio = sqlite.transaction(() => {
                // Insertar convenio
                const r = sqlite.prepare(`
                    INSERT INTO convenios_pago (
                        cliente_id, medidor_id, monto_total, monto_inicial,
                        saldo_restante, numero_parcialidades, periodicidad,
                        estado, fecha_inicio, fecha_fin, autorizado_por, observaciones
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo', ?, ?, ?, ?)
                `).run(
                    cliente_id, medidor_id, deudaTotal, Number(monto_inicial),
                    saldoDiferir, numero_parcialidades, periodicidad || 'mensual',
                    format(fechaInicio, 'yyyy-MM-dd'), format(fechaFin, 'yyyy-MM-dd'),
                    autorizado_por, observaciones || null
                );
                convenioId = Number(r.lastInsertRowid);

                // Marcar SOLO las facturas de este medidor como 'En Convenio'
                // (no bloquea facturas de otros medidores del mismo cliente)
                sqlite.prepare(`
                    UPDATE facturas
                    SET convenio_id = ?, estado = 'En Convenio'
                    WHERE estado IN ('Pendiente', 'Parcial', 'Vencida')
                      AND saldo_pendiente > 0
                      AND lectura_id IN (SELECT id FROM lecturas WHERE medidor_id = ?)
                `).run(convenioId, medidor_id);

                // Reconectar administrativamente si el medidor estaba cortado
                sqlite.prepare(`
                    UPDATE medidores SET estado_servicio = 'Activo'
                    WHERE id = ? AND estado_servicio = 'Cortado'
                `).run(medidor_id);

                // Insertar todas las parcialidades (reutiliza prepared statement en el loop)
                const stmtParcialidad = sqlite.prepare(`
                    INSERT INTO parcialidades_convenio (
                        convenio_id, numero_parcialidad, monto_esperado, fecha_vencimiento, estado
                    ) VALUES (?, ?, ?, ?, 'Pendiente')
                `);

                for (let i = 1; i <= numero_parcialidades; i++) {
                    let fechaVencimiento;
                    if (periodicidad === 'quincenal') {
                        fechaVencimiento = new Date(fechaInicio);
                        fechaVencimiento.setDate(fechaVencimiento.getDate() + (i * 15));
                    } else {
                        fechaVencimiento = addMonths(fechaInicio, i);
                    }
                    const fechaVencStr = format(fechaVencimiento, 'yyyy-MM-dd');
                    stmtParcialidad.run(convenioId, i, montoPorParcialidad, fechaVencStr);
                    parcialidades.push({ numero: i, monto: montoPorParcialidad, vencimiento: fechaVencStr });
                }
            });

            transaccionConvenio();

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

            // 4-7. OPERACIÓN ATÓMICA: pago + parcialidad + saldo de convenio + cierre.
            // Si falla cualquier paso, SQLite hace rollback completo.
            const nuevoSaldo = Math.round((Number(parcialidad.saldo_restante) - monto) * 100) / 100;
            let pagoId;

            const transaccionPago = sqlite.transaction(() => {
                // Registrar pago vinculado a la parcialidad
                const r = sqlite.prepare(`
                    INSERT INTO pagos (parcialidad_id, monto, cantidad_entregada, cambio, metodo_pago, fecha_pago, comentario, modificado_por)
                    VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)
                `).run(parcialidad_id, monto, cantidadEntregada, cambio, metodo_pago, comentario || null, modificado_por);
                pagoId = Number(r.lastInsertRowid);

                // Marcar parcialidad como pagada
                sqlite.prepare(`
                    UPDATE parcialidades_convenio
                    SET estado = 'Pagada', monto_pagado = ?, fecha_pago = datetime('now'), pago_id = ?
                    WHERE id = ?
                `).run(monto, pagoId, parcialidad_id);

                // Actualizar saldo restante del convenio
                sqlite.prepare(`
                    UPDATE convenios_pago SET saldo_restante = ? WHERE id = ?
                `).run(nuevoSaldo, parcialidad.convenio_id);

                // Si el convenio quedó en cero, cerrarlo y liberar las facturas
                if (nuevoSaldo <= 0) {
                    sqlite.prepare(`
                        UPDATE convenios_pago SET estado = 'Finalizado' WHERE id = ?
                    `).run(parcialidad.convenio_id);

                    sqlite.prepare(`
                        UPDATE facturas SET estado = 'Pagado', saldo_pendiente = 0
                        WHERE convenio_id = ?
                    `).run(parcialidad.convenio_id);
                }
            });

            transaccionPago();

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
