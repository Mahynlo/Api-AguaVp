import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();


// Para Turso
/*
export default defineConfig({
  schema: './src/database/schema/index.js',
  out: './src/database/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
  verbose: true,
  strict: true,
});
*/

// Para SQLite local
export default defineConfig({
  schema: './src/database/schema/index.js',
  out: './src/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_DB_PATH || 'file:./src/database/agua-vp-local.db'
  },
  verbose: true,
  strict: true,
});