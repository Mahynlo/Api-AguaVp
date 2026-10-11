import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { clientes, medidores } from './clientes.js';
import { usuarios } from './usuarios.js';

export const cortes_servicio = sqliteTable('cortes_servicio', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
    medidor_id: integer('medidor_id').notNull().references(() => medidores.id),
    fecha_corte: text('fecha_corte').notNull(),
    motivo: text('motivo').notNull(),
    autorizado_por: integer('autorizado_por').notNull().references(() => usuarios.id),
    fecha_reconexion: text('fecha_reconexion'),
    reconectado_por: integer('reconectado_por').references(() => usuarios.id),
    observaciones: text('observaciones')
}, (table) => ({
    medidorIdx: index('cortes_medidor_idx').on(table.medidor_id)
}));
