
import { jest } from '@jest/globals';

// 1. Mock DB Module BEFORE importing controller
jest.unstable_mockModule('../../database/db-turso.js', () => ({
    default: {
        execute: jest.fn()
    }
}));

// 2. Import Controller (Dynamic import)
const { default: reportsController } = await import('../../v2/controllers/reportsController.js');

// 3. Import Mock to manipulate behavior
const { default: dbTurso } = await import('../../database/db-turso.js');

describe('ReportsController - Lista de Lecturas', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        mockReq = {
            query: {
                mes: '2024-03'
            }
        };
        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };
        jest.clearAllMocks();
    });

    test('debe retornar error 400 si falta el parámetro mes', async () => {
        mockReq.query.mes = null;
        await reportsController.getReporteLecturas(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('mes') }));
    });

    test('debe generar lista agrupada por localidad', async () => {
        // Mock data
        const mockRows = [
            {
                cliente_id: 1,
                cliente_nombre: 'Juan Pérez',
                localidad: 'Nacori',
                direccion: 'Calle 1',
                medidor_id: 101,
                numero_serie: 'SER-001',
                medidor_ubicacion: 'Frente',
                latitud: 29.1,
                longitud: -110.1,
                consumo_anterior: 20
            },
            {
                cliente_id: 2,
                cliente_nombre: 'Maria Lopez',
                localidad: 'Nacori',
                direccion: 'Calle 2',
                medidor_id: 102,
                numero_serie: 'SER-002',
                medidor_ubicacion: 'Patio',
                latitud: 29.2,
                longitud: -110.2,
                consumo_anterior: 15
            },
            {
                cliente_id: 3,
                cliente_nombre: 'Pedro Infante',
                localidad: 'Mesa Tres Rios',
                direccion: 'Av Principal',
                medidor_id: 103,
                numero_serie: 'SER-003',
                medidor_ubicacion: 'Entrada',
                latitud: 29.3,
                longitud: -110.3,
                consumo_anterior: null // Sin lectura previa
            }
        ];

        dbTurso.execute.mockResolvedValue({ rows: mockRows });

        await reportsController.getReporteLecturas(mockReq, mockRes);

        expect(dbTurso.execute).toHaveBeenCalledTimes(1);

        // Verify SQL args include calculated previous month (2024-02)
        const sqlCalls = dbTurso.execute.mock.calls[0][0];
        expect(sqlCalls.args).toContain('2024-02');

        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            periodo_solicitado: '2024-03',
            periodo_lectura_anterior: '2024-02',
            total_general: 3,
            total_localidades: 2,
            datos: expect.any(Array)
        }));

        const responseData = mockRes.json.mock.calls[0][0];

        // Verify Grouping
        const nacoriGroup = responseData.datos.find(g => g.localidad === 'Nacori');
        expect(nacoriGroup).toBeDefined();
        expect(nacoriGroup.total_clientes).toBe(2);
        expect(nacoriGroup.clientes[0].medidor.coordenadas.lat).toBe(29.1);

        // Verify Data Mapping
        const mesaGroup = responseData.datos.find(g => g.localidad === 'Mesa Tres Rios');
        expect(mesaGroup).toBeDefined();
        expect(mesaGroup.total_clientes).toBe(1);
        expect(mesaGroup.clientes[0].lectura_anterior.consumo_registrado).toBe(0); // Null handled as 0
    });

    test('debe filtrar por localidad si se proporciona', async () => {
        mockReq.query.localidad = 'Nacori';
        dbTurso.execute.mockResolvedValue({ rows: [] });

        await reportsController.getReporteLecturas(mockReq, mockRes);

        const sqlCalls = dbTurso.execute.mock.calls[0][0];
        expect(sqlCalls.sql).toContain('AND c.ciudad = ?');
        expect(sqlCalls.args).toContain('Nacori');
    });

    test('debe manejar errores de base de datos', async () => {
        dbTurso.execute.mockRejectedValue(new Error('DB Error'));
        await reportsController.getReporteLecturas(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(500);
    });
});
