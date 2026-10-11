// Aplica las migraciones pendientes a la base de datos de desarrollo.
// Usa el mismo migrador que AguaVPServer (src/api-module.js) para que la base
// local quede exactamente igual que la de una instalación de Electron.
//
// Uso: npm run migrate          (usa DB_PATH o src/database/agua-vp-local.db)

import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { customMigrate } from '../src/database/sqlite-migrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'src', 'database', 'agua-vp-local.db');
const migrationsFolder = path.join(__dirname, '..', 'src', 'database', 'migrations');

console.log(`📦 Base de datos: ${dbPath}`);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
customMigrate(sqlite, migrationsFolder);
sqlite.close();

console.log('✅ Migraciones aplicadas');
