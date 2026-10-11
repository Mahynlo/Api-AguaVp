/**
 * Controlador de Convenios de Pago - V2
 *
 * File: src/v2/controllers/conveniosController.js
 *
 * Descripción:
 * Gestiona la creación y seguimiento de acuerdos de pago por parcialidades.
 * La lógica y el acceso a datos están en services/conveniosService.js.
 */

import {
    toMoney,
    crearConvenio,
    pagarParcialidad,
    obtenerResumenCobroMedidor,
    pagarIntegrado,
    obtenerConvenio
} from "../services/conveniosService.js";
import { esErrorDeNegocio, responderErrorDeNegocio } from "../../utils/errores.js";

const conveniosController = {

    /**
     * Crear Nuevo Convenio
     * POST /api/v2/deudores/convenios
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
            const medidorIdNum = Number(medidor_id);
            const montoInicialNum = toMoney(monto_inicial);
            const numeroParcialidadesNum = Number(numero_parcialidades);
            const periodicidadNormalizada = periodicidad || 'mensual';

            if (!autorizado_por) {
                return res.status(401).json({ error: "Usuario no autenticado para autorizar convenio" });
            }

            if (medidor_id == null || monto_inicial == null || numero_parcialidades == null) {
                return res.status(400).json({ error: "Faltan datos requeridos" });
            }

            if (!Number.isFinite(medidorIdNum) || medidorIdNum <= 0) {
                return res.status(400).json({ error: "medidor_id inválido" });
            }

            if (!Number.isFinite(montoInicialNum) || montoInicialNum < 0) {
                return res.status(400).json({ error: "monto_inicial debe ser un número mayor o igual a 0" });
            }

            if (!Number.isInteger(numeroParcialidadesNum) || numeroParcialidadesNum <= 0) {
                return res.status(400).json({ error: "numero_parcialidades debe ser un entero mayor a 0" });
            }

            if (!['mensual', 'quincenal'].includes(periodicidadNormalizada)) {
                return res.status(400).json({ error: "periodicidad inválida. Valores permitidos: mensual, quincenal" });
            }

            const { convenioId, deudaTotal, saldoDiferir, montoPorParcialidad, parcialidades } = await crearConvenio({
                medidorIdNum, montoInicialNum, numeroParcialidadesNum, periodicidadNormalizada, observaciones, autorizado_por
            });

            res.status(201).json({
                success: true,
                message: "Convenio creado exitosamente",
                convenio_id: convenioId,
                detalle: {
                    deuda_original: deudaTotal,
                    pago_inicial: montoInicialNum,
                    saldo_diferido: saldoDiferir,
                    cuotas: numeroParcialidadesNum,
                    monto_por_cuota: montoPorParcialidad
                },
                parcialidades: parcialidades
            });

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error("Error creando convenio:", error);
            res.status(500).json({ error: "Error interno creando convenio" });
        }
    },

    /**
     * Pagar Parcialidad de Convenio
     * POST /api/v2/deudores/convenios/pagar-parcialidad
     * Body: { parcialidad_id, cantidad_entregada, metodo_pago, comentario }
     */
    pagarParcialidad: async (req, res) => {
        try {
            console.log('=== PAGAR PARCIALIDAD ===');
            console.log('Body recibido:', req.body);
            console.log('Usuario:', req.usuario);

            const {
                parcialidad_id,
                cantidad_entregada,
                metodo_pago,
                comentario
            } = req.body;

            const modificado_por = req.usuario?.id || null;

            console.log('Datos extraídos:', { parcialidad_id, cantidad_entregada, metodo_pago, modificado_por });

            // Validaciones
            if (!parcialidad_id || !cantidad_entregada || !metodo_pago) {
                console.log('Validación fallida - Datos faltantes');
                return res.status(400).json({ error: 'Faltan datos requeridos' });
            }

            const cantidadEntregada = Number(cantidad_entregada);
            if (!Number.isFinite(cantidadEntregada) || cantidadEntregada <= 0) {
                return res.status(400).json({ error: 'La cantidad entregada debe ser un número mayor a 0' });
            }

            const { pagoId, monto, cambio, nuevoSaldo, convenioCompletado } = await pagarParcialidad({
                parcialidad_id, cantidadEntregada, metodo_pago, comentario, modificado_por
            });

            return res.status(201).json({
                mensaje: 'Parcialidad pagada exitosamente',
                pago_id: pagoId,
                monto_aplicado: monto,
                cambio: cambio,
                saldo_restante_convenio: nuevoSaldo,
                convenio_completado: convenioCompletado
            });

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('Error pagando parcialidad:', error);
            if (error.message?.includes('concurrente')) {
                return res.status(409).json({ error: error.message });
            }
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Obtener resumen de cobro por medidor
     * GET /api/v2/deudores/convenios/resumen-cobro/:medidor_id
     *
     * Retorna sugerencia de cobro combinando:
     * - Próxima factura pendiente (si existe)
     * - Próxima parcialidad de convenio (si existe)
     */
    obtenerResumenCobroMedidor: async (req, res) => {
        try {
            const medidor_id = Number(req.params.medidor_id);
            if (!Number.isFinite(medidor_id) || medidor_id <= 0) {
                return res.status(400).json({ error: 'medidor_id inválido' });
            }

            return res.json(await obtenerResumenCobroMedidor(medidor_id));

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('Error obteniendo resumen de cobro por medidor:', error);
            return res.status(500).json({ error: 'Error interno obteniendo resumen de cobro' });
        }
    },

    /**
     * Pago integrado: factura del periodo + convenio (una o varias parcialidades)
     * POST /api/v2/deudores/convenios/pagar-integrado
     * Body:
     * {
     *   convenio_id,
     *   factura_id?,
     *   monto_factura?,
     *   monto_convenio?,
     *   cantidad_entregada,
     *   metodo_pago,
     *   comentario?
     * }
     */
    pagarIntegrado: async (req, res) => {
        try {
            const {
                convenio_id,
                factura_id,
                monto_factura,
                monto_convenio,
                cantidad_entregada,
                metodo_pago,
                comentario
            } = req.body;

            const modificado_por = req.usuario?.id || null;
            const convenioIdNum = Number(convenio_id);
            const facturaIdNum = factura_id ? Number(factura_id) : null;
            const cantidadEntregadaNum = toMoney(cantidad_entregada);

            if (!Number.isFinite(convenioIdNum) || convenioIdNum <= 0) {
                return res.status(400).json({ error: 'convenio_id es requerido y debe ser válido' });
            }

            if (!metodo_pago) {
                return res.status(400).json({ error: 'metodo_pago es requerido' });
            }

            if (!Number.isFinite(cantidadEntregadaNum) || cantidadEntregadaNum <= 0) {
                return res.status(400).json({ error: 'cantidad_entregada debe ser mayor a 0' });
            }

            const resultado = pagarIntegrado({
                convenioIdNum, facturaIdNum, monto_factura, monto_convenio, cantidadEntregadaNum, metodo_pago, comentario, modificado_por
            });

            return res.status(201).json(resultado);
        } catch (error) {
            if (error?.statusCode) {
                return res.status(error.statusCode).json(error);
            }
            console.error('Error en pago integrado de convenio:', error);
            return res.status(500).json({ error: 'Error interno procesando pago integrado' });
        }
    },

    /**
     * Obtener Convenio con Parcialidades
     * GET /api/v2/deudores/convenios/:id
     */
    obtenerConvenio: async (req, res) => {
        try {
            return res.json(await obtenerConvenio(req.params.id));
        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('Error obteniendo convenio:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
};

export default conveniosController;
