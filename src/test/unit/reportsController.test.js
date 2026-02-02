
import { jest } from '@jest/globals';

// Mock DB Module
jest.unstable_mockModule('../../database/db-sqlite.js', () => import('../../database/__mocks__/db-sqlite.js'));

// Import Controller (Dynamic import after mock)
const { default: reportsController } = await import('../../v2/controllers/reportsController.js');

// Import Mock to manipulate behavior
const { mockExecute } = await import('../../database/__mocks__/db-sqlite.js');

describe('ReportsController - Unit Tests', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();
        // Silence console errors
        jest.spyOn(console, 'error').mockImplementation(() => { });

        req = {
            query: {},
            usuario: { id: 1 }
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };
    });

    // 1. GET /recibos
    describe('getRecibosData', () => {
        test('debería retornar error 400 si falta mes', async () => {
            req.query = {}; // Missing mes
            await reportsController.getRecibosData(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('debería generar recibos correctamente', async () => {
            req.query = { mes: '2024-01' };

            // 1. Mock Facturas del mes
            mockExecute.mockResolvedValueOnce({
                rows: [
                    {
                        folio_factura: 1, fecha_emision: '2024-01-01', total_mes: 100,
                        saldo_pendiente: 100, cliente_id: 10, cliente_nombre: 'Pepe',
                        medidor_serial: 'ABC-123', consumo_mes: 20
                    }
                ]
            });

            // 2. Mock Deuda Anterior (Query de suma)
            mockExecute.mockResolvedValueOnce({
                rows: [{ cliente_id: 10, deuda_anterior: 50 }]
            });

            // 3. Mock Consumo Anterior (Query lecturas mes pasado)
            mockExecute.mockResolvedValueOnce({
                rows: [{ numero_serie: 'ABC-123', consumo_m3: 18 }]
            });

            await reportsController.getRecibosData(req, res);

            expect(res.json).toHaveBeenCalled();
            const data = res.json.mock.calls[0][0];

            expect(data.periodo).toBe('2024-01');
            expect(data.total_recibos).toBe(1);

            const recibo = data.recibos[0];
            expect(recibo.datos_cliente.nombre).toBe('Pepe');
            expect(recibo.detalle_facturacion.total_mes).toBe(100);
            expect(recibo.detalle_facturacion.deuda_acumulada_anterior).toBe(50);
            expect(recibo.detalle_facturacion.total_a_pagar).toBe(150); // 100 + 50
        });
    });

    // 2. GET /financiero
    describe('getReporteFinanciero', () => {
        test('debería consolidar ingresos y facturación', async () => {
            req.query = { fecha_inicio: '2024-01-01', fecha_fin: '2024-01-31' };

            // Promise.all mocking sequence can be tricky, but mockResolvedValue queues them.
            // 1. Pagos Query
            mockExecute.mockResolvedValueOnce({
                rows: [
                    { metodo_pago: 'Efectivo', total_cobrado: 500, cantidad_transacciones: 5 },
                    { metodo_pago: 'Transferencia', total_cobrado: 1000, cantidad_transacciones: 2 }
                ]
            });
            // 2. Facturas Query
            mockExecute.mockResolvedValueOnce({
                rows: [{ total_facturado: 2000, cantidad_facturas: 20 }]
            });

            await reportsController.getReporteFinanciero(req, res);

            expect(res.json).toHaveBeenCalled();
            const data = res.json.mock.calls[0][0];

            expect(data.resumen.total_facturado).toBe(2000);
            expect(data.resumen.total_ingresos).toBe(1500); // 500 + 1000
            expect(data.resumen.eficiencia_recaudo).toBe('75.0%'); // 1500/2000
        });
    });

    // 3. GET /deudores
    describe('getReporteDeudores', () => {
        test('debería retornar métricas y top deudores', async () => {
            // 1. Resumen Query
            mockExecute.mockResolvedValueOnce({
                rows: [{
                    total_deuda_vencida: 5000,
                    clientes_morosos: 10,
                    cortes_activos: 2,
                    convenios_activos: 1
                }]
            });

            // 2. Top Deudores Query
            mockExecute.mockResolvedValueOnce({
                rows: [
                    { id: 1, nombre: 'Juan Moroso', deuda_total: 1000 }
                ]
            });

            // 3. Antigüedad Query
            mockExecute.mockResolvedValueOnce({
                rows: [{ rango: '+90 días', total: 4000 }]
            });

            // 4. Operatividad Query
            mockExecute.mockResolvedValueOnce({
                rows: [{ cortes_mes: 5, reconexiones_mes: 3 }]
            });

            await reportsController.getReporteDeudores(req, res);

            expect(res.json).toHaveBeenCalled();
            const data = res.json.mock.calls[0][0];

            expect(data.resumen.deuda_vencida).toBe(5000);
            expect(data.top_deudores).toHaveLength(1);
            expect(data.top_deudores[0].nombre).toBe('Juan Moroso');
            expect(data.operatividad_mes.cortes).toBe(5);
        });
    });

});
