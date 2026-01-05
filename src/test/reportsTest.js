import 'dotenv/config';
import reportsController from '../v2/controllers/reportsController.js';

const mockReqRecibos = {
    query: {
        mes: '2025-12', // Mes actual para prueba
        ruta_id: 1
    }
};

const mockReqFinanciero = {
    query: {
        fecha_inicio: '2025-01-01',
        fecha_fin: '2025-12-31'
    }
};

const createMockRes = (label) => ({
    status: (code) => {
        console.log(`[${label}] Status: ${code}`);
        return {
            json: (data) => {
                console.log(`[${label}] Data sample (keys):`, Object.keys(data));
                if (data.recibos && data.recibos.length > 0) {
                    console.log(`[${label}] Primer recibo:`, JSON.stringify(data.recibos[0], null, 2));
                } else if (data.recibos) {
                    console.log(`[${label}] No hay recibos (Array vacío)`);
                }

                if (data.resumen) {
                    console.log(`[${label}] Resumen Financiero:`, JSON.stringify(data.resumen, null, 2));
                }
                return this;
            }
        };
    },
    json: (data) => {
        console.log(`[${label}] JSON Response direct`);
    }
});

async function runTests() {
    console.log('--- TEST: Reporte Recibos ---');
    await reportsController.getRecibosData(mockReqRecibos, createMockRes('Recibos'));

    console.log('\n--- TEST: Reporte Financiero ---');
    await reportsController.getReporteFinanciero(mockReqFinanciero, createMockRes('Financiero'));
}

runTests().catch(console.error);
