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
  current: 'v1',
  available: {
    v1: {
      version: '1.0.0',
      status: 'stable',
      releaseDate: '2025-01-30',
      description: 'Primera versión estable de la API',
      features: [
        'Gestión de clientes',
        'Gestión de medidores',
        'Control de lecturas',
        'Sistema de facturación',
        'Gestión de pagos',
        'Sistema de tarifas',
        'Rutas de lectura',
        'Autenticación JWT',
        'WebSocket support',
        'Health check endpoints'
      ],
      endpoints: {
        base: '/api/v1',
        documentation: '/api-docs',
        health: '/api/health'
      },
      breaking_changes: [],
      deprecated: false,
      support_until: null
    },
    v2: {
      version: '2.0.0',
      status: 'stable',
      releaseDate: '2025-08-16',
      description: 'Segunda versión con SSE y migración a Turso',
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
        'Turso Database (@libsql/client)',
        'Health check endpoints',
        'Real-time notifications via SSE'
      ],
      endpoints: {
        base: '/api/v2',
        documentation: '/api-docs',
        health: '/api/health',
        events: '/api/v2/events'
      },
      breaking_changes: ['WebSockets reemplazados por SSE', 'Migración de SQLite3 a Turso'],
      deprecated: false,
      support_until: null
    }
  },
  deprecated: [],
  planned: {
    v3: {
      version: '3.0.0',
      status: 'planned',
      expected_release: '2025-12-01',
      description: 'Tercera versión con mejoras de performance y nuevas funcionalidades',
      planned_features: [
        'GraphQL support',
        'Real-time notifications',
        'Advanced reporting',
        'Multi-tenant support',
        'Enhanced security',
        'Caching layer'
      ]
    }
  }
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
  return versions.available.hasOwnProperty(version);
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
