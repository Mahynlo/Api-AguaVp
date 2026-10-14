/**
 * Configuración de Versiones de la API
 * 
 * File: src/config/versions.js
 * 
 * Descripción:
 * - Configuración centralizada de las versiones de la API
 * - Información sobre cada versión disponible
 * - Estado de deprecación y fechas de soporte
 */

const versions = {
  current: 'v2',
  available: {
    v2: {
      version: '2.0.0',
      status: 'stable',
      releaseDate: '2025-08-16',
      description: 'API con SQLite local (better-sqlite3 + Drizzle), SSE y sincronización con Turso Cloud',
      features: [
        'Gestión de clientes',
        'Gestión de medidores',
        'Control de lecturas',
        'Sistema de facturación',
        'Gestión de pagos',
        'Sistema de tarifas',
        'Rutas de lectura',
        'Autenticación JWT',
        'Server-Sent Events (SSE)',
        'Sincronización con Turso Cloud',
        'Health check endpoints',
        'Real-time notifications via SSE'
      ],
      endpoints: {
        base: '/api/v2',
        documentation: '/api-docs',
        health: '/api/health',
        events: '/api/v2/events'
      },
      breaking_changes: ['WebSockets reemplazados por SSE'],
      deprecated: false,
      support_until: null
    }
  },
  // v1 retirada: su código se conserva en el tag git "v1-final"
  deprecated: ['v1'],
  planned: {}
};

/**
 * Obtener información de una versión específica
 */
const getVersionInfo = (version) => {
  return versions.available[version] || null;
};

/**
 * Obtener todas las versiones disponibles
 */
const getAvailableVersions = () => {
  return Object.keys(versions.available);
};

/**
 * Verificar si una versión está disponible
 */
const isVersionAvailable = (version) => {
  return Object.hasOwn(versions.available, version);
};

/**
 * Verificar si una versión está deprecada
 */
const isVersionDeprecated = (version) => {
  return versions.deprecated.includes(version);
};

/**
 * Obtener la versión actual
 */
const getCurrentVersion = () => {
  return versions.current;
};

/**
 * Obtener información completa de versiones
 */
const getVersionsInfo = () => {
  return {
    current: versions.current,
    available: getAvailableVersions(),
    deprecated: versions.deprecated,
    planned: Object.keys(versions.planned)
  };
};

export {
  versions,
  getVersionInfo,
  getAvailableVersions,
  isVersionAvailable,
  isVersionDeprecated,
  getCurrentVersion,
  getVersionsInfo
};
