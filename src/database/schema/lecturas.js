// src/database/schema/lecturas.js
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { medidores } from './clientes.js';
import { rutas } from './rutas.js';
import { usuarios } from './usuarios.js';

export const lecturas = sqliteTable('lecturas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  medidor_id: integer('medidor_id').references(() => medidores.id),
  ruta_id: integer('ruta_id').references(() => rutas.id),
  fecha_lectura: text('fecha_lectura').notNull(),
  consumo_m3: real('consumo_m3').notNull(),
  periodo: text('periodo'),
  modificado_por: integer('modificado_por').references(() => usuarios.id),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
});
