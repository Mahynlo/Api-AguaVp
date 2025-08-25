//conexion base de datos
// src/database/db.js
import { createClient } from "@libsql/client";

const dbTurso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/**
 * Función helper para convertir BigInt a Number recursivamente
 * Esto es necesario porque Turso/LibSQL devuelve BigInt para los IDs
 * y JSON.stringify no puede serializar BigInt directamente
 */
function convertBigIntToNumber(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToNumber);
  }
  
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigIntToNumber(value);
    }
    return converted;
  }
  
  return obj;
}

/**
 * Wrapper para ejecutar consultas y convertir automáticamente BigInt a Number
 */
async function executeQuery(query) {
  const result = await dbTurso.execute(query);
  
  return {
    ...result,
    rows: convertBigIntToNumber(result.rows),
    lastInsertRowid: typeof result.lastInsertRowid === 'bigint' 
      ? Number(result.lastInsertRowid) 
      : result.lastInsertRowid
  };
}

// Exportación por defecto
export default dbTurso;

// Exportación con función helper
export { executeQuery, convertBigIntToNumber };
