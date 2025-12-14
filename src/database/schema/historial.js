// src/database/schema/historial.js
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './usuarios.js';

export const historial_cambios = sqliteTable('historial_cambios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tabla: text('tabla').notNull(),
  operacion: text('operacion').notNull(),
  registro_id: integer('registro_id').notNull(),
  modificado_por: integer('modificado_por').references(() => usuarios.id),
  fecha_modificacion: text('fecha_modificacion').default(sql`(datetime('now'))`),
  cambios: text('cambios'),
});
