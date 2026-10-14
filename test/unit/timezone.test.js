/**
 * Unit Tests: timezone.js
 * 
 * Descripción:
 * Prueba las funciones del helper de timezone para GMT-7
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../../src/utils/timezone.js';

describe('Timezone Helper - America/Mexico_City (GMT-7)', () => {

    describe('now()', () => {
        it('debe retornar fecha/hora actual en formato SQL', () => {
            const resultado = now();
            // Formato: YYYY-MM-DD HH:mm:ss
            assert.match(resultado, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        });
    });

    describe('nowDate()', () => {
        it('debe retornar solo la fecha actual', () => {
            const resultado = nowDate();
            // Formato: YYYY-MM-DD
            assert.match(resultado, /^\d{4}-\d{2}-\d{2}$/);
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
            assert.ok([20, 21].includes(expectedHour)); // 8 PM o 9 PM dependiendo de DST
        });
    });

    describe('formatDate()', () => {
        it('debe formatear fecha en GMT-7', () => {
            const fecha = new Date('2026-01-15T10:30:00.000Z');
            const resultado = formatDate(fecha);

            assert.match(resultado, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        });

        it('debe aceptar formato personalizado', () => {
            const fecha = new Date('2026-01-15T10:30:00.000Z');
            const resultado = formatDate(fecha, 'dd/MM/yyyy');

            assert.match(resultado, /^\d{2}\/\d{2}\/\d{4}$/);
        });
    });

    describe('formatForDisplay()', () => {
        it('debe formatear para mostrar al usuario', () => {
            const fecha = new Date('2026-01-15T10:30:00.000Z');
            const resultado = formatForDisplay(fecha);

            // Formato: DD/MM/YYYY HH:mm
            assert.match(resultado, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
        });
    });

    describe('formatDateForDisplay()', () => {
        it('debe formatear solo fecha para usuario', () => {
            const fecha = new Date('2026-01-15T10:30:00.000Z');
            const resultado = formatDateForDisplay(fecha);

            // Formato: DD/MM/YYYY
            assert.match(resultado, /^\d{2}\/\d{2}\/\d{4}$/);
        });
    });

    describe('calcularVencimiento()', () => {
        it('debe calcular fecha de vencimiento correctamente', () => {
            const fechaBase = new Date('2026-01-15T00:00:00');
            const vencimiento = calcularVencimiento(30, fechaBase);

            assert.match(vencimiento, /^\d{4}-\d{2}-\d{2}$/);
            // Debería ser 30 días después
            assert.ok(vencimiento.includes('2026-02-14'));
        });
    });

    describe('estaVencida()', () => {
        it('debe detectar fecha vencida', () => {
            const fechaPasada = new Date('2020-01-01');
            assert.equal(estaVencida(fechaPasada), true);
        });

        it('debe detectar fecha no vencida', () => {
            const fechaFutura = new Date('2030-01-01');
            assert.equal(estaVencida(fechaFutura), false);
        });
    });

    describe('inicioDia() y finDia()', () => {
        it('debe retornar inicio del día', () => {
            const resultado = inicioDia();
            assert.match(resultado, /^\d{4}-\d{2}-\d{2} 00:00:00$/);
        });

        it('debe retornar fin del día', () => {
            const resultado = finDia();
            assert.match(resultado, /^\d{4}-\d{2}-\d{2} 23:59:59$/);
        });
    });
});
