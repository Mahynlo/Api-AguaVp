/**
 * Servicio de convenios de pago (acuerdos por parcialidades)
 *
 * File: src/v2/services/conveniosService.js
 *
 * Errores de negocio:
 * - crearError(mensaje, status, { datos }) → el controller responde { error, ...datos }.
 * - pagarIntegrado lanza objetos { statusCode, error, ... } que el controller responde tal cual.
 */

import db, { sqlite } from "../../database/db-sqlite.js";
import { addMonths, format } from 'date-fns';
import { nowDate, siguienteDiaHabil, calcularVencimiento } from '../../utils/timezone.js';
import { crearError } from "../../utils/errores.js";

export const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const estadoFacturaDesdeSaldo = (saldo) => (toMoney(saldo) <= 0 ? 'Pagado' : 'Parcial');

/**
 * Crea un convenio sobre la deuda del medidor: convenio + facturas 'En Convenio' +
 * reconexión administrativa + parcialidades, en una sola transacción.
 * Los datos de entrada ya vienen validados por el controller.
 */
export async function crearConvenio({ medidorIdNum, montoInicialNum, numeroParcialidadesNum, periodicidadNormalizada, observaciones, autorizado_por }) {
    // 1. Obtener Cliente y Deuda Total
    const infoQuery = `SELECT cliente_id FROM medidores WHERE id = ?`;
    const infoRes = await db.execute({ sql: infoQuery, args: [medidorIdNum] });

    if (infoRes.rows.length === 0) throw crearError("Medidor no encontrado", 404);
    const cliente_id = infoRes.rows[0].cliente_id;

    const convenioActivoRes = await db.execute({
        sql: `
            SELECT id, estado
            FROM convenios_pago
            WHERE medidor_id = ?
              AND estado IN ('Activo', 'Incumplido')
            ORDER BY id DESC
            LIMIT 1
        `,
        args: [medidorIdNum]
    });

    if (convenioActivoRes.rows.length > 0) {
        const convenioExistente = convenioActivoRes.rows[0];
        throw crearError('Ya existe un convenio activo para este medidor', 409, {
            datos: { convenio_id: Number(convenioExistente.id), estado: convenioExistente.estado }
        });
    }

    // Deuda calculada SOLO para este medidor (no todo el cliente)
    // Evita bloquear facturas de otros medidores del mismo cliente
    const deudaQuery = `
        SELECT SUM(f.saldo_pendiente) as total
        FROM facturas f
        JOIN lecturas l ON f.lectura_id = l.id
        WHERE l.medidor_id = ? AND f.estado NOT IN ('Pagado', 'En Convenio')
    `;
    const deudaRes = await db.execute({ sql: deudaQuery, args: [medidorIdNum] });
    const deudaTotal = Number(deudaRes.rows[0]?.total || 0);

    if (deudaTotal <= 0) throw crearError("El cliente no tiene deuda pendiente para generar convenio", 400);

    // 2. Saldo a diferir = Deuda Total - Monto Inicial
    const saldoDiferir = toMoney(deudaTotal - montoInicialNum);

    if (saldoDiferir < 0) throw crearError("El monto inicial supera la deuda total", 400);

    // 3-6. OPERACIÓN ATÓMICA: convenio + facturas + medidor + parcialidades.
    // Si falla cualquier paso, SQLite hace rollback completo.
    const fechaInicioStr = nowDate();
    const fechaInicio = new Date(fechaInicioStr.replace(/-/g, '/'));
    const mesesSumar = periodicidadNormalizada === 'quincenal' ? Math.ceil(numeroParcialidadesNum / 2) : numeroParcialidadesNum;
    const fechaFin = addMonths(fechaInicio, mesesSumar);
    // Redondear a 2 decimales para evitar acumulación de error flotante en las cuotas
    const montoPorParcialidad = Math.round((saldoDiferir / numeroParcialidadesNum) * 100) / 100;

    let convenioId;
    const parcialidades = [];

    const transaccionConvenio = sqlite.transaction(() => {
        // Insertar convenio
        const r = sqlite.prepare(`
            INSERT INTO convenios_pago (
                cliente_id, medidor_id, monto_total, monto_inicial,
                saldo_restante, numero_parcialidades, periodicidad,
                estado, fecha_inicio, fecha_fin, autorizado_por, observaciones
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo', ?, ?, ?, ?)
        `).run(
            cliente_id, medidorIdNum, deudaTotal, montoInicialNum,
            saldoDiferir, numeroParcialidadesNum, periodicidadNormalizada,
            fechaInicioStr, format(fechaFin, 'yyyy-MM-dd'),
            autorizado_por, observaciones || null
        );
        convenioId = Number(r.lastInsertRowid);

        // Marcar SOLO las facturas de este medidor como 'En Convenio'
        // (no bloquea facturas de otros medidores del mismo cliente)
        sqlite.prepare(`
            UPDATE facturas
            SET convenio_id = ?, estado = 'En Convenio'
            WHERE estado IN ('Pendiente', 'Parcial', 'Vencida')
              AND saldo_pendiente > 0
              AND lectura_id IN (SELECT id FROM lecturas WHERE medidor_id = ?)
        `).run(convenioId, medidorIdNum);

        // Reconectar administrativamente si el medidor estaba cortado
        sqlite.prepare(`
            UPDATE medidores SET estado_servicio = 'Activo'
            WHERE id = ? AND estado_servicio = 'Cortado'
        `).run(medidorIdNum);

        sqlite.prepare(`
            UPDATE cortes_servicio
            SET fecha_reconexion = datetime('now'),
                reconectado_por = COALESCE(reconectado_por, ?),
                observaciones = CASE
                    WHEN observaciones IS NULL OR TRIM(observaciones) = ''
                        THEN 'Reconexión por creación de convenio'
                    ELSE observaciones || ' | Reconexión por creación de convenio'
                END
            WHERE medidor_id = ?
              AND fecha_reconexion IS NULL
        `).run(autorizado_por, medidorIdNum);

        // Insertar todas las parcialidades (reutiliza prepared statement en el loop)
        const stmtParcialidad = sqlite.prepare(`
            INSERT INTO parcialidades_convenio (
                convenio_id, numero_parcialidad, monto_esperado, fecha_vencimiento, estado
            ) VALUES (?, ?, ?, ?, 'Pendiente')
        `);

        for (let i = 1; i <= numeroParcialidadesNum; i++) {
            let fechaVencStr;
            if (periodicidadNormalizada === 'quincenal') {
                // Cada 15 días, ajustando a día hábil
                fechaVencStr = siguienteDiaHabil(calcularVencimiento(i * 15, fechaInicioStr));
            } else {
                // Mensual, ajustando a día hábil
                fechaVencStr = siguienteDiaHabil(format(addMonths(fechaInicio, i), 'yyyy-MM-dd'));
            }
            stmtParcialidad.run(convenioId, i, montoPorParcialidad, fechaVencStr);
            parcialidades.push({ numero: i, monto: montoPorParcialidad, vencimiento: fechaVencStr });
        }
    });

    transaccionConvenio();

    return { convenioId, deudaTotal, saldoDiferir, montoPorParcialidad, parcialidades };
}

/**
 * Paga una parcialidad completa: pago + parcialidad pagada + saldo del convenio
 * (y cierre del convenio si llega a cero), en una sola transacción.
 * Si la parcialidad se pagó en paralelo lanza un Error cuyo mensaje contiene "concurrente".
 */
export async function pagarParcialidad({ parcialidad_id, cantidadEntregada, metodo_pago, comentario, modificado_por }) {
    // 1. Obtener parcialidad y convenio
    const parcialidadQuery = `
        SELECT p.*, c.saldo_restante, c.cliente_id, c.medidor_id, c.estado as convenio_estado
        FROM parcialidades_convenio p
        JOIN convenios_pago c ON p.convenio_id = c.id
        WHERE p.id = ?
    `;
    const parcialidadRes = await db.execute({
        sql: parcialidadQuery,
        args: [parcialidad_id]
    });

    if (parcialidadRes.rows.length === 0) throw crearError('Parcialidad no encontrada', 404);

    const parcialidad = parcialidadRes.rows[0];

    // 2. Validar estado
    if (parcialidad.estado === 'Pagada') {
        throw crearError('Esta parcialidad ya fue pagada', 400, { datos: { fecha_pago: parcialidad.fecha_pago } });
    }

    const estadosConvenioPermitidos = new Set(['Activo', 'Incumplido']);
    if (!estadosConvenioPermitidos.has(parcialidad.convenio_estado)) {
        throw crearError('No se puede registrar pago. El convenio no está activo para cobrar parcialidades', 400, {
            datos: { estado_convenio: parcialidad.convenio_estado || 'Desconocido' }
        });
    }

    // 3. Calcular monto y cambio
    const montoEsperado = Number(parcialidad.monto_esperado);
    if (!Number.isFinite(montoEsperado) || montoEsperado <= 0) {
        throw crearError('La parcialidad tiene un monto esperado inválido', 400);
    }

    if (cantidadEntregada < montoEsperado) {
        throw crearError('La cantidad entregada es menor al monto esperado de la parcialidad', 400, {
            datos: { monto_esperado: montoEsperado, cantidad_entregada: cantidadEntregada }
        });
    }

    const monto = Math.round(montoEsperado * 100) / 100;
    const cambio = Math.round((cantidadEntregada - monto) * 100) / 100;

    console.log(`Pagando parcialidad ${parcialidad_id}: Monto ${monto}, Cambio ${cambio}`);

    // 4-7. OPERACIÓN ATÓMICA: pago + parcialidad + saldo de convenio + cierre.
    // Si falla cualquier paso, SQLite hace rollback completo.
    let pagoId;
    let nuevoSaldo = null;
    let convenioCompletado = false;

    const transaccionPago = sqlite.transaction(() => {
        // Registrar pago vinculado a la parcialidad
        const r = sqlite.prepare(`
            INSERT INTO pagos (parcialidad_id, monto, cantidad_entregada, cambio, metodo_pago, fecha_pago, comentario, modificado_por)
            VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)
        `).run(parcialidad_id, monto, cantidadEntregada, cambio, metodo_pago, comentario || null, modificado_por);
        pagoId = Number(r.lastInsertRowid);

        // Marcar parcialidad como pagada
        const updateParcialidad = sqlite.prepare(`
            UPDATE parcialidades_convenio
            SET estado = 'Pagada', monto_pagado = ?, fecha_pago = datetime('now'), pago_id = ?
            WHERE id = ? AND estado != 'Pagada'
        `).run(monto, pagoId, parcialidad_id);

        if (updateParcialidad.changes === 0) {
            throw new Error('La parcialidad ya fue pagada por otra operación concurrente');
        }

        // Actualizar saldo restante del convenio en forma atómica
        const updateConvenio = sqlite.prepare(`
            UPDATE convenios_pago
            SET saldo_restante = ROUND(
                CASE
                    WHEN saldo_restante - ? <= 0 THEN 0
                    ELSE saldo_restante - ?
                END,
                2
            )
            WHERE id = ?
              AND estado IN ('Activo', 'Incumplido')
        `).run(monto, monto, parcialidad.convenio_id);

        if (updateConvenio.changes === 0) {
            throw new Error('No se pudo actualizar el convenio en estado cobrable');
        }

        const convenioActualizado = sqlite.prepare(`
            SELECT saldo_restante
            FROM convenios_pago
            WHERE id = ?
        `).get(parcialidad.convenio_id);

        nuevoSaldo = toMoney(convenioActualizado?.saldo_restante || 0);
        convenioCompletado = nuevoSaldo <= 0;

        // Si el convenio quedó en cero, cerrarlo y liberar las facturas
        if (convenioCompletado) {
            sqlite.prepare(`
                UPDATE convenios_pago SET estado = 'Finalizado' WHERE id = ?
            `).run(parcialidad.convenio_id);

            sqlite.prepare(`
                UPDATE facturas SET estado = 'Pagado', saldo_pendiente = 0
                WHERE convenio_id = ?
            `).run(parcialidad.convenio_id);
        }
    });

    transaccionPago();

    return { pagoId, monto, cambio, nuevoSaldo, convenioCompletado };
}

/**
 * Resumen de cobro por medidor: próxima factura pendiente (fuera de convenio) +
 * próxima parcialidad de convenio, con el total sugerido a cobrar.
 */
export async function obtenerResumenCobroMedidor(medidor_id) {
    const medidorRes = await db.execute({
        sql: `
            SELECT m.id, m.numero_serie, m.estado_servicio, c.id as cliente_id, c.nombre as cliente_nombre
            FROM medidores m
            JOIN clientes c ON c.id = m.cliente_id
            WHERE m.id = ?
        `,
        args: [medidor_id]
    });

    if (medidorRes.rows.length === 0) throw crearError('Medidor no encontrado', 404);

    const medidor = medidorRes.rows[0];

    const facturaRes = await db.execute({
        sql: `
            SELECT f.id, f.fecha_emision, f.fecha_vencimiento, f.total, f.saldo_pendiente, f.estado
            FROM facturas f
            JOIN lecturas l ON l.id = f.lectura_id
            WHERE l.medidor_id = ?
              AND f.saldo_pendiente > 0
              AND f.convenio_id IS NULL
              AND f.estado IN ('Pendiente', 'Parcial', 'Vencida')
            ORDER BY f.fecha_vencimiento ASC, f.id ASC
            LIMIT 1
        `,
        args: [medidor_id]
    });

    const totalFacturasRes = await db.execute({
        sql: `
            SELECT COALESCE(SUM(f.saldo_pendiente), 0) as total
            FROM facturas f
            JOIN lecturas l ON l.id = f.lectura_id
            WHERE l.medidor_id = ?
              AND f.saldo_pendiente > 0
              AND f.convenio_id IS NULL
              AND f.estado IN ('Pendiente', 'Parcial', 'Vencida')
        `,
        args: [medidor_id]
    });

    const convenioRes = await db.execute({
        sql: `
            SELECT id, estado, saldo_restante, numero_parcialidades, periodicidad
            FROM convenios_pago
            WHERE medidor_id = ? AND estado IN ('Activo', 'Incumplido')
            ORDER BY id DESC
            LIMIT 1
        `,
        args: [medidor_id]
    });

    let convenio = null;
    let siguienteParcialidad = null;
    let totalParcialidadesPendientes = 0;

    if (convenioRes.rows.length > 0) {
        convenio = convenioRes.rows[0];

        const parcialidadRes = await db.execute({
            sql: `
                SELECT id, numero_parcialidad, monto_esperado, fecha_vencimiento, estado
                FROM parcialidades_convenio
                WHERE convenio_id = ? AND estado IN ('Pendiente', 'Vencida')
                ORDER BY numero_parcialidad ASC
                LIMIT 1
            `,
            args: [convenio.id]
        });

        const totalParcialidadesRes = await db.execute({
            sql: `
                SELECT COALESCE(SUM(monto_esperado), 0) as total
                FROM parcialidades_convenio
                WHERE convenio_id = ? AND estado IN ('Pendiente', 'Vencida')
            `,
            args: [convenio.id]
        });

        if (parcialidadRes.rows.length > 0) {
            siguienteParcialidad = parcialidadRes.rows[0];
        }

        totalParcialidadesPendientes = toMoney(totalParcialidadesRes.rows[0]?.total || 0);
    }

    const facturaActual = facturaRes.rows[0] || null;
    const saldoFacturaActual = toMoney(facturaActual?.saldo_pendiente || 0);
    const montoParcialidadSiguiente = toMoney(siguienteParcialidad?.monto_esperado || 0);
    const totalSugerido = toMoney(saldoFacturaActual + montoParcialidadSiguiente);

    return {
        medidor: {
            id: Number(medidor.id),
            numero_serie: medidor.numero_serie,
            estado_servicio: medidor.estado_servicio,
            cliente_id: Number(medidor.cliente_id),
            cliente_nombre: medidor.cliente_nombre
        },
        factura_actual: facturaActual ? {
            id: Number(facturaActual.id),
            fecha_emision: facturaActual.fecha_emision,
            fecha_vencimiento: facturaActual.fecha_vencimiento,
            total: toMoney(facturaActual.total),
            saldo_pendiente: saldoFacturaActual,
            estado: facturaActual.estado
        } : null,
        convenio: convenio ? {
            id: Number(convenio.id),
            estado: convenio.estado,
            saldo_restante: toMoney(convenio.saldo_restante),
            numero_parcialidades: Number(convenio.numero_parcialidades),
            periodicidad: convenio.periodicidad,
            siguiente_parcialidad: siguienteParcialidad ? {
                id: Number(siguienteParcialidad.id),
                numero_parcialidad: Number(siguienteParcialidad.numero_parcialidad),
                monto_esperado: montoParcialidadSiguiente,
                fecha_vencimiento: siguienteParcialidad.fecha_vencimiento,
                estado: siguienteParcialidad.estado
            } : null,
            total_parcialidades_pendientes: totalParcialidadesPendientes
        } : null,
        sugerencia_cobro: {
            monto_factura: saldoFacturaActual,
            monto_convenio: montoParcialidadSiguiente,
            total: totalSugerido
        },
        resumen: {
            saldo_facturas_pendientes_no_convenio: toMoney(totalFacturasRes.rows[0]?.total || 0),
            saldo_convenio_pendiente: toMoney(convenio?.saldo_restante || 0)
        }
    };
}

/**
 * Pago integrado: factura del periodo (opcional) + parcialidades completas del convenio,
 * en una sola transacción. Los errores se lanzan como { statusCode, error, ... }.
 */
export function pagarIntegrado({ convenioIdNum, facturaIdNum, monto_factura, monto_convenio, cantidadEntregadaNum, metodo_pago, comentario, modificado_por }) {
    return sqlite.transaction(() => {
        const convenio = sqlite.prepare(`
            SELECT id, medidor_id, estado, saldo_restante
            FROM convenios_pago
            WHERE id = ?
        `).get(convenioIdNum);

        if (!convenio) {
            throw { statusCode: 404, error: 'Convenio no encontrado' };
        }

        if (!['Activo', 'Incumplido'].includes(convenio.estado)) {
            throw {
                statusCode: 400,
                error: 'El convenio no está en estado cobrable',
                estado_convenio: convenio.estado
            };
        }

        let montoFacturaAplicado = 0;
        let montoConvenioAplicado = 0;
        const pagosFactura = [];
        const parcialidadesPagadas = [];

        // 1) Planificar y registrar pago a factura del periodo (opcional)
        if (facturaIdNum) {
            const factura = sqlite.prepare(`
                SELECT f.id, f.saldo_pendiente, f.estado, f.convenio_id
                FROM facturas f
                JOIN lecturas l ON l.id = f.lectura_id
                WHERE f.id = ? AND l.medidor_id = ?
            `).get(facturaIdNum, convenio.medidor_id);

            if (!factura) {
                throw {
                    statusCode: 404,
                    error: 'Factura no encontrada para el medidor del convenio'
                };
            }

            if (factura.convenio_id !== null) {
                throw {
                    statusCode: 400,
                    error: 'La factura seleccionada pertenece al convenio y no debe cobrarse como factura independiente',
                    factura_id: facturaIdNum,
                    convenio_id: factura.convenio_id
                };
            }

            const saldoFactura = toMoney(factura.saldo_pendiente);
            if (saldoFactura <= 0) {
                throw {
                    statusCode: 400,
                    error: 'La factura seleccionada no tiene saldo pendiente',
                    factura_id: facturaIdNum
                };
            }

            const montoFacturaSolicitado = monto_factura == null
                ? saldoFactura
                : toMoney(monto_factura);

            if (montoFacturaSolicitado <= 0) {
                throw {
                    statusCode: 400,
                    error: 'monto_factura debe ser mayor a 0 cuando se envía factura_id'
                };
            }

            montoFacturaAplicado = toMoney(Math.min(saldoFactura, montoFacturaSolicitado));
        }

        // 2) Determinar monto destinado a convenio
        const remanenteDespuesFactura = toMoney(cantidadEntregadaNum - montoFacturaAplicado);
        const montoConvenioSolicitado = monto_convenio == null
            ? remanenteDespuesFactura
            : toMoney(monto_convenio);

        if (montoConvenioSolicitado < 0) {
            throw { statusCode: 400, error: 'monto_convenio no puede ser negativo' };
        }

        const parcialidadesPendientes = sqlite.prepare(`
            SELECT id, numero_parcialidad, monto_esperado, estado
            FROM parcialidades_convenio
            WHERE convenio_id = ?
              AND estado IN ('Pendiente', 'Vencida')
            ORDER BY numero_parcialidad ASC
        `).all(convenioIdNum);

        if (montoConvenioSolicitado > 0 && parcialidadesPendientes.length === 0) {
            throw {
                statusCode: 400,
                error: 'No hay parcialidades pendientes para aplicar pago de convenio'
            };
        }

        // 3) Planificar parcialidades completas (sin subpago de cuota)
        let restanteConvenio = montoConvenioSolicitado;
        const parcialidadesAProcesar = [];
        for (const parcialidad of parcialidadesPendientes) {
            const cuota = toMoney(parcialidad.monto_esperado);
            if (restanteConvenio >= cuota && cuota > 0) {
                parcialidadesAProcesar.push({
                    id: Number(parcialidad.id),
                    numero_parcialidad: Number(parcialidad.numero_parcialidad),
                    monto_esperado: cuota,
                    estado: parcialidad.estado
                });
                restanteConvenio = toMoney(restanteConvenio - cuota);
            } else {
                break;
            }
        }

        if (restanteConvenio > 0) {
            throw {
                statusCode: 400,
                error: 'El monto para convenio debe cubrir parcialidades completas. Ajuste el monto al múltiplo de cuota pendiente.',
                sobrante_no_aplicable: restanteConvenio
            };
        }

        montoConvenioAplicado = toMoney(
            parcialidadesAProcesar.reduce((acc, p) => acc + p.monto_esperado, 0)
        );

        const totalAplicado = toMoney(montoFacturaAplicado + montoConvenioAplicado);
        if (totalAplicado <= 0) {
            throw {
                statusCode: 400,
                error: 'No hay monto aplicable. Envíe factura_id/monto_factura o monto_convenio válido.'
            };
        }

        if (cantidadEntregadaNum < totalAplicado) {
            throw {
                statusCode: 400,
                error: 'La cantidad entregada es menor al total aplicado',
                cantidad_entregada: cantidadEntregadaNum,
                total_aplicado: totalAplicado
            };
        }

        // 4) Aplicar pago a factura (si corresponde)
        if (facturaIdNum && montoFacturaAplicado > 0) {
            const insertPagoFactura = sqlite.prepare(`
                INSERT INTO pagos (factura_id, monto, cantidad_entregada, cambio, metodo_pago, fecha_pago, comentario, modificado_por)
                VALUES (?, ?, ?, 0, ?, datetime('now'), ?, ?)
            `).run(
                facturaIdNum,
                montoFacturaAplicado,
                montoFacturaAplicado,
                metodo_pago,
                comentario || null,
                modificado_por
            );

            pagosFactura.push({
                pago_id: Number(insertPagoFactura.lastInsertRowid),
                factura_id: facturaIdNum,
                monto_aplicado: montoFacturaAplicado
            });

            const facturaActualizada = sqlite.prepare(`
                SELECT saldo_pendiente FROM facturas WHERE id = ?
            `).get(facturaIdNum);

            const nuevoSaldoFactura = toMoney(facturaActualizada?.saldo_pendiente || 0);
            sqlite.prepare(`
                UPDATE facturas
                SET estado = ?
                WHERE id = ?
            `).run(estadoFacturaDesdeSaldo(nuevoSaldoFactura), facturaIdNum);
        }

        // 5) Aplicar pagos a parcialidades de convenio
        const insertPagoParcialidadStmt = sqlite.prepare(`
            INSERT INTO pagos (parcialidad_id, monto, cantidad_entregada, cambio, metodo_pago, fecha_pago, comentario, modificado_por)
            VALUES (?, ?, ?, 0, ?, datetime('now'), ?, ?)
        `);

        const updateParcialidadStmt = sqlite.prepare(`
            UPDATE parcialidades_convenio
            SET estado = 'Pagada', monto_pagado = ?, fecha_pago = datetime('now'), pago_id = ?
            WHERE id = ? AND estado != 'Pagada'
        `);

        for (const parcialidad of parcialidadesAProcesar) {
            const insertPago = insertPagoParcialidadStmt.run(
                parcialidad.id,
                parcialidad.monto_esperado,
                parcialidad.monto_esperado,
                metodo_pago,
                comentario || null,
                modificado_por
            );

            const pagoId = Number(insertPago.lastInsertRowid);
            const updateParcialidad = updateParcialidadStmt.run(
                parcialidad.monto_esperado,
                pagoId,
                parcialidad.id
            );

            if (updateParcialidad.changes === 0) {
                throw {
                    statusCode: 409,
                    error: 'Una parcialidad ya fue pagada por otra operación concurrente',
                    parcialidad_id: parcialidad.id
                };
            }

            parcialidadesPagadas.push({
                parcialidad_id: parcialidad.id,
                numero_parcialidad: parcialidad.numero_parcialidad,
                monto_aplicado: parcialidad.monto_esperado,
                pago_id: pagoId
            });
        }

        // 6) Actualizar saldo/estado del convenio
        if (montoConvenioAplicado > 0) {
            const nuevoSaldoConvenio = toMoney(toMoney(convenio.saldo_restante) - montoConvenioAplicado);

            sqlite.prepare(`
                UPDATE convenios_pago
                SET saldo_restante = ?, estado = ?
                WHERE id = ?
            `).run(
                nuevoSaldoConvenio,
                nuevoSaldoConvenio <= 0 ? 'Finalizado' : 'Activo',
                convenioIdNum
            );

            if (nuevoSaldoConvenio <= 0) {
                sqlite.prepare(`
                    UPDATE facturas
                    SET estado = 'Pagado', saldo_pendiente = 0
                    WHERE convenio_id = ?
                `).run(convenioIdNum);
            }
        }

        const convenioActualizado = sqlite.prepare(`
            SELECT id, estado, saldo_restante
            FROM convenios_pago
            WHERE id = ?
        `).get(convenioIdNum);

        const cambioTotal = toMoney(cantidadEntregadaNum - totalAplicado);

        return {
            mensaje: 'Pago integrado aplicado exitosamente',
            convenio_id: convenioIdNum,
            total_aplicado: totalAplicado,
            cantidad_entregada: cantidadEntregadaNum,
            cambio: cambioTotal,
            desglose: {
                factura: {
                    aplicada: montoFacturaAplicado > 0,
                    total_aplicado: montoFacturaAplicado,
                    pagos: pagosFactura
                },
                convenio: {
                    aplicada: montoConvenioAplicado > 0,
                    total_aplicado: montoConvenioAplicado,
                    parcialidades_pagadas: parcialidadesPagadas.length,
                    parcialidades: parcialidadesPagadas
                }
            },
            convenio_estado: {
                estado: convenioActualizado?.estado,
                saldo_restante: toMoney(convenioActualizado?.saldo_restante || 0)
            }
        };
    })();
}

/** Convenio con sus parcialidades y progreso de pago. */
export async function obtenerConvenio(id) {
    const convenioQuery = `
        SELECT c.*, cl.nombre as cliente_nombre, m.numero_serie
        FROM convenios_pago c
        JOIN clientes cl ON c.cliente_id = cl.id
        JOIN medidores m ON c.medidor_id = m.id
        WHERE c.id = ?
    `;
    const convenioRes = await db.execute({ sql: convenioQuery, args: [id] });

    if (convenioRes.rows.length === 0) throw crearError('Convenio no encontrado', 404);

    const convenio = convenioRes.rows[0];

    const parcialidadesQuery = `
        SELECT * FROM parcialidades_convenio
        WHERE convenio_id = ?
        ORDER BY numero_parcialidad ASC
    `;
    const parcialidadesRes = await db.execute({
        sql: parcialidadesQuery,
        args: [id]
    });

    // Calcular progreso
    const totalPagado = Number(convenio.monto_total) - Number(convenio.saldo_restante);
    const porcentaje = (totalPagado / Number(convenio.monto_total)) * 100;

    return {
        convenio: {
            ...convenio,
            id: Number(convenio.id),
            cliente_id: Number(convenio.cliente_id),
            medidor_id: Number(convenio.medidor_id)
        },
        parcialidades: parcialidadesRes.rows.map(p => ({
            ...p,
            id: Number(p.id),
            convenio_id: Number(p.convenio_id)
        })),
        progreso: {
            total: Number(convenio.monto_total),
            pagado: totalPagado,
            pendiente: Number(convenio.saldo_restante),
            porcentaje: Math.round(porcentaje * 100) / 100
        }
    };
}
