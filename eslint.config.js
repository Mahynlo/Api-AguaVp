// Configuración de ESLint (flat config).
// Objetivo: detectar errores reales (variables no definidas, imports rotos,
// código inalcanzable…) sin imponer estilo. El formato se deja a otra herramienta.

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'pack_tgz/', '.comparar/', 'src/database/migrations/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Variables sin usar: aviso (no error) e ignorar las que empiezan con _
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Los bloques catch vacíos a veces son intencionales en esta base de código
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
];
