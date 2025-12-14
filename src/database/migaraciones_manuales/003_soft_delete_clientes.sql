-- Migración 003: Soft Delete para Clientes
-- Fecha: 2024-12-11
-- Descripción: Agrega campos para soft delete de clientes

-- Agregar campos de soft delete a la tabla clientes
ALTER TABLE clientes ADD COLUMN fecha_eliminacion DATETIME;
ALTER TABLE clientes ADD COLUMN eliminado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE clientes ADD COLUMN razon_eliminacion TEXT;

-- Crear índice para mejorar consultas de clientes eliminados
CREATE INDEX IF NOT EXISTS idx_clientes_estado_eliminacion 
ON clientes(estado_cliente, fecha_eliminacion);

-- Vista para clientes eliminados
CREATE VIEW IF NOT EXISTS v_clientes_eliminados AS
SELECT 
    c.id,
    c.nombre,
    c.direccion,
    c.telefono,
    c.ciudad,
    c.correo,
    c.fecha_eliminacion,
    c.razon_eliminacion,
    u.nombre as eliminado_por_nombre,
    (SELECT COUNT(*) FROM facturas f WHERE f.cliente_id = c.id) as total_facturas,
    (SELECT COUNT(*) FROM medidores m WHERE m.cliente_id = c.id) as total_medidores
FROM clientes c
LEFT JOIN usuarios u ON c.eliminado_por = u.id
WHERE c.estado_cliente = 'Eliminado';
