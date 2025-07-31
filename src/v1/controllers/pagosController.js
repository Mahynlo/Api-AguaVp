// File: src/controllers/pagosController.js
const db = require('../../database/db');
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

const pagosController = {
  registrarPago: (req, res) => {
    try {
      const {
        factura_id,
        fecha_pago,
        cantidad_entregada,
        metodo_pago,
        comentario,
        modificado_por
      } = req.body;

      if (
        !factura_id || !fecha_pago || cantidad_entregada == null ||
        !metodo_pago || !modificado_por
      ) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }

      if (cantidad_entregada <= 0) {
        return res.status(400).json({ error: 'La cantidad entregada debe ser mayor a cero' });
      }

      // Verificar existencia de la factura y obtener el saldo
      const query = `SELECT id, saldo_pendiente FROM facturas WHERE id = ?`;
      db.get(query, [factura_id], (err, factura) => {
        if (err) {
          console.error('Error al buscar factura:', err);
          return res.status(500).json({ error: 'Error interno del servidor' });
        }

        if (!factura) {
          return res.status(404).json({ error: 'Factura no encontrada' });
        }

        const saldo = parseFloat(factura.saldo_pendiente);

        if (saldo <= 0) {
          return res.status(400).json({ error: 'La factura ya está completamente pagada' });
        }

        const monto = Math.min(saldo, cantidad_entregada); // Nunca más del saldo

        const cambio = parseFloat((cantidad_entregada - monto).toFixed(2));
        console.log(`Monto a aplicar: ${monto}, Cantidad entregada: ${cantidad_entregada}`);
        console.log(`Cambio a devolver: ${cambio}`);
        const insertQuery = `
        INSERT INTO pagos (
          factura_id, fecha_pago, monto, cantidad_entregada, cambio, metodo_pago, comentario, modificado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

        db.run(
          insertQuery,
          [
            factura_id,
            fecha_pago,
            monto,
            cantidad_entregada,
            cambio,
            metodo_pago,
            comentario || null,
            modificado_por
          ],
          function (err) {
            if (err) {
              console.error('Error al registrar pago:', err);
              return res.status(500).json({ error: err.message });
            }

            const pagoId = this.lastID;

            // Obtener datos completos del pago para WebSocket
            const query = `
              SELECT p.*, f.numero as factura_numero, c.nombre as cliente_nombre
              FROM pagos p
              JOIN facturas f ON p.factura_id = f.id
              JOIN clientes c ON f.cliente_id = c.id
              WHERE p.id = ?
            `;

            db.get(query, [pagoId], (err, pagoCompleto) => {
              // Respuesta exitosa
              const response = {
                mensaje: 'Pago registrado exitosamente',
                pago_id: pagoId,
                monto_aplicado: monto,
                cambio
              };

              // Emitir eventos WebSocket si está disponible
              if (res.websocket && pagoCompleto) {
                // Datos para notificación de negocio
                const pagoData = {
                  id: pagoId,
                  factura_id: factura_id,
                  factura_numero: pagoCompleto.factura_numero,
                  cliente_nombre: pagoCompleto.cliente_nombre,
                  monto: monto,
                  cantidad_entregada: cantidad_entregada,
                  cambio: cambio,
                  metodo_pago: metodo_pago,
                  fecha_pago: fecha_pago,
                  timestamp: new Date().toISOString()
                };

                // Notificar pago recibido
                res.websocket.notifyBusiness('pago_recibido', pagoData);
                
                // Trackear operación
                res.websocket.trackOperation('pago_registrado', {
                  pago_id: pagoId,
                  factura_id: factura_id,
                  monto: monto,
                  metodo: metodo_pago
                });

                // Emitir evento específico de pago completado
                res.websocket.emitToRoom('pagos', 'pago_completed', {
                  pago: pagoData,
                  mensaje: `Pago de $${monto} procesado exitosamente`
                });
              }

              // saldo_pendiente y estado se actualizan automáticamente con los triggers
              return res.status(201).json(response);
            });
          }
        );
      });

    } catch (error) {
      console.error('Error al registrar pago:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },



  obtenerPagos: (req, res) => {
    try {
      const { id } = req.params;
      const { periodo } = req.query;

      const baseQuery = `
        SELECT 
          p.*,
          f.estado AS estado_factura, 
          f.total AS total_factura,
          f.fecha_emision AS fecha_emision_factura,
          f.saldo_pendiente AS saldo_pendiente_factura,
          u.username AS modificado_por_nombre,
          c.nombre AS cliente_nombre,
          c.direccion AS direccion_cliente,
          l.periodo AS periodo_facturado,
          l.consumo_m3,
          l.fecha_lectura,
          m.numero_serie AS medidor_numero_serie
        FROM pagos p
        JOIN facturas f ON p.factura_id = f.id
        JOIN usuarios u ON p.modificado_por = u.id
        JOIN clientes c ON f.cliente_id = c.id
        LEFT JOIN lecturas l ON f.lectura_id = l.id
        LEFT JOIN medidores m ON l.medidor_id = m.id
      `;

      // 🔧 Construir WHERE clause basado en parámetros
      let whereClause = '';
      let queryParams = [];

      if (id) {
        whereClause = 'WHERE p.id = ?';
        queryParams.push(id);
      } else if (periodo) {
        whereClause = 'WHERE l.periodo = ?';
        queryParams.push(periodo);
      }

      // Usar ORDER BY solo cuando no sea consulta específica por ID
      const orderClause = id ? '' : 'ORDER BY p.fecha_pago DESC';
      
      // 🎯 Agregar LIMIT para consultas grandes (opcional)
      const limitClause = (!id && !periodo) ? 'LIMIT 500' : '';
      
      const query = `${baseQuery} ${whereClause} ${orderClause} ${limitClause}`;

      const callback = (err, result) => {
        if (err) {
          console.error('Error al obtener pago(s):', err);
          return res.status(500).json({ error: 'Error interno del servidor' });
        }

        if (id && !result) {
          return res.status(404).json({ error: 'Pago no encontrado' });
        }

        // 📊 Para consulta específica por ID, retornar directamente con período
        if (id && result) {
          return res.status(200).json({
            ...result,
            periodo_info: {
              periodo_facturado: result.periodo_facturado,
              mes_facturado: result.periodo_facturado ? 
                formatearMesPeriodo(result.periodo_facturado) : null
            }
          });
        }

        // 📊 Para consultas múltiples, agregar información de resumen y períodos
        if (Array.isArray(result) && result.length > 0) {
          const totalPagado = result.reduce((sum, pago) => sum + parseFloat(pago.monto || 0), 0);
          const cantidadPagos = result.length;
          
          // Obtener períodos únicos de los pagos
          const periodosUnicos = [...new Set(
            result
              .map(pago => pago.periodo_facturado)
              .filter(periodo => periodo != null)
          )].sort();

          // Agrupar pagos por período
          const pagosPorPeriodo = periodosUnicos.reduce((acc, periodo) => {
            const pagosDelPeriodo = result.filter(pago => pago.periodo_facturado === periodo);
            const totalDelPeriodo = pagosDelPeriodo.reduce((sum, pago) => sum + parseFloat(pago.monto || 0), 0);
            
            acc[periodo] = {
              cantidad_pagos: pagosDelPeriodo.length,
              total_pagado: parseFloat(totalDelPeriodo.toFixed(2)),
              promedio_pago: parseFloat((totalDelPeriodo / pagosDelPeriodo.length).toFixed(2))
            };
            return acc;
          }, {});

          // Formatear los pagos con información del período
          const pagosFormateados = result.map(pago => ({
            ...pago,
            mes_facturado: pago.periodo_facturado ? 
              formatearMesPeriodo(pago.periodo_facturado) : null
          }));

          const respuesta = {
            pagos: pagosFormateados,
            resumen_general: {
              total_pagado: parseFloat(totalPagado.toFixed(2)),
              cantidad_pagos: cantidadPagos,
              promedio_pago: parseFloat((totalPagado / cantidadPagos).toFixed(2))
            },
            periodos_encontrados: periodosUnicos,
            resumen_por_periodo: pagosPorPeriodo
          };

          // Si se filtró por período específico, agregar info adicional
          if (periodo) {
            respuesta.filtro_aplicado = {
              tipo: 'periodo',
              valor: periodo,
              mes_facturado: formatearMesPeriodo(periodo)
            };
          }

          return res.status(200).json(respuesta);
        }

        // Si no hay resultados pero es consulta múltiple
        if (Array.isArray(result) && result.length === 0) {
          return res.status(200).json({
            pagos: [],
            resumen_general: {
              total_pagado: 0,
              cantidad_pagos: 0,
              promedio_pago: 0
            },
            periodos_encontrados: [],
            resumen_por_periodo: {},
            filtro_aplicado: periodo ? {
              tipo: 'periodo',
              valor: periodo,
              mes_facturado: formatearMesPeriodo(periodo)
            } : null
          });
        }

        return res.status(200).json(result);
      };

      // 🗓️ Función auxiliar para formatear período a mes legible
      function formatearMesPeriodo(periodo) {
        if (!periodo || !periodo.match(/^\d{4}-\d{2}$/)) {
          return periodo;
        }
        
        const meses = {
          '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
          '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
          '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
        };
        
        const [año, mes] = periodo.split('-');
        return `${meses[mes]} ${año}`;
      }

      if (id) {
        db.get(query, queryParams, callback);
      } else {
        db.all(query, queryParams, callback);
      }

    } catch (error) {
      console.error('Error al obtener pago(s):', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  modificarPago: (req, res) => {
    try {
      const { id } = req.params;
      const { fecha_pago, monto, metodo_pago, modificado_por } = req.body;

      if (!fecha_pago || !monto || !metodo_pago || !modificado_por) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }

      const query = `
        UPDATE pagos
        SET fecha_pago = ?, monto = ?, metodo_pago = ?, modificado_por = ?
        WHERE id = ?
      `;

      db.run(query, [fecha_pago, monto, metodo_pago, modificado_por, id], function (err) {
        if (err) {
          console.error('Error al modificar pago:', err);
          return res.status(500).json({ error: 'Error interno del servidor' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Pago no encontrado' });
        }

        return res.status(200).json({ mensaje: 'Pago modificado exitosamente' });
      });

    } catch (error) {
      console.error('Error al modificar pago:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  // Middleware de WebSocket para todas las operaciones de pagos
  withWebSocket: ControllerIntegration.withWebSocket
};

module.exports = pagosController;
