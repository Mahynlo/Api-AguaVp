/**
 * Integration Tests: Flujo Completo del Sistema de Deudores
 * 
 * Descripción:
 * Prueba el flujo end-to-end del sistema de deudores:
 * 1. Crear facturas vencidas
 * 2. Detectar candidatos a corte
 * 3. Crear convenio
 * 4. Verificar que convenio protege de corte
 * 5. Incumplir convenio
 * 6. Verificar que vuelve a ser candidato
 * 7. Ejecutar corte
 * 8. Procesar reconexión
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock de dbTurso
const mockExecute = jest.fn();
const mockDbTurso = {
    execute: mockExecute
};

jest.unstable_mockModule('../../database/db-sqlite.js', () => ({
    default: mockDbTurso
}));

// Importar después de mockear
const { default: cortesController } = await import('../../v2/controllers/cortesController.js');
const { default: conveniosController } = await import('../../v2/controllers/conveniosController.js');

describe('Flujo Completo: Sistema de Deudores', () => {
    let app;
    let mockReq;
    let mockRes;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock de request y response
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

    describe('Escenario 1: Cliente con 5 facturas vencidas → Candidato a Corte', () => {
        it('debe detectar cliente como candidato a corte', async () => {
            // Mock: Configuración
            mockExecute.mockResolvedValueOnce({
                rows: [{ facturas_para_corte: 4, dias_gracia: 7 }]
            });

            // Mock: 1 medidor con 5 facturas vencidas
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    medidor_id: 1,
                    numero_serie: 'MED-001',
                    estado_servicio: 'Activo',
                    cliente_id: 1,
                    cliente_nombre: 'Juan Pérez',
                    direccion: 'Calle 123',
                    facturas_vencidas: 5,
                    deuda_total: 2500,
                    fecha_vencimiento_mas_antigua: '2025-12-01'
                }]
            });

            await cortesController.detectarCandidatosCorte(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    umbral_corte: 4,
                    dias_gracia: 7,
                    total_candidatos: 1,
                    candidatos: expect.arrayContaining([
                        expect.objectContaining({
                            medidor: expect.objectContaining({
                                id: 1,
                                serial: 'MED-001'
                            }),
                            deuda: expect.objectContaining({
                                facturas_vencidas: 5,
                                total: 2500
                            })
                        })
                    ])
                })
            );
        });
    });

    describe('Escenario 2: Ejecutar Corte de Servicio', () => {
        it('debe ejecutar corte correctamente', async () => {
            mockReq.body = {
                medidor_id: 1,
                motivo: 'Deuda acumulada - 5 facturas vencidas',
                observaciones: 'Cliente notificado previamente'
            };

            // Mock: Obtener medidor
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    cliente_id: 1,
                    estado_servicio: 'Activo'
                }]
            });

            // Mock: Insertar corte
            mockExecute.mockResolvedValueOnce({
                lastInsertRowid: 1
            });

            // Mock: Actualizar medidor
            mockExecute.mockResolvedValueOnce({});

            await cortesController.ejecutarCorte(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Corte ejecutado correctamente',
                    medidor_id: 1
                })
            );

            // Verificar que se actualizó el estado del medidor
            expect(mockExecute).toHaveBeenCalledWith(
                expect.objectContaining({
                    sql: expect.stringContaining("UPDATE medidores"),
                    args: [1]
                })
            );
        });

        it('debe rechazar corte si medidor ya está cortado', async () => {
            mockReq.body = {
                medidor_id: 1,
                motivo: 'Deuda'
            };

            mockExecute.mockResolvedValueOnce({
                rows: [{
                    cliente_id: 1,
                    estado_servicio: 'Cortado'
                }]
            });

            await cortesController.ejecutarCorte(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'El servicio ya se encuentra cortado'
                })
            );
        });
    });

    describe('Escenario 3: Crear Convenio de Pago', () => {
        it('debe crear convenio y generar parcialidades automáticamente', async () => {
            mockReq.body = {
                medidor_id: 1,
                monto_inicial: 500,
                numero_parcialidades: 8,
                periodicidad: 'mensual',
                observaciones: 'Cliente solicita convenio'
            };

            // Mock: Obtener medidor
            mockExecute.mockResolvedValueOnce({
                rows: [{ cliente_id: 1 }]
            });

            // Mock: Obtener deuda
            mockExecute.mockResolvedValueOnce({
                rows: [{ total: 2500 }]
            });

            // Mock: Insertar convenio
            mockExecute.mockResolvedValueOnce({
                lastInsertRowid: 1
            });

            // Mock: Verificar estado medidor
            mockExecute.mockResolvedValueOnce({
                rows: [{ estado_servicio: 'Cortado' }]
            });

            // Mock: Actualizar medidor a Activo
            mockExecute.mockResolvedValueOnce({});

            // Mock: 8 inserts de parcialidades
            for (let i = 0; i < 8; i++) {
                mockExecute.mockResolvedValueOnce({});
            }

            await conveniosController.crearConvenio(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    convenio_id: 1,
                    detalle: expect.objectContaining({
                        deuda_original: 2500,
                        pago_inicial: 500,
                        saldo_diferido: 2000,
                        cuotas: 8,
                        monto_por_cuota: 250
                    }),
                    parcialidades: expect.arrayContaining([
                        expect.objectContaining({
                            numero: 1,
                            monto: 250
                        })
                    ])
                })
            );

            // Verificar que se crearon 8 parcialidades
            const parcialidadInserts = mockExecute.mock.calls.filter(
                call => call[0].sql.includes('INSERT INTO parcialidades_convenio')
            );
            expect(parcialidadInserts).toHaveLength(8);
        });

        it('debe rechazar convenio si no hay deuda', async () => {
            mockReq.body = {
                medidor_id: 1,
                monto_inicial: 500,
                numero_parcialidades: 8
            };

            mockExecute.mockResolvedValueOnce({
                rows: [{ cliente_id: 1 }]
            });

            mockExecute.mockResolvedValueOnce({
                rows: [{ total: 0 }]
            });

            await conveniosController.crearConvenio(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.stringContaining('no tiene deuda')
                })
            );
        });
    });

    describe('Escenario 4: Cliente con Convenio NO es Candidato a Corte', () => {
        it('debe excluir medidores con convenio activo', async () => {
            mockExecute.mockResolvedValueOnce({
                rows: [{ facturas_para_corte: 4, dias_gracia: 7 }]
            });

            // Mock: Sin candidatos (convenio activo los excluye)
            mockExecute.mockResolvedValueOnce({
                rows: []
            });

            await cortesController.detectarCandidatosCorte(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    total_candidatos: 0,
                    candidatos: []
                })
            );

            // Verificar que la query excluye convenios activos
            const detectarQuery = mockExecute.mock.calls[1][0];
            expect(detectarQuery.sql).toContain("cp.estado = 'Activo'");
            expect(detectarQuery.sql).toContain('cp.id IS NULL');
        });
    });

    describe('Escenario 5: Reconexión después de Pago', () => {
        it('debe procesar reconexión correctamente', async () => {
            mockReq.body = {
                medidor_id: 1,
                observaciones: 'Cliente pagó deuda completa'
            };

            // Mock: Obtener medidor cortado
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    cliente_id: 1,
                    estado_servicio: 'Cortado'
                }]
            });

            // Mock: Verificar que no hay deuda
            mockExecute.mockResolvedValueOnce({
                rows: [{ total: 0 }]
            });

            // Mock: Verificar convenios activos
            mockExecute.mockResolvedValueOnce({
                rows: []
            });

            // Mock: Actualizar medidor a Activo
            mockExecute.mockResolvedValueOnce({});

            // Mock: Registrar reconexión en cortes_servicio
            mockExecute.mockResolvedValueOnce({});

            await cortesController.procesarReconexion(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringContaining('Reconexión autorizada')
                })
            );
        });
    });
});

describe('Validaciones de Período de Gracia', () => {
    let mockReq, mockRes;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = { params: {}, query: {}, body: {}, usuario: { id: 1 } };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
    });

    it('debe aplicar período de gracia de 7 días', async () => {
        mockExecute.mockResolvedValueOnce({
            rows: [{ facturas_para_corte: 4, dias_gracia: 7 }]
        });

        mockExecute.mockResolvedValueOnce({
            rows: []
        });

        await cortesController.detectarCandidatosCorte(mockReq, mockRes);

        // Verificar que la query usa días de gracia
        const candidatosCall = mockExecute.mock.calls.find(
            call => call[0].sql && call[0].sql.includes('date(')
        );

        expect(candidatosCall).toBeDefined();
        expect(candidatosCall[0].sql).toContain("date('now', '-' || ? || ' days')");
        expect(candidatosCall[0].args[0]).toBe(7);
    });
});
