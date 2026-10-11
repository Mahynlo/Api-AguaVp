// src/database/schema/rutas.js
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './usuarios.js';
import { medidores } from './clientes.js';

export const rutas = sqliteTable('rutas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  fecha_creacion: text('fecha_creacion').default(sql`(DATE('now'))`),
  creado_por: integer('creado_por').references(() => usuarios.id),
  distancia_km: real('distancia_km'),
  ruta_json: text('ruta_json'),
  instrucciones_json: text('instrucciones_json'),
});

export const rutas_puntos = sqliteTable('rutas_puntos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ruta_id: integer('ruta_id').notNull().references(() => rutas.id, { onDelete: 'cascade' }),
  medidor_id: integer('medidor_id').notNull().references(() => medidores.id),
  orden: integer('orden').notNull(),
});
