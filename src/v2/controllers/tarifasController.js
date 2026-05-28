import { registrarTarifa, registrarRangosTarifa, obtenerTodasLasTarifas, obtenerHistorialTarifas, modificarTarifa, modificarRangosTarifa, obtenerTarifaPorId, obtenerTarifasActivas, obtenerHistorialTarifa, estadisticasTarifas } from '../services/tarifasService.js';

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

const tarifasController = {

    async registrarTarifa(req, res) {
        const { nombre, descripcion, fecha_inicio, fecha_fin } = req.body;
        if (!nombre || !descripcion || !fecha_inicio) return res.status(400).json({ error: 'Faltan campos requeridos' });
        if (fecha_fin && new Date(fecha_inicio) > new Date(fecha_fin)) return res.status(400).json({ error: 'La fecha de inicio no puede ser mayor a la fecha de fin' });
        try {
            const tarifa = await registrarTarifa(req.body, req.usuario.id);
            notify(`Nueva tarifa "${nombre}" creada`, 'success', { tarifa, accion: 'tarifa_creada' });
            res.status(201).json({ mensaje: 'Tarifa creada exitosamente', tarifa_id: tarifa.id, detalles: tarifa });
        } catch (err) {
            console.error('❌ Error al crear tarifa v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    async registrarRangosTarifa(req, res) {
        const { tarifa_id, rangos } = req.body;
        if (!tarifa_id || !Array.isArray(rangos) || !rangos.length) return res.status(400).json({ error: 'Faltan datos de tarifa o rangos (error-BK)' });
        try {
            await registrarRangosTarifa(tarifa_id, rangos);
            notify(`Tarifa ID ${tarifa_id} configurada con ${rangos.length} rangos`, 'info', { tarifa_id, total_rangos: rangos.length, rangos_resumen: rangos.map(r => ({ min: r.consumo_min, max: r.consumo_max, precio: r.precio_por_m3 })), accion: 'tarifa_configurada' });
            res.json({ mensaje: 'Rangos registrados correctamente (error-BK)', tarifa_id, rangos_procesados: rangos.length });
        } catch (err) {
            console.error('❌ Error al registrar rangos v2:', err);
            if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un rango similar para esta tarifa (error-BK)' });
            res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor (error-BK)' });
        }
    },

    async obtenerTodasLasTarifas(req, res) {
        try {
            res.json(await obtenerTodasLasTarifas(req.query));
        } catch (err) {
            console.error('❌ Error al obtener tarifas v2:', err);
            res.status(err.status || 500).json({ error: 'Error interno del servidor(error-BK)' });
        }
    },

    async obtenerHistorialTarifas(req, res) {
        try {
            res.json(await obtenerHistorialTarifas());
        } catch (err) {
            console.error('❌ Error al obtener historial v2:', err);
            res.status(500).json({ error: 'Error interno del servidor(error-BK)' });
        }
    },

    async modificarTarifa(req, res) {
        const { descripcion, fecha_inicio } = req.body;
        if (!descripcion || !fecha_inicio) return res.status(400).json({ error: 'Faltan campos requeridos' });
        try {
            const { nombre } = await modificarTarifa(req.params.id, req.body, req.usuario.id);
            notify(`Tarifa "${nombre}" modificada`, 'info', { tarifa_id: Number(req.params.id), nombre, accion: 'tarifa_modificada' });
            res.json({ mensaje: 'Tarifa modificada exitosamente' });
        } catch (err) {
            console.error('❌ Error al modificar tarifa v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    async modificarRangosTarifa(req, res) {
        const { tarifa_id, rangos } = req.body;
        if (!tarifa_id || !Array.isArray(rangos) || !rangos.length) return res.status(400).json({ error: 'Faltan datos de tarifa o rangos (error-BK)' });
        try {
            await modificarRangosTarifa(tarifa_id, rangos);
            notify(`Rangos de tarifa modificados para tarifa ID: ${tarifa_id}`, 'info', { tarifa_id: Number(tarifa_id), rangos_modificados: rangos.length, accion: 'rangos_tarifa_modificados' });
            res.json({ mensaje: 'Rangos modificados/agregados exitosamente (error-BK)' });
        } catch (err) {
            console.error('❌ Error al modificar rangos v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    obtenerTarifaPorId: async (req, res) => {
        try {
            res.json(await obtenerTarifaPorId(req.params.id));
        } catch (err) {
            console.error('Error obteniendo tarifa por ID:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al obtener tarifa' });
        }
    },

    obtenerTarifasActivas: async (req, res) => {
        try {
            const tarifas = await obtenerTarifasActivas();
            res.json({ total: tarifas.length, tarifas });
        } catch (err) {
            console.error('Error obteniendo tarifas activas:', err);
            res.status(500).json({ error: 'Error al obtener tarifas activas' });
        }
    },

    obtenerHistorialTarifa: async (req, res) => {
        try {
            res.json(await obtenerHistorialTarifa(req.params.id));
        } catch (err) {
            console.error('Error obteniendo historial de tarifa:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al obtener historial' });
        }
    },

    estadisticas: async (req, res) => {
        try {
            res.json(await estadisticasTarifas());
        } catch (err) {
            console.error('Error obteniendo estadísticas de tarifas:', err);
            res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    }
};

export default tarifasController;
