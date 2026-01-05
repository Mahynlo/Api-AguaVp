import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';
import { clientes, medidores } from './clientes.js';
import { usuarios } from './usuarios.js';

export const convenios_pago = sqliteTable('convenios_pago', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
    medidor_id: integer('medidor_id').notNull().references(() => medidores.id),
    monto_total: real('monto_total').notNull(),
    monto_inicial: real('monto_inicial').notNull(),
    saldo_restante: real('saldo_restante').notNull(),
    numero_parcialidades: integer('numero_parcialidades').notNull(),
    periodicidad: text('periodicidad').notNull(), // 'mensual', 'quincenal'
    estado: text('estado', { enum: ['Activo', 'Incumplido', 'Finalizado'] }).notNull(),
    fecha_inicio: text('fecha_inicio').notNull(),
    fecha_fin: text('fecha_fin'),
    autorizado_por: integer('autorizado_por').notNull().references(() => usuarios.id),
    observaciones: text('observaciones')
}, (table) => ({
    estadoIdx: index('convenios_estado_idx').on(table.estado)
}));
