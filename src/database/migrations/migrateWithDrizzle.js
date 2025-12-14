// src/database/migrations/migrateWithDrizzle.js
/**
 * Script para aplicar migraciones usando Drizzle Kit
 * Este script reemplaza runMigration.js para el flujo con Drizzle ORM
 */

import { migrate } from 'drizzle-orm/libsql/migrator';
import { db, rawClient } from '../drizzle-client.js';

async function runMigrations() {
  console.log('🚀 Aplicando migraciones con Drizzle...');
  
  try {
    // Aplicar migraciones desde src/database/migrations
    await migrate(db, { 
      migrationsFolder: './src/database/migrations',
      migrationsTable: '__drizzle_migrations'
    });
    
    console.log('✅ Migraciones aplicadas exitosamente');
    
    // Cerrar la conexión
    rawClient.close();
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al aplicar migración:', error.message);
    rawClient.close();
    process.exit(1);
  }
}

runMigrations();
