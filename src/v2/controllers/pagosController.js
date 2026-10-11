import { registrarPago, registrarPagoDistribuido, obtenerPagos, modificarPago, getPagoCompleto, toDecimal } from '../services/pagosService.js';

let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

const pagosController = {

    registrarPago: async (req, res) => {
        const { factura_id, fecha_pago, cantidad_entregada, metodo_pago } = req.body;
        if (!factura_id || !fecha_pago || cantidad_entregada == null || !metodo_pago) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        if (cantidad_entregada <= 0) {
            return res.status(400).json({ error: 'La cantidad entregada debe ser mayor a cero' });
        }
        try {
            const { pagoId, monto, cambio } = registrarPago(req.body, req.usuario.id);
            const pagoCompleto = await getPagoCompleto(pagoId);

            if (notificationManager && pagoCompleto) {
                try {
                    notificationManager.notificacionPersonalizada('pago_recibido', { id: pagoId, factura_id, factura_numero: pagoCompleto.factura_numero, cliente_nombre: pagoCompleto.cliente_nombre, monto, cantidad_entregada, cambio, metodo_pago, fecha_pago, timestamp: new Date().toISOString() });
                    notificationManager.alertaSistema(`Pago de $${monto} procesado exitosamente`, 'success', { pago_id: pagoId, factura_id, monto });
                } catch (sseError) { console.warn('Error enviando notificación SSE:', sseError); }
            }

            res.status(201).json({ mensaje: 'Pago registrado exitosamente', pago_id: pagoId, monto_aplicado: monto, cambio });
        } catch (error) {
            if (error.statusCode) return res.status(error.statusCode).json(error);
            console.error('Error al registrar pago:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    registrarPagoDistribuido: async (req, res) => {
        const { cliente_id, fecha_pago, cantidad_entregada, metodo_pago } = req.body;
        if (!cliente_id || !fecha_pago || cantidad_entregada == null || !metodo_pago) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        if (cantidad_entregada <= 0) {
            return res.status(400).json({ error: 'La cantidad entregada debe ser mayor a cero' });
        }
        try {
            const result = registrarPagoDistribuido(req.body, req.usuario.id);

            if (notificationManager) {
                try {
                    notificationManager.notificacionPersonalizada('pago_distribuido_registrado', { cliente_id: Number(cliente_id), monto_aplicado: result.montoAplicadoTotal, facturas_afectadas: result.facturasAfectadas, timestamp: new Date().toISOString() });
                } catch (sseError) { console.warn('Error enviando notificación SSE de pago distribuido:', sseError); }
            }

            res.status(201).json({ mensaje: 'Pago distribuido registrado exitosamente', cliente_id: Number(cliente_id), pagos_ids: result.pagoIds, monto_entregado: toDecimal(cantidad_entregada), monto_aplicado: result.montoAplicadoTotal, cambio: result.cambio, facturas_afectadas: result.facturasAfectadas, aplicaciones: result.aplicaciones });
        } catch (error) {
            if (error.statusCode) return res.status(error.statusCode).json(error);
            console.error('Error al registrar pago distribuido:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    obtenerPagos: async (req, res) => {
        try {
            const result = await obtenerPagos({ id: req.params.id, ...req.query });
            if (result.tipo === 'unico') return res.json(result.pago);
            const response = { pagos: result.pagos, pagination: result.pagination, resumen: result.resumen, periodos_encontrados: result.periodos_encontrados, resumen_por_periodo: result.resumen_por_periodo };
            if (result.filtro) response.filtro_aplicado = result.filtro;
            res.json(response);
        } catch (error) {
            console.error('Error al obtener pago(s):', error);
            res.status(error.status || 500).json({ error: error.message || 'Error interno del servidor' });
        }
    },

    modificarPago: async (req, res) => {
        const { fecha_pago, monto, metodo_pago, comentario } = req.body;
        if (!fecha_pago && monto === undefined && !metodo_pago && comentario === undefined) {
            return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
        }
        try {
            await modificarPago(req.params.id, req.body, req.usuario.id);
            res.json({ success: true, message: 'Pago modificado exitosamente' });
        } catch (error) {
            if (error.statusCode) return res.status(error.statusCode).json(error);
            console.error('Error al modificar pago:', error);
            res.status(error.status || 500).json({ error: error.message || 'Error interno del servidor' });
        }
    }
};

export default pagosController;
