import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

describe('Suite de Verificación: Reporte de Toma de Lecturas (Padrón de Campo)', () => {
    let db;

    beforeEach(() => {
        db = new DatabaseSync(':memory:');

        db.exec(`
            CREATE TABLE clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                numero_predio TEXT,
                ciudad TEXT DEFAULT 'Villa Pesqueira',
                direccion TEXT,
                estado_cliente TEXT DEFAULT 'Activo'
            );

            CREATE TABLE medidores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER REFERENCES clientes(id),
                numero_serie TEXT NOT NULL,
                estado_medidor TEXT NOT NULL DEFAULT 'Activo',
                lectura_base REAL DEFAULT 0,
                ubicacion TEXT,
                latitud REAL,
                longitud REAL
            );

            CREATE TABLE lecturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medidor_id INTEGER NOT NULL,
                periodo TEXT,
                lectura_actual REAL,
                consumo_m3 REAL,
                fecha_lectura TEXT
            );
        `);
    });

    it('en cambio de medidor: primer ciclo muestra lectura_base del medidor nuevo y marca es_cambio_medidor', () => {
        // 1. Cliente con medidor viejo retirado que tenía lecturas acumuladas
        db.exec(`INSERT INTO clientes (id, nombre, numero_predio, ciudad) VALUES (1, 'Ramon Coronado', 'NG-35', 'Villa Pesqueira')`);
        db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor, lectura_base) VALUES (10, 1, 'NG-SM-VIEJO', 'Retirado', 0)`);
        db.exec(`INSERT INTO lecturas (medidor_id, periodo, lectura_actual, consumo_m3, fecha_lectura) VALUES (10, '2026-02', 8500, 25, '2026-03-01')`);

        // 2. Nuevo medidor activo con lectura base 1998
        db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor, lectura_base) VALUES (20, 1, 'NG-0102956', 'Activo', 1998)`);

        const mes = '2026-03';
        const mesAnterior = '2026-02';

        const query = `
            SELECT 
                c.id as cliente_id,
                c.nombre as cliente_nombre,
                m.id as medidor_id,
                m.numero_serie,
                m.lectura_base,
                (
                    SELECT lf.lectura_actual 
                    FROM lecturas lf 
                    WHERE lf.medidor_id = m.id 
                      AND (lf.periodo < ? OR (lf.periodo IS NULL AND lf.fecha_lectura < ?))
                      AND lf.lectura_actual IS NOT NULL
                    ORDER BY lf.periodo DESC, lf.fecha_lectura DESC, lf.id DESC 
                    LIMIT 1
                ) as ultima_lectura_medidor,
                COALESCE(
                    (
                        SELECT lf.consumo_m3 
                        FROM lecturas lf 
                        WHERE lf.medidor_id = m.id 
                          AND lf.periodo = ?
                        LIMIT 1
                    ),
                    (
                        SELECT lf.consumo_m3 
                        FROM lecturas lf 
                        JOIN medidores m_all ON lf.medidor_id = m_all.id 
                        WHERE m_all.cliente_id = c.id 
                          AND lf.periodo = ?
                        LIMIT 1
                    ),
                    0
                ) as consumo_anterior,
                (
                    SELECT m_prev.numero_serie 
                    FROM medidores m_prev 
                    WHERE m_prev.cliente_id = c.id 
                      AND m_prev.id != m.id 
                      AND m_prev.estado_medidor = 'Retirado'
                    ORDER BY m_prev.id DESC 
                    LIMIT 1
                ) as medidor_anterior_serie
            FROM clientes c
            LEFT JOIN medidores m ON c.id = m.cliente_id AND m.estado_medidor != 'Retirado'
            WHERE c.estado_cliente = 'Activo'
        `;

        const row = db.prepare(query).get(mes, mes + '-01', mesAnterior, mesAnterior);

        const tieneLecturaPrevia = row.ultima_lectura_medidor !== null && row.ultima_lectura_medidor !== undefined;
        const lecturaFisica = tieneLecturaPrevia 
            ? Number(row.ultima_lectura_medidor) 
            : Number(row.lectura_base || 0);
        const esCambioMedidor = !tieneLecturaPrevia && !!row.medidor_anterior_serie;

        assert.equal(lecturaFisica, 1998, 'La lectura física anterior debe ser la lectura base del medidor nuevo (1998)');
        assert.equal(esCambioMedidor, true, 'Debe marcarse como cambio de medidor en el primer ciclo');
        assert.equal(row.numero_serie, 'NG-0102956', 'Debe corresponder al número de serie del medidor activo nuevo');
        assert.equal(row.medidor_anterior_serie, 'NG-SM-VIEJO', 'Debe identificar el medidor anterior');
        assert.equal(row.consumo_anterior, 25, 'Consumo anterior recupera el consumo previo de referencia');
    });

    it('en ciclo subsecuente: desaparece la bandera es_cambio_medidor y usa la última lectura tomada', () => {
        // Mismo caso anterior pero ahora ya se capturó la lectura de marzo: 2003
        db.exec(`INSERT INTO clientes (id, nombre, numero_predio, ciudad) VALUES (1, 'Ramon Coronado', 'NG-35', 'Villa Pesqueira')`);
        db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor, lectura_base) VALUES (10, 1, 'NG-SM-VIEJO', 'Retirado', 0)`);
        db.exec(`INSERT INTO medidores (id, cliente_id, numero_serie, estado_medidor, lectura_base) VALUES (20, 1, 'NG-0102956', 'Activo', 1998)`);
        db.exec(`INSERT INTO lecturas (medidor_id, periodo, lectura_actual, consumo_m3, fecha_lectura) VALUES (20, '2026-03', 2003, 5, '2026-04-05')`);

        const mes = '2026-04';
        const mesAnterior = '2026-03';

        const query = `
            SELECT 
                c.id as cliente_id,
                m.numero_serie,
                m.lectura_base,
                (
                    SELECT lf.lectura_actual 
                    FROM lecturas lf 
                    WHERE lf.medidor_id = m.id 
                      AND (lf.periodo < ? OR (lf.periodo IS NULL AND lf.fecha_lectura < ?))
                      AND lf.lectura_actual IS NOT NULL
                    ORDER BY lf.periodo DESC, lf.fecha_lectura DESC, lf.id DESC 
                    LIMIT 1
                ) as ultima_lectura_medidor,
                (
                    SELECT m_prev.numero_serie 
                    FROM medidores m_prev 
                    WHERE m_prev.cliente_id = c.id 
                      AND m_prev.id != m.id 
                      AND m_prev.estado_medidor = 'Retirado'
                    ORDER BY m_prev.id DESC 
                    LIMIT 1
                ) as medidor_anterior_serie
            FROM clientes c
            LEFT JOIN medidores m ON c.id = m.cliente_id AND m.estado_medidor != 'Retirado'
            WHERE c.estado_cliente = 'Activo'
        `;

        const row = db.prepare(query).get(mes, mes + '-01');

        const tieneLecturaPrevia = row.ultima_lectura_medidor !== null && row.ultima_lectura_medidor !== undefined;
        const lecturaFisica = tieneLecturaPrevia 
            ? Number(row.ultima_lectura_medidor) 
            : Number(row.lectura_base || 0);
        const esCambioMedidor = !tieneLecturaPrevia && !!row.medidor_anterior_serie;

        assert.equal(lecturaFisica, 2003, 'En el siguiente mes debe mostrar la lectura tomada del nuevo medidor (2003)');
        assert.equal(esCambioMedidor, false, 'La etiqueta de cambio de medidor debe desaparecer automáticamente');
    });
});
