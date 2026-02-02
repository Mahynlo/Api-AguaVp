/**
 * Unit Tests: Sistema de Convenios
 * 
 * Descripción:
 * Prueba la lógica de verificación de convenios y parcialidades
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

const { verificarConvenios } = await import('../../jobs/verificarConvenios.js');

describe('Sistema de Convenios - Verificación de Cumplimiento', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe detectar parcialidades vencidas', async () => {
        // Mock: 2 parcialidades vencidas
        mockExecute
            .mockResolvedValueOnce({ // Parcialidades vencidas
                rows: [
                    {
                        parcialidad_id: 1,
                        convenio_id: 1,
                        numero_parcialidad: 1,
                        fecha_vencimiento: '2026-01-01',
                        cliente_id: 1,
                        medidor_id: 1,
                        cliente_nombre: 'Juan Pérez'
                    },
                    {
                        parcialidad_id: 2,
                        convenio_id: 1,
                        numero_parcialidad: 2,
                        fecha_vencimiento: '2026-01-05',
                        cliente_id: 1,
                        medidor_id: 1,
                        cliente_nombre: 'Juan Pérez'
                    }
                ]
            })
            .mockResolvedValue({ rows: [] }); // Para los UPDATEs

        const resultado = await verificarConvenios();

        expect(resultado.parcialidades_vencidas).toBe(2);
        expect(resultado.convenios_incumplidos).toBe(1);

        // Verificar que marcó parcialidades como vencidas (2 UPDATEs)
        expect(mockExecute).toHaveBeenCalledWith({
            sql: expect.stringContaining('UPDATE parcialidades_convenio'),
            args: [1]
        });
        expect(mockExecute).toHaveBeenCalledWith({
            sql: expect.stringContaining('UPDATE parcialidades_convenio'),
            args: [2]
        });

        // Verificar que marcó convenio como incumplido
        expect(mockExecute).toHaveBeenCalledWith({
            sql: expect.stringContaining('UPDATE convenios_pago'),
            args: [1]
        });
    });

    it('debe retornar 0 si no hay parcialidades vencidas', async () => {
        mockExecute.mockResolvedValueOnce({ rows: [] });

        const resultado = await verificarConvenios();

        expect(resultado.parcialidades_vencidas).toBe(0);
        expect(resultado.convenios_incumplidos).toBe(0);
    });

    it('debe agrupar correctamente convenios con múltiples parcialidades vencidas', async () => {
        // Mock: 3 parcialidades de 2 convenios diferentes
        mockExecute
            .mockResolvedValueOnce({
                rows: [
                    { parcialidad_id: 1, convenio_id: 1, cliente_nombre: 'Juan' },
                    { parcialidad_id: 2, convenio_id: 1, cliente_nombre: 'Juan' },
                    { parcialidad_id: 3, convenio_id: 2, cliente_nombre: 'María' }
                ]
            })
            .mockResolvedValue({ rows: [] });

        const resultado = await verificarConvenios();

        expect(resultado.parcialidades_vencidas).toBe(3);
        expect(resultado.convenios_incumplidos).toBe(2); // 2 convenios únicos
    });
});
