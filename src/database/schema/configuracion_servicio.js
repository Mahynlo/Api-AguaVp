import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './usuarios.js';

export const configuracion_servicio = sqliteTable('configuracion_servicio', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    facturas_para_primer_aviso: integer('facturas_para_primer_aviso').notNull().default(1),
    facturas_para_segundo_aviso: integer('facturas_para_segundo_aviso').notNull().default(2),
    facturas_para_tercer_aviso: integer('facturas_para_tercer_aviso').notNull().default(3),
    facturas_para_corte: integer('facturas_para_corte').notNull().default(4),
    dias_gracia: integer('dias_gracia').default(0),
    activo: integer('activo').notNull().default(1),
    modificado_por: integer('modificado_por').references(() => usuarios.id),
    fecha_modificacion: text('fecha_modificacion'),
    fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`)
});
