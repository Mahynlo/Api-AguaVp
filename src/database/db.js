//conexion base de datos
// src/database/db.js
/*
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default db;*/

// src/database/db-local.js
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// Para obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'app.db');

const db = new (sqlite3.verbose()).Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error al conectar con la base de datos:', err.message);
    } else {
        console.log('📦 Conectado a la base de datos SQLite');
    }
});

// Crear tablas si no existen
const setupSQL = `
-- 🚀 Clientes ###################################################################
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    direccion TEXT NOT NULL,
    telefono TEXT NOT NULL,
    ciudad TEXT NOT NULL,
    correo TEXT,
    estado_cliente TEXT NOT NULL DEFAULT 'Activo',
    tarifa_id INTEGER REFERENCES tarifas(id), -- 🔹 Tarifa asignada
    modificado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion DATETIME DEFAULT (datetime('now')),
    UNIQUE(nombre, telefono)
);


-- 🚀 Medidores ###################################################################
CREATE TABLE IF NOT EXISTS medidores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id),
    numero_serie TEXT NOT NULL UNIQUE,
    ubicacion TEXT,
    fecha_instalacion DATE,
    latitud NUMERIC,
    longitud NUMERIC,
    estado_medidor TEXT NOT NULL CHECK (estado_medidor IN ('Activo', 'Inactivo', 'Retirado','No instalado')),
    fecha_creacion DATETIME DEFAULT (datetime('now'))
);

--  Tabla para historial de asignaciones de medidores a clientes 
CREATE TABLE IF NOT EXISTS cliente_medidor_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    medidor_id INTEGER NOT NULL REFERENCES medidores(id),
    fecha_inicio DATE NOT NULL DEFAULT (date('now')),
    fecha_fin DATE,
    asignado_por INTEGER REFERENCES usuarios(id),
    UNIQUE(cliente_id, medidor_id, fecha_inicio)
);

-- Triger de actualización de cliente_medidor_historial
CREATE TRIGGER IF NOT EXISTS cerrar_historial_asignacion_anterior
BEFORE UPDATE OF cliente_id ON medidores
FOR EACH ROW
WHEN OLD.cliente_id IS NOT NULL AND NEW.cliente_id != OLD.cliente_id
BEGIN
  UPDATE cliente_medidor_historial
  SET fecha_fin = date('now')
  WHERE medidor_id = OLD.id AND fecha_fin IS NULL;
END;


CREATE TRIGGER IF NOT EXISTS registrar_historial_asignacion
AFTER UPDATE OF cliente_id ON medidores
FOR EACH ROW
WHEN NEW.cliente_id IS NOT NULL AND NEW.cliente_id != OLD.cliente_id
BEGIN
  INSERT INTO cliente_medidor_historial (cliente_id, medidor_id, fecha_inicio)
  VALUES (NEW.cliente_id, NEW.id, date('now'));
END;


-- 🚀 Usuarios ###################################################################
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correo TEXT NOT NULL UNIQUE,
    nombre TEXT,
    contraseña TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    rol TEXT NOT NULL CHECK (rol IN ('superadmin', 'administrador', 'operador')),
    fecha_creacion DATETIME DEFAULT (datetime('now'))
);


-- 🚀 Tarifas ###################################################################
CREATE TABLE IF NOT EXISTS tarifas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE CHECK (fecha_fin IS NULL OR fecha_fin > fecha_inicio),
    modificado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion DATETIME DEFAULT (datetime('now'))
    
);

-- 🚀 Rangos por tarifa (bloques de consumo)
CREATE TABLE IF NOT EXISTS rangos_tarifas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarifa_id INTEGER NOT NULL REFERENCES tarifas(id) ON DELETE CASCADE,
    consumo_min INTEGER NOT NULL,                   -- Mínimo incluido
    consumo_max INTEGER,                            -- Máximo incluido, NULL si es el último bloque abierto
    precio_por_m3 NUMERIC NOT NULL,
    UNIQUE(tarifa_id, consumo_min)
);

-- 🚀 Historial de tarifas (rangos)
CREATE TABLE IF NOT EXISTS historial_tarifas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarifa_id INTEGER REFERENCES tarifas(id),
    rango_id INTEGER REFERENCES rangos_tarifas(id),
    fecha_cambio DATETIME DEFAULT (datetime('now')),
    consumo_min INTEGER,
    consumo_max INTEGER,
    precio_anterior NUMERIC,
    precio_nuevo NUMERIC NOT NULL
);

-- 🚀 Lecturas ###################################################################
CREATE TABLE IF NOT EXISTS lecturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medidor_id INTEGER REFERENCES medidores(id),
    ruta_id INTEGER REFERENCES rutas(id),
    fecha_lectura DATE NOT NULL,
    consumo_m3 NUMERIC NOT NULL,
    periodo TEXT, -- CAMBIO AQUi a tipo texto 
    modificado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion DATETIME DEFAULT (datetime('now')),
    UNIQUE(medidor_id, periodo) -- Un medidor no puede tener dos lecturas en el mismo periodo
);

-- 🚀 Facturas ###################################################################
CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id),
    lectura_id INTEGER REFERENCES lecturas(id),
    tarifa_id INTEGER REFERENCES tarifas(id),
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    total NUMERIC NOT NULL,
    saldo_pendiente NUMERIC NOT NULL DEFAULT 0,
    estado TEXT NOT NULL CHECK (estado IN ('Pagado', 'Pendiente', 'Vencida')),
    modificado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion DATETIME DEFAULT (datetime('now'))
);

-- 🚀 Pagos ###################################################################
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER REFERENCES facturas(id),
    fecha_pago DATE NOT NULL,
    monto NUMERIC NOT NULL CHECK (monto > 0),              -- Lo que se aplica a la factura
    cantidad_entregada NUMERIC CHECK (cantidad_entregada >= monto), -- Lo que el cliente entregó
    cambio NUMERIC CHECK (cambio >= 0),                    -- Lo que se le devuelve
    metodo_pago TEXT NOT NULL CHECK (
        metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Cheque')
    ),
    comentario TEXT,
    modificado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion DATETIME DEFAULT (datetime('now'))
);


-- 🚀 Trigger: actualizar saldo
CREATE TRIGGER IF NOT EXISTS actualizar_saldo_factura
AFTER INSERT ON pagos
FOR EACH ROW
BEGIN
    UPDATE facturas
    SET saldo_pendiente = ROUND(saldo_pendiente - NEW.monto, 2)
    WHERE id = NEW.factura_id;
END;


-- 🚀 Trigger: validar pago contra saldo
CREATE TRIGGER IF NOT EXISTS validar_pago_contra_saldo
BEFORE INSERT ON pagos
FOR EACH ROW
BEGIN
  SELECT 
    CASE 
      WHEN (SELECT ROUND(saldo_pendiente, 2) FROM facturas WHERE id = NEW.factura_id) < ROUND(NEW.monto, 2)
      THEN RAISE(ABORT, 'El monto del pago excede el saldo pendiente de la factura')
    END;
END;


-- 🚀 Trigger: actualizar estado (asegura saldo limpio)
CREATE TRIGGER IF NOT EXISTS actualizar_estado_factura
AFTER UPDATE OF saldo_pendiente ON facturas
FOR EACH ROW
WHEN NEW.saldo_pendiente <= 0
BEGIN
    UPDATE facturas
    SET estado = 'Pagado',
        saldo_pendiente = 0.00 -- fuerza a cero exacto
    WHERE id = NEW.id;
END;


-- 🚀 Historial de cambios ###################################################################
CREATE TABLE IF NOT EXISTS historial_cambios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tabla TEXT NOT NULL,
    operacion TEXT NOT NULL,
    registro_id INTEGER NOT NULL,
    modificado_por INTEGER REFERENCES usuarios(id),
    fecha_modificacion DATETIME DEFAULT (datetime('now')),
    cambios TEXT
);

-- 🚀 Trigger para historial de cambios en facturas
CREATE TRIGGER IF NOT EXISTS registrar_cambios_facturas
AFTER UPDATE ON facturas
FOR EACH ROW
BEGIN
    INSERT INTO historial_cambios (tabla, operacion, registro_id, modificado_por, cambios)
    VALUES (
        'facturas',
        'UPDATE',
        OLD.id,
        NEW.modificado_por,
        'Estado: ' || OLD.estado || ' → ' || NEW.estado || ', Saldo: ' || OLD.saldo_pendiente || ' → ' || NEW.saldo_pendiente
    );
END;

-- 🚀 Sesiones de usuarios ###################################################################
CREATE TABLE IF NOT EXISTS sesiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    token TEXT UNIQUE NOT NULL,
    fecha_inicio DATETIME DEFAULT (datetime('now')),
    fecha_fin DATETIME,
    direccion_ip TEXT,
    dispositivo TEXT,
    ubicacion TEXT,
    activo BOOLEAN DEFAULT 1
);

-- 🚀 Registro de apps (dispositivos)
CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT UNIQUE NOT NULL,
    token TEXT NOT NULL,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    nombre TEXT,
    ip_registro TEXT,
    activo INTEGER DEFAULT 1,
    fecha_creacion DATETIME DEFAULT (datetime('now'))
);


-- 🚀 Rutas de toma de lectura ###################################################################

CREATE TABLE IF NOT EXISTS rutas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    fecha_creacion DATE DEFAULT (DATE('now')),
    creado_por INTEGER REFERENCES usuarios(id),
    distancia_km REAL,
    ruta_json TEXT,             -- Coordenadas de la ruta calculada
    instrucciones_json TEXT     -- Instrucciones generadas para recorrer la ruta
);


-- 🚀 Puntos de ruta (medidores asignados a rutas)
CREATE TABLE IF NOT EXISTS rutas_puntos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ruta_id INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
    medidor_id INTEGER NOT NULL REFERENCES medidores(id),
    orden INTEGER NOT NULL, -- orden de visita
    UNIQUE(ruta_id, orden),
    UNIQUE(ruta_id, medidor_id)
);


`;

db.exec(setupSQL, (err) => {
    if (err) {
        console.error('❌ Error al crear las tablas:', err.message);
    } else {
        console.log('✅ Base de datos inicializada correctamente');
    }
});


export default db;