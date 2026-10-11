/**
 * Servicio de reportes y recibos
 *
 * Genera los datos estructurados de los reportes (recibos, financiero, deudores,
 * consumo de agua y lista de lecturas). Optimizado para consultas de alto volumen.
 * Los errores de parámetros se lanzan con crearError(mensaje, 400).
 *
 * Cada reporte vive en su propio archivo dentro de services/reports/.
 */

export { generarRecibos } from './reports/recibos.js';
export { generarReporteFinanciero } from './reports/financiero.js';
export { generarReporteDeudores } from './reports/deudores.js';
export { generarReporteConsumoAgua } from './reports/consumoAgua.js';
export { generarReporteLecturas } from './reports/lecturas.js';
