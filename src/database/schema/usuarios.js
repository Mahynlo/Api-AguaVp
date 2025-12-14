// src/database/schema/usuarios.js
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const usuarios = sqliteTable('usuarios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  correo: text('correo').notNull().unique(),
  nombre: text('nombre'),
  contraseña: text('contraseña').notNull(),
  username: text('username').notNull().unique(),
  rol: text('rol', { enum: ['superadmin', 'administrador', 'operador'] }).notNull(),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
  
  // Campos de seguridad (Migración 001)
  ultimo_acceso: text('ultimo_acceso'),
  intentos_fallidos: integer('intentos_fallidos').default(0),
  bloqueado_hasta: text('bloqueado_hasta'),
  requiere_cambio_password: integer('requiere_cambio_password').default(0),
  ultimo_cambio_password: text('ultimo_cambio_password'),
});

export const sesiones = sqliteTable('sesiones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  usuario_id: integer('usuario_id').notNull().references(() => usuarios.id),
  token: text('token').unique().notNull(),
  fecha_inicio: text('fecha_inicio').default(sql`(datetime('now'))`),
  fecha_fin: text('fecha_fin'),
  direccion_ip: text('direccion_ip'),
  dispositivo: text('dispositivo'),
  ubicacion: text('ubicacion'),
  activo: integer('activo', { mode: 'boolean' }).default(true),
  
  // Campos de Migración 001
  ultimo_uso: text('ultimo_uso'),
  expira_en: text('expira_en'),
  user_agent: text('user_agent'),
  tipo_sesion: text('tipo_sesion').default('web'),
});

export const apps = sqliteTable('apps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  app_id: text('app_id').unique().notNull(),
  token: text('token').notNull(),
  fecha_registro: text('fecha_registro').default(sql`CURRENT_TIMESTAMP`),
  nombre: text('nombre'),
  ip_registro: text('ip_registro'),
  activo: integer('activo').default(1),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
  
  // Campos de Migración 001
  ultimo_uso: text('ultimo_uso'),
  expira_en: text('expira_en'),
  version_app: text('version_app'),
  plataforma: text('plataforma'),
  descripcion: text('descripcion'),
});

// Tablas de seguridad (Migración 001)
export const auditoria_seguridad = sqliteTable('auditoria_seguridad', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  evento: text('evento').notNull(),
  usuario_id: integer('usuario_id').references(() => usuarios.id),
  app_id: text('app_id'),
  ip: text('ip'),
  dispositivo: text('dispositivo'),
  user_agent: text('user_agent'),
  exitoso: integer('exitoso').default(1),
  detalles: text('detalles'),
  severidad: text('severidad').default('info'),
  fecha: text('fecha').default(sql`(datetime('now'))`),
});

export const tokens_revocados = sqliteTable('tokens_revocados', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').unique().notNull(),
  tipo: text('tipo').notNull(),
  usuario_id: integer('usuario_id').references(() => usuarios.id),
  app_id: text('app_id'),
  razon: text('razon'),
  revocado_por: integer('revocado_por').references(() => usuarios.id),
  fecha_revocacion: text('fecha_revocacion').default(sql`(datetime('now'))`),
  expira_original: text('expira_original'),
});

export const historial_passwords = sqliteTable('historial_passwords', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  usuario_id: integer('usuario_id').notNull().references(() => usuarios.id),
  password_hash: text('password_hash').notNull(),
  fecha_cambio: text('fecha_cambio').default(sql`(datetime('now'))`),
});

// Tabla de Refresh Tokens (Migración 002)
export const refresh_tokens = sqliteTable('refresh_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').notNull().unique(),
  usuario_id: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  app_id: integer('app_id').references(() => apps.id, { onDelete: 'cascade' }),
  expira_en: text('expira_en').notNull(),
  creado_en: text('creado_en').default(sql`(datetime('now'))`),
  ultimo_uso: text('ultimo_uso'),
  user_agent: text('user_agent'),
  ip: text('ip'),
  revocado: integer('revocado').default(0),
  revocado_en: text('revocado_en'),
  razon_revocacion: text('razon_revocacion'),
});
