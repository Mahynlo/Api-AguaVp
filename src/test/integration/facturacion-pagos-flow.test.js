/**
 * Integration Tests: Flujo de Facturación y Pagos
 * 
 * Descripción:
 * Prueba el flujo end-to-end de facturación y pagos:
 * 1. Generar factura desde lectura
 * 2. Registrar pago completo
 * 3. Registrar pago parcial
 * 4. Actualizar estado de factura
 * 5. Validar cálculos de saldos
 * 6. Verificar cambios de estado automáticos
 */

import { jest } from '@jest/globals';

// Mock de dbTurso
const mockExecute = jest.fn();
const mockDbTurso = {
    execute: mockExecute
};

jest.unstable_mockModule('../../database/db-sqlite.js', () => ({
    default: mockDbTurso
}));

// Importar después de mockear
const { default: facturasController } = await import('../../v2/controllers/facturasController.js');
const { default: pagosController } = await import('../../v2/controllers/pagosController.js');

describe('Flujo Completo: Facturación y Pagos', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        jest.clearAllMocks();

        mockReq = {
            params: {},
            query: {},
            body: {},
            usuario: { id: 1 }
        };

        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
    });

    describe('Escenario 1: Generar Factura desde Lectura', () => {
        it('debe generar factura correctamente con cálculo de consumo', async () => {
            mockReq.body = {
                lectura_id: 1,
                cliente_id: 1,
                tarifa_id: 1,
                consumo_m3: 25,
                fecha_emision: '2026-01-15',
                modificado_por: 1
            };

            // Mock: Obtener lectura
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    consumo_m3: 25,
                    periodo: '2026-01',
                    medidor_id: 1
                }]
            });

            // Mock: Obtener rangos de tarifa
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    consumo_min: 0,
                    consumo_max: 50,
                    precio_por_m3: 15.50
                }]
            });

            // Mock: Insertar factura
            mockExecute.mockResolvedValueOnce({
                lastInsertRowid: 1
            });

            // Mock: Obtener factura completa
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    cliente_nombre: 'Juan Pérez',
                    tarifa_nombre: 'Residencial',
                    consumo_m3: 25,
                    periodo: '2026-01',
                    medidor_numero: 'MED-001',
                    total: 387.50,
                    fecha_emision: '2026-01-15',
                    fecha_vencimiento: '2026-02-14'
                }]
            });

            await facturasController.generarFactura(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensaje: 'Factura generada exitosamente',
                    factura_id: 1,
                    total_calculado: 387.50,
                    detalles: expect.objectContaining({
                        consumo_m3: 25,
                        total: 387.50
                    })
                })
            );
        });

        it('debe calcular fecha de vencimiento correctamente (30 días)', async () => {
            mockReq.body = {
                lectura_id: 1,
                cliente_id: 1,
                tarifa_id: 1,
                consumo_m3: 20,
                fecha_emision: '2026-01-15'
            };

            mockExecute
                .mockResolvedValueOnce({ rows: [{ consumo_m3: 20, periodo: '2026-01' }] })
                .mockResolvedValueOnce({ rows: [{ precio_por_m3: 15 }] })
                .mockResolvedValueOnce({ lastInsertRowid: 1 })
                .mockResolvedValueOnce({
                    rows: [{
                        fecha_emision: '2026-01-15',
                        fecha_vencimiento: '2026-02-14'
                    }]
                });

            await facturasController.generarFactura(mockReq, mockRes);

            // Verificar que se insertó con fecha_vencimiento correcta
            const insertCall = mockExecute.mock.calls.find(
                call => call[0].sql && call[0].sql.includes('INSERT INTO facturas')
            );

            expect(insertCall).toBeDefined();
            // La fecha de vencimiento debe ser 30 días después
            expect(insertCall[0].args).toContain('2026-02-14');
        });
    });

    describe('Escenario 2: Pago Completo de Factura', () => {
        it('debe registrar pago y actualizar factura a Pagado', async () => {
            mockReq.body = {
                factura_id: 1,
                monto: 387.50,
                metodo_pago: 'Efectivo',
                fecha_pago: '2026-01-20',
                cantidad_entregada: 400,
                cambio: 12.50,
                modificado_por: 1
            };

            // Mock: Obtener factura
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    total: 387.50,
                    saldo_pendiente: 387.50,
                    estado: 'Pendiente'
                }]
            });

            // Mock: Insertar pago
            mockExecute.mockResolvedValueOnce({
                lastInsertRowid: 1
            });

            // Mock: Actualizar factura (saldo = 0, estado = Pagado)
            mockExecute.mockResolvedValueOnce({});

            await pagosController.registrarPago(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensaje: 'Pago registrado exitosamente',
                    pago_id: 1,
                    nuevo_saldo: 0,
                    estado_factura: 'Pagado'
                })
            );

            // Verificar que se actualizó la factura
            const updateCall = mockExecute.mock.calls.find(
                call => call[0].sql && call[0].sql.includes('UPDATE facturas')
            );
            expect(updateCall).toBeDefined();
            expect(updateCall[0].args).toContain(0); // Saldo = 0
            expect(updateCall[0].args).toContain('Pagado');
        });
    });

    describe('Escenario 3: Pago Parcial de Factura', () => {
        it('debe registrar pago parcial y actualizar estado a Parcial', async () => {
            mockReq.body = {
                factura_id: 1,
                monto: 200,
                metodo_pago: 'Transferencia',
                fecha_pago: '2026-01-20',
                cantidad_entregada: 200,
                modificado_por: 1
            };

            // Mock: Obtener factura
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    total: 387.50,
                    saldo_pendiente: 387.50,
                    estado: 'Pendiente'
                }]
            });

            // Mock: Insertar pago
            mockExecute.mockResolvedValueOnce({
                lastInsertRowid: 1
            });

            // Mock: Actualizar factura (saldo = 187.50, estado = Parcial)
            mockExecute.mockResolvedValueOnce({});

            await pagosController.registrarPago(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensaje: 'Pago registrado exitosamente',
                    nuevo_saldo: 187.50,
                    estado_factura: 'Parcial'
                })
            );
        });

        it('debe completar factura con segundo pago parcial', async () => {
            mockReq.body = {
                factura_id: 1,
                monto: 187.50,
                metodo_pago: 'Efectivo',
                fecha_pago: '2026-01-25',
                cantidad_entregada: 187.50,
                modificado_por: 1
            };

            // Mock: Obtener factura con saldo parcial
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    total: 387.50,
                    saldo_pendiente: 187.50,
                    estado: 'Parcial'
                }]
            });

            // Mock: Insertar pago
            mockExecute.mockResolvedValueOnce({
                lastInsertRowid: 2
            });

            // Mock: Actualizar factura (saldo = 0, estado = Pagado)
            mockExecute.mockResolvedValueOnce({});

            await pagosController.registrarPago(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    nuevo_saldo: 0,
                    estado_factura: 'Pagado'
                })
            );
        });
    });

    describe('Escenario 4: Validaciones de Pagos', () => {
        it('debe rechazar pago mayor al saldo pendiente', async () => {
            mockReq.body = {
                factura_id: 1,
                monto: 500,
                metodo_pago: 'Efectivo',
                fecha_pago: '2026-01-20',
                cantidad_entregada: 500,
                modificado_por: 1
            };

            mockExecute.mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    total: 387.50,
                    saldo_pendiente: 387.50
                }]
            });

            await pagosController.registrarPago(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.stringContaining('excede el saldo')
                })
            );
        });

        it('debe rechazar pago en factura ya pagada', async () => {
            mockReq.body = {
                factura_id: 1,
                monto: 100,
                metodo_pago: 'Efectivo',
                fecha_pago: '2026-01-20',
                cantidad_entregada: 100,
                modificado_por: 1
            };

            mockExecute.mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    total: 387.50,
                    saldo_pendiente: 0,
                    estado: 'Pagado'
                }]
            });

            await pagosController.registrarPago(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.stringContaining('ya está pagada')
                })
            );
        });

        it('debe rechazar monto negativo o cero', async () => {
            mockReq.body = {
                factura_id: 1,
                monto: 0,
                metodo_pago: 'Efectivo',
                fecha_pago: '2026-01-20',
                cantidad_entregada: 0,
                modificado_por: 1
            };

            mockExecute.mockResolvedValueOnce({
                rows: [{
                    saldo_pendiente: 387.50
                }]
            });

            await pagosController.registrarPago(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('Escenario 5: Consultar Facturas con Filtros', () => {
        it('debe obtener facturas por período', async () => {
            mockReq.query = {
                periodo: '2026-01'
            };

            mockExecute.mockResolvedValueOnce({
                rows: [
                    {
                        id: 1,
                        cliente_nombre: 'Juan Pérez',
                        total: 387.50,
                        saldo_pendiente: 0,
                        estado: 'Pagado',
                        periodo: '2026-01'
                    },
                    {
                        id: 2,
                        cliente_nombre: 'María López',
                        total: 450,
                        saldo_pendiente: 450,
                        estado: 'Pendiente',
                        periodo: '2026-01'
                    }
                ]
            });

            await facturasController.obtenerFacturas(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    facturas: expect.arrayContaining([
                        expect.objectContaining({
                            periodo: '2026-01'
                        })
                    ])
                })
            );
        });
    });

    describe('Escenario 6: Historial de Pagos de una Factura', () => {
        it('debe obtener todos los pagos de una factura', async () => {
            mockReq.params = { id: 1 };

            // Mock: Obtener pagos
            mockExecute.mockResolvedValueOnce({
                rows: [
                    {
                        id: 1,
                        monto: 200,
                        metodo_pago: 'Transferencia',
                        fecha_pago: '2026-01-20'
                    },
                    {
                        id: 2,
                        monto: 187.50,
                        metodo_pago: 'Efectivo',
                        fecha_pago: '2026-01-25'
                    }
                ]
            });

            await pagosController.obtenerPagosPorFactura(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    pagos: expect.arrayContaining([
                        expect.objectContaining({
                            monto: 200
                        }),
                        expect.objectContaining({
                            monto: 187.50
                        })
                    ]),
                    total_pagado: 387.50
                })
            );
        });
    });
});

describe('Validaciones de Cálculos', () => {
    let mockReq, mockRes;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = { params: {}, query: {}, body: {}, usuario: { id: 1 } };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
    });

    it('debe calcular correctamente el total con múltiples rangos de tarifa', async () => {
        mockReq.body = {
            lectura_id: 1,
            cliente_id: 1,
            tarifa_id: 1,
            consumo_m3: 75,
            fecha_emision: '2026-01-15'
        };

        // Mock: Lectura con consumo alto
        mockExecute.mockResolvedValueOnce({
            rows: [{ consumo_m3: 75 }]
        });

        // Mock: Rangos escalonados
        mockExecute.mockResolvedValueOnce({
            rows: [
                { consumo_min: 0, consumo_max: 50, precio_por_m3: 10 },
                { consumo_min: 51, consumo_max: 100, precio_por_m3: 15 }
            ]
        });

        mockExecute.mockResolvedValueOnce({ lastInsertRowid: 1 });
        mockExecute.mockResolvedValueOnce({
            rows: [{
                total: 875 // 50*10 + 25*15 = 500 + 375 = 875
            }]
        });

        await facturasController.generarFactura(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                total_calculado: 875
            })
        );
    });
});
