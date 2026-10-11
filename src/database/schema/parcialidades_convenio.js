import { sqliteTable, integer, text, numeric, index } from 'drizzle-orm/sqlite-core';
import { convenios_pago } from './convenios_pago.js';
import { pagos } from './facturas.js';

export const parcialidades_convenio = sqliteTable('parcialidades_convenio', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    convenio_id: integer('convenio_id').notNull().references(() => convenios_pago.id),
    numero_parcialidad: integer('numero_parcialidad').notNull(),
    monto_esperado: numeric('monto_esperado').notNull(),
    fecha_vencimiento: text('fecha_vencimiento').notNull(),

    // Campos de pago (se llenan cuando se paga)
    monto_pagado: numeric('monto_pagado'),
    fecha_pago: text('fecha_pago'),
    pago_id: integer('pago_id').references(() => pagos.id),

    estado: text('estado', {
        enum: ['Pendiente', 'Pagada', 'Vencida', 'Parcial']
    }).notNull().default('Pendiente')
}, (table) => ({
    convenioIdx: index('parcialidades_convenio_idx').on(table.convenio_id),
    estadoIdx: index('parcialidades_estado_idx').on(table.estado)
}));
