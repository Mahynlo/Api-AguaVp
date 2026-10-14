import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

// Configuración de drizzle-kit (solo desarrollo):
//   npm run db:generate  → genera una migración nueva en src/database/migrations
//   npm run db:studio    → abre Drizzle Studio sobre la base local
// Las migraciones se aplican con `npm run migrate` (mismo migrador que usa Electron).

// Convertir path de Windows a file:// URL si es necesario
function toFileUrl(dbPath: string): string {
  // Si ya es una URL, retornarla
  if (dbPath.startsWith('file:')) {
    return dbPath;
  }

  // Si es path absoluto de Windows (C:\...), convertir a file:///
  if (/^[A-Za-z]:\\/.test(dbPath)) {
    return `file:///${dbPath.replace(/\\/g, '/')}`;
  }

  // Si es path relativo, agregar file:
  return `file:${dbPath}`;
}

const dbPath = process.env.DB_PATH || './src/database/agua-vp-local.db';

export default defineConfig({
  schema: './src/database/schema/index.js',
  out: './src/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: toFileUrl(dbPath)
  },
  verbose: true,
  strict: true,
});
