/**
 * Controlador de Cortes y Reconexiones - V2
 * 
 * File: src/v2/controllers/cortesController.js
 * 
 * Descripción: 
 * Gestiona la detección de candidatos a corte y la ejecución de órdenes.
 */

import dbTurso, { sqlite } from "../../database/db-sqlite.js";

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
            const diasGracia = configResult.rows.length > 0 ? (configResult.rows[0].dias_gracia || 0) : 0;

            // 2. Buscar medidores con N facturas VENCIDAS pendientes
            // MODIFICADO: Incluye medidores con convenios para visualización completa
            const query = `
                SELECT 
                    m.id as medidor_id,
                    m.numero_serie,
                    m.estado_servicio,
                    c.id as cliente_id,
                    c.nombre as cliente_nombre,
                    c.direccion,
                    COUNT(CASE WHEN f.estado = 'Vencida' THEN f.id END) as facturas_vencidas,
                    SUM(f.saldo_pendiente) as deuda_total,
                    MIN(f.fecha_vencimiento) as fecha_vencimiento_mas_antigua,
                    cp.id as convenio_id,
                    cp.saldo_restante as convenio_saldo,
                    cp.numero_parcialidades as convenio_parcialidades,
                    (SELECT COUNT(*) FROM parcialidades_convenio pc WHERE pc.convenio_id = cp.id AND pc.estado = 'Pendiente') as parcialidades_pendientes,
                    cp.numero_parcialidades as total_parcialidades
                FROM medidores m
                JOIN clientes c ON m.cliente_id = c.id
                JOIN lecturas l ON l.medidor_id = m.id
                JOIN facturas f ON f.lectura_id = l.id
                LEFT JOIN convenios_pago cp ON cp.medidor_id = m.id AND cp.estado = 'Activo'
                WHERE f.saldo_pendiente > 0 
                AND f.estado IN ('Vencida', 'En Convenio')
                AND m.estado_servicio IN ('Activo', 'Cortado')
                AND (
                    (f.estado = 'Vencida' AND f.fecha_vencimiento <= date('now', '-' || ? || ' days'))
                    OR f.estado = 'En Convenio'
                )
                GROUP BY m.id, m.numero_serie, m.estado_servicio, c.id, c.nombre, c.direccion, cp.id, cp.saldo_restante, cp.numero_parcialidades
                HAVING facturas_vencidas >= ? OR cp.id IS NOT NULL
                ORDER BY 
                    CASE 
                        WHEN cp.id IS NOT NULL THEN 0
                        WHEN m.estado_servicio = 'Cortado' THEN 1 
                        WHEN m.estado_servicio = 'Activo' THEN 2 
                    END,
                    facturas_vencidas DESC
            `;

            const result = await dbTurso.execute({ sql: query, args: [diasGracia, umbralCorte] });

            // 3. Formatear respuesta
            const candidatos = result.rows.map(row => {
                const tieneConvenio = row.convenio_id !== null;

                return {
                    cliente: {
                        id: row.cliente_id,
                        nombre: row.cliente_nombre,
                        direccion: row.direccion
                    },
                    medidor: {
                        id: row.medidor_id,
                        serial: row.numero_serie,
                        estado: row.estado_servicio,
                        estado_servicio: row.estado_servicio
                    },
                    deuda: {
                        facturas_vencidas: Number(row.facturas_vencidas),
                        total: Number(row.deuda_total),
                        fecha_mas_antigua: row.fecha_vencimiento_mas_antigua
                    },
                    convenio: tieneConvenio ? {
                        id: row.convenio_id,
                        saldo_restante: Number(row.convenio_saldo),
                        parcialidades: Number(row.convenio_parcialidades),
                        parcialidades_pendientes: Number(row.parcialidades_pendientes || 0),
                        total_parcialidades: Number(row.total_parcialidades || 0)
                    } : null,
                    tiene_convenio: tieneConvenio,
                    accion_sugerida: tieneConvenio ? "En Convenio" :
                        (row.estado_servicio === 'Cortado' ? "Reconexión" : "Corte de Servicio"),
                    // Campos de compatibilidad para el frontend
                    fecha_vencimiento: row.fecha_vencimiento_mas_antigua,
                    saldo_pendiente: Number(row.deuda_total)
                };
            });

            res.json({
                umbral_corte: umbralCorte,
                dias_gracia: diasGracia,
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
            console.log("=== EJECUTAR CORTE ===");
            console.log("Body recibido:", req.body);
            console.log("Usuario:", req.usuario);

            const { medidor_id, motivo, observaciones } = req.body;
            const autorizado_por = req.usuario?.id; // Del token

            console.log("Datos extraídos:", { medidor_id, motivo, observaciones, autorizado_por });

            if (!medidor_id || !motivo) {
                console.error("ERROR: Faltan datos requeridos", { medidor_id, motivo });
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

            // 2 y 3. Registrar corte y actualizar medidor — operación atómica.
            // Si falla cualquiera de las dos, SQLite hace rollback automático.
            const transaccionCorte = sqlite.transaction(() => {
                sqlite.prepare(`
                    INSERT INTO cortes_servicio (cliente_id, medidor_id, fecha_corte, motivo, autorizado_por, observaciones)
                    VALUES (?, ?, datetime('now'), ?, ?, ?)
                `).run(medidor.cliente_id, medidor_id, motivo, autorizado_por || null, observaciones || '');

                sqlite.prepare(`
                    UPDATE medidores SET estado_servicio = 'Cortado', fecha_corte = date('now')
                    WHERE id = ?
                `).run(medidor_id);
            });

            transaccionCorte();

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

            if (!medidor_id) {
                return res.status(400).json({ error: "Falta medidor_id" });
            }

            // 1. Validar Estado Actual
            const checkQuery = `SELECT * FROM medidores WHERE id = ?`;
            const checkRes = await dbTurso.execute({ sql: checkQuery, args: [medidor_id] });
            if (checkRes.rows.length === 0) {
                return res.status(404).json({ error: "Medidor no encontrado" });
            }
            const medidor = checkRes.rows[0];

            if (medidor.estado_servicio !== 'Cortado') {
                return res.status(400).json({ error: "El servicio no está reportado como Cortado" });
            }

            // 2. Verificar Deuda (Saldo Pendiente)
            // Se asume deuda del *cliente* asociada a este medidor.
            // Para ser estrictos con la propuesta: Valida SI saldo = 0 O hay convenio activo.
            const deudaQuery = `
                SELECT SUM(f.saldo_pendiente) as total_deuda
                FROM facturas f
                JOIN lecturas l ON l.id = f.lectura_id
                WHERE l.medidor_id = ?
                  AND f.estado != 'Pagado'
            `;
            const deudaRes = await dbTurso.execute({ sql: deudaQuery, args: [medidor_id] });
            const deudaTotal = Number(deudaRes.rows[0]?.total_deuda || 0);

            // 3. Verificar Convenio Activo
            const convenioQuery = `
                SELECT * FROM convenios_pago 
                WHERE medidor_id = ? AND estado = 'Activo'
            `;
            const convenioRes = await dbTurso.execute({ sql: convenioQuery, args: [medidor_id] });
            const tieneConvenio = convenioRes.rows.length > 0;

            // REGLA: Solo reconectar si Deuda es 0 O Tiene Convenio
            console.log("Validación reconexión:", { deudaTotal, tieneConvenio });

            if (deudaTotal > 0 && !tieneConvenio) {
                console.log("RECHAZADO: Deuda pendiente sin convenio");
                return res.status(403).json({
                    error: "No es posible reconectar. Existe deuda pendiente y no hay convenio activo.",
                    deuda_pendiente: deudaTotal,
                    requiere: "Pagar deuda completa o crear convenio de pago"
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
