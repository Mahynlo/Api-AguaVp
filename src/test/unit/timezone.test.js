/**
 * Unit Tests: timezone.js
 * 
 * Descripción:
 * Prueba las funciones del helper de timezone para GMT-7
 */

import { jest } from '@jest/globals';
import {
    now,
    nowDate,
    toLocalTime,
    formatDate,
    formatForDisplay,
    formatDateForDisplay,
    calcularVencimiento,
    estaVencida,
    inicioDia,
    finDia
} from '../../utils/timezone.js';

describe('Timezone Helper - America/Mexico_City (GMT-7)', () => {

    describe('now()', () => {
        it('debe retornar fecha/hora actual en formato SQL', () => {
            const resultado = now();
            // Formato: YYYY-MM-DD HH:mm:ss
            expect(resultado).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        });
    });

    describe('nowDate()', () => {
        it('debe retornar solo la fecha actual', () => {
            const resultado = nowDate();
            // Formato: YYYY-MM-DD
            expect(resultado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    describe('toLocalTime()', () => {
        it('debe convertir UTC a hora local de México', () => {
            const utcDate = '2026-01-15T03:00:00.000Z'; // 3 AM UTC
            const local = toLocalTime(utcDate);

            // En enero, México está en horario estándar (GMT-6)
            // 3 AM UTC = 9 PM del día anterior (GMT-6)
            // En verano sería 8 PM (GMT-7)
            const expectedHour = local.getHours();
            expect([20, 21]).toContain(expectedHour); // 8 PM o 9 PM dependiendo de DST
        });
    });

    describe('formatDate()', () => {
        it('debe formatear fecha en GMT-7', () => {
            const fecha = new Date('2026-01-15T10:30:00.000Z');
            const resultado = formatDate(fecha);

            expect(resultado).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        });

        it('debe aceptar formato personalizado', () => {
            const fecha = new Date('2026-01-15T10:30:00.000Z');
            const resultado = formatDate(fecha, 'dd/MM/yyyy');

            expect(resultado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        });
    });

    describe('formatForDisplay()', () => {
        it('debe formatear para mostrar al usuario', () => {
            const fecha = new Date('2026-01-15T10:30:00.000Z');
            const resultado = formatForDisplay(fecha);

            // Formato: DD/MM/YYYY HH:mm
            expect(resultado).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
        });
    });

    describe('formatDateForDisplay()', () => {
        it('debe formatear solo fecha para usuario', () => {
            const fecha = new Date('2026-01-15T10:30:00.000Z');
            const resultado = formatDateForDisplay(fecha);

            // Formato: DD/MM/YYYY
            expect(resultado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        });
    });

    describe('calcularVencimiento()', () => {
        it('debe calcular fecha de vencimiento correctamente', () => {
            const fechaBase = new Date('2026-01-15T00:00:00');
            const vencimiento = calcularVencimiento(30, fechaBase);

            expect(vencimiento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            // Debería ser 30 días después
            expect(vencimiento).toContain('2026-02-14');
        });
    });

    describe('estaVencida()', () => {
        it('debe detectar fecha vencida', () => {
            const fechaPasada = new Date('2020-01-01');
            expect(estaVencida(fechaPasada)).toBe(true);
        });

        it('debe detectar fecha no vencida', () => {
            const fechaFutura = new Date('2030-01-01');
            expect(estaVencida(fechaFutura)).toBe(false);
        });
    });

    describe('inicioDia() y finDia()', () => {
        it('debe retornar inicio del día', () => {
            const resultado = inicioDia();
            expect(resultado).toMatch(/^\d{4}-\d{2}-\d{2} 00:00:00$/);
        });

        it('debe retornar fin del día', () => {
            const resultado = finDia();
            expect(resultado).toMatch(/^\d{4}-\d{2}-\d{2} 23:59:59$/);
        });
    });
});
