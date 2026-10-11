import { registrarMedidor, obtenerMedidores, modificarMedidor, eliminarMedidor, restaurarMedidor, obtenerMedidoresEliminados, purgarMedidor } from '../services/medidorService.js';

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

const MedidorController = {

    registrarMedidor: async (req, res) => {
        const { numero_serie, ubicacion, fecha_instalacion, latitud, longitud } = req.body;
        if (!numero_serie || !ubicacion || !fecha_instalacion || !latitud || !longitud) {
            return res.status(400).json({ success: false, message: "Todos los campos obligatorios excepto cliente_id" });
        }
        try {
            const medidor = await registrarMedidor(req.body, req.usuario?.id || 1);
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(`Medidor ${medidor.numero_serie} registrado`, 'success', {
                        medidor_id: medidor.id, numero_serie: medidor.numero_serie, ubicacion: medidor.ubicacion,
                        estado_medidor: medidor.estado_medidor, accion: 'medidor_registrado'
                    });
                } catch (sseError) { console.warn('Error enviando notificación SSE:', sseError); }
            }
            res.status(201).json({ success: true, message: "Medidor registrado exitosamente", data: { medidorID: medidor.id } });
        } catch (err) {
            console.error('Error registrando medidor v2:', err);
            res.status(err.status || 500).json({ success: false, message: err.message || "Error al registrar medidor" });
        }
    },

    obtenerMedidores: async (req, res) => {
        try {
            const result = await obtenerMedidores(req.query);
            if (Array.isArray(result)) return res.json(result);
            res.json({ success: true, ...result });
        } catch (err) {
            console.error('Error obteniendo medidores v2:', err);
            res.status(err.status || 500).json({ error: "Error al obtener medidores" });
        }
    },

    modificarMedidor: async (req, res) => {
        const { id } = req.params;
        const hayDatos = Object.values(req.body).some(v => v !== undefined);
        if (!hayDatos) {
            return res.status(400).json({ success: false, message: "Al menos un campo es obligatorio" });
        }
        try {
            const result = await modificarMedidor(id, req.body, req.usuario?.id || 1);
            if (notificationManager && Object.keys(result.cambios).length > 0) {
                try {
                    notificationManager.alertaSistema(`Medidor ${result.numero_serie} modificado`, 'info', {
                        medidor_id: result.id, numero_serie: result.numero_serie,
                        campos_modificados: Object.keys(result.cambios), accion: 'medidor_modificado'
                    });
                } catch (sseError) { console.warn('Error enviando notificación SSE:', sseError); }
            }
            res.json({ success: true, message: "Medidor modificado correctamente", data: { id: result.id, cambios_realizados: Object.keys(result.cambios), rowsAffected: result.rowsAffected } });
        } catch (err) {
            console.error('Error modificando medidor v2:', err);
            // Caso especial: lectura_base bloqueada tiene código específico
            if (err.message?.includes('lectura base')) {
                return res.status(err.status || 409).json({ success: false, error: err.message, code: "LECTURA_BASE_LOCKED" });
            }
            res.status(err.status || 500).json({ success: false, message: err.message || "Error al modificar medidor" });
        }
    },

    eliminarMedidor: async (req, res) => {
        try {
            const { numero_serie } = await eliminarMedidor(req.params.id, req.usuario?.id || 1, req.body.razon);
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(`Medidor ${numero_serie} eliminado`, 'warning', {
                        medidor_id: Number(req.params.id), numero_serie, razon: req.body.razon || 'Sin razón especificada', accion: 'medidor_eliminado'
                    });
                } catch (e) { console.warn('Error enviando notificación SSE:', e); }
            }
            res.json({ success: true, message: 'Medidor eliminado correctamente', medidor_id: req.params.id });
        } catch (err) {
            console.error('Error eliminando medidor:', err);
            res.status(err.status || 500).json({ success: false, message: err.message || 'Error al eliminar medidor' });
        }
    },

    restaurarMedidor: async (req, res) => {
        try {
            const { numero_serie } = await restaurarMedidor(req.params.id, req.usuario.id);
            notify(`Medidor "${numero_serie}" restaurado`, 'success', { medidor_id: Number(req.params.id), numero_serie, accion: 'medidor_restaurado' });
            res.json({ success: true, message: 'Medidor restaurado correctamente', medidor_id: req.params.id });
        } catch (err) {
            console.error('Error restaurando medidor:', err);
            res.status(err.status || 500).json({ success: false, message: err.message || 'Error al restaurar medidor' });
        }
    },

    purgarMedidor: async (req, res) => {
        try {
            const { numero_serie } = await purgarMedidor(req.params.id);
            notify(`Medidor "${numero_serie}" purgado/eliminado definitivamente`, 'warning', { medidor_id: Number(req.params.id), numero_serie, accion: 'medidor_purgado' });
            res.json({ success: true, message: 'Medidor eliminado definitivamente', medidor_id: req.params.id });
        } catch (err) {
            console.error('Error purgando medidor:', err);
            res.status(err.status || 500).json({ success: false, message: err.message || 'Error al eliminar definitivamente el medidor' });
        }
    },

    obtenerMedidoresEliminados: async (req, res) => {
        try {
            const result = await obtenerMedidoresEliminados();
            res.json(result);
        } catch (err) {
            console.error('Error obteniendo medidores eliminados:', err);
            res.status(500).json({ success: false, error: 'Error al obtener medidores eliminados' });
        }
    }
};

export default MedidorController;
