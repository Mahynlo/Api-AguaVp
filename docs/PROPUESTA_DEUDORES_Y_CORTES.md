# 📋 Propuesta: Sistema de Deudores y Gestión de Cortes

## 🎯 Objetivo
Implementar un sistema completo para gestionar clientes morosos, automatizar cortes de servicio y facilitar reconexiones basándose en la infraestructura existente de facturas y pagos.

---

## 📊 Análisis del Estado Actual

### ✅ Lo que ya está implementado:

**Schema de Base de Datos:**
```javascript
// clientes table
estado_cliente: 'Activo' | 'Inactivo' | 'Eliminado'
// Falta: 'Suspendido' | 'Moroso'

// facturas table
saldo_pendiente: real (actualizado por triggers)
estado: 'Pagado' | 'Pendiente' | 'Vencida'
fecha_vencimiento: text

// pagos table  
metodo_pago: 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Cheque'
monto: real
```

**Triggers Implementados:**
1. ✅ `actualizar_saldo_factura` - Descuenta pagos del saldo
2. ✅ `validar_pago_contra_saldo` - Evita pagos mayores al saldo
3. ✅ `actualizar_estado_factura` - Marca como 'Pagado' cuando saldo = 0

**Lógica de Negocio:**
- ✅ Facturas se generan automáticamente con las lecturas
- ✅ Fecha de vencimiento = fecha_emision + 30 días
- ✅ Sistema de pagos parciales funcional
- ✅ Cálculo de adeudos anteriores en consultas

### ❌ Lo que falta implementar:

1. **Estados de cliente extendidos** (Suspendido, Moroso)
2. **Tabla de cortes** para registrar suspensiones
3. **Lógica de mora automática** (facturas vencidas)
4. **Proceso de corte de servicio**
5. **Proceso de reconexión**
6. **Alertas y notificaciones de mora**
7. **Reportes de deudores**

---

## 🏗️ Propuesta de Implementación

### 1️⃣ **Actualización del Schema de Clientes (Sistema de Semáforo)**

**Modificar enum de estado_cliente:**
```sql
-- Migración: 004_add_estados_mora.sql
ALTER TABLE clientes 
MODIFY estado_cliente TEXT CHECK(
  estado_cliente IN ('Activo', 'Inactivo', 'Suspendido', 'Moroso', 'Eliminado')
);

-- Agregar campos de mora y semáforo de riesgo
ALTER TABLE clientes ADD COLUMN dias_mora INTEGER DEFAULT 0;
ALTER TABLE clientes ADD COLUMN nivel_riesgo INTEGER DEFAULT 0 CHECK(nivel_riesgo BETWEEN 0 AND 3);
ALTER TABLE clientes ADD COLUMN fecha_ultimo_corte TEXT;
ALTER TABLE clientes ADD COLUMN monto_total_adeudado REAL DEFAULT 0.00;
ALTER TABLE clientes ADD COLUMN ultima_notificacion TEXT; -- Fecha última alerta enviada
ALTER TABLE clientes ADD COLUMN fecha_cambio_nivel TEXT; -- Cuándo cambió de nivel por última vez
```

**Sistema de Niveles de Riesgo:**
- **Nivel 0** (🟣 Moroso Inicial): 1-4 días de atraso. Sin acción aún.
- **Nivel 1** (🟡 Recordatorio): 5-14 días. Email/SMS suave.
- **Nivel 2** (🟠 Advertencia): 15-29 días. Advertencia formal.
- **Nivel 3** (🔴 Ultimátum): 30+ días. Riesgo de corte inminente.
- **Suspendido** (🚫): Acción manual del administrador.

**Actualizar schema Drizzle:**
```javascript
// src/database/schema/clientes.js
export const clientes = sqliteTable('clientes', {
  // ... campos existentes ...
  estado_cliente: text('estado_cliente', { 
    enum: ['Activo', 'Inactivo', 'Suspendido', 'Moroso', 'Eliminado'] 
  }).notNull().default('Activo'),
  dias_mora: integer('dias_mora').default(0),
  nivel_riesgo: integer('nivel_riesgo').default(0), // 0-3
  fecha_ultimo_corte: text('fecha_ultimo_corte'),
  monto_total_adeudado: real('monto_total_adeudado').default(0.00),
  ultima_notificacion: text('ultima_notificacion'),
  fecha_cambio_nivel: text('fecha_cambio_nivel'),
});
```

---

### 2️⃣ **Nueva Tabla: cortes**

**Propósito:** Registrar historial de cortes y reconexiones

```sql
-- Migración: 004_add_estados_mora.sql (continuación)
CREATE TABLE IF NOT EXISTS cortes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  medidor_id INTEGER NOT NULL REFERENCES medidores(id),
  tipo_accion TEXT NOT NULL CHECK(tipo_accion IN ('Corte', 'Reconexion')),
  motivo TEXT NOT NULL CHECK(motivo IN ('Mora', 'Solicitud Cliente', 'Mantenimiento', 'Pago Realizado', 'Acuerdo Pago')),
  fecha_accion TEXT NOT NULL,
  monto_adeudado REAL DEFAULT 0.00,
  facturas_pendientes TEXT, -- JSON array de IDs
  realizado_por INTEGER REFERENCES usuarios(id),
  notas TEXT,
  costo_reconexion REAL DEFAULT 0.00,
  fecha_creacion TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_cortes_cliente ON cortes(cliente_id);
CREATE INDEX idx_cortes_medidor ON cortes(medidor_id);
CREATE INDEX idx_cortes_fecha ON cortes(fecha_accion);
```

**Schema Drizzle:**
```javascript
// src/database/schema/cortes.js
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { clientes } from './clientes.js';
import { medidores } from './clientes.js';
import { usuarios } from './usuarios.js';

export const cortes = sqliteTable('cortes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
  medidor_id: integer('medidor_id').notNull().references(() => medidores.id),
  tipo_accion: text('tipo_accion', { 
    enum: ['Corte', 'Reconexion'] 
  }).notNull(),
  motivo: text('motivo', { 
    enum: ['Mora', 'Solicitud Cliente', 'Mantenimiento', 'Pago Realizado', 'Acuerdo Pago'] 
  }).notNull(),
  fecha_accion: text('fecha_accion').notNull(),
  monto_adeudado: real('monto_adeudado').default(0.00),
  facturas_pendientes: text('facturas_pendientes'), // JSON
  realizado_por: integer('realizado_por').references(() => usuarios.id),
  notas: text('notas'),
  costo_reconexion: real('costo_reconexion').default(0.00),
  fecha_creacion: text('fecha_creacion').default(sql`(datetime('now'))`),
});
```

---

### 3️⃣ **Nuevos Triggers para Gestión Automática con Semáforo**

```sql
-- Trigger: Marcar factura como vencida y cliente como Moroso Nivel 0
CREATE TRIGGER IF NOT EXISTS marcar_facturas_vencidas
AFTER INSERT ON facturas
FOR EACH ROW
WHEN NEW.saldo_pendiente > 0 
  AND DATE(NEW.fecha_vencimiento) < DATE('now')
BEGIN
    -- Marcar factura como vencida
    UPDATE facturas
    SET estado = 'Vencida'
    WHERE id = NEW.id;
    
    -- Marcar cliente como Moroso Nivel 0 (sin escalar aún)
    UPDATE clientes
    SET 
      estado_cliente = 'Moroso',
      nivel_riesgo = 0, -- Empieza en nivel 0
      dias_mora = CAST((JULIANDAY('now') - JULIANDAY(NEW.fecha_vencimiento)) AS INTEGER),
      monto_total_adeudado = (
        SELECT COALESCE(SUM(saldo_pendiente), 0) 
        FROM facturas 
        WHERE cliente_id = NEW.cliente_id AND saldo_pendiente > 0
      ),
      fecha_cambio_nivel = datetime('now')
    WHERE id = NEW.cliente_id
      AND estado_cliente NOT IN ('Suspendido'); -- No modificar suspendidos
END;

-- Trigger: Restaurar estado Activo cuando se paga toda la deuda
CREATE TRIGGER IF NOT EXISTS restaurar_estado_activo
AFTER UPDATE OF saldo_pendiente ON facturas
FOR EACH ROW
WHEN NEW.saldo_pendiente = 0
  AND (SELECT COUNT(*) FROM facturas 
       WHERE cliente_id = NEW.cliente_id 
       AND saldo_pendiente > 0) = 0
BEGIN
    UPDATE clientes
    SET 
      estado_cliente = 'Activo',
      dias_mora = 0,
      nivel_riesgo = 0,
      monto_total_adeudado = 0.00,
      fecha_cambio_nivel = datetime('now')
    WHERE id = NEW.cliente_id
      AND estado_cliente = 'Moroso';
END;

-- Trigger: Actualizar dias_mora y monto_total al recibir pagos parciales
CREATE TRIGGER IF NOT EXISTS actualizar_estado_cliente_pago_parcial
AFTER UPDATE OF saldo_pendiente ON facturas
FOR EACH ROW
WHEN NEW.saldo_pendiente > 0 AND NEW.saldo_pendiente < OLD.saldo_pendiente
BEGIN
    UPDATE clientes
    SET 
      monto_total_adeudado = (
        SELECT COALESCE(SUM(saldo_pendiente), 0) 
        FROM facturas 
        WHERE cliente_id = NEW.cliente_id AND saldo_pendiente > 0
      )
    WHERE id = NEW.cliente_id;
END;
```

---

### 4️⃣ **Cron Job: Motor del Semáforo (procesarDeudores.js)**

**Ubicación:** `src/jobs/procesarDeudores.js`

**Propósito:** Script que se ejecuta diariamente para escalar niveles de riesgo automáticamente.

```javascript
/**
 * Procesador Automático de Deudores - Semáforo de Riesgo
 * 
 * Se ejecuta diariamente (3:00 AM) para:
 * 1. Detectar clientes morosos
 * 2. Escalar niveles de riesgo según días de mora
 * 3. Enviar notificaciones automáticas
 * 4. Generar alertas para administradores
 */

import dbTurso from '../database/db-turso.js';
import { reglasCobranza } from '../config/reglasCobranza.js';
import { enviarEmail, enviarSMS } from '../utils/notificaciones.js';

// Managers SSE
let notificationManager = null;

export const setNotificationManager = (manager) => {
  notificationManager = manager;
};

export const procesarDeudores = async () => {
  const timestamp = new Date().toISOString();
  console.log(`🤖 [${timestamp}] Iniciando procesamiento de deudores...`);

  try {
    // 1. OBTENER TODOS LOS CLIENTES MOROSOS
    const query = `
      SELECT 
        c.id,
        c.nombre,
        c.correo,
        c.telefono,
        c.estado_cliente,
        c.nivel_riesgo,
        c.dias_mora,
        c.monto_total_adeudado,
        c.ultima_notificacion,
        MIN(f.fecha_vencimiento) as factura_mas_antigua
      FROM clientes c
      JOIN facturas f ON f.cliente_id = c.id
      WHERE c.estado_cliente = 'Moroso'
        AND f.saldo_pendiente > 0
      GROUP BY c.id
      ORDER BY c.dias_mora DESC
    `;

    const result = await dbTurso.execute({ sql: query, args: [] });
    const deudores = result.rows;

    console.log(`📊 Total deudores encontrados: ${deudores.length}`);

    let procesados = 0;
    let escalados = 0;
    let notificacionesEnviadas = 0;

    // 2. PROCESAR CADA CLIENTE
    for (const cliente of deudores) {
      procesados++;
      
      // Calcular días de mora reales
      const diasMoraActual = Math.floor(
        (Date.now() - new Date(cliente.factura_mas_antigua).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determinar nuevo nivel según reglas
      const nuevoNivel = determinarNivelRiesgo(diasMoraActual);
      const nivelActual = Number(cliente.nivel_riesgo);

      // 3. VERIFICAR SI DEBE ESCALAR DE NIVEL
      if (nuevoNivel > nivelActual) {
        escalados++;
        
        console.log(`⬆️ Escalando cliente ${cliente.nombre} de Nivel ${nivelActual} → ${nuevoNivel}`);

        // Actualizar nivel en base de datos
        await dbTurso.execute({
          sql: `
            UPDATE clientes 
            SET 
              nivel_riesgo = ?,
              dias_mora = ?,
              fecha_cambio_nivel = datetime('now'),
              ultima_notificacion = datetime('now')
            WHERE id = ?
          `,
          args: [nuevoNivel, diasMoraActual, cliente.id]
        });

        // 4. ENVIAR NOTIFICACIONES SEGÚN NIVEL
        const mensajeConfig = reglasCobranza.niveles[nuevoNivel];
        
        if (mensajeConfig && cliente.correo) {
          try {
            // Email
            await enviarEmail({
              to: cliente.correo,
              subject: mensajeConfig.asuntoEmail,
              template: mensajeConfig.plantillaEmail,
              data: {
                nombre: cliente.nombre,
                monto: cliente.monto_total_adeudado,
                dias: diasMoraActual,
                nivel: nuevoNivel
              }
            });

            // SMS (si está configurado y el nivel es crítico)
            if (nuevoNivel >= 2 && cliente.telefono) {
              await enviarSMS({
                to: cliente.telefono,
                message: mensajeConfig.mensajeSMS
                  .replace('{nombre}', cliente.nombre)
                  .replace('{monto}', cliente.monto_total_adeudado)
              });
            }

            notificacionesEnviadas++;
          } catch (error) {
            console.error(`❌ Error enviando notificación a ${cliente.nombre}:`, error.message);
          }
        }

        // 5. NOTIFICAR A ADMINISTRADORES VÍA SSE
        if (notificationManager) {
          const nivelTexto = ['Moroso Inicial', 'Recordatorio', 'Advertencia', 'ULTIMÁTUM'][nuevoNivel];
          const emoji = ['🟣', '🟡', '🟠', '🔴'][nuevoNivel];
          
          notificationManager.alertaSistema(
            `${emoji} Cliente escaló a ${nivelTexto}`,
            nuevoNivel >= 2 ? 'warning' : 'info',
            {
              cliente_id: Number(cliente.id),
              cliente_nombre: cliente.nombre,
              nivel_anterior: nivelActual,
              nivel_nuevo: nuevoNivel,
              dias_mora: diasMoraActual,
              monto_adeudado: Number(cliente.monto_total_adeudado),
              accion: 'escalamiento_nivel'
            }
          );
        }

        // 6. REGISTRAR EN TABLA DE ALERTAS
        await dbTurso.execute({
          sql: `
            INSERT INTO alertas_mora (
              cliente_id, nivel_riesgo, dias_mora, monto_adeudado, 
              accion_tomada, notificacion_enviada
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          args: [
            cliente.id,
            nuevoNivel,
            diasMoraActual,
            cliente.monto_total_adeudado,
            `Escalado a Nivel ${nuevoNivel}`,
            cliente.correo ? 'Si' : 'No'
          ]
        });
      }
    }

    // 7. RESUMEN FINAL
    const resumen = {
      timestamp,
      total_deudores: deudores.length,
      procesados,
      escalados,
      notificaciones_enviadas: notificacionesEnviadas
    };

    console.log(`✅ Procesamiento completado:`, resumen);

    // Notificar resumen a admin
    if (notificationManager && escalados > 0) {
      notificationManager.alertaSistema(
        `Procesamiento de deudores completado`,
        'info',
        {
          ...resumen,
          accion: 'procesamiento_deudores_completado'
        }
      );
    }

    return resumen;

  } catch (error) {
    console.error('❌ Error en procesamiento de deudores:', error);
    throw error;
  }
};

/**
 * Determina el nivel de riesgo según días de mora
 */
function determinarNivelRiesgo(diasMora) {
  const reglas = reglasCobranza.escalamiento;
  
  if (diasMora >= reglas.nivel3) return 3; // 🔴 ULTIMÁTUM
  if (diasMora >= reglas.nivel2) return 2; // 🟠 ADVERTENCIA
  if (diasMora >= reglas.nivel1) return 1; // 🟡 RECORDATORIO
  return 0; // 🟣 MOROSO INICIAL
}

/**
 * Ejecutar manualmente (endpoint API)
 */
export const ejecutarProcesamientoManual = async (req, res) => {
  try {
    console.log('📌 Procesamiento manual iniciado por:', req.usuario?.username || 'Desconocido');
    
    const resultado = await procesarDeudores();
    
    return res.status(200).json({
      success: true,
      mensaje: 'Procesamiento de deudores ejecutado correctamente',
      ...resultado
    });
  } catch (error) {
    console.error('Error en procesamiento manual:', error);
    return res.status(500).json({ 
      error: 'Error al procesar deudores',
      details: error.message 
    });
  }
};
```

**Archivo de Configuración: `src/config/reglasCobranza.js`**

```javascript
/**
 * Reglas de Cobranza - Configuración del Semáforo
 */

export const reglasCobranza = {
  // Días para escalar cada nivel
  escalamiento: {
    nivel1: 5,   // 🟡 Recordatorio
    nivel2: 15,  // 🟠 Advertencia
    nivel3: 30   // 🔴 ULTIMÁTUM
  },

  // Configuración de notificaciones por nivel
  niveles: {
    0: {
      // 🟣 Moroso Inicial (1-4 días)
      nombre: 'Moroso Inicial',
      emoji: '🟣',
      accion: 'Ninguna (período de gracia)',
      enviarNotificacion: false
    },
    1: {
      // 🟡 NIVEL 1: Recordatorio Amigable
      nombre: 'Recordatorio',
      emoji: '🟡',
      accion: 'Enviar email suave',
      enviarNotificacion: true,
      asuntoEmail: '💧 Recordatorio: Factura de Agua Pendiente',
      plantillaEmail: 'recordatorio_nivel1',
      mensajeSMS: null // No SMS en nivel 1
    },
    2: {
      // 🟠 NIVEL 2: Advertencia Formal
      nombre: 'Advertencia',
      emoji: '🟠',
      accion: 'Email + SMS advertencia',
      enviarNotificacion: true,
      asuntoEmail: '⚠️ ADVERTENCIA: Factura Vencida - Riesgo de Suspensión',
      plantillaEmail: 'advertencia_nivel2',
      mensajeSMS: 'AGUAVP: Estimado/a {nombre}, su servicio tiene una deuda de ${monto}. Pague antes de 15 días para evitar corte.'
    },
    3: {
      // 🔴 NIVEL 3: ULTIMÁTUM
      nombre: 'ULTIMÁTUM',
      emoji: '🔴',
      accion: 'Email URGENTE + SMS + Llamada',
      enviarNotificacion: true,
      asuntoEmail: '🚨 URGENTE: Última Oportunidad - Evite el Corte de Servicio',
      plantillaEmail: 'ultimatum_nivel3',
      mensajeSMS: '🚨 AGUAVP URGENTE: {nombre}, deuda de ${monto}. Pague HOY para evitar corte inmediato del servicio.'
    }
  },

  // Configuración del cron job
  cron: {
    horario: '0 3 * * *', // 3:00 AM todos los días
    timezone: 'America/Bogota'
  },

  // Costos
  costos: {
    reconexion: 50000, // COP
    intereses: {
      activo: false, // ¿Cobrar intereses?
      porcentajeMensual: 0.02 // 2% mensual
    }
  }
};
```

**Configurar Cron Job (con node-cron):**

```javascript
// src/server.js o src/jobs/index.js
import cron from 'node-cron';
import { procesarDeudores, setNotificationManager } from './jobs/procesarDeudores.js';
import { reglasCobranza } from './config/reglasCobranza.js';

// Configurar managers SSE
setNotificationManager(notificationManager);

// Programar ejecución diaria a las 3:00 AM
cron.schedule(reglasCobranza.cron.horario, async () => {
  console.log('⏰ Ejecutando procesamiento automático de deudores...');
  try {
    await procesarDeudores();
  } catch (error) {
    console.error('Error en cron de deudores:', error);
  }
}, {
  timezone: reglasCobranza.cron.timezone
});

console.log('✅ Cron job de deudores configurado:', reglasCobranza.cron.horario);
```

---

### 5️⃣ **Nueva Tabla: alertas_mora**

Registra cada escalamiento de nivel para auditoría:

```sql
CREATE TABLE IF NOT EXISTS alertas_mora (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  nivel_riesgo INTEGER NOT NULL CHECK(nivel_riesgo BETWEEN 0 AND 3),
  dias_mora INTEGER NOT NULL,
  monto_adeudado REAL NOT NULL,
  accion_tomada TEXT NOT NULL,
  notificacion_enviada TEXT, -- 'Si' | 'No' | 'Error'
  fecha_creacion TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_alertas_cliente ON alertas_mora(cliente_id);
CREATE INDEX idx_alertas_fecha ON alertas_mora(fecha_creacion);
```

---

### 6️⃣ **Nuevo Controlador: deudoresController.js**

**Ubicación:** `src/v2/controllers/deudoresController.js`

**Funcionalidades:**

```javascript
/**
 * Controlador de Deudores y Cortes - V2
 * 
 * Gestiona clientes morosos, cortes de servicio y reconexiones
 */

import dbTurso from '../../database/db-turso.js';

const deudoresController = {

  /**
   * 📊 Obtener lista de deudores
   * GET /api/v2/deudores/listar?dias_mora=15&ordenar=monto_desc
   */
  async listarDeudores(req, res) {
    // Consulta con:
    // - Clientes con estado Moroso o facturas vencidas
    // - Total adeudado por cliente
    // - Días de mora más antiguo
    // - Cantidad de facturas pendientes
    // - Última factura vencida
    // - Información de medidor
  },

  /**
   * 📋 Obtener detalle de deuda de un cliente
   * GET /api/v2/deudores/:cliente_id/detalle
   */
  async obtenerDetalleDeuda(req, res) {
    // Información completa:
    // - Facturas pendientes (individual)
    // - Pagos parciales realizados
    // - Historial de cortes
    // - Plan de pagos (si existe)
    // - Monto total + intereses (si aplica)
  },

  /**
   * ⚠️ Generar orden de corte
   * POST /api/v2/deudores/generar-orden-corte
   * Body: { cliente_id, medidor_id, motivo, notas, realizado_por }
   */
  async generarOrdenCorte(req, res) {
    // 1. Validar que cliente tiene deuda
    // 2. Validar que no está ya suspendido
    // 3. Calcular monto total adeudado
    // 4. Insertar en tabla cortes (tipo: Corte)
    // 5. Actualizar estado_cliente a 'Suspendido'
    // 6. Actualizar estado_medidor a 'Inactivo'
    // 7. Notificar por SSE
  },

  /**
   * ✅ Registrar corte ejecutado
   * POST /api/v2/deudores/registrar-corte/:corte_id
   */
  async registrarCorteEjecutado(req, res) {
    // Confirmar que el corte físico se realizó
  },

  /**
   * 🔌 Generar orden de reconexión
   * POST /api/v2/deudores/generar-reconexion
   * Body: { cliente_id, medidor_id, monto_pagado, costo_reconexion, realizado_por }
   */
  async generarReconexion(req, res) {
    // 1. Validar que cliente pagó deuda o hay acuerdo
    // 2. Validar que está suspendido
    // 3. Insertar en tabla cortes (tipo: Reconexion)
    // 4. Actualizar estado_cliente a 'Activo'
    // 5. Actualizar estado_medidor a 'Activo'
    // 6. Registrar costo de reconexión (si aplica)
    // 7. Notificar por SSE
  },

  /**
   * 📈 Estadísticas de morosidad
   * GET /api/v2/deudores/estadisticas
   */
  async obtenerEstadisticas(req, res) {
    // Resumen general:
    // - Total clientes morosos
    // - Monto total adeudado
    // - Promedio de días de mora
    // - Clientes con corte activo
    // - Tendencia mensual
  },

  /**
   * 🔔 Enviar alertas de mora
   * POST /api/v2/deudores/enviar-alertas
   * Body: { dias_previos: 3 } // Alertar antes de vencimiento
   */
  async enviarAlertasMora(req, res) {
    // 1. Buscar facturas próximas a vencer
    // 2. Buscar facturas ya vencidas
    // 3. Generar notificaciones SSE
    // 4. Opcional: enviar correos/SMS
  },

  /**
   * 📄 Reporte de cortes realizados
   * GET /api/v2/deudores/reporte-cortes?fecha_inicio&fecha_fin
   */
  async reporteCortes(req, res) {
    // Listado de cortes y reconexiones en rango de fechas
  },

  /**
   * 💰 Crear acuerdo de pago
   * POST /api/v2/deudores/acuerdo-pago
   * Body: { cliente_id, monto_total, cuotas, fecha_inicio }
   */
  async crearAcuerdoPago(req, res) {
    // Para clientes que negocian pago en cuotas
    // (Requiere tabla adicional: acuerdos_pago)
  }
};

export default deudoresController;
```

---

### 5️⃣ **Nuevas Rutas**

**Ubicación:** `src/v2/routes/deudores.js`

```javascript
import express from 'express';
import deudoresController from '../controllers/deudoresController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

// 📊 Consultas
router.get('/listar', authMiddleware, deudoresController.listarDeudores);
router.get('/estadisticas', authMiddleware, deudoresController.obtenerEstadisticas);
router.get('/:cliente_id/detalle', authMiddleware, deudoresController.obtenerDetalleDeuda);
router.get('/reporte-cortes', authMiddleware, deudoresController.reporteCortes);

// ⚠️ Gestión de cortes
router.post('/generar-orden-corte', authMiddleware, deudoresController.generarOrdenCorte);
router.post('/registrar-corte/:corte_id', authMiddleware, deudoresController.registrarCorteEjecutado);

// 🔌 Reconexiones
router.post('/generar-reconexion', authMiddleware, deudoresController.generarReconexion);

// 🔔 Alertas
router.post('/enviar-alertas', authMiddleware, deudoresController.enviarAlertasMora);

// 💰 Acuerdos de pago (opcional)
router.post('/acuerdo-pago', authMiddleware, deudoresController.crearAcuerdoPago);

export default router;
```

**Registrar en router principal:**
```javascript
// src/routes/api-router.js
import deudoresRoutes from './v2/routes/deudores.js';

router.use('/api/v2/deudores', appKeyMiddleware, deudoresRoutes);
```

---

### 6️⃣ **Tabla Opcional: acuerdos_pago**

Para clientes que negocian pago en cuotas:

```sql
CREATE TABLE IF NOT EXISTS acuerdos_pago (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  monto_total REAL NOT NULL,
  monto_pagado REAL DEFAULT 0.00,
  numero_cuotas INTEGER NOT NULL,
  cuotas_pagadas INTEGER DEFAULT 0,
  monto_cuota REAL NOT NULL,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  estado TEXT NOT NULL CHECK(estado IN ('Activo', 'Completado', 'Cancelado', 'Incumplido')),
  creado_por INTEGER REFERENCES usuarios(id),
  notas TEXT,
  fecha_creacion TEXT DEFAULT (datetime('now'))
);
```

---

## 🎨 Flujo de Trabajo Completo: El Semáforo en Acción

### **🔄 Ciclo de Vida: Semáforo de Riesgo**

```
┌─────────────────────────────────────────────────────────────┐
│                    EL SEMÁFORO DE RIESGO                     │
└─────────────────────────────────────────────────────────────┘

    🟢 ACTIVO
      │
      │ Factura vence + 1 día sin pago
      ▼
    🟣 MOROSO NIVEL 0 (1-4 días)
      │ ← Período de gracia, sin acción
      │
      │ +5 días (Cron Job a las 3 AM)
      ▼
    🟡 NIVEL 1: RECORDATORIO (5-14 días)
      │ ✉️ Email suave: "Recuerde pagar su factura"
      │
      │ +10 días más (Cron Job)
      ▼
    🟠 NIVEL 2: ADVERTENCIA (15-29 días)
      │ ✉️ Email + 📱 SMS: "Riesgo de suspensión"
      │
      │ +15 días más (Cron Job)
      ▼
    🔴 NIVEL 3: ULTIMÁTUM (30+ días)
      │ 🚨 Email URGENTE + SMS + Alerta Admin
      │ "Corte inminente"
      │
      │ Acción MANUAL del Administrador
      ▼
    🚫 SUSPENDIDO / CORTADO
      │ ⚠️ Servicio físicamente cortado
      │
      │ Cliente paga deuda + costo reconexión
      ▼
    🔧 ORDEN DE RECONEXIÓN
      │ Técnico ejecuta reconexión física
      ▼
    🟢 ACTIVO (Restaurado)

┌─────────────────────────────────────────────────────────────┐
│ 🔄 RECUPERACIÓN AUTOMÁTICA (En cualquier nivel)             │
│                                                              │
│  Cliente paga factura completa                              │
│         ↓                                                    │
│  [TRIGGER] Detecta saldo = 0                                │
│         ↓                                                    │
│  estado_cliente → 'Activo'                                  │
│  nivel_riesgo → 0                                           │
│  dias_mora → 0                                              │
│         ↓                                                    │
│  🟢 RESTAURADO AUTOMÁTICAMENTE                              │
└─────────────────────────────────────────────────────────────┘
```

---

### **⏰ El Motor: ¿Qué pasa cada noche a las 3:00 AM?**

```
    ⏰ 3:00 AM (Disparador Cron)
              ⬇️
    ┌──────────────────────┐
    │ LEER Base de Datos   │ 🔍 SELECT * FROM clientes
    │ WHERE estado='Moroso'│    WHERE estado = 'Moroso'
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │   CICLO FOR (Bucle)  │ 🔄 Para cada cliente moroso...
    └──────────┬───────────┘
               │
      ┌────────▼─────────┐      ┌──────────────────┐
      │ COMPARAR REGLAS  │ ⬅️   │ ⚙️ reglasCobranza│
      │ (¿Días >= 5?)    │      │    .js           │
      │ (¿Días >= 15?)   │      │ nivel1: 5 días   │
      │ (¿Días >= 30?)   │      │ nivel2: 15 días  │
      └────────┬─────────┘      │ nivel3: 30 días  │
               │                 └──────────────────┘
    ¿Cumple condición para subir nivel?
       ├── NO ➡️ Siguiente Cliente
       │
       └── SI ⬇️
    ┌──────────────────────┐
    │ 1. UPDATE clientes   │ 💾 SET nivel_riesgo = 1, 2 o 3
    │    SET nivel_riesgo  │    SET fecha_cambio_nivel = now()
    │ 2. INSERT alertas    │ 📝 Registrar en tabla alertas_mora
    │ 3. ENVIAR Email      │ ✉️ Template según nivel
    │ 4. ENVIAR SMS        │ 📱 Solo Nivel 2 y 3
    │ 5. ALERTA SSE Admin  │ 🔔 "Cliente escaló a Nivel X"
    └──────────────────────┘
               │
               ▼
        📊 RESUMEN FINAL
        "X clientes escalados"
```

---

### **📖 Ejemplo Práctico: El Caso de "Pedro el Olvidadizo"**

**Timeline completa:**

```
┌─────────────────────────────────────────────────────────────┐
│ 1 ENERO                                                      │
│ ✅ Se genera factura de $200.000                            │
│ 📅 Fecha vencimiento: 1 Febrero                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2 FEBRERO (Día +1)                                          │
│ ⚠️ Pedro NO pagó                                            │
│                                                              │
│ 🤖 SISTEMA (Trigger automático):                           │
│    ├─ facturas.estado → 'Vencida'                          │
│    ├─ clientes.estado_cliente → 'Moroso'                   │
│    ├─ clientes.nivel_riesgo → 0 (🟣 Gracia)               │
│    └─ clientes.dias_mora → 1                               │
│                                                              │
│ 📧 Acción: NINGUNA (período de gracia)                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 7 FEBRERO (Día +6)                                          │
│ ⏰ Cron Job ejecuta a las 3:00 AM                           │
│                                                              │
│ 🤖 SISTEMA (procesarDeudores.js):                          │
│    ├─ Detecta: dias_mora = 6                               │
│    ├─ Regla: Nivel 1 = 5 días ✅ (6 >= 5)                 │
│    ├─ UPDATE nivel_riesgo → 1 (🟡)                        │
│    └─ fecha_cambio_nivel → '2025-02-07 03:00:00'          │
│                                                              │
│ 📧 Email a Pedro:                                           │
│    Asunto: "💧 Recordatorio: Factura Pendiente"            │
│    Mensaje: "Hola Pedro, te recordamos que tienes una      │
│             factura de $200.000 pendiente. ¡Gracias!"      │
│                                                              │
│ 🔔 SSE a Admin:                                             │
│    "🟡 Pedro Gómez escaló a Nivel 1 (Recordatorio)"       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 20 FEBRERO (Día +19)                                        │
│ ⏰ Cron Job ejecuta a las 3:00 AM                           │
│                                                              │
│ 🤖 SISTEMA:                                                 │
│    ├─ Detecta: dias_mora = 19                              │
│    ├─ Regla: Nivel 2 = 15 días ✅ (19 >= 15)              │
│    ├─ UPDATE nivel_riesgo → 2 (🟠)                        │
│    └─ INSERT alertas_mora (registro)                       │
│                                                              │
│ ✉️ Email + 📱 SMS a Pedro:                                 │
│    Email: "⚠️ ADVERTENCIA: Riesgo de Suspensión"          │
│    SMS: "AGUAVP: Deuda $200.000. Pague antes de 11 días   │
│          para evitar corte del servicio."                   │
│                                                              │
│ 🔔 SSE a Admin:                                             │
│    "🟠 Pedro Gómez escaló a Nivel 2 (ADVERTENCIA)"        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 25 FEBRERO (Día +24) - ¡PEDRO PAGA! 💰                    │
│ 👤 Pedro va a la oficina y paga $200.000                   │
│                                                              │
│ 🤖 SISTEMA (Trigger de pago):                              │
│    1. UPDATE facturas SET saldo_pendiente = 0             │
│    2. UPDATE facturas SET estado = 'Pagado'               │
│    3. [TRIGGER] Detecta: saldo = 0 en TODAS las facturas  │
│    4. UPDATE clientes:                                      │
│       ├─ estado_cliente → 'Activo' 🟢                     │
│       ├─ nivel_riesgo → 0                                  │
│       ├─ dias_mora → 0                                     │
│       ├─ monto_total_adeudado → 0.00                      │
│       └─ fecha_cambio_nivel → now()                        │
│                                                              │
│ 🔔 SSE a Admin:                                             │
│    "✅ Pedro Gómez pagó su deuda - Restaurado a ACTIVO"   │
│                                                              │
│ 📊 RESULTADO:                                               │
│    Pedro nunca llegó al Nivel 3 (ULTIMÁTUM)               │
│    El sistema lo devolvió automáticamente a 🟢 ACTIVO     │
└─────────────────────────────────────────────────────────────┘
```

---

### **❌ Escenario Alternativo: Pedro NO paga (Corte)**

```
┌─────────────────────────────────────────────────────────────┐
│ 5 MARZO (Día +33)                                           │
│ ⏰ Cron Job ejecuta a las 3:00 AM                           │
│                                                              │
│ 🤖 SISTEMA:                                                 │
│    ├─ Detecta: dias_mora = 33                              │
│    ├─ Regla: Nivel 3 = 30 días ✅ (33 >= 30)              │
│    ├─ UPDATE nivel_riesgo → 3 (🔴 ULTIMÁTUM)              │
│                                                              │
│ 🚨 Email URGENTE + SMS a Pedro:                            │
│    Email: "🚨 ÚLTIMA OPORTUNIDAD - Evite el Corte"         │
│    SMS: "AGUAVP URGENTE: Deuda $200.000. Pague HOY        │
│          para evitar corte INMEDIATO."                      │
│                                                              │
│ 🔔 SSE a Admin con PRIORIDAD ALTA:                         │
│    "🔴 Pedro Gómez en NIVEL 3 - Corte Inminente"          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 10 MARZO - ACCIÓN MANUAL DEL ADMINISTRADOR                  │
│ 👤 Admin genera orden de corte desde dashboard             │
│                                                              │
│ 📝 POST /api/v2/deudores/generar-orden-corte               │
│ Body: {                                                     │
│   cliente_id: 45,                                           │
│   medidor_id: 67,                                           │
│   motivo: "Mora",                                           │
│   realizado_por: 10                                         │
│ }                                                            │
│                                                              │
│ 🤖 SISTEMA:                                                 │
│    1. INSERT INTO cortes (tipo: 'Corte')                   │
│    2. UPDATE clientes SET estado_cliente = 'Suspendido'    │
│    3. UPDATE medidores SET estado_medidor = 'Inactivo'     │
│    4. SSE: "🚫 Orden de corte generada para Pedro"        │
│                                                              │
│ 👷 Técnico recibe orden y ejecuta corte físico             │
│ 🔴 Servicio de agua CORTADO                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 15 MARZO - PEDRO PAGA + RECONEXIÓN                         │
│ 💰 Pedro paga $200.000 (deuda) + $50.000 (reconexión)     │
│                                                              │
│ 📝 Registro de pago actualiza facturas (Trigger)           │
│                                                              │
│ 👤 Admin genera orden de reconexión:                       │
│ POST /api/v2/deudores/generar-reconexion                   │
│ Body: {                                                     │
│   cliente_id: 45,                                           │
│   monto_pagado: 200000,                                     │
│   costo_reconexion: 50000,                                  │
│   realizado_por: 10                                         │
│ }                                                            │
│                                                              │
│ 🤖 SISTEMA:                                                 │
│    1. INSERT INTO cortes (tipo: 'Reconexion')              │
│    2. UPDATE clientes SET estado_cliente = 'Activo' 🟢    │
│    3. UPDATE medidores SET estado_medidor = 'Activo'       │
│    4. SSE: "✅ Reconexión aprobada para Pedro"            │
│                                                              │
│ 👷 Técnico reconecta servicio                              │
│ 🟢 AGUA RESTAURADA                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Endpoints de Documentación

Agregar a `RUTAS_API_V2_ENDPOINTS.md`:

```markdown
## 💸 DEUDORES - Gestión de Morosidad y Cortes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v2/deudores/listar` | Listar clientes morosos |
| GET | `/api/v2/deudores/:cliente_id/detalle` | Detalle de deuda de cliente |
| POST | `/api/v2/deudores/generar-orden-corte` | Generar orden de corte |
| POST | `/api/v2/deudores/generar-reconexion` | Generar reconexión |
| GET | `/api/v2/deudores/estadisticas` | Estadísticas de morosidad |
| POST | `/api/v2/deudores/enviar-alertas` | Enviar alertas de mora |
| GET | `/api/v2/deudores/reporte-cortes` | Reporte de cortes |

### GET /listar
Query params: `?dias_mora=15&ordenar=monto_desc&estado=Moroso`

### POST /generar-orden-corte
```json
{
  "cliente_id": 45,
  "medidor_id": 67,
  "motivo": "Mora",
  "notas": "Cliente con 45 días de mora",
  "realizado_por": 10
}
```

### POST /generar-reconexion
```json
{
  "cliente_id": 45,
  "medidor_id": 67,
  "monto_pagado": 125000,
  "costo_reconexion": 50000,
  "realizado_por": 10,
  "notas": "Pagó deuda completa"
}
```
```

---

## ⚙️ Configuración del Sistema

**Variables de entorno opcionales:**
```env
# Configuración de mora
DIAS_ALERTA_PREVENCIMIENTO=3
DIAS_MORA_AUTOMATICA=30
COSTO_RECONEXION=50000
INTERES_MORA_MENSUAL=0.02
```

---

## 🔔 Notificaciones SSE

Nuevos eventos a implementar:

```javascript
// En deudoresController.js
notificationManager.alertaSistema(
  'Cliente entró en mora',
  'warning',
  {
    cliente_id: 45,
    cliente_nombre: 'Juan Pérez',
    monto_adeudado: 125000,
    dias_mora: 15,
    accion: 'mora_detectada'
  }
);

notificationManager.alertaSistema(
  'Orden de corte generada',
  'error',
  {
    corte_id: 12,
    cliente_nombre: 'Juan Pérez',
    medidor_numero: 'MED-001',
    accion: 'corte_generado'
  }
);

notificationManager.alertaSistema(
  'Reconexión aprobada',
  'success',
  {
    cliente_nombre: 'Juan Pérez',
    monto_pagado: 125000,
    accion: 'reconexion_aprobada'
  }
);
```

---

## 📝 Plan de Implementación

### **Fase 1: Base de Datos y Configuración** (1-2 días)
- [ ] Crear migración `004_add_estados_mora.sql`
- [ ] Actualizar schema de clientes (agregar `nivel_riesgo`, `ultima_notificacion`, etc.)
- [ ] Crear tabla `cortes`
- [ ] Crear tabla `alertas_mora`
- [ ] Crear tabla `acuerdos_pago` (opcional)
- [ ] Implementar triggers actualizados (con niveles de riesgo)
- [ ] Ejecutar migraciones en Turso

### **Fase 2: Cron Job y Reglas de Cobranza** (2-3 días)
- [ ] Crear `src/config/reglasCobranza.js`
- [ ] Crear `src/jobs/procesarDeudores.js`
- [ ] Implementar función `determinarNivelRiesgo()`
- [ ] Configurar cron job en `server.js`
- [ ] Crear plantillas de email por nivel
- [ ] Integrar servicio de SMS (Twilio/similar)
- [ ] Agregar notificaciones SSE para escalamientos

### **Fase 3: Controlador y Rutas** (2-3 días)
- [ ] Crear `deudoresController.js` con todas las funciones
- [ ] Agregar endpoint `POST /procesar-manualmente` (ejecutar cron manualmente)
- [ ] Crear archivo de rutas `deudores.js`
- [ ] Registrar rutas en router principal
- [ ] Implementar función `obtenerHistorialNiveles()`

### **Fase 4: Testing y Validación** (1-2 días)
- [ ] Probar flujo de mora automática con datos de prueba
- [ ] Probar escalamiento de niveles (forzar fechas)
- [ ] Probar cron job manual
- [ ] Probar generación de cortes
- [ ] Probar reconexiones
- [ ] Validar triggers con múltiples escenarios
- [ ] Verificar notificaciones Email/SMS
- [ ] Verificar alertas SSE

### **Fase 5: Documentación** (1 día)
- [ ] Actualizar `RUTAS_API_V2_ENDPOINTS.md` con endpoints de deudores
- [ ] Crear ejemplos de uso del semáforo
- [ ] Documentar configuración de `reglasCobranza.js`
- [ ] Documentar flujos de trabajo completos
- [ ] Crear guía de troubleshooting

---

## 🎯 Beneficios del Sistema de Semáforo

1. ✅ **Automatización completa** de detección y escalamiento de mora
2. ✅ **Intervención gradual** - 4 niveles antes del corte físico
3. ✅ **Trazabilidad total** de todo el proceso (tabla `alertas_mora`)
4. ✅ **Alertas proactivas** con comunicación automática (Email/SMS)
5. ✅ **Reducción de carga administrativa** - El sistema trabaja solo
6. ✅ **Mejor experiencia del cliente** - Avisos escalonados y claros
7. ✅ **Notificaciones en tiempo real** (SSE) para administradores
8. ✅ **Historial completo** de acciones y decisiones
9. ✅ **Configuración flexible** - Ajustar días y mensajes en `reglasCobranza.js`
10. ✅ **Recuperación automática** - Cliente paga → Vuelve a Verde inmediatamente

---

## 📊 Métricas y KPIs del Sistema

El sistema de semáforo permite medir:

```javascript
// Dashboard de Cobranza
{
  total_clientes_activos: 1250,
  total_morosos: 87,
  
  por_nivel: {
    nivel_0: 12,  // 🟣 Período de gracia
    nivel_1: 35,  // 🟡 Recordatorio
    nivel_2: 28,  // 🟠 Advertencia
    nivel_3: 8,   // 🔴 Ultimátum
    suspendidos: 4 // 🚫 Cortados
  },
  
  monto_total_adeudado: 45500000, // COP
  
  tasa_recuperacion: {
    antes_nivel_3: "85%", // Pagan antes del ultimátum
    total: "92%"          // Tasa de recuperación total
  },
  
  tiempo_promedio_cobranza: "18 días",
  
  notificaciones_enviadas_hoy: {
    emails: 15,
    sms: 8
  }
}
```

---

## 🚀 Extensiones Futuras

- [ ] Cálculo de intereses por mora
- [ ] Generación automática de reportes PDF
- [ ] Envío de recordatorios por email/SMS
- [ ] Dashboard de cobranza
- [ ] Predicción de mora con ML
- [ ] Integración con pasarelas de pago

---

**Autor:** GitHub Copilot  
**Fecha:** 2025-12-21  
**Versión:** 1.0
