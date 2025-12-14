// src/database/schema/facturas.js
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { clientes } from './clientes.js';
import { lecturas } from './lecturas.js';
import { tarifas } from './tarifas.js';
import { usuarios } from './usuarios.js';

export const facturas = sqliteTable('facturas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cliente_id: integer('cliente_id').references(() => clientes.id),
  lectura_id: integer('lectura_id').references(() => lecturas.id),
  tarifa_id: integer('tarifa_id').references(() => tarifas.id),
  fecha_emision: text('fecha_emision').notNull(),
  fecha_vencimiento: text('fecha_vencimiento').notNull(),
  total: real('total').notNull(),
  saldo_pendiente: real('saldo_pendiente').notNull().default(0),
  estado: text('estado', { enum: ['Pagado', 'Pendiente', 'Vencida'] }).notNull(),
  modificado_por: integer('modificado_por').references(() => usuarios.id),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
});

export const pagos = sqliteTable('pagos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  factura_id: integer('factura_id').references(() => facturas.id),
  fecha_pago: text('fecha_pago').notNull(),
  monto: real('monto').notNull(),
  cantidad_entregada: real('cantidad_entregada'),
  cambio: real('cambio'),
  metodo_pago: text('metodo_pago', { 
    enum: ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque'] 
  }).notNull(),
  comentario: text('comentario'),
  modificado_por: integer('modificado_por').references(() => usuarios.id),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
});
