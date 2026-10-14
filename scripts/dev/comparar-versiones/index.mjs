/**
 * Compara el comportamiento del código actual contra otra versión (por defecto HEAD).
 *
 * Ejecuta los mismos escenarios (escenarios.mjs) sobre los mismos datos de prueba con
 * ambas versiones y compara TODAS las respuestas HTTP y el estado final de TODAS las tablas.
 * Sirve para comprobar que un refactor no cambió el comportamiento.
 *
 * Uso:
 *   node scripts/dev/comparar-versiones/index.mjs            # actual vs HEAD
 *   node scripts/dev/comparar-versiones/index.mjs <ref>      # actual vs <ref> (commit, rama, tag)
 *   node scripts/dev/comparar-versiones/index.mjs HEAD HEAD  # control: una versión contra sí misma
 *
 * Sale con código 1 si hay diferencias.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, '../../..');
const [, , refA = 'HEAD', refB = 'actual'] = process.argv;

// Carpeta src de una versión: 'actual' = árbol de trabajo; otra ref = worktree en .comparar/<sha>
function srcDe(ref) {
    if (ref === 'actual') return path.join(raiz, 'src');
    const sha = execFileSync('git', ['rev-parse', '--short', ref], { cwd: raiz, encoding: 'utf8' }).trim();
    const dir = path.join(raiz, '.comparar', sha);
    if (!fs.existsSync(dir)) {
        execFileSync('git', ['worktree', 'add', '--detach', dir, sha], { cwd: raiz, stdio: 'ignore' });
    }
    return path.join(dir, 'src');
}

function ejecutar(ref) {
    const salida = path.join(os.tmpdir(), `aguavp-comparar-${ref.replace(/\W/g, '_')}-${process.pid}.json`);
    process.stdout.write(`▶ ${ref}: `);
    execFileSync(process.execPath, [path.join(__dirname, 'ejecutar.mjs'), srcDe(ref), salida], { cwd: raiz, stdio: ['ignore', 'inherit', 'inherit'] });
    const datos = JSON.parse(fs.readFileSync(salida, 'utf8'));
    fs.rmSync(salida);
    return datos;
}

// Valores que cambian en cada ejecución aunque el código sea el mismo
function normalizar(valor) {
    return JSON.parse(JSON.stringify(valor)
        .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<JWT>')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
        .replace(/\b[0-9a-f]{40,}\b/gi, '<HEX>')
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIMESTAMP>')
        .replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '<FECHA_HORA>'));
}

function diferencias(a, b, ruta = '', out = []) {
    if (out.length > 30) return out;
    if (JSON.stringify(a) === JSON.stringify(b)) return out;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diferencias(a[k], b[k], `${ruta}${Array.isArray(a) ? `[${k}]` : `.${k}`}`, out);
        return out;
    }
    out.push(`${ruta}\n      ${refA}: ${JSON.stringify(a)?.slice(0, 200)}\n      ${refB}: ${JSON.stringify(b)?.slice(0, 200)}`);
    return out;
}

const A = normalizar(ejecutar(refA));
const B = normalizar(ejecutar(refB));

let total = 0;
console.log(`\nRespuestas (${A.resultados.length} pasos):`);
A.resultados.forEach((ra, i) => {
    const rb = B.resultados[i];
    if (ra.sql) return;
    const d = diferencias(ra, rb);
    total += d.length;
    console.log(`  ${d.length ? '✖' : '✔'} ${String(ra.status).padEnd(4)} ${ra.nombre}`);
    d.forEach((x) => console.log(`    · ${x}`));
});

console.log('\nEstado final de la base:');
for (const tabla of Object.keys({ ...A.dump, ...B.dump })) {
    const d = diferencias(A.dump[tabla], B.dump[tabla], tabla);
    total += d.length;
    if (d.length) { console.log(`  ✖ ${tabla}`); d.forEach((x) => console.log(`    · ${x}`)); }
}
console.log(`  ${Object.keys(A.dump).length} tablas comparadas`);

console.log(total ? `\n✖ ${total} diferencia(s) entre ${refA} y ${refB}` : `\n✔ Sin diferencias entre ${refA} y ${refB}`);
process.exit(total ? 1 : 0);
