// src/database/schema/clientes.js
import { sqliteTable, integer, text, numeric } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './usuarios.js';
import { tarifas } from './tarifas.js';

export const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  numero_predio: text('numero_predio').unique(),  // Identificador único de la toma/predio
  nombre: text('nombre').notNull(),
  direccion: text('direccion').notNull(),
  telefono: text('telefono').notNull(),
  ciudad: text('ciudad').notNull(),
  correo: text('correo'),
  estado_cliente: text('estado_cliente', {
    enum: ['Activo', 'Inactivo', 'Suspendido', 'Eliminado']
  }).notNull().default('Activo'),
  tarifa_id: integer('tarifa_id').references(() => tarifas.id),
  modificado_por: integer('modificado_por').references(() => usuarios.id),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
  fecha_eliminacion: text('fecha_eliminacion'),
  eliminado_por: integer('eliminado_por').references(() => usuarios.id),
  razon_eliminacion: text('razon_eliminacion'),
});

export const medidores = sqliteTable('medidores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cliente_id: integer('cliente_id').references(() => clientes.id),
  numero_serie: text('numero_serie').notNull().unique(),
  marca: text('marca'),
  modelo: text('modelo'),
  ubicacion: text('ubicacion'),
  fecha_instalacion: text('fecha_instalacion'),
  latitud: numeric('latitud'),
  longitud: numeric('longitud'),
  estado_medidor: text('estado_medidor', {
    enum: ['Activo', 'Inactivo', 'Retirado', 'No instalado']
  }).notNull(),
  estado_servicio: text('estado_servicio', {
    enum: ['Activo', 'Cortado']
  }).default('Activo'),
  fecha_corte: text('fecha_corte'),
  // Columnas para sistema de lecturas reales (migración 0016)
  lectura_base: numeric('lectura_base'),       // lectura al instalar / inicio del sistema
  capacidad_maxima: numeric('capacidad_maxima'), // límite del totalizador antes del rollover (default runtime: 99999.99)
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
});

export const cliente_medidor_historial = sqliteTable('cliente_medidor_historial', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
  medidor_id: integer('medidor_id').notNull().references(() => medidores.id),
  fecha_inicio: text('fecha_inicio').notNull().default(sql`(date('now'))`),
  fecha_fin: text('fecha_fin'),
  asignado_por: integer('asignado_por').references(() => usuarios.id),
});
