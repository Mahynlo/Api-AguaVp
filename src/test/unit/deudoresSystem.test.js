/**
 * Unit Tests: Sistema de Deudores
 * 
 * Descripción:
 * Prueba la lógica de detección de candidatos a corte
 * Verifica que la deuda se atribuya correctamente por medidor
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

const { analizarCarteraVencida } = await import('../../jobs/procesarDeudores.js');

describe('Sistema de Deudores - Detección de Candidatos', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe detectar correctamente medidores con deuda (no clientes)', async () => {
        // Escenario: Cliente tiene 2 medidores
        // - Medidor A: 5 facturas vencidas
        // - Medidor B: 0 facturas vencidas
        // Solo Medidor A debe aparecer como candidato

        mockExecute
            .mockResolvedValueOnce({ // Configuración
                rows: [{ facturas_para_corte: 3 }]
            })
            .mockResolvedValueOnce({ // Candidatos (solo 1, no 2)
                rows: [{ total: 1 }] // ← Solo Medidor A
            })
            .mockResolvedValueOnce({ // Deuda total
                rows: [{ total: 15000 }]
            });

        const resultado = await analizarCarteraVencida();

        expect(resultado.numCandidatos).toBe(1);

        // Verificar que la query usa JOIN con lecturas
        const candidatosQuery = mockExecute.mock.calls[1][0];
        expect(candidatosQuery.sql).toContain('JOIN lecturas l');
        expect(candidatosQuery.sql).toContain('JOIN facturas f ON f.lectura_id = l.id');
    });

    it('debe excluir medidores con convenios activos', async () => {
        mockExecute
            .mockResolvedValueOnce({ rows: [{ facturas_para_corte: 3 }] })
            .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // Sin candidatos
            .mockResolvedValueOnce({ rows: [{ total: 0 }] });

        const resultado = await analizarCarteraVencida();

        expect(resultado.numCandidatos).toBe(0);

        // Verificar que excluye convenios
        const query = mockExecute.mock.calls[1][0];
        expect(query.sql).toContain("cp.estado = 'Activo'");
        expect(query.sql).toContain('cp.id IS NULL');
    });

    it('debe usar el umbral configurado', async () => {
        const umbralCustom = 5;

        mockExecute
            .mockResolvedValueOnce({
                rows: [{ facturas_para_corte: umbralCustom }]
            })
            .mockResolvedValueOnce({ rows: [{ total: 2 }] })
            .mockResolvedValueOnce({ rows: [{ total: 25000 }] });

        await analizarCarteraVencida();

        // Verificar que usa el umbral correcto
        const candidatosCall = mockExecute.mock.calls[1][0];
        expect(candidatosCall.args[0]).toBe(umbralCustom);
    });
});
