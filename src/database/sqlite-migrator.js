/**
 * Migrador SQLite personalizado — compatible con Drizzle ORM
 * 
 * Reemplaza `migrate()` de drizzle-orm/better-sqlite3/migrator para manejar
 * sentencias ALTER COLUMN que drizzle-kit genera pero que SQLite nativo
 * (better-sqlite3) NO soporta.
 * 
 * Implementa el patrón de recreación de tabla recomendado por la documentación
 * oficial de SQLite: https://www.sqlite.org/lang_altertable.html#otheralter
 * 
 * Compatibilidad:
 * - Usa la misma tabla __drizzle_migrations (formato hash + created_at)
 * - Lee el mismo _journal.json del directorio meta/
 * - Cualquier migración sin ALTER COLUMN se ejecuta idéntico a Drizzle
 * - Coexiste con drizzle-orm/migrate() — ambos reconocen las migraciones aplicadas
 * 
 * @module sqlite-migrator
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Patrón para detectar la sintaxis ALTER COLUMN que genera drizzle-kit
//
// Ejemplos que reconoce:
//   ALTER TABLE `medidores` ALTER COLUMN "latitud" TO "latitud" numeric;
//   ALTER TABLE `pagos` ALTER COLUMN "monto" TO "monto" numeric NOT NULL;
//   ALTER TABLE `configuracion_servicio` ALTER COLUMN "dias_gracia" TO "dias_gracia" integer DEFAULT 7;
// ─────────────────────────────────────────────────────────────────────────────
const ALTER_COLUMN_RE = /^\s*ALTER\s+TABLE\s+[`"']?(\w+)[`"']?\s+ALTER\s+COLUMN\s+["'`](\w+)["'`]\s+TO\s+["'`](\w+)["'`]\s+(.+?)\s*;?\s*$/i;

/**
 * Ejecuta migraciones pendientes desde el directorio de migraciones de Drizzle.
 * 
 * Maneja automáticamente sentencias ALTER COLUMN traducéndolas al patrón
 * de recreación de tabla de SQLite. Todo el SQL estándar se ejecuta sin cambios.
 * 
 * @param {import('better-sqlite3').Database} db - Instancia de better-sqlite3
 * @param {string} migrationsFolder - Ruta absoluta al directorio de migraciones
 * @param {Function} [log=console.log] - Función de logging (compatible con EventEmitter)
 */
export function customMigrate(db, migrationsFolder, log = console.log) {
    // ── 1. Crear tabla de tracking (mismo esquema que usa Drizzle) ──
    db.exec(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL,
            created_at numeric
        )
    `);

    // ── 2. Leer journal de migraciones ──
    const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
    if (!fs.existsSync(journalPath)) {
        throw new Error(`[Migrator] Journal no encontrado: ${journalPath}`);
    }
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));

    // ── 3. Determinar última migración aplicada ──
    const lastRow = db.prepare(
        'SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1'
    ).get();
    const lastTimestamp = lastRow ? Number(lastRow.created_at) : -1;

    // ── 4. Aplicar migraciones pendientes en orden del journal ──
    let applied = 0;

    for (const entry of journal.entries) {
        if (entry.when <= lastTimestamp) continue; // Ya aplicada

        const sqlFile = path.join(migrationsFolder, `${entry.tag}.sql`);
        if (!fs.existsSync(sqlFile)) {
            throw new Error(`[Migrator] Archivo de migración no encontrado: ${sqlFile}`);
        }

        const sqlContent = fs.readFileSync(sqlFile, 'utf-8');
        const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');

        // Separar sentencias por el marcador de Drizzle
        const statements = sqlContent
            .split('--> statement-breakpoint')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Detectar si esta migración contiene ALTER COLUMN
        const hasAlterColumn = statements.some(s => ALTER_COLUMN_RE.test(s));

        log(`🔄 Aplicando migración: ${entry.tag} (${statements.length} sentencias${hasAlterColumn ? ' — ALTER COLUMN detectado' : ''})`);

        // ── Si hay ALTER COLUMN: desactivar FKs ANTES de la transacción ──
        // SQLite exige que PRAGMA foreign_keys se cambie fuera de transacciones
        if (hasAlterColumn) {
            db.pragma('foreign_keys = OFF');
        }

        // ── Ejecutar toda la migración en una transacción atómica ──
        const runMigration = db.transaction(() => {
            for (const stmt of statements) {
                const alterMatch = stmt.match(ALTER_COLUMN_RE);

                if (alterMatch) {
                    // Sentencia ALTER COLUMN → traducir a recreación de tabla
                    const [, tableName, oldCol, newCol, definition] = alterMatch;
                    const cleanDef = definition.replace(/;$/, '').trim();
                    log(`   ↳ ALTER COLUMN: ${tableName}.${oldCol} → ${newCol} ${cleanDef}`);
                    alterColumnViaRecreation(db, tableName, oldCol, newCol, cleanDef, log);
                } else {
                    // SQL estándar → ejecutar tal cual
                    const cleanStmt = stmt.endsWith(';') ? stmt : `${stmt};`;
                    db.exec(cleanStmt);
                }
            }

            // Registrar migración aplicada (mismo formato que Drizzle)
            db.prepare(
                'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)'
            ).run(hash, entry.when);
        });

        runMigration();

        // ── Verificar integridad FK después de recreación de tablas ──
        if (hasAlterColumn) {
            const violations = db.pragma('foreign_key_check');
            if (violations.length > 0) {
                log(`   ⚠️ Advertencia: ${violations.length} referencia(s) FK a verificar tras ${entry.tag}`);
                for (const v of violations.slice(0, 5)) {
                    log(`      tabla=${v.table}, rowid=${v.rowid}, parent=${v.parent}, fkid=${v.fkid}`);
                }
            }
            db.pragma('foreign_keys = ON');
        }

        applied++;
        log(`✅ Migración aplicada: ${entry.tag}`);
    }

    // ── Resumen ──
    if (applied === 0) {
        log('📦 Base de datos actualizada — no hay migraciones pendientes.');
    } else {
        log(`📦 ${applied} migración(es) aplicada(s) correctamente.`);
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// RECREACIÓN DE TABLA — Patrón oficial de SQLite para ALTER COLUMN
// Referencia: https://www.sqlite.org/lang_altertable.html#otheralter
//
// Pasos:
//   1. Leer esquema actual desde sqlite_master
//   2. Guardar índices y triggers asociados
//   3. Renombrar tabla original a nombre temporal
//   4. Crear tabla nueva con la definición de columna modificada
//   5. Copiar datos de la tabla temporal a la nueva
//   6. Eliminar tabla temporal
//   7. Recrear índices y triggers
//   8. Verificar integridad (conteo de filas)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica un ALTER COLUMN usando el patrón de recreación de tabla de SQLite.
 * 
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName - Nombre de la tabla
 * @param {string} oldCol - Nombre actual de la columna
 * @param {string} newCol - Nuevo nombre de la columna (generalmente igual)
 * @param {string} newDef - Definición completa: tipo + constraints (ej: "numeric NOT NULL")
 * @param {Function} log - Función de logging
 */
function alterColumnViaRecreation(db, tableName, oldCol, newCol, newDef, log) {
    // ── 1. Obtener CREATE TABLE actual ──
    const tableRow = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);

    if (!tableRow || !tableRow.sql) {
        throw new Error(`[Migrator] Tabla "${tableName}" no encontrada en sqlite_master`);
    }

    // ── 2. Obtener columnas para la copia de datos ──
    const columns = db.pragma(`table_info("${tableName}")`);
    if (!columns || columns.length === 0) {
        throw new Error(`[Migrator] Tabla "${tableName}" no tiene columnas`);
    }

    // Verificar que la columna objetivo existe
    if (!columns.find(c => c.name === oldCol)) {
        throw new Error(`[Migrator] Columna "${oldCol}" no encontrada en tabla "${tableName}"`);
    }

    // ── 3. Guardar conteo de filas para verificación posterior ──
    const rowCount = db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get().cnt;

    // ── 4. Guardar índices ANTES del rename (el SQL referencia el nombre original) ──
    const savedIndexes = db.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL"
    ).all(tableName);

    // ── 5. Guardar triggers ANTES del rename ──
    const savedTriggers = db.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name=? AND sql IS NOT NULL"
    ).all(tableName);

    // ── 6. Construir CREATE TABLE con la columna modificada ──
    const newCreateSql = replaceColumnDefinition(tableRow.sql, oldCol, newCol, newDef);

    // ── 7. Listas de columnas para INSERT ... SELECT ──
    const selectCols = columns.map(c => `"${c.name}"`).join(', ');
    const insertCols = columns.map(c =>
        c.name === oldCol ? `"${newCol}"` : `"${c.name}"`
    ).join(', ');

    // ── 8. Ejecutar recreación ──
    const tempName = `__drizzle_temp_${tableName}`;

    // CRÍTICO: legacy_alter_table = ON evita que SQLite actualice
    // automáticamente las referencias a esta tabla en triggers, views
    // y FK constraints de OTRAS tablas. Sin esto, al renombrar la tabla
    // los triggers de otras tablas quedarían apuntando al nombre temporal
    // y fallarían después de DROP.
    db.pragma('legacy_alter_table = ON');

    // 8a. Renombrar tabla original (solo cambia nombre, no toca triggers/views)
    db.exec(`ALTER TABLE "${tableName}" RENAME TO "${tempName}"`);

    // 8b. Crear tabla nueva con esquema modificado
    db.exec(newCreateSql);

    // 8c. Copiar todos los datos
    db.exec(`INSERT INTO "${tableName}" (${insertCols}) SELECT ${selectCols} FROM "${tempName}"`);

    // 8d. Eliminar tabla temporal (la original renombrada)
    db.exec(`DROP TABLE "${tempName}"`);

    // Restaurar comportamiento normal de ALTER TABLE
    db.pragma('legacy_alter_table = OFF');

    // ── 9. Verificar integridad: conteo de filas ──
    const newRowCount = db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get().cnt;
    if (newRowCount !== rowCount) {
        throw new Error(
            `[Migrator] Error de integridad: "${tableName}" tenía ${rowCount} filas, ahora tiene ${newRowCount}`
        );
    }

    // ── 10. Recrear índices ──
    for (const idx of savedIndexes) {
        try {
            const idxSql = oldCol !== newCol
                ? idx.sql.replace(new RegExp(`"${escapeRegex(oldCol)}"`, 'g'), `"${newCol}"`)
                : idx.sql;
            db.exec(idxSql);
        } catch (err) {
            // El índice podría ya existir si otra sentencia de la migración lo creó
            if (!err.message.includes('already exists')) {
                log(`   ⚠️ No se pudo recrear índice "${idx.name}": ${err.message}`);
            }
        }
    }

    // ── 11. Recrear triggers ──
    for (const trigger of savedTriggers) {
        try {
            const trigSql = oldCol !== newCol
                ? trigger.sql.replace(new RegExp(`"${escapeRegex(oldCol)}"`, 'g'), `"${newCol}"`)
                : trigger.sql;
            db.exec(trigSql);
        } catch (err) {
            if (!err.message.includes('already exists')) {
                log(`   ⚠️ No se pudo recrear trigger "${trigger.name}": ${err.message}`);
            }
        }
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES AUXILIARES DE PARSEO SQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Modifica la definición de una columna dentro de un CREATE TABLE.
 * 
 * Parsea el cuerpo del CREATE TABLE en definiciones individuales (columnas
 * y constraints), encuentra la columna objetivo, reemplaza su definición
 * completa, y reconstruye el statement.
 * 
 * Maneja correctamente paréntesis anidados en expresiones DEFAULT,
 * FOREIGN KEY, CHECK, etc.
 * 
 * @param {string} createSql - El CREATE TABLE completo desde sqlite_master
 * @param {string} oldColName - Nombre actual de la columna
 * @param {string} newColName - Nuevo nombre de la columna
 * @param {string} newDef - Nueva definición (tipo + constraints)
 * @returns {string} CREATE TABLE modificado
 */
function replaceColumnDefinition(createSql, oldColName, newColName, newDef) {
    // Separar encabezado del cuerpo: "CREATE TABLE `name` (" + body + ")"
    const match = createSql.match(
        /^(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?\w+[`"']?\s*\()([\s\S]*)\)\s*;?\s*$/i
    );

    if (!match) {
        throw new Error(
            `[Migrator] No se pudo parsear CREATE TABLE: ${createSql.substring(0, 120)}...`
        );
    }

    const header = match[1]; // "CREATE TABLE `tableName` ("
    const body = match[2];   // contenido entre paréntesis

    // Separar en definiciones individuales (respetando paréntesis anidados)
    const defs = splitByTopLevelCommas(body);

    // Buscar y reemplazar la columna objetivo
    const colRe = new RegExp(
        `^\\s*["\`]?${escapeRegex(oldColName)}["\`]?\\s`,
        'i'
    );

    let found = false;
    for (let i = 0; i < defs.length; i++) {
        if (colRe.test(defs[i])) {
            // Preservar la indentación original
            const indent = defs[i].match(/^(\s*)/)?.[1] || '\t';
            defs[i] = `${indent}\`${newColName}\` ${newDef}`;
            found = true;
            break;
        }
    }

    if (!found) {
        throw new Error(
            `[Migrator] Columna "${oldColName}" no encontrada en CREATE TABLE de "${createSql.substring(0, 80)}"`
        );
    }

    return `${header}${defs.join(',')}\n)`;
}

/**
 * Separa un texto por comas que NO estén dentro de paréntesis.
 * 
 * Necesario para dividir las definiciones de columna en un CREATE TABLE
 * sin romper expresiones como DEFAULT (datetime('now')), FOREIGN KEY (...), etc.
 * 
 * @param {string} text - Cuerpo del CREATE TABLE (sin los paréntesis exteriores)
 * @returns {string[]} Array de definiciones individuales
 */
function splitByTopLevelCommas(text) {
    const parts = [];
    let current = '';
    let depth = 0;

    for (const ch of text) {
        if (ch === '(') {
            depth++;
            current += ch;
        } else if (ch === ')') {
            depth--;
            current += ch;
        } else if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim()) {
        parts.push(current);
    }

    return parts;
}

/**
 * Escapa caracteres especiales de regex en un string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
