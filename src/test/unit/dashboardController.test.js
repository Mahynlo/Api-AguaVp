
import { jest } from '@jest/globals';

// Indicar a Jest que use el mock para este módulo
// NOTA: En ESM con --experimental-vm-modules, los mocks se comportan un poco diferente.
// unstable_mockModule es preferido sobre __mocks__ manuales a veces, pero probemos __mocks__ primero.
// Si esto falla, volveremos a unstable_mockModule pero con la ruta resuelta correctamente.

// Para que funcione el __mocks__ con ESM y jest.mock, necesitamos esto:
jest.unstable_mockModule('../../database/db-sqlite.js', () => import('../../database/__mocks__/db-sqlite.js'));

// Importar dinámicamente el controlador (después del mock)
const { default: dashboardController } = await import('../../v2/controllers/dashboardController.js');
// Importar el mock para manipularlo
const { mockExecute } = await import('../../database/__mocks__/db-sqlite.js');


describe('Dashboard Controller', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();
        // Silenciar console.error para mantener limpio el output de tests
        jest.spyOn(console, 'error').mockImplementation(() => { });

        req = {};
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };
    });

    test('getDashboardStats debería retornar estructura correcta', async () => {
        // Configurar los mocks para las respuestas secuenciales
        mockExecute.mockResolvedValue({
            rows: [{ total: 100 }, { cantidad: 5 }], // Default catch-all
        });

        // MockImplementation para diferenciar por query SQL
        mockExecute.mockImplementation(async ({ sql }) => {
            const result = { rows: [] };

            // Simular respuestas según la tabla consultada
            if (sql.includes('FROM lecturas')) result.rows = [{ total: 1000, consumo_total: 50, mes: '2024-01' }];
            if (sql.includes('FROM clientes')) result.rows = [{ total: 150, cantidad: 10 }];
            if (sql.includes('FROM medidores')) result.rows = [{ total: 200 }];
            if (sql.includes('FROM pagos')) result.rows = [{ total: 50000 }];

            // Para queries de totales (SUM, COUNT) que deben devolver un número
            if (sql.includes('COUNT(*)') || sql.includes('SUM(')) {
                if (result.rows.length === 0) result.rows = [{ total: 0 }];
            }

            return result;
        });

        await dashboardController.getDashboardStats(req, res);

        expect(res.json).toHaveBeenCalled();
        const responseData = res.json.mock.calls[0][0];

        // Verificar estructura
        expect(responseData).toHaveProperty('tarjetas');
        expect(responseData).toHaveProperty('graficos');
        expect(responseData.tarjetas).toHaveProperty('consumo');
        expect(responseData.tarjetas).toHaveProperty('clientes');
        expect(responseData.tarjetas.consumo).toHaveProperty('actual');
        expect(responseData.tarjetas.clientes).toHaveProperty('total');
    });

    test('debería manejar errores de base de datos', async () => {
        mockExecute.mockRejectedValue(new Error('DB Error Crítico'));

        await dashboardController.getDashboardStats(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Error interno') }));
    });
});
