# FLUJO TECNICO: Lecturas, Facturacion y Movimientos de Medidor (v2)

## 1. Alcance
Este documento describe la implementacion tecnica aplicada para evitar inconsistencias entre:
- Captura de lecturas por ruta/periodo.
- Facturacion por periodo.
- Reasignacion o reemplazo de medidores en clientes.
- Integridad de rutas y auditoria de cambios.

## 2. Control de cierre por facturacion en alta de lecturas
Archivo:
- src/v2/controllers/lecturasController.js

Comportamiento:
1. Antes de insertar lectura, se valida pertenencia del medidor a la ruta.
2. Se valida unicidad por medidor_id + periodo.
3. Se consulta cantidad de facturas existentes para ruta_id + periodo (join facturas -> lecturas).
4. Si total_facturas_periodo > 0, se rechaza la alta con HTTP 409 y code=PERIODO_RUTA_CERRADO.

Respuesta de bloqueo:
- error
- code: PERIODO_RUTA_CERRADO
- ruta_id
- periodo
- total_facturas_periodo

Objetivo:
- Evitar que medidores agregados posteriormente alteren un periodo ya facturado.

## 3. Ajuste de resumen/progreso de rutas en periodos cerrados
Archivo:
- src/v2/controllers/rutasController.js

Comportamiento:
- En listados y progreso por ruta, si existe facturacion para el periodo:
  - Se marca periodo_cerrado=true.
  - Se expone total_facturas_periodo.
  - El resumen del periodo evita mostrar como pendientes medidores que no tuvieron lectura en el cierre.

Objetivo:
- Mantener una vista operativa coherente con cierre por facturacion.

## 4. Reasignacion atomica y migracion automatica de punto de ruta
Archivo:
- src/v2/controllers/clientesController.js

Cambios clave:
1. Actualizacion de cliente + liberacion/asignacion de medidores se ejecuta dentro de una transaccion SQLite.
2. Se valida que medidores a liberar pertenezcan al cliente actual.
3. Se valida que medidores a asignar no esten ocupados por otro cliente.
4. Si el movimiento es reemplazo 1:1 (1 liberado, 1 asignado), se intenta migrar automaticamente rutas_puntos:
   - from medidor_anterior -> medidor_nuevo
5. Si el medidor nuevo ya esta asignado a otra ruta, se aborta la transaccion con error explicito.
6. Se registra historial_cambios con detalle de reasignacion y, cuando aplica, bloque reasignacion_ruta_medidor con accion=migracion_automatica_reemplazo_1_a_1.

Objetivo:
- Evitar estados parcialmente aplicados.
- Preservar trazabilidad y consistencia entre clientes, medidores y rutas.

## 5. Contrato frontend para errores de ruta
(Referencia para consumidores)
Archivo en app:
- ../AguaVP/src/fetch/rutas.js

Comportamiento esperado:
- Cuando actualizar ruta falla, retorna objeto estructurado con status/message/details en lugar de lanzar error generico.

Objetivo:
- Mejor diagnostico operativo y menor ambiguedad en errores de reglas de negocio.

## 6. Escenarios cubiertos
1. Lectura duplicada en mismo periodo: bloqueada.
2. Alta de lectura en ruta/periodo ya facturado: bloqueada con codigo especifico.
3. Reemplazo de medidor 1:1 con punto de ruta existente: migracion automatica.
4. Reemplazo de medidor 1:1 cuando nuevo ya esta en otra ruta: bloqueo preventivo.
5. Registro de auditoria por cambios de asignacion/reasignacion.

## 7. Validacion recomendada (QA)
1. Crear ruta con varios medidores y registrar lecturas parciales.
2. Generar facturacion del periodo.
3. Intentar registrar nueva lectura para medidor sin lectura previa del mismo periodo: debe devolver 409 PERIODO_RUTA_CERRADO.
4. Ejecutar reemplazo 1:1 de medidor en cliente con punto en ruta.
5. Verificar que rutas_puntos apunte al medidor nuevo.
6. Verificar historial_cambios con metadatos de reasignacion.

## 8. Consideraciones de evolucion
- Si en el futuro se requiere "cierre formal" (flag de cierre) diferente a "existe al menos una factura", este flujo debe migrarse a una entidad explicita de estado de periodo-ruta.
- Mantener versionado de contrato de errores para clientes Electron y futuras apps consumidoras.
