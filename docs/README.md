# Documentación

## Empezar aquí
- [arquitectura.md](arquitectura.md): estructura del código, estructura estándar de un módulo, cómo verificar que un cambio no altera el comportamiento, arranque embebido en Electron, rutas, seguridad, SSE y jobs.
- [base-de-datos.md](base-de-datos.md): conexión, cómo funcionan las migraciones y cómo crear una nueva.
- [SINCRONIZACION_TURSO_CLOUD.md](SINCRONIZACION_TURSO_CLOUD.md): especificación de la copia espejo en Turso Cloud.

## Endpoints (`/api/v2`)
- [auth](endpoints/auth.md) · [headers de autenticación](endpoints/auth-headers.md)
- [clientes](endpoints/clientes.md) · [medidores](endpoints/medidores.md) · [rutas](endpoints/rutas.md)
- [tarifas](endpoints/tarifas.md) · [lecturas](endpoints/lecturas.md) · [facturas](endpoints/facturas.md) · [pagos](endpoints/pagos.md)
- [deudores](endpoints/deudores.md)

La referencia interactiva completa está en Swagger: `http://localhost:3000/api-docs`.

## Guías
- [autenticacion.md](guias/autenticacion.md): arquitectura de autenticación y autorización.
- [oauth.md](guias/oauth.md): flujo OAuth 2.0.
- [validacion-zod.md](guias/validacion-zod.md) y [ejemplos](guias/validacion-zod-ejemplos.md): validación de entrada.
- [password-validator.md](guias/password-validator.md): política de contraseñas.
- [rate-limiter.md](guias/rate-limiter.md): límites de peticiones.
- [timezone.md](guias/timezone.md): manejo de fechas en GMT-7.
- [flujo-lecturas-facturacion.md](guias/flujo-lecturas-facturacion.md): lecturas, facturación y movimientos de medidor.

## Historial
Propuestas, planes y análisis previos. Sirven como contexto de diseño; no necesariamente describen el estado actual.
- [propuesta-deudores-y-cortes.md](historial/propuesta-deudores-y-cortes.md)
- [plan-seguridad-produccion.md](historial/plan-seguridad-produccion.md)
- [analisis-operaciones-crud.md](historial/analisis-operaciones-crud.md)
- [clientes-nuevas-operaciones.md](historial/clientes-nuevas-operaciones.md)
