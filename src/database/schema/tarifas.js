// src/database/schema/tarifas.js
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './usuarios.js';

export const tarifas = sqliteTable('tarifas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion').notNull(),
  fecha_inicio: text('fecha_inicio').notNull(),
  fecha_fin: text('fecha_fin'),
  modificado_por: integer('modificado_por').references(() => usuarios.id),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
});

export const rangos_tarifas = sqliteTable('rangos_tarifas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tarifa_id: integer('tarifa_id').notNull().references(() => tarifas.id, { onDelete: 'cascade' }),
  consumo_min: integer('consumo_min').notNull(),
  consumo_max: integer('consumo_max'),
  precio_por_m3: real('precio_por_m3').notNull(),
});

export const historial_tarifas = sqliteTable('historial_tarifas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tarifa_id: integer('tarifa_id').references(() => tarifas.id),
  rango_id: integer('rango_id').references(() => rangos_tarifas.id),
  fecha_cambio: text('fecha_cambio').default(sql`(datetime('now'))`),
  consumo_min: integer('consumo_min'),
  consumo_max: integer('consumo_max'),
  precio_anterior: real('precio_anterior'),
  precio_nuevo: real('precio_nuevo').notNull(),
});
