// src/database/drizzle.js
// Conexión a la base de datos usando Drizzle ORM
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import * as schema from './schema/index.js';

dotenv.config();

// Cliente LibSQL
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Instancia de Drizzle con el esquema completo
export const db = drizzle(client, { schema });

// Exportar el cliente raw para queries SQL personalizadas
export const rawClient = client;

export default db;
