import { registrarLectura, obtenerLecturas, modificarLectura, obtenerLecturasPorRutaYPeriodo, generarFacturasParaLecturasSinFactura, obtenerLecturasPorMedidor, obtenerLecturasPorCliente, estadisticasLecturas, validarCobranzaPeriodoAnterior } from '../services/lecturasService.js';

let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

const notify = (msg, tipo, data) => {
    if (!notificationManager) return;
    try { notificationManager.alertaSistema(msg, tipo, data); } catch (e) { console.warn('Error enviando notificación SSE:', e); }
};

const lecturasController = {

    async registrarLectura(req, res) {
        const { medidor_id, ruta_id, lectura_actual, consumo_m3, fecha_lectura } = req.body;
        if (!medidor_id || !ruta_id || !fecha_lectura) {
            return res.status(400).json({ error: 'Faltan campos requeridos (medidor_id, ruta_id, fecha_lectura)' });
        }
        if (lectura_actual === undefined && consumo_m3 === undefined) {
            return res.status(400).json({ error: 'Debe proporcionar lectura_actual o consumo_m3' });
        }
        try {
            const { lectura_id, consumo_m3_final, lectura_anterior_val, lectura_actual_val, vuelta_cero_val, lecturaCompleta } = await registrarLectura(req.body, req.usuario.id);

            if (sseManager && notificationManager && lecturaCompleta) {
                try {
                    notificationManager.lecturaRegistrada({ id: lectura_id, medidor_id, medidor_numero: lecturaCompleta.medidor_numero, cliente_nombre: lecturaCompleta.cliente_nombre, consumo_m3: consumo_m3_final, lectura_anterior: lectura_anterior_val, lectura_actual: lectura_actual_val, fecha_lectura, periodo: lecturaCompleta.periodo, ruta_nombre: lecturaCompleta.ruta_nombre, message: `Lectura registrada para medidor ${lecturaCompleta.medidor_numero}` }, req.usuario.id);
                    notify(`Progreso de ruta: medidor ${lecturaCompleta.medidor_numero} completado`, 'info', { ruta_id, medidor_id, lectura_id, consumo_m3: consumo_m3_final, tipo: 'progreso_ruta' });
                } catch (e) { console.warn('Error enviando notificaciones SSE de lectura:', e); }
            }

            return res.status(201).json({
                success: true,
                message: 'Lectura registrada exitosamente',
                data: {
                    lectura_id,
                    detalles: {
                        id: lectura_id,
                        medidor_id: Number(lecturaCompleta.medidor_id),
                        ruta_id: Number(lecturaCompleta.ruta_id || 0),
                        consumo_m3: consumo_m3_final,
                        lectura_anterior: lectura_anterior_val,
                        lectura_actual: lectura_actual_val,
                        vuelta_cero: vuelta_cero_val === 1,
                        fecha_lectura: lecturaCompleta.fecha_lectura,
                        periodo: lecturaCompleta.periodo,
                        estado: 'pendiente',
                        modificado_por: Number(lecturaCompleta.modificado_por || 0),
                        medidor_numero: lecturaCompleta.medidor_numero,
                        medidor_ubicacion: lecturaCompleta.medidor_ubicacion,
                        cliente_nombre: lecturaCompleta.cliente_nombre,
                        ruta_nombre: lecturaCompleta.ruta_nombre
                    }
                }
            });
        } catch (err) {
            console.error('Error al registrar lectura v2:', err);
            const body = { error: err.message || 'Error interno del servidor' };
            if (err.code) body.code = err.code;
            if (err.ruta_id !== undefined) { body.ruta_id = err.ruta_id; body.periodo = err.periodo; body.total_facturas_periodo = err.total_facturas_periodo; }
            if (err.lectura_anterior !== undefined) { body.lectura_anterior = err.lectura_anterior; body.lectura_actual = err.lectura_actual; }
            return res.status(err.status || 500).json(body);
        }
    },

    async obtenerLecturas(req, res) {
        try {
            const id = req.params.id || req.query.id;
            const result = await obtenerLecturas({ id });
            if (result.tipo === 'unico') return res.status(200).json(result.lectura);
            return res.status(200).json(result.lecturas);
        } catch (err) {
            console.error('Error al obtener lectura(s) v2:', err);
            return res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    async modificarLectura(req, res) {
        const { medidor_id, lectura_actual, consumo_m3, fecha_lectura, periodo } = req.body;
        if (medidor_id === undefined && lectura_actual === undefined && consumo_m3 == null && fecha_lectura === undefined && periodo === undefined) {
            return res.status(400).json({ success: false, message: 'Debe proporcionar al menos un campo para modificar' });
        }
        try {
            const lectura = await modificarLectura(req.params.id, req.body, req.usuario.id);
            if (notificationManager && lectura) {
                try { notificationManager.alertaSistema(`Lectura modificada para medidor ${lectura.medidor_numero}`, 'info', { lectura_id: Number(req.params.id), medidor_id: Number(lectura.medidor_id), medidor_numero: lectura.medidor_numero, cliente_nombre: lectura.cliente_nombre, tipo: 'lectura_modificada' }); } catch (e) { console.warn('Error enviando notificación SSE:', e); }
            }
            return res.status(200).json({ success: true, message: 'Lectura modificada exitosamente' });
        } catch (err) {
            console.error('Error al modificar lectura v2:', err);
            return res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    async obtenerLecturasPorRutaYPeriodo(req, res) {
        const { ruta_id, periodo } = req.query;
        if (!ruta_id || !periodo) return res.status(400).json({ error: 'Faltan parámetros: ruta_id y periodo son requeridos' });
        try {
            const result = await obtenerLecturasPorRutaYPeriodo({ ruta_id, periodo });
            return res.status(200).json(result);
        } catch (err) {
            console.error('Error al obtener lecturas por ruta y periodo v2:', err);
            return res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    async generarFacturasParaLecturasSinFactura(req, res) {
        const { periodo } = req.body;
        const modificado_por = req.usuario?.id;
        if (!modificado_por) return res.status(401).json({ success: false, message: 'No se pudo identificar al usuario autenticado' });
        if (!periodo) return res.status(400).json({ success: false, message: 'Falta campo requerido: periodo' });

        const fecha_emision = req.body.fecha_emision;
        if (fecha_emision && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_emision)) {
            return res.status(400).json({ success: false, message: 'El formato de fecha_emision debe ser YYYY-MM-DD' });
        }

        const recalcular = req.body.recalcular || req.body.forzar_recalculo;
        try {
            const resultados = await generarFacturasParaLecturasSinFactura({ periodo, ruta_id: req.body.ruta_id, recalcular, motivoRecalculo: req.body.motivo_recalculo, fecha_emision }, modificado_por);

            if (resultados.empty) {
                return res.status(200).json({ success: true, message: 'No hay lecturas pendientes de facturar para los criterios indicados', data: { periodo, ruta_id: resultados.ruta_id, facturas_generadas: 0, detalles: [] } });
            }

            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(`${resultados.facturas_generadas} facturas generadas masivamente`, 'success', { periodo, total_generadas: resultados.facturas_generadas, total_fallidas: resultados.facturas_fallidas, operador_id: modificado_por, accion: 'facturas_masivas_generadas' });
                } catch (e) { console.warn('Error enviando notificación SSE de facturas masivas:', e); }

                if (resultados.recalculo_activado && resultados.facturas_recalculadas > 0) {
                    try {
                        notificationManager.alertaSistema(`${resultados.facturas_recalculadas} factura(s) recalculada(s)`, 'info', { periodo, total_recalculadas: resultados.facturas_recalculadas, total_generadas: resultados.facturas_generadas, total_fallidas: resultados.facturas_fallidas, operador_id: modificado_por, accion: 'facturas_recalculadas_masivo', motivo_recalculo: resultados.motivo_recalculo });
                    } catch (e) { console.warn('Error enviando notificación SSE de recálculo:', e); }
                }
            }

            return res.status(200).json({
                success: true,
                message: resultados.recalculo_activado ? 'Proceso de generación y recálculo de facturas completado' : 'Proceso de generación de facturas completado',
                data: resultados
            });
        } catch (err) {
            console.error('Error en generación masiva de facturas v2:', err);
            return res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    obtenerLecturasPorMedidor: async (req, res) => {
        try {
            res.json(await obtenerLecturasPorMedidor(req.params.id, req.query.limit));
        } catch (err) {
            console.error('Error obteniendo lecturas por medidor v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al obtener lecturas del medidor' });
        }
    },

    obtenerLecturasPorCliente: async (req, res) => {
        try {
            const result = await obtenerLecturasPorCliente(req.params.id, req.query.periodo);
            res.json(result);
        } catch (err) {
            console.error('Error obteniendo lecturas por cliente v2:', err);
            if (err.cliente) return res.status(err.status || 404).json({ error: err.message, cliente: err.cliente });
            res.status(err.status || 500).json({ error: err.message || 'Error al obtener lecturas del cliente' });
        }
    },

    estadisticas: async (req, res) => {
        try {
            res.json(await estadisticasLecturas());
        } catch (err) {
            console.error('Error obteniendo estadísticas de lecturas:', err);
            res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    },

    validarCobranzaPeriodoAnterior: async (req, res) => {
        const { ruta_id, periodo } = req.query;
        if (!ruta_id || !periodo) return res.status(400).json({ error: 'Faltan parámetros: ruta_id y periodo son requeridos' });
        try {
            const result = await validarCobranzaPeriodoAnterior(ruta_id, periodo);
            return res.status(200).json(result);
        } catch (err) {
            console.error('Error al validar cobranza del periodo anterior:', err);
            return res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    }
};

export default lecturasController;
