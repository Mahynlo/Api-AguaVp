
import { jest } from '@jest/globals';

// Mock DB Module
jest.unstable_mockModule('../../database/db-turso.js', () => import('../../database/__mocks__/db-turso.js'));

// Import Controllers (Dynamic imports after mock)
const { default: configuracionController } = await import('../../v2/controllers/configuracionController.js');
const { default: cortesController } = await import('../../v2/controllers/cortesController.js');
const { default: conveniosController } = await import('../../v2/controllers/conveniosController.js');

// Import Mock
const { mockExecute } = await import('../../database/__mocks__/db-turso.js');

describe('Sistema de Deudores - Unit Tests', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => { });

        req = {
            body: {},
            query: {},
            usuario: { id: 1 } // Simular usuario admin
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };
    });

    // 1. Tests Configuración
    describe('ConfiguracionController', () => {
        test('getConfiguracion debería devolver config default si bd vacía', async () => {
            mockExecute.mockResolvedValueOnce({ rows: [] }); // BD vacía

            await configuracionController.getConfiguracion(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                facturas_para_corte: 4,
                mensaje: expect.stringContaining("Configuración por defecto")
            }));
        });

        test('updateConfiguracion debería inactivar anterior e insertar nueva', async () => {
            req.body = { facturas_para_corte: 3 };
            mockExecute.mockResolvedValue({ lastInsertRowid: 10 });

            await configuracionController.updateConfiguracion(req, res);

            // Verificar que se llamaron a las queries correctas
            expect(mockExecute).toHaveBeenCalledTimes(2);
            // 1. Update inactivar
            expect(mockExecute.mock.calls[0][0].sql).toContain('UPDATE configuracion_servicio SET activo = 0');
            // 2. Insert nueva
            expect(mockExecute.mock.calls[1][0].sql).toContain('INSERT INTO configuracion_servicio');

            expect(res.status).toHaveBeenCalledWith(201);
        });
    });

    // 2. Tests Cortes
    describe('CortesController', () => {
        test('detectarCandidatosCorte debería listar medidores con deuda', async () => {
            // Mock config
            mockExecute.mockResolvedValueOnce({ rows: [{ facturas_para_corte: 3 }] });
            // Mock candidatos
            mockExecute.mockResolvedValueOnce({
                rows: [
                    {
                        cliente_id: 1, medidor_id: 100, facturas_vencidas: 5, deuda_total: 1500,
                        cliente_nombre: 'Juan', estado_servicio: 'Activo'
                    }
                ]
            });

            await cortesController.detectarCandidatosCorte(req, res);

            expect(res.json).toHaveBeenCalled();
            const response = res.json.mock.calls[0][0];
            expect(response.total_candidatos).toBe(1);
            expect(response.candidatos[0].medidor.id).toBe(100);
            expect(response.umbral_corte).toBe(3);
        });

        test('ejecutarCorte debería registrar corte y actualizar medidor', async () => {
            req.body = { medidor_id: 100, motivo: 'Prueba' };
            // Mock medidor check
            mockExecute.mockResolvedValueOnce({ rows: [{ cliente_id: 1, estado_servicio: 'Activo' }] });

            await cortesController.ejecutarCorte(req, res);

            // Expect inserts and updates
            expect(mockExecute).toHaveBeenCalledTimes(3);
            // 1. Select medidor 2. Insert corte 3. Update medidor
            const sqlUpdate = mockExecute.mock.calls[2][0].sql.replace(/\s+/g, ' '); // Normalize spaces
            expect(sqlUpdate).toContain("UPDATE medidores SET estado_servicio = 'Cortado'");

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        test('procesarReconexion debería rechazar si hay deuda y sin convenio', async () => {
            req.body = { medidor_id: 100 };

            // 1. Check medidor (Cortado)
            mockExecute.mockResolvedValueOnce({ rows: [{ id: 100, cliente_id: 1, estado_servicio: 'Cortado' }] });
            // 2. Check deuda (Tiene deuda)
            mockExecute.mockResolvedValueOnce({ rows: [{ total_deuda: 500 }] });
            // 3. Check convenio (No tiene)
            mockExecute.mockResolvedValueOnce({ rows: [] });

            await cortesController.procesarReconexion(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("No es posible reconectar") }));
        });
    });

    // 3. Tests Convenios
    describe('ConveniosController', () => {
        test('crearConvenio debería crear acuerdo y reactivar servicio', async () => {
            req.body = {
                medidor_id: 100,
                monto_inicial: 200,
                numero_parcialidades: 3
            };

            // 1. Info medidor
            mockExecute.mockResolvedValueOnce({ rows: [{ cliente_id: 1 }] });
            // 2. Deuda total (1000)
            mockExecute.mockResolvedValueOnce({ rows: [{ total: 1000 }] });
            // 3. Insert Convenio
            mockExecute.mockResolvedValueOnce({ lastInsertRowid: 50 });
            // 4. Check estado actual medidor (para ver si reactiva) - Simulamos 'Cortado'
            mockExecute.mockResolvedValueOnce({ rows: [{ estado_servicio: 'Cortado' }] });
            // 5. Update medidor a Activo
            mockExecute.mockResolvedValueOnce({});

            await conveniosController.crearConvenio(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                detalle: expect.objectContaining({ saldo_diferido: 800 }) // 1000 - 200
            }));

            // Verificar que intentó reactivar (Update medidor)
            const lastCall = mockExecute.mock.calls[4][0].sql; // Call 5
            expect(lastCall).toContain("UPDATE medidores SET estado_servicio = 'Activo'");
        });
    });

});
