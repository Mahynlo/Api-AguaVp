// Configuración de SQLite local usando Drizzle ORM
// src/database/db-sqlite.js
// Versión mejorada con cache, async/await, y detección robusta de queries

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta de la base de datos
const dbPath = process.env.DB_PATH || path.join(__dirname, 'agua-vp-local.db');

console.log(`📦 Conectando a SQLite en: ${dbPath}`);

// Crear conexión SQLite
const sqlite = new Database(dbPath);

// Habilitar foreign keys (importante para integridad referencial)
sqlite.pragma('foreign_keys = ON');

// Habilitar WAL mode para mejor concurrencia
sqlite.pragma('journal_mode = WAL');

console.log('✅ Configuración SQLite:');
console.log('   - Foreign Keys: ON');
console.log('   - Journal Mode: WAL (Write-Ahead Logging)');

// Crear instancia de Drizzle
const db = drizzle(sqlite);

console.log('✅ Base de datos SQLite inicializada con Drizzle');

// Cache de prepared statements para mejor rendimiento
const stmtCache = new Map();
const CACHE_MAX_SIZE = 100; // Límite de statements en cache

/**
 * Detecta el tipo de query de forma robusta
 * @param {string} sql - Query SQL
 * @returns {'read'|'write'} - Tipo de operación
 */
const detectQueryType = (sql) => {
    // Remover comentarios SQL
    const cleaned = sql
        .replace(/\/\*[\s\S]*?\*\//g, '') // Comentarios /* */
        .replace(/--[^\n]*/g, '')          // Comentarios --
        .trim()
        .toUpperCase();

    // Obtener primera palabra significativa
    const firstWord = cleaned.split(/\s+/)[0];

    // Operaciones de lectura
    const readOps = ['SELECT', 'PRAGMA', 'SHOW', 'EXPLAIN', 'WITH'];

    // Si es una operación de lectura
    if (readOps.includes(firstWord)) {
        return 'read';
    }

    // Por defecto, asumir escritura (más seguro)
    return 'write';
};

/**
 * Obtiene o crea un prepared statement (con cache LRU)
 * @param {string} sql - Query SQL
 * @returns {Statement} - Prepared statement
 */
const getStatement = (sql) => {
    // Si ya está en cache, retornarlo
    if (stmtCache.has(sql)) {
        return stmtCache.get(sql);
    }

    // Si el cache está lleno, eliminar el más antiguo (LRU simple)
    if (stmtCache.size >= CACHE_MAX_SIZE) {
        const firstKey = stmtCache.keys().next().value;
        stmtCache.delete(firstKey);
    }

    // Crear nuevo statement y agregarlo al cache
    const stmt = sqlite.prepare(sql);
    stmtCache.set(sql, stmt);

    return stmt;
};

/**
 * Wrapper para compatibilidad con la API de Turso/LibSQL
 * Ahora completamente asíncrono para mantener compatibilidad total
 */
const dbWrapper = {
    /**
     * Ejecuta una query SQL (compatible con Turso)
     * @param {string|object} sql - Query SQL o objeto {sql, args}
     * @param {array} params - Parámetros opcionales (si sql es string)
     * @returns {Promise<{rows: array, rowsAffected: number, lastInsertRowid: number|null}>}
     */
    execute: async (sql, params = []) => {
        return new Promise((resolve, reject) => {
            try {
                let sqlString = '';
                let sqlParams = [];

                // Normalizar formato de entrada
                if (typeof sql === 'object' && sql.sql) {
                    // Formato Turso: {sql: "...", args: [...]}
                    sqlString = sql.sql;
                    sqlParams = sql.args || [];
                } else {
                    // Formato directo: "SELECT ...", [params]
                    sqlString = sql;
                    sqlParams = params;
                }

                // Detectar tipo de query
                const queryType = detectQueryType(sqlString);

                // Obtener prepared statement (con cache)
                const stmt = getStatement(sqlString);

                if (queryType === 'read') {
                    // Para SELECT: usar .all() que retorna filas
                    const result = sqlParams.length > 0
                        ? stmt.all(...sqlParams)
                        : stmt.all();

                    resolve({
                        rows: result,
                        rowsAffected: 0,
                        lastInsertRowid: null
                    });
                } else {
                    // Para INSERT/UPDATE/DELETE: usar .run() que no retorna filas
                    const result = sqlParams.length > 0
                        ? stmt.run(...sqlParams)
                        : stmt.run();

                    resolve({
                        rows: [],
                        rowsAffected: result.changes || 0,
                        lastInsertRowid: result.lastInsertRowid || null
                    });
                }
            } catch (error) {
                // Log detallado del error
                console.error('❌ Error en execute():', {
                    message: error.message,
                    sql: typeof sql === 'object' ? sql.sql : sql,
                    params: typeof sql === 'object' ? sql.args : params
                });
                reject(error);
            }
        });
    },

    /**
     * Limpia el cache de prepared statements
     * Útil para liberar memoria o en desarrollo
     */
    clearCache: () => {
        stmtCache.clear();
        console.log('🗑️ Cache de prepared statements limpiado');
    },

    /**
     * Obtiene estadísticas del cache
     * @returns {object} - Información del cache
     */
    getCacheStats: () => {
        return {
            size: stmtCache.size,
            maxSize: CACHE_MAX_SIZE,
            queries: Array.from(stmtCache.keys())
        };
    },

    // Exponer la instancia de Drizzle para queries ORM
    drizzle: db,

    // Exponer la conexión SQLite nativa para operaciones avanzadas
    sqlite: sqlite
};

// Exportar el wrapper como default (compatible con import dbTurso)
export default dbWrapper;

// Exportar también las instancias individuales
export { sqlite, db };
