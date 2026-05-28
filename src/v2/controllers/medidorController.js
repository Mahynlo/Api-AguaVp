import { registrarMedidor, obtenerMedidores, modificarMedidor } from '../services/medidorService.js';

let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
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
    }
};

export default MedidorController;
