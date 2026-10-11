import { generarFactura, obtenerFacturas, modificarFactura } from '../services/facturasService.js';

let sseManager = null;
let notificationManager = null;

export const setSSEManagers = (sseManagerInstance, notificationManagerInstance) => {
    sseManager = sseManagerInstance;
    notificationManager = notificationManagerInstance;
};

const facturasController = {

    async generarFactura(req, res) {
        const { lectura_id, cliente_id, tarifa_id, consumo_m3 } = req.body;
        const fecha_emision = req.body.fecha_emision || null;

        if (!lectura_id || !cliente_id || !tarifa_id || consumo_m3 == null) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        if (fecha_emision && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_emision)) {
            return res.status(400).json({ error: 'El formato de fecha_emision debe ser YYYY-MM-DD' });
        }
        try {
            const { factura_id, total, facturaCompleta } = await generarFactura(req.body, req.usuario.id);

            if (notificationManager && facturaCompleta) {
                try {
                    notificationManager.alertaSistema(`Factura generada por $${total}`, 'success', {
                        factura_id, cliente_nombre: facturaCompleta.cliente_nombre, total,
                        fecha_vencimiento: facturaCompleta.fecha_vencimiento,
                        periodo: facturaCompleta.periodo, consumo_m3: Number(facturaCompleta.consumo_m3),
                        accion: 'factura_generada'
                    });
                } catch (sseError) { console.warn('Error enviando notificaciones SSE:', sseError); }
            }

            res.status(201).json({
                mensaje: 'Factura generada exitosamente', factura_id, total_calculado: total,
                detalles: {
                    id: Number(facturaCompleta.id), cliente_nombre: facturaCompleta.cliente_nombre,
                    tarifa_nombre: facturaCompleta.tarifa_nombre, consumo_m3: Number(facturaCompleta.consumo_m3),
                    periodo: facturaCompleta.periodo, medidor_numero: facturaCompleta.medidor_numero,
                    total: Number(facturaCompleta.total), fecha_emision: facturaCompleta.fecha_emision,
                    fecha_vencimiento: facturaCompleta.fecha_vencimiento
                }
            });
        } catch (err) {
            console.error('Error al generar factura v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    async obtenerFacturas(req, res) {
        try {
            const result = await obtenerFacturas({ id: req.params.id, ...req.query });
            if (result.tipo === 'unica') return res.json(result.factura);
            if (req.query.periodo && !req.params.id && result.facturas.length === 0) {
                return res.status(200).json([]);
            }
            const response = { facturas: result.facturas, pagination: result.pagination, estadisticas: result.estadisticas, metadata: { timestamp: new Date().toISOString(), version: 'v2.1-paginated' } };
            if (result.filtros) response.filtros = result.filtros;
            res.json(response);
        } catch (err) {
            console.error('Error al obtener factura(s) v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    },

    async modificarFactura(req, res) {
        const { estado } = req.body;
        if (!estado) return res.status(400).json({ error: 'Faltan campos requeridos' });
        try {
            await modificarFactura(req.params.id, req.body, req.usuario.id);
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(`Factura ID ${req.params.id} modificada`, 'info', {
                        factura_id: Number(req.params.id), nuevo_estado: estado,
                        nuevo_total: req.body.total ? Number(req.body.total) : 0, accion: 'factura_modificada'
                    });
                } catch (sseError) { console.warn('Error enviando notificación SSE:', sseError); }
            }
            res.json({ mensaje: 'Factura modificada exitosamente' });
        } catch (err) {
            console.error('Error al modificar factura v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
        }
    }
};

export default facturasController;
