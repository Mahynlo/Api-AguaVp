/**
 * Controlador de Cortes y Reconexiones - V2
 * 
 * File: src/v2/controllers/cortesController.js
 * 
 * Descripción: 
 * Gestiona la detección de candidatos a corte y la ejecución de órdenes.
 */

import dbTurso from "../../database/db-turso.js";

const cortesController = {

    /**
     * Detectar Candidatos a Corte
     * GET /api/v2/cortes/candidatos
     * 
     * Analiza facturas vencidas y compara con reglas de configuración.
     */
    detectarCandidatosCorte: async (req, res) => {
        try {
            // 1. Obtener Configuración Activa
            const configQuery = `SELECT * FROM configuracion_servicio ORDER BY id DESC LIMIT 1`;
            const configResult = await dbTurso.execute({ sql: configQuery, args: [] });

            // Valores por defecto si no hay config
            const umbralCorte = configResult.rows.length > 0 ? configResult.rows[0].facturas_para_corte : 4;

            // 2. Buscar medidores con N facturas VENCIDAS pendientes
            const query = `
                SELECT 
                    m.id as medidor_id,
                    m.numero_serie,
                    m.estado_servicio,
                    c.id as cliente_id,
                    c.nombre as cliente_nombre,
                    c.direccion,
                    COUNT(f.id) as facturas_vencidas,
                    SUM(f.saldo_pendiente) as deuda_total,
                    MIN(f.fecha_vencimiento) as fecha_vencimiento_mas_antigua
                FROM medidores m
                JOIN facturas f ON f.cliente_id = (SELECT cliente_id FROM medidores WHERE id = m.id) -- OJO: Relación Cliente-Medidor puede ser compleja
                JOIN clientes c ON m.cliente_id = c.id
                LEFT JOIN convenios_pago cp ON cp.medidor_id = m.id AND cp.estado = 'Activo'
                WHERE f.saldo_pendiente > 0 
                AND f.estado = 'Vencida'
                AND m.estado_servicio = 'Activo' -- Solo analizar Activos
                AND cp.id IS NULL -- EXCLUIR si tiene convenio activo
                GROUP BY m.id
                HAVING facturas_vencidas >= ?
                ORDER BY facturas_vencidas DESC
            `;

            // Nota: La relación Factura -> Medidor es vía Lectura normalmente (f.lectura_id -> l.medidor_id), 
            // pero para deuda acumulada general usamos cliente_id. 
            // MEJOR QUERY: Vincular facturas a medidor si es posible, o asumir deuda del cliente.
            // Asumiremos deuda del cliente asociada al medidor principal.

            const result = await dbTurso.execute({ sql: query, args: [umbralCorte] });

            // 3. Formatear respuesta
            const candidatos = result.rows.map(row => ({
                cliente: {
                    id: row.cliente_id,
                    nombre: row.cliente_nombre,
                    direccion: row.direccion
                },
                medidor: {
                    id: row.medidor_id,
                    serial: row.numero_serie,
                    estado: row.estado_servicio
                },
                deuda: {
                    facturas_vencidas: Number(row.facturas_vencidas),
                    total: Number(row.deuda_total),
                    fecha_mas_antigua: row.fecha_vencimiento_mas_antigua
                },
                accion_sugerida: "Corte de Servicio"
            }));

            res.json({
                umbral_corte: umbralCorte,
                total_candidatos: candidatos.length,
                candidatos
            });

        } catch (error) {
            console.error("Error detectando candidatos:", error);
            res.status(500).json({ error: "Error interno al detectar candidatos" });
        }
    },

    /**
     * Ejecutar Corte de Servicio
     * POST /api/v2/cortes/ejecutar
     * Body: { medidor_id, motivo, observaciones }
     */
    ejecutarCorte: async (req, res) => {
        try {
            const { medidor_id, motivo, observaciones } = req.body;
            const autorizado_por = req.usuario?.id; // Del token

            if (!medidor_id || !motivo) {
                return res.status(400).json({ error: "Faltan datos requeridos (medidor_id, motivo)" });
            }

            // 1. Obtener datos del medidor y cliente
            const medidorQuery = `SELECT cliente_id, estado_servicio FROM medidores WHERE id = ?`;
            const medidorRes = await dbTurso.execute({ sql: medidorQuery, args: [medidor_id] });

            if (medidorRes.rows.length === 0) {
                return res.status(404).json({ error: "Medidor no encontrado" });
            }

            const medidor = medidorRes.rows[0];

            if (medidor.estado_servicio === 'Cortado') {
                return res.status(400).json({ error: "El servicio ya se encuentra cortado" });
            }

            // 2. Registrar en historial cortes_servicio
            const insertCorte = `
                INSERT INTO cortes_servicio (
                    cliente_id, medidor_id, fecha_corte, motivo, 
                    autorizado_por, observaciones
                ) VALUES (?, ?, datetime('now'), ?, ?, ?)
            `;

            await dbTurso.execute({
                sql: insertCorte,
                args: [medidor.cliente_id, medidor_id, motivo, autorizado_por, observaciones || '']
            });

            // 3. Actualizar estado del medidor
            const updateMedidor = `
                UPDATE medidores 
                SET estado_servicio = 'Cortado' 
                WHERE id = ?
            `;

            await dbTurso.execute({ sql: updateMedidor, args: [medidor_id] });

            res.json({
                success: true,
                message: "Corte ejecutado correctamente",
                medidor_id
            });

        } catch (error) {
            console.error("Error ejecutando corte:", error);
            res.status(500).json({ error: "Error ejecutando el corte" });
        }
    },

    /**
     * Procesar Reconexión (Validación)
     * POST /api/v2/cortes/reconectar
     * Body: { medidor_id, observaciones }
     */
    procesarReconexion: async (req, res) => {
        try {
            const { medidor_id, observaciones } = req.body;
            const reconectado_por = req.usuario?.id;

            // 1. Validar Estado Actual
            const checkQuery = `SELECT * FROM medidores WHERE id = ?`;
            const checkRes = await dbTurso.execute({ sql: checkQuery, args: [medidor_id] });
            const medidor = checkRes.rows[0];

            if (medidor.estado_servicio !== 'Cortado') {
                return res.status(400).json({ error: "El servicio no está reportado como Cortado" });
            }

            // 2. Verificar Deuda (Saldo Pendiente)
            // Se asume deuda del *cliente* asociada a este medidor.
            // Para ser estrictos con la propuesta: Valida SI saldo = 0 O hay convenio activo.
            const deudaQuery = `
                SELECT SUM(saldo_pendiente) as total_deuda 
                FROM facturas 
                WHERE cliente_id = ? AND estado != 'Pagado'
            `;
            const deudaRes = await dbTurso.execute({ sql: deudaQuery, args: [medidor.cliente_id] });
            const deudaTotal = Number(deudaRes.rows[0]?.total_deuda || 0);

            // 3. Verificar Convenio Activo
            const convenioQuery = `
                SELECT * FROM convenios_pago 
                WHERE medidor_id = ? AND estado = 'Activo'
            `;
            const convenioRes = await dbTurso.execute({ sql: convenioQuery, args: [medidor_id] });
            const tieneConvenio = convenioRes.rows.length > 0;

            // REGLA: Solo reconectar si Deuda es 0 O Tiene Convenio
            if (deudaTotal > 0 && !tieneConvenio) {
                return res.status(403).json({
                    error: "No es posible reconectar. Existe deuda pendiente y no hay convenio activo.",
                    deuda_pendiente: deudaTotal
                });
            }

            // 4. Ejecutar Reconexión
            // Actualizar tabla cortes_servicio (Cerrar ciclo)
            const closeCorte = `
                UPDATE cortes_servicio 
                SET fecha_reconexion = datetime('now'), reconectado_por = ?, observaciones = ?
                WHERE medidor_id = ? AND fecha_reconexion IS NULL
            `;
            await dbTurso.execute({
                sql: closeCorte,
                args: [reconectado_por, observaciones || 'Reconexión autorizada', medidor_id]
            });

            // Actualizar medidor
            // El estado 'En Convenio' ya no se usa en el medidor, vuelve a 'Activo'
            const nuevoEstado = 'Activo';
            await dbTurso.execute({
                sql: `UPDATE medidores SET estado_servicio = ? WHERE id = ?`,
                args: [nuevoEstado, medidor_id]
            });

            res.json({
                success: true,
                message: `Servicio reconectado exitosamente. Estado: ${nuevoEstado}`,
                nuevo_estado: nuevoEstado
            });

        } catch (error) {
            console.error("Error reconectando servicio:", error);
            res.status(500).json({ error: "Error procesando reconexión" });
        }
    }
};

export default cortesController;
