/**
 * Integration Tests: Endpoints de Convenios - Fase 2
 * 
 * Descripción:
 * Prueba los endpoints de creación de convenios, obtención de parcialidades
 * y pago de parcialidades
 * 
 * Ejecutar: npm test src/test/integration/convenios-endpoints.test.js
 */

import { jest } from '@jest/globals';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const APP_KEY = process.env.APP_KEY || 'test-app-key';

// Variables compartidas entre tests
let authToken = null;
let convenioId = null;
let parcialidadId = null;
let testMedidorId = 1; // Actualizar con ID válido

describe('Convenios - Endpoints de Fase 2', () => {

    beforeAll(async () => {
        // Obtener token de autenticación
        // TODO: Implementar login si es necesario
        authToken = process.env.TEST_TOKEN || 'test-token';
    });

    describe('POST /api/v2/deudores/convenios', () => {
        it('debe crear un convenio exitosamente', async () => {
            const response = await fetch(`${API_URL}/api/v2/deudores/convenios`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                },
                body: JSON.stringify({
                    medidor_id: testMedidorId,
                    monto_inicial: 100,
                    numero_parcialidades: 3,
                    periodicidad: 'mensual',
                    observaciones: 'Test de convenio'
                })
            });

            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data).toHaveProperty('success', true);
            expect(data).toHaveProperty('convenio_id');
            expect(data).toHaveProperty('detalle');
            expect(data.detalle).toHaveProperty('deuda_original');
            expect(data.detalle).toHaveProperty('pago_inicial', 100);
            expect(data.detalle).toHaveProperty('cuotas', 3);
            expect(data).toHaveProperty('parcialidades');
            expect(data.parcialidades).toHaveLength(3);

            // Guardar ID para siguientes tests
            convenioId = data.convenio_id;
        });

        it('debe rechazar convenio sin datos requeridos', async () => {
            const response = await fetch(`${API_URL}/api/v2/deudores/convenios`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                },
                body: JSON.stringify({
                    // Faltan datos requeridos
                    monto_inicial: 100
                })
            });

            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data).toHaveProperty('error');
        });
    });

    describe('GET /api/v2/deudores/convenios/:id', () => {
        it('debe obtener convenio con parcialidades', async () => {
            if (!convenioId) {
                console.warn('Saltando test - No hay convenio creado');
                return;
            }

            const response = await fetch(`${API_URL}/api/v2/deudores/convenios/${convenioId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                }
            });

            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveProperty('convenio');
            expect(data).toHaveProperty('parcialidades');
            expect(data).toHaveProperty('progreso');

            expect(data.convenio).toHaveProperty('id', convenioId);
            expect(data.convenio).toHaveProperty('estado');
            expect(data.convenio).toHaveProperty('cliente_nombre');

            expect(data.progreso).toHaveProperty('total');
            expect(data.progreso).toHaveProperty('pagado');
            expect(data.progreso).toHaveProperty('pendiente');
            expect(data.progreso).toHaveProperty('porcentaje');

            expect(Array.isArray(data.parcialidades)).toBe(true);
            expect(data.parcialidades.length).toBeGreaterThan(0);

            // Guardar ID de primera parcialidad pendiente
            const parcialidadPendiente = data.parcialidades.find(p => p.estado === 'Pendiente');
            if (parcialidadPendiente) {
                parcialidadId = parcialidadPendiente.id;
            }
        });

        it('debe retornar 404 para convenio inexistente', async () => {
            const response = await fetch(`${API_URL}/api/v2/deudores/convenios/99999`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                }
            });

            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data).toHaveProperty('error');
        });
    });

    describe('POST /api/v2/deudores/convenios/pagar-parcialidad', () => {
        it('debe pagar una parcialidad exitosamente', async () => {
            if (!parcialidadId) {
                console.warn('Saltando test - No hay parcialidad pendiente');
                return;
            }

            const response = await fetch(`${API_URL}/api/v2/deudores/convenios/pagar-parcialidad`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                },
                body: JSON.stringify({
                    parcialidad_id: parcialidadId,
                    cantidad_entregada: 250,
                    metodo_pago: 'Efectivo',
                    comentario: 'Pago de test'
                })
            });

            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data).toHaveProperty('mensaje');
            expect(data).toHaveProperty('pago_id');
            expect(data).toHaveProperty('monto_aplicado');
            expect(data).toHaveProperty('cambio');
            expect(data).toHaveProperty('saldo_restante_convenio');
            expect(data).toHaveProperty('convenio_completado');

            expect(typeof data.pago_id).toBe('number');
            expect(data.monto_aplicado).toBeGreaterThan(0);
            expect(data.cambio).toBeGreaterThanOrEqual(0);
        });

        it('debe rechazar pago de parcialidad ya pagada', async () => {
            if (!parcialidadId) {
                console.warn('Saltando test - No hay parcialidad');
                return;
            }

            const response = await fetch(`${API_URL}/api/v2/deudores/convenios/pagar-parcialidad`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                },
                body: JSON.stringify({
                    parcialidad_id: parcialidadId,
                    cantidad_entregada: 100,
                    metodo_pago: 'Efectivo'
                })
            });

            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data).toHaveProperty('error');
            expect(data.error).toContain('ya fue pagada');
        });

        it('debe rechazar pago sin datos requeridos', async () => {
            const response = await fetch(`${API_URL}/api/v2/deudores/convenios/pagar-parcialidad`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                },
                body: JSON.stringify({
                    // Faltan datos requeridos
                    cantidad_entregada: 100
                })
            });

            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data).toHaveProperty('error');
        });

        it('debe retornar 404 para parcialidad inexistente', async () => {
            const response = await fetch(`${API_URL}/api/v2/deudores/convenios/pagar-parcialidad`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                },
                body: JSON.stringify({
                    parcialidad_id: 99999,
                    cantidad_entregada: 100,
                    metodo_pago: 'Efectivo'
                })
            });

            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data).toHaveProperty('error');
        });
    });

    describe('Verificación de actualización de convenio', () => {
        it('debe reflejar el pago en el progreso del convenio', async () => {
            if (!convenioId) {
                console.warn('Saltando test - No hay convenio creado');
                return;
            }

            const response = await fetch(`${API_URL}/api/v2/deudores/convenios/${convenioId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'x-app-key': APP_KEY
                }
            });

            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.progreso.pagado).toBeGreaterThan(0);
            expect(data.progreso.porcentaje).toBeGreaterThan(0);

            // Verificar que al menos una parcialidad está pagada
            const parcialidadesPagadas = data.parcialidades.filter(p => p.estado === 'Pagada');
            expect(parcialidadesPagadas.length).toBeGreaterThan(0);
        });
    });
});
