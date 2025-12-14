// src/database/migrations/applyTriggers.js
// Aplica los triggers a la base de datos
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function applyTriggers() {
  try {
    console.log('📌 Aplicando triggers a la base de datos...\n');

    // Leer el archivo de triggers
    const triggersSQL = readFileSync(
      join(__dirname, '0000_triggers.sql'),
      'utf-8'
    );

    // Dividir por cada trigger (separados por comentarios o líneas vacías)
    const triggerStatements = triggersSQL
      .split(/(?=CREATE TRIGGER)/g)
      .filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'));

    console.log(`✅ Se encontraron ${triggerStatements.length} triggers para aplicar\n`);

    for (const trigger of triggerStatements) {
      const triggerName = trigger.match(/CREATE TRIGGER.*?(\w+)/)?.[1];
      if (triggerName) {
        try {
          await client.execute(trigger);
          console.log(`  ✓ Trigger aplicado: ${triggerName}`);
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(`  ⚠ Trigger ya existe: ${triggerName}`);
          } else {
            throw error;
          }
        }
      }
    }

    console.log('\n✅ Triggers aplicados exitosamente');
  } catch (error) {
    console.error('❌ Error al aplicar triggers:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

applyTriggers();
