/**
 * Controlador de Rutas - V2
 *
 * File: src/v2/controllers/rutasController.js
 *
 * Descripción: rutas de lectura (crear, listar, medidores en orden, progreso de captura).
 * La lógica y el acceso a datos están en services/rutasService.js; aquí quedan la
 * validación de entrada, las notificaciones SSE y la forma de las respuestas.
 */

import {
    crearRuta,
    listarRutas,
    agregarMedidorARuta,
    obtenerRutaConMedidores,
    modificarRuta,
    eliminarMedidorDeRuta,
    reordenarMedidores,
    obtenerProgresoCapturaRuta
} from '../services/rutasService.js';
import { esErrorDeNegocio, responderErrorDeNegocio } from '../../utils/errores.js';

// Managers SSE - Configurados dinámicamente (ver configureSSE en routes/rutas.js)
let notificationManager = null;

export const setSSEManagers = (_sseManagerInstance, notificationManagerInstance) => {
    notificationManager = notificationManagerInstance;
};

const rutasController = {

    /**
     * Crear ruta
     * POST /api/v2/rutas/crear
     */
    crearRuta: async (req, res) => {
        try {
            const {
                nombre,
                descripcion,
                creado_por,
                distancia_km,
                ruta_calculada,
                instrucciones,
                puntos // contiene los medidores con su id
            } = req.body;

            if (!nombre || !creado_por || !Array.isArray(puntos) || puntos.some(p => !p.id)) {
                return res.status(400).json({ error: 'Faltan campos requeridos o puntos inválidos' });
            }

            const ruta_id = await crearRuta({ nombre, descripcion, creado_por, distancia_km, ruta_calculada, instrucciones, puntos });

            // Datos completos de la ruta para notificaciones SSE
            const rutaCompleta = {
                id: ruta_id,
                nombre,
                descripcion,
                creado_por,
                distancia_km,
                ruta_calculada,
                instrucciones,
                puntos: puntos.map((punto, index) => ({
                    medidor_id: punto.id,
                    orden: index + 1
                })),
                fecha_creacion: new Date().toISOString()
            };

            // Enviar notificaciones SSE
            if (notificationManager) {
                try {
                    // Notificar a operadores sobre nueva ruta
                    notificationManager.notificacionPersonalizada('ruta_creada', {
                        message: `Nueva ruta "${nombre}" creada`,
                        ruta: rutaCompleta,
                        timestamp: new Date().toISOString()
                    });

                    // Notificar a administradores
                    notificationManager.alertaSistema(
                        `Ruta "${nombre}" creada con ${puntos.length} puntos`,
                        'success',
                        {
                            ruta: rutaCompleta,
                            creado_por_id: creado_por
                        }
                    );

                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            return res.status(201).json({
                mensaje: '✅ Ruta creada correctamente',
                ruta_id,
                detalles: rutaCompleta
            });

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('❌ Error al crear ruta v2:', error);
            res.status(500).json({ error: 'Error interno del servidor al crear la ruta' });
        }
    },

    /**
     * Listar rutas con paginación y búsqueda
     * GET /api/v2/rutas/listar?periodo=2025-08&page=1&limit=10&search=...
     */
    listarRutas: async (req, res) => {
        try {
            const { periodo: periodoParam, page, limit, search } = req.query;
            return res.status(200).json(await listarRutas({ periodoParam, page, limit, search }));
        } catch (error) {
            console.error('❌ Error al listar rutas v2:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Agregar medidor a ruta
     * POST /api/v2/rutas/agregar-medidor
     */
    agregarMedidorARuta: async (req, res) => {
        try {
            const { ruta_id, medidor_id, orden } = req.body;

            if (!ruta_id || !medidor_id || orden == null) {
                return res.status(400).json({ error: 'Faltan campos requeridos' });
            }

            await agregarMedidorARuta({ ruta_id, medidor_id, orden });

            return res.status(201).json({ mensaje: 'Medidor agregado a la ruta' });

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('Error al agregar medidor v2:', error);
            return res.status(500).json({ error: 'No se pudo agregar el medidor. Verifica si ya existe en la ruta.' });
        }
    },

    /**
     * Obtener ruta con medidores (enriquecido con datos de lectura del período)
     * GET /api/v2/rutas/:ruta_id/medidores?periodo=2025-08
     */
    obtenerRutaConMedidores: async (req, res) => {
        try {
            return res.status(200).json(await obtenerRutaConMedidores(req.params.ruta_id, req.query.periodo));
        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('❌ Error al obtener ruta v2:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Modificar ruta
     * PUT /api/v2/rutas/:ruta_id
     * Body: { nombre?, descripcion?, distancia_km?, ruta_calculada?, instrucciones?, puntos? }
     */
    modificarRuta: async (req, res) => {
        try {
            const { ruta_id } = req.params;
            const { nombre, descripcion, distancia_km, ruta_calculada, instrucciones, puntos } = req.body;

            if (!ruta_id) {
                return res.status(400).json({ error: 'ID de ruta requerido' });
            }

            const { nombreActual, medidores_actualizados } = await modificarRuta(ruta_id, { nombre, descripcion, distancia_km, ruta_calculada, instrucciones, puntos });

            // Notificar cambios
            if (notificationManager) {
                try {
                    const campos = Object.keys(req.body);
                    notificationManager.alertaSistema(
                        `Ruta "${nombre || nombreActual}" actualizada`,
                        'info',
                        {
                            ruta_id: Number(ruta_id),
                            campos_actualizados: campos,
                            medidores_actualizados: medidores_actualizados
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            const response = {
                success: true,
                mensaje: 'Ruta actualizada correctamente',
                ruta_id: Number(ruta_id)
            };

            if (medidores_actualizados > 0) {
                response.medidores_actualizados = medidores_actualizados;
            }

            return res.status(200).json(response);

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('❌ Error al modificar ruta:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Eliminar medidor de ruta (y reordenar los siguientes)
     * DELETE /api/v2/rutas/:ruta_id/medidores/:medidor_id
     */
    eliminarMedidorDeRuta: async (req, res) => {
        try {
            const { ruta_id, medidor_id } = req.params;

            if (!ruta_id || !medidor_id) {
                return res.status(400).json({ error: 'ID de ruta y medidor requeridos' });
            }

            const ordenEliminado = await eliminarMedidorDeRuta(ruta_id, medidor_id);

            // Notificar cambios
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Medidor removido de ruta`,
                        'info',
                        {
                            ruta_id: Number(ruta_id),
                            medidor_id: Number(medidor_id),
                            orden_eliminado: ordenEliminado
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            return res.status(200).json({
                success: true,
                mensaje: 'Medidor eliminado de la ruta y orden actualizado',
                ruta_id: Number(ruta_id),
                medidor_id: Number(medidor_id)
            });

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('❌ Error al eliminar medidor de ruta:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Reordenar medidores
     * PUT /api/v2/rutas/:ruta_id/reordenar
     * Body: { orden: [{ medidor_id: 1, orden: 1 }, { medidor_id: 2, orden: 2 }, ...] }
     */
    reordenarMedidores: async (req, res) => {
        try {
            const { ruta_id } = req.params;
            const { orden } = req.body;

            if (!ruta_id || !Array.isArray(orden) || orden.length === 0) {
                return res.status(400).json({
                    error: 'ID de ruta y array de orden requeridos',
                    ejemplo: { orden: [{ medidor_id: 1, orden: 1 }, { medidor_id: 2, orden: 2 }] }
                });
            }

            await reordenarMedidores(ruta_id, orden);

            // Notificar cambios
            if (notificationManager) {
                try {
                    notificationManager.alertaSistema(
                        `Orden de medidores actualizado en ruta`,
                        'info',
                        {
                            ruta_id: Number(ruta_id),
                            medidores_reordenados: orden.length
                        }
                    );
                } catch (sseError) {
                    console.warn('Error enviando notificación SSE:', sseError);
                }
            }

            return res.status(200).json({
                success: true,
                mensaje: 'Orden de medidores actualizado correctamente',
                ruta_id: Number(ruta_id),
                medidores_actualizados: orden.length
            });

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('❌ Error al reordenar medidores:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    /**
     * Progreso de captura de la ruta
     * GET /api/v2/rutas/:ruta_id/progreso?periodo=2025-12
     */
    obtenerProgresoCapturaRuta: async (req, res) => {
        try {
            const { ruta_id } = req.params;

            if (!ruta_id) {
                return res.status(400).json({ error: 'ID de ruta requerido' });
            }

            return res.status(200).json(await obtenerProgresoCapturaRuta(ruta_id, req.query.periodo));

        } catch (error) {
            if (esErrorDeNegocio(error)) return responderErrorDeNegocio(res, error);
            console.error('❌ Error al obtener progreso de ruta:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
};

export default rutasController;
