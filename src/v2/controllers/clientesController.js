import { registrarCliente, obtenerClientes, modificarCliente, asignarTarifa, estadisticasClientes, eliminarCliente, restaurarCliente, obtenerClientesEliminados, purgarCliente } from '../services/clientesService.js';

let sseManager = null;
let notificationManager = null;

export function setSSEManagers(sse, notification) {
    sseManager = sse;
    notificationManager = notification;
}

const notify = (msg, tipo, data) => {
    if (!notificationManager) return;
    try { notificationManager.alertaSistema(msg, tipo, data); } catch (e) { console.warn('Error enviando notificación SSE:', e); }
};

const clientesController = {

    registrarCliente: async (req, res) => {
        const { nombre, direccion, telefono, ciudad, tarifa_id } = req.body;
        if (!nombre || !direccion || !telefono || !ciudad || !tarifa_id) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }
        try {
            const cliente = await registrarCliente(req.body, req.usuario.id);
            notify(`Nuevo cliente "${nombre}" registrado`, 'success', { cliente, accion: 'cliente_creado' });
            res.status(201).json({ mensaje: 'Cliente registrado con éxito', clienteID: cliente.id });
        } catch (err) {
            console.error('Error registrando cliente v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al registrar cliente' });
        }
    },

    obtenerClientes: async (req, res) => {
        try {
            const result = await obtenerClientes(req.query);
            if (Array.isArray(result)) return res.json(result);
            res.json({ success: true, data: result.data, pagination: result.pagination });
        } catch (err) {
            console.error('Error obteniendo clientes v2:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al obtener clientes' });
        }
    },

    modificarCliente: async (req, res) => {
        const { nombre, direccion, telefono, ciudad, correo, estado_cliente, tarifa_id, numero_predio, medidor_id, medidores_liberados } = req.body;
        if (!nombre && !direccion && !telefono && !ciudad && !correo && !estado_cliente && tarifa_id === undefined && medidor_id === undefined && medidores_liberados === undefined && numero_predio === undefined) {
            return res.status(400).json({ error: 'Al menos un campo es obligatorio' });
        }
        try {
            const { nombre: nombreActual, cambios } = await modificarCliente(req.params.id, req.body, req.usuario.id);
            notify(`Cliente "${nombreActual}" ha sido modificado`, 'info', { cliente_id: Number(req.params.id), nombre: nombreActual, cambios_realizados: Object.keys(cambios).length, accion: 'cliente_actualizado' });
            res.json({ mensaje: 'Cliente modificado', cambios });
        } catch (err) {
            console.error('Error modificando cliente v2:', err);
            if (err.status && err.error) return res.status(err.status).json({ error: err.error });
            res.status(err.status || 500).json({ error: err.message || 'Error al modificar cliente' });
        }
    },

    asignarTarifa: async (req, res) => {
        const { tarifa_id } = req.body;
        if (!tarifa_id) return res.status(400).json({ error: 'El ID de la tarifa es obligatorio' });
        try {
            const result = await asignarTarifa(req.params.id, tarifa_id, req.usuario.id);
            notify(`Tarifa actualizada para cliente "${result.cliente_nombre}"`, 'info', { ...result, accion: 'tarifa_asignada' });
            res.json({ mensaje: 'Tarifa asignada exitosamente', ...result });
        } catch (err) {
            console.error('Error asignando tarifa:', err);
            if (err.status === 400 && err.message?.includes('ya tiene esta tarifa')) {
                return res.status(400).json({ error: err.message, tarifa_actual: Number(tarifa_id) });
            }
            res.status(err.status || 500).json({ error: err.message || 'Error al asignar tarifa' });
        }
    },

    estadisticas: async (req, res) => {
        try {
            res.json(await estadisticasClientes());
        } catch (err) {
            console.error('Error obteniendo estadísticas de clientes:', err);
            res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    },

    eliminarCliente: async (req, res) => {
        try {
            const { nombre } = await eliminarCliente(req.params.id, req.usuario.id, req.body.razon);
            notify(`Cliente "${nombre}" eliminado`, 'warning', { cliente_id: Number(req.params.id), nombre, razon: req.body.razon || 'Sin razón especificada', accion: 'cliente_eliminado' });
            res.json({ message: 'Cliente eliminado correctamente', cliente_id: req.params.id });
        } catch (err) {
            console.error('Error eliminando cliente:', err);
            const body = { error: err.message || 'Error al eliminar cliente' };
            if (err.facturas_pendientes !== undefined) body.facturas_pendientes = err.facturas_pendientes;
            res.status(err.status || 500).json(body);
        }
    },

    restaurarCliente: async (req, res) => {
        try {
            const { nombre } = await restaurarCliente(req.params.id, req.usuario.id);
            notify(`Cliente "${nombre}" restaurado`, 'success', { cliente_id: Number(req.params.id), nombre, accion: 'cliente_restaurado' });
            res.json({ message: 'Cliente restaurado correctamente', cliente_id: req.params.id });
        } catch (err) {
            console.error('Error restaurando cliente:', err);
            const body = { error: err.message || 'Error al restaurar cliente' };
            if (err.estado_actual !== undefined) body.estado_actual = err.estado_actual;
            res.status(err.status || 500).json(body);
        }
    },

    purgarCliente: async (req, res) => {
        try {
            const { nombre } = await purgarCliente(req.params.id);
            notify(`Cliente "${nombre}" purgado/eliminado definitivamente`, 'warning', { cliente_id: Number(req.params.id), nombre, accion: 'cliente_purgado' });
            res.json({ message: 'Cliente eliminado definitivamente', cliente_id: req.params.id });
        } catch (err) {
            console.error('Error purgando cliente:', err);
            res.status(err.status || 500).json({ error: err.message || 'Error al eliminar definitivamente el cliente' });
        }
    },

    obtenerClientesEliminados: async (req, res) => {
        try {
            res.json(await obtenerClientesEliminados());
        } catch (err) {
            console.error('Error obteniendo clientes eliminados:', err);
            res.status(500).json({ error: 'Error al obtener clientes eliminados' });
        }
    }
};

export default clientesController;
