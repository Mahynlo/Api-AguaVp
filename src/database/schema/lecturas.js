// src/database/schema/lecturas.js
import { sqliteTable, integer, text, real, numeric } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { medidores } from './clientes.js';
import { rutas } from './rutas.js';
import { usuarios } from './usuarios.js';

export const lecturas = sqliteTable('lecturas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  medidor_id: integer('medidor_id').references(() => medidores.id),
  ruta_id: integer('ruta_id').references(() => rutas.id),
  fecha_lectura: text('fecha_lectura').notNull(),
  consumo_m3: numeric('consumo_m3').notNull(),
  // Columnas para trazabilidad de lecturas reales del medidor (migración 0016)
  lectura_anterior: numeric('lectura_anterior'),             // lectura del periodo anterior (m³ acumulados)
  lectura_actual: numeric('lectura_actual'),                 // lectura física leída en el medidor
  vuelta_cero: integer('vuelta_cero').default(0).notNull(),  // 1 si el medidor dio la vuelta a cero (rollover)
  periodo: text('periodo'),
  estado: text('estado').default('pendiente'),  // 'pendiente' | 'facturada'
  modificado_por: integer('modificado_por').references(() => usuarios.id),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
});
