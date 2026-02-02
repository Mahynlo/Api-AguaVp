/**
 * Unit Tests: procesarDeudores.js
 * 
 * Descripción:
 * - Prueba la lógica del job de análisis de cartera
 * - Verifica que funcione en modo LOCAL y SERVER
 * - Mockea la base de datos Turso
 */

import { jest } from '@jest/globals';

// Mock de dbTurso
const mockExecute = jest.fn();
const mockDbTurso = {
    execute: mockExecute
};

// Mock de node-cron
const mockSchedule = jest.fn();
const mockCron = {
    schedule: mockSchedule
};

// Mock de setTimeout global
global.setTimeout = jest.fn((callback, delay) => {
    // Ejecutar inmediatamente en tests
    callback();
    return 1;
});

// Importar módulo con mocks
jest.unstable_mockModule('../../../database/db-sqlite.js', () => ({
    default: mockDbTurso
}));

jest.unstable_mockModule('node-cron', () => ({
    default: mockCron
}));

const { analizarCarteraVencida, initDeudoresJob } = await import('../../../jobs/procesarDeudores.js');

describe('procesarDeudores - Análisis de Cartera', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('analizarCarteraVencida', () => {
        it('debe analizar la cartera y retornar candidatos y deuda', async () => {
            // Mock de respuestas de la BD
            mockExecute
                .mockResolvedValueOnce({ // Configuración
                    rows: [{ facturas_para_corte: 3 }]
                })
                .mockResolvedValueOnce({ // Candidatos
                    rows: [{ total: 5 }]
                })
                .mockResolvedValueOnce({ // Deuda total
                    rows: [{ total: 15000 }]
                });

            const resultado = await analizarCarteraVencida();

            expect(resultado).toEqual({
                numCandidatos: 5,
                deudaTotal: 15000
            });

            expect(mockExecute).toHaveBeenCalledTimes(3);
        });

        it('debe usar umbral por defecto si no hay configuración', async () => {
            mockExecute
                .mockResolvedValueOnce({ rows: [] }) // Sin configuración
                .mockResolvedValueOnce({ rows: [{ total: 2 }] })
                .mockResolvedValueOnce({ rows: [{ total: 8000 }] });

            const resultado = await analizarCarteraVencida();

            expect(resultado.numCandidatos).toBe(2);

            // Verificar que usó umbral 4 (default)
            const candidatosQuery = mockExecute.mock.calls[1][0];
            expect(candidatosQuery.args[0]).toBe(4);
        });

        it('debe manejar errores correctamente', async () => {
            mockExecute.mockRejectedValueOnce(new Error('DB Error'));

            await expect(analizarCarteraVencida()).resolves.toBeUndefined();
        });
    });

    describe('initDeudoresJob - Modo SERVER', () => {
        beforeEach(() => {
            process.env.EXECUTION_MODE = 'SERVER';
        });

        it('debe programar job para las 3:00 AM en modo SERVER', () => {
            initDeudoresJob();

            expect(mockSchedule).toHaveBeenCalledTimes(1);
            expect(mockSchedule).toHaveBeenCalledWith(
                '0 3 * * *',
                expect.any(Function),
                { timezone: 'America/Mexico_City' }
            );
        });
    });

    describe('initDeudoresJob - Modo LOCAL', () => {
        beforeEach(() => {
            process.env.EXECUTION_MODE = 'LOCAL';
        });

        it('debe ejecutar al inicio y programar respaldo horario en modo LOCAL', () => {
            initDeudoresJob();

            // Verificar setTimeout (ejecución al inicio)
            expect(global.setTimeout).toHaveBeenCalledWith(
                expect.any(Function),
                60000
            );

            // Verificar cron schedule (respaldo horario)
            expect(mockSchedule).toHaveBeenCalledWith(
                '0 * * * *',
                expect.any(Function),
                { timezone: 'America/Mexico_City' }
            );
        });
    });

    describe('initDeudoresJob - Sin EXECUTION_MODE', () => {
        beforeEach(() => {
            delete process.env.EXECUTION_MODE;
        });

        it('debe usar modo SERVER por defecto', () => {
            initDeudoresJob();

            expect(mockSchedule).toHaveBeenCalledWith(
                '0 3 * * *',
                expect.any(Function),
                { timezone: 'America/Mexico_City' }
            );
        });
    });
});
