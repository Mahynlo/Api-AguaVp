/**
 * Controlador de Convenios de Pago - V2
 * 
 * File: src/v2/controllers/conveniosController.js
 * 
 * Descripción: 
 * Gestiona la creación y seguimiento de acuerdos de pago por parcialidades.
 */

import dbTurso from "../../database/db-turso.js";
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

            // 4. Actualizar Estado del Medidor (Reconexión administrativa)
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

            // 5. Autorizar Reconexión Automática (Opcional, o dejar que cortesController lo maneje)
            // Aquí solo retornamos éxito, el admin debe llamar a /reconectar si estaba cortado

            res.status(201).json({
                success: true,
                message: "Convenio creado exitosamente",
                convenio_id: convenioId,
                detalle: {
                    deuda_original: deudaTotal,
                    pago_inicial: monto_inicial,
                    saldo_diferido: saldoDiferir,
                    cuotas: numero_parcialidades
                }
            });

        } catch (error) {
            console.error("Error creando convenio:", error);
            res.status(500).json({ error: "Error interno creando convenio" });
        }
    }
};

export default conveniosController;
