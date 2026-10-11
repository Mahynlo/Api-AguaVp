# 🔒 Plan de Seguridad para Producción - API Agua VP

**Fecha**: Diciembre 2025  
**Estado Actual**: 5.5/10 - Aceptable para DEV, NO LISTO para producción  
**Objetivo**: Alcanzar 8.5/10 - Production Ready

---

## 📊 Estado Actual de Implementación

### ✅ Completado (Fase 1 y 2.1)

| Feature | Estado | Descripción |
|---------|--------|-------------|
| Rate Limiting | ✅ | 5 limiters en endpoints críticos (login, registro, etc.) |
| Validación Contraseñas | ✅ | 9 reglas, fuerza mínima, sin contraseñas comunes |
| Refresh Tokens | ✅ | Access 15min, Refresh 7días, sistema de revocación |
| Hashing Passwords | ✅ | bcrypt con salt factor 10 |
| JWT Firmados | ✅ | Tokens con firma verificable |
| Migración BD | ✅ | Tablas de auditoría, tokens, historial |
| IPv6 Compatible | ✅ | Rate limiter sin bypass IPv6 |

### ⚠️ Implementado pero NO Usado

| Feature | Estado | Problema |
|---------|--------|----------|
| Audit Logger | 🟡 | Creado (`auditLogger.js`) pero NO integrado |
| Tabla Auditoría | 🟡 | Existe pero vacía, sin eventos registrados |
| Tokens Revocados | 🟡 | Tabla existe pero middleware NO la consulta |
| Historial Passwords | 🟡 | Tabla sin uso en cambio de contraseña |

### ❌ Vulnerabilidades Críticas

| Vulnerabilidad | Severidad | Riesgo | Ubicación |
|----------------|-----------|--------|-----------|
| Tokens en logs | 🔴 CRÍTICO | Exposición de credenciales | `src/v2/controllers/appController.js` líneas ~45, ~85 |
| Sin HTTPS forzado | 🔴 CRÍTICO | Man-in-the-middle | Configuración servidor |
| AppKey 365 días | 🔴 ALTO | Ventana larga de compromiso | `appController.js` línea ~42 |
| Sin verificar revocación | 🟡 MEDIO | Tokens revocados válidos | `authMiddleware.js`, `appKeyMiddleware.js` |
| Sin auditoría activa | 🟡 MEDIO | Ataques no detectables | Todos los controllers |
| .env sin proteger | 🟡 MEDIO | Secretos en Git | `.gitignore` |
| Errores informativos | 🟡 BAJO | Enumeration attacks | `authController.js` |
| Inputs sin sanitizar | 🟡 BAJO | Posible inyección | Todos los endpoints |
| CORS permisivo | 🟡 MEDIO | XSS desde cualquier origen | `src/server.js` |

---

## 🎯 PRIORIDAD 1 - Bloqueantes para Producción

**Tiempo estimado**: 4-6 horas  
**Debe completarse ANTES de cualquier deploy a producción**

### 1.1 ✅ Remover Logs Sensibles (10 min) - FASE 1.3 PENDIENTE

**Problema**: Tokens aparecen en console.log

**Archivos a modificar**:
```javascript
// src/v2/controllers/appController.js
Buscar: console.log('Nuevo Token:', nuevoToken);
Acción: ELIMINAR o reemplazar por logger seguro

Buscar: console.log con tokens, passwords, secrets
Acción: ELIMINAR todos
```

**Implementación**:
```javascript
// ❌ ANTES (INSEGURO)
console.log('Nuevo Token:', nuevoToken);
console.log('Usuario:', user);

// ✅ DESPUÉS (SEGURO)
console.log('Token generado exitosamente');
console.log('Usuario autenticado:', user.id); // Solo ID, no datos sensibles
```

**Archivos afectados**:
- `src/v2/controllers/appController.js`
- `src/v2/controllers/authController.js`
- `src/v1/controllers/authController.js`

**Verificación**:
```powershell
# Buscar todos los console.log con datos sensibles
Select-String -Path "src/**/*.js" -Pattern "console.log.*token|console.log.*password|console.log.*secret"
```

---

### 1.2 ✅ Reducir Expiración AppKey a 90 días (5 min) - FASE 2.2

**Problema**: AppKeys válidas por 1 año

**Archivo**: `src/v2/controllers/appController.js`

**Cambio**:
```javascript
// Línea ~42
// ❌ ANTES
{ expiresIn: '365d' }

// ✅ DESPUÉS
{ expiresIn: '90d' }
```

**Ubicaciones**:
- `registrarApp()` línea ~42
- `recuperarToken()` línea ~85 (si existe)

---

### 1.3 ✅ Configurar HTTPS Obligatorio (30 min)

**Problema**: API acepta HTTP, tokens viajan sin encriptar

**Solución Desarrollo**:
```javascript
// src/server.js
import https from 'https';
import fs from 'fs';

// Certificado autofirmado para desarrollo
const httpsOptions = {
  key: fs.readFileSync('./certs/key.pem'),
  cert: fs.readFileSync('./certs/cert.pem')
};

https.createServer(httpsOptions, app).listen(3443, () => {
  console.log('🔒 HTTPS Server on https://localhost:3443');
});

// Redirigir HTTP a HTTPS
app.use((req, res, next) => {
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  next();
});
```

**Generar certificado dev**:
```powershell
# Crear carpeta certs
mkdir certs

# Generar certificado autofirmado (válido 365 días)
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes
```

**Solución Producción**:
- Usar Let's Encrypt con Certbot
- Configurar reverse proxy (Nginx/Caddy) con SSL
- Variables de entorno para paths de certificados

---

### 1.4 ✅ Verificar .gitignore (2 min)

**Archivo**: `.gitignore`

**Debe incluir**:
```gitignore
# Variables de entorno
.env
.env.local
.env.production
.env.*.local

# Certificados SSL
certs/
*.pem
*.key
*.crt

# Base de datos local
*.db
*.sqlite
*.sqlite3

# Logs
logs/
*.log
npm-debug.log*

# Node
node_modules/
```

**Verificación**:
```powershell
# Verificar que .env NO está trackeado
git ls-files | Select-String ".env"

# Si aparece, removerlo del historial:
git rm --cached .env
git commit -m "Remove .env from git history"
```

---

### 1.5 ✅ Middleware con Verificación de Revocación (20 min)

**Problema**: Tokens revocados siguen siendo válidos hasta expiración

**Archivo**: `src/v2/middlewares/authMiddleware.js`

**Implementación**:
```javascript
import jwt from 'jsonwebtoken';
import dbTurso from '../../database/db-turso.js';

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token requerido" });
  }

  try {
    // 1. Verificar firma JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2. ✅ NUEVO: Verificar si está revocado en BD
    const revokeCheck = await dbTurso.execute({
      sql: `SELECT id FROM tokens_revocados WHERE token = ? LIMIT 1`,
      args: [token]
    });

    if (revokeCheck.rows.length > 0) {
      return res.status(401).json({ 
        error: "Token revocado",
        code: "TOKEN_REVOKED"
      });
    }

    // 3. ✅ NUEVO: Verificar si el refresh token asociado está revocado
    if (decoded.type === 'user') {
      const refreshCheck = await dbTurso.execute({
        sql: `
          SELECT rt.id 
          FROM refresh_tokens rt
          WHERE rt.usuario_id = ? 
            AND rt.revocado = 1
            AND datetime(rt.revocado_en) > datetime(?)
        `,
        args: [decoded.id, decoded.iat * 1000] // Issued at time
      });

      // Si se revocó refresh DESPUÉS de crear este access token, invalidar
      if (refreshCheck.rows.length > 0) {
        return res.status(401).json({ 
          error: "Sesión revocada",
          code: "SESSION_REVOKED"
        });
      }
    }

    req.user = decoded;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: "Token expirado",
        code: "TOKEN_EXPIRED"
      });
    }
    return res.status(401).json({ error: "Token inválido" });
  }
};

export default authMiddleware;
```

**También aplicar en**: `src/v2/middlewares/appKeyMiddleware.js`

---

## 🎯 PRIORIDAD 2 - Importantes (Esta Semana)

**Tiempo estimado**: 8-12 horas

### 2.1 ✅ Integrar Audit Logger (30 min)

**Archivo**: Modificar todos los controllers

**Implementación en authController.js**:
```javascript
import { logSecurityEvent } from '../../utils/auditLogger.js';

// En login()
if (!validPassword) {
  // ✅ NUEVO: Registrar intento fallido
  await logSecurityEvent({
    tipo_evento: 'FAILED_LOGIN',
    usuario_id: user.id,
    detalles: 'Contraseña incorrecta',
    nivel_severidad: 'warning',
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });
  
  return res.status(401).json({ error: "Credenciales inválidas" });
}

// Login exitoso
await logSecurityEvent({
  tipo_evento: 'LOGIN',
  usuario_id: user.id,
  detalles: 'Inicio de sesión exitoso',
  nivel_severidad: 'info',
  ip: req.ip,
  user_agent: req.headers['user-agent']
});

// En registrar()
await logSecurityEvent({
  tipo_evento: 'REGISTRO_USUARIO',
  usuario_id: userId,
  detalles: `Usuario registrado: ${username}`,
  nivel_severidad: 'info',
  ip: req.ip,
  user_agent: req.headers['user-agent']
});

// En refresh()
await logSecurityEvent({
  tipo_evento: 'TOKEN_REFRESH',
  usuario_id: user.id,
  detalles: 'Token renovado exitosamente',
  nivel_severidad: 'info',
  ip: req.ip,
  user_agent: req.headers['user-agent']
});

// En logout()
await logSecurityEvent({
  tipo_evento: 'LOGOUT',
  usuario_id: req.user.id,
  detalles: 'Cierre de sesión',
  nivel_severidad: 'info',
  ip: req.ip,
  user_agent: req.headers['user-agent']
});
```

**Controllers a modificar**:
- `authController.js` - login, logout, register, refresh, revoke
- `appController.js` - registrarApp, recuperarToken
- `clientesController.js` - operaciones CRUD (opcional)
- `facturasController.js` - create, update, delete (opcional)

---

### 2.2 ✅ Limpieza Automática de Tokens Expirados (45 min)

**Crear**: `src/utils/tokenCleanup.js`

```javascript
/**
 * Limpieza automática de tokens expirados
 * Se ejecuta cada 24 horas
 */
import dbTurso from '../database/db-turso.js';
import { logSecurityEvent } from './auditLogger.js';

export async function cleanupExpiredTokens() {
  try {
    console.log('🧹 Iniciando limpieza de tokens expirados...');

    // 1. Limpiar refresh tokens expirados (mayores a 30 días)
    const refreshResult = await dbTurso.execute(`
      DELETE FROM refresh_tokens 
      WHERE datetime(expira_en) < datetime('now', '-30 days')
    `);

    // 2. Limpiar tokens revocados antiguos (mayores a 90 días)
    const revokedResult = await dbTurso.execute(`
      DELETE FROM tokens_revocados
      WHERE datetime(fecha_revocacion) < datetime('now', '-90 days')
    `);

    // 3. Limpiar sesiones inactivas
    const sessionsResult = await dbTurso.execute(`
      UPDATE sesiones 
      SET activo = 0
      WHERE activo = 1 
        AND datetime(expira_en) < datetime('now')
    `);

    // 4. Limpiar auditoría antigua (mayor a 1 año)
    const auditResult = await dbTurso.execute(`
      DELETE FROM auditoria_seguridad
      WHERE datetime(fecha_evento) < datetime('now', '-1 year')
        AND nivel_severidad IN ('info', 'low')
    `);

    const stats = {
      refresh_tokens_deleted: refreshResult.rowsAffected || 0,
      revoked_tokens_deleted: revokedResult.rowsAffected || 0,
      sessions_closed: sessionsResult.rowsAffected || 0,
      audit_logs_deleted: auditResult.rowsAffected || 0
    };

    console.log('✅ Limpieza completada:', stats);

    // Registrar en auditoría
    await logSecurityEvent({
      tipo_evento: 'CLEANUP_TOKENS',
      detalles: JSON.stringify(stats),
      nivel_severidad: 'info'
    });

    return stats;

  } catch (error) {
    console.error('❌ Error en limpieza de tokens:', error);
    await logSecurityEvent({
      tipo_evento: 'CLEANUP_ERROR',
      detalles: error.message,
      nivel_severidad: 'error'
    });
    throw error;
  }
}

// Programar ejecución cada 24 horas
export function scheduleCleanup() {
  const INTERVAL = 24 * 60 * 60 * 1000; // 24 horas

  setInterval(async () => {
    await cleanupExpiredTokens();
  }, INTERVAL);

  // Ejecutar una vez al iniciar
  cleanupExpiredTokens();
  console.log('⏰ Limpieza programada cada 24 horas');
}
```

**Integrar en**: `src/index.js`
```javascript
import { scheduleCleanup } from './utils/tokenCleanup.js';

// Después de iniciar el servidor
scheduleCleanup();
```

---

### 2.3 ✅ Validación de Inputs con express-validator (1 hora)

**Instalar**:
```powershell
npm install express-validator
```

**Crear**: `src/v2/middlewares/validators.js`

```javascript
import { body, param, validationResult } from 'express-validator';

// Middleware para manejar errores de validación
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Datos inválidos',
      detalles: errors.array() 
    });
  }
  next();
};

// Validaciones para login
export const validateLogin = [
  body('correo')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  body('contraseña')
    .notEmpty().withMessage('Contraseña requerida')
    .isLength({ min: 8 }).withMessage('Contraseña muy corta'),
  handleValidationErrors
];

// Validaciones para registro
export const validateRegister = [
  body('correo')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  body('username')
    .isLength({ min: 3, max: 30 }).withMessage('Username: 3-30 caracteres')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username: solo letras, números, _ y -')
    .trim(),
  body('nombre')
    .notEmpty().withMessage('Nombre requerido')
    .isLength({ max: 100 }).withMessage('Nombre muy largo')
    .trim()
    .escape(),
  body('contrasena')
    .notEmpty().withMessage('Contraseña requerida'),
  body('rol')
    .isIn(['admin', 'operador', 'lector']).withMessage('Rol inválido'),
  handleValidationErrors
];

// Validaciones para cliente
export const validateCliente = [
  body('nombre')
    .notEmpty().withMessage('Nombre requerido')
    .isLength({ max: 100 }).withMessage('Nombre muy largo')
    .trim()
    .escape(),
  body('direccion')
    .optional()
    .isLength({ max: 200 }).withMessage('Dirección muy larga')
    .trim(),
  body('telefono')
    .optional()
    .matches(/^[0-9]{8,15}$/).withMessage('Teléfono inválido'),
  body('email')
    .optional()
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  handleValidationErrors
];

// Validaciones para factura
export const validateFactura = [
  body('cliente_id')
    .isInt({ min: 1 }).withMessage('ID cliente inválido'),
  body('monto')
    .isFloat({ min: 0 }).withMessage('Monto debe ser positivo'),
  body('fecha')
    .optional()
    .isISO8601().withMessage('Fecha inválida'),
  handleValidationErrors
];

// Validaciones para ID en params
export const validateId = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),
  handleValidationErrors
];
```

**Aplicar en rutas**:
```javascript
// src/v2/routes/authroutes.js
import { validateLogin, validateRegister } from '../middlewares/validators.js';

router.post('/login', loginLimiter, validateLogin, authController.login);
router.post('/registrar', registroUsuarioLimiter, validateRegister, authController.registrar);

// src/v2/routes/clientes.js
import { validateCliente, validateId } from '../middlewares/validators.js';

router.post('/', appKeyMiddleware, validateCliente, clientesController.crear);
router.put('/:id', appKeyMiddleware, validateId, validateCliente, clientesController.actualizar);
router.delete('/:id', appKeyMiddleware, validateId, clientesController.eliminar);
```

---

### 2.4 ✅ Mensajes de Error Genéricos (30 min)

**Problema**: Errores revelan si un email existe o no

**Cambios en authController.js**:

```javascript
// ❌ ANTES (Revela información)
if (result.rows.length === 0) {
  return res.status(401).json({ error: "Usuario no encontrado" });
}
if (!validPassword) {
  return res.status(401).json({ error: "Contraseña incorrecta" });
}

// ✅ DESPUÉS (Genérico)
if (result.rows.length === 0 || !validPassword) {
  await logSecurityEvent({
    tipo_evento: 'FAILED_LOGIN',
    detalles: `Intento fallido para: ${correo}`,
    nivel_severidad: 'warning',
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });
  
  return res.status(401).json({ 
    error: "Credenciales inválidas" // Mensaje genérico
  });
}
```

**Aplicar en**:
- Login
- Recuperación de contraseña
- Verificación de email
- Cambio de contraseña

---

### 2.5 ✅ Configurar CORS Restrictivo (15 min)

**Archivo**: `src/server.js` o donde se configure CORS

```javascript
import cors from 'cors';

// ❌ ANTES (Muy permisivo)
app.use(cors());

// ✅ DESPUÉS (Restrictivo)
const corsOptions = {
  origin: function (origin, callback) {
    // Lista blanca de orígenes permitidos
    const whitelist = [
      'https://aguavp.com',
      'https://app.aguavp.com',
      'http://localhost:5173', // Dev frontend
      'http://localhost:3000'  // Dev local
    ];

    // En producción, NO permitir null origin
    if (process.env.NODE_ENV === 'production' && !origin) {
      return callback(new Error('Not allowed by CORS'));
    }

    // Permitir si está en whitelist o es dev
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Permitir cookies
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'AppKey']
};

app.use(cors(corsOptions));

// Manejo de errores CORS
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  next(err);
});
```

**Variables de entorno** (`.env`):
```env
# Orígenes permitidos (separados por coma)
CORS_ORIGINS=https://aguavp.com,https://app.aguavp.com
```

---

## 🎯 PRIORIDAD 3 - Mejoras (Siguiente Sprint)

**Tiempo estimado**: 12-16 horas

### 3.1 ✅ Protección CSRF (2 horas)

**Instalar**:
```powershell
npm install csurf cookie-parser
```

**Configurar**:
```javascript
import csrf from 'csurf';
import cookieParser from 'cookie-parser';

app.use(cookieParser());
app.use(csrf({ cookie: true }));

// Endpoint para obtener token CSRF
app.get('/api/v2/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// El middleware csrf verificará automáticamente en POST/PUT/DELETE
```

---

### 3.2 ✅ Rate Limiting Combinado (1 hora)

**Crear**: `src/v2/middlewares/advancedRateLimiter.js`

```javascript
/**
 * Rate limiting por IP + Usuario
 */
import rateLimit from 'express-rate-limit';
import dbTurso from '../../database/db-turso.js';

// Limiter por usuario autenticado (más restrictivo)
export const userBasedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: async (req) => {
    // Admin: 200 req/15min, Operador: 100, Lector: 50
    const roleLimits = {
      admin: 200,
      operador: 100,
      lector: 50
    };
    return roleLimits[req.user?.rol] || 50;
  },
  keyGenerator: (req) => {
    // Combinar usuario + IP
    return `user:${req.user?.id || 'anonymous'}:${req.ip}`;
  },
  handler: async (req, res) => {
    // Registrar abuso
    await logSecurityEvent({
      tipo_evento: 'RATE_LIMIT_EXCEEDED',
      usuario_id: req.user?.id,
      detalles: `Límite excedido: ${req.path}`,
      nivel_severidad: 'warning',
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    res.status(429).json({ 
      error: 'Demasiadas solicitudes',
      retry_after: '15 minutos'
    });
  }
});
```

---

### 3.3 ✅ 2FA Opcional (4-6 horas)

**Instalar**:
```powershell
npm install speakeasy qrcode
```

**Crear**: `src/v2/controllers/twoFactorController.js`

```javascript
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import dbTurso from '../../database/db-turso.js';

export const twoFactorController = {
  // Generar secreto y QR para configurar 2FA
  setup: async (req, res) => {
    const secret = speakeasy.generateSecret({
      name: `AguaVP (${req.user.email})`
    });

    // Guardar secret temporal (confirmar después)
    await dbTurso.execute({
      sql: `UPDATE usuarios SET two_factor_secret_temp = ? WHERE id = ?`,
      args: [secret.base32, req.user.id]
    });

    // Generar QR
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl
    });
  },

  // Confirmar configuración con código
  confirm: async (req, res) => {
    const { token } = req.body;

    // Obtener secret temporal
    const result = await dbTurso.execute({
      sql: `SELECT two_factor_secret_temp FROM usuarios WHERE id = ?`,
      args: [req.user.id]
    });

    const secret = result.rows[0].two_factor_secret_temp;

    // Verificar código
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    // Activar 2FA
    await dbTurso.execute({
      sql: `
        UPDATE usuarios 
        SET two_factor_secret = two_factor_secret_temp,
            two_factor_enabled = 1,
            two_factor_secret_temp = NULL
        WHERE id = ?
      `,
      args: [req.user.id]
    });

    res.json({ 
      success: true,
      mensaje: '2FA activado exitosamente'
    });
  },

  // Verificar código 2FA en login
  verify: async (req, res) => {
    const { userId, token } = req.body;

    const result = await dbTurso.execute({
      sql: `SELECT two_factor_secret FROM usuarios WHERE id = ? AND two_factor_enabled = 1`,
      args: [userId]
    });

    if (result.rows.length === 0) {
      return res.status(400).json({ error: '2FA no configurado' });
    }

    const secret = result.rows[0].two_factor_secret;

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    res.json({ verified });
  }
};
```

**Migración SQL**:
```sql
-- Agregar campos 2FA a usuarios
ALTER TABLE usuarios ADD COLUMN two_factor_enabled INTEGER DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN two_factor_secret TEXT;
ALTER TABLE usuarios ADD COLUMN two_factor_secret_temp TEXT;
```

---

### 3.4 ✅ Notificaciones Login Nuevo Dispositivo (2 horas)

**Crear**: `src/utils/deviceDetection.js`

```javascript
import dbTurso from '../database/db-turso.js';
import { logSecurityEvent } from './auditLogger.js';

export async function checkNewDevice(userId, userAgent, ip) {
  // Buscar sesiones previas con mismo user-agent e IP
  const result = await dbTurso.execute({
    sql: `
      SELECT COUNT(*) as count 
      FROM sesiones 
      WHERE usuario_id = ? 
        AND user_agent = ? 
        AND direccion_ip = ?
    `,
    args: [userId, userAgent, ip]
  });

  const isNewDevice = result.rows[0].count === 0;

  if (isNewDevice) {
    await logSecurityEvent({
      tipo_evento: 'NEW_DEVICE_LOGIN',
      usuario_id: userId,
      detalles: `Login desde nuevo dispositivo: ${userAgent}`,
      nivel_severidad: 'warning',
      ip: ip,
      user_agent: userAgent
    });

    // Aquí enviar email/SMS (implementar después)
    // await sendSecurityAlert(userId, 'new_device', { ip, userAgent });
  }

  return isNewDevice;
}
```

**Integrar en login**:
```javascript
// En authController.login()
const isNewDevice = await checkNewDevice(user.id, req.headers['user-agent'], req.ip);

res.json({
  success: true,
  accessToken,
  refreshToken,
  user: { /* ... */ },
  security: {
    newDevice: isNewDevice
  }
});
```

---

### 3.5 ✅ Encriptación de Datos Sensibles (3 horas)

**Instalar**:
```powershell
npm install crypto-js
```

**Crear**: `src/utils/encryption.js`

```javascript
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-key';

export function encrypt(text) {
  if (!text) return null;
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext) {
  if (!ciphertext) return null;
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
```

**Aplicar en campos sensibles**:
```javascript
// Al guardar cliente
import { encrypt } from '../../utils/encryption.js';

const telefonoEncriptado = encrypt(telefono);
const direccionEncriptada = encrypt(direccion);

await dbTurso.execute({
  sql: `INSERT INTO clientes (nombre, telefono, direccion) VALUES (?, ?, ?)`,
  args: [nombre, telefonoEncriptado, direccionEncriptada]
});

// Al leer
import { decrypt } from '../../utils/encryption.js';

const cliente = {
  ...row,
  telefono: decrypt(row.telefono),
  direccion: decrypt(row.direccion)
};
```

---

## 📋 Checklist de Implementación

### Prioridad 1 (Bloqueante)
- [ ] 1.1 Remover logs sensibles (10 min)
- [ ] 1.2 Reducir AppKey a 90d (5 min)
- [ ] 1.3 Configurar HTTPS (30 min)
- [ ] 1.4 Verificar .gitignore (2 min)
- [ ] 1.5 Middleware verificación revocación (20 min)

**Total Prioridad 1**: ~1 hora 7 minutos

### Prioridad 2 (Importante)
- [ ] 2.1 Integrar audit logger (30 min)
- [ ] 2.2 Limpieza automática tokens (45 min)
- [ ] 2.3 Validación inputs (1 hora)
- [ ] 2.4 Mensajes error genéricos (30 min)
- [ ] 2.5 CORS restrictivo (15 min)

**Total Prioridad 2**: ~3 horas

### Prioridad 3 (Mejoras)
- [ ] 3.1 Protección CSRF (2 horas)
- [ ] 3.2 Rate limiting combinado (1 hora)
- [ ] 3.3 2FA opcional (4-6 horas)
- [ ] 3.4 Notificaciones nuevo dispositivo (2 horas)
- [ ] 3.5 Encriptación datos sensibles (3 horas)

**Total Prioridad 3**: ~12-14 horas

---

## 🎯 Roadmap de Implementación

### Semana 1 (Production Ready)
**Día 1-2**: Prioridad 1 completa  
**Día 3-4**: Prioridad 2 completa  
**Día 5**: Testing y documentación  

### Semana 2 (Mejoras Avanzadas)
**Día 1-2**: CSRF + Rate limiting avanzado  
**Día 3-4**: 2FA + Notificaciones  
**Día 5**: Encriptación + Testing  

---

## 📊 Métricas de Seguridad Post-Implementación

| Aspecto | Antes | Después P1 | Después P2 | Después P3 |
|---------|-------|------------|------------|------------|
| Autenticación | 7/10 | 9/10 | 9/10 | 10/10 |
| Autorización | 5/10 | 7/10 | 8/10 | 9/10 |
| Tokens | 8/10 | 9/10 | 9/10 | 9/10 |
| Auditoría | 2/10 | 4/10 | 8/10 | 9/10 |
| Logs | 1/10 | 9/10 | 9/10 | 9/10 |
| HTTPS | 0/10 | 9/10 | 9/10 | 9/10 |
| Inputs | 4/10 | 4/10 | 9/10 | 9/10 |
| **TOTAL** | **5.5/10** | **7.5/10** | **8.5/10** | **9.3/10** |

---

## 🚀 Comando Rápido para Iniciar

```powershell
# 1. Verificar estado actual
npm run migrate
Select-String -Path "src/**/*.js" -Pattern "console.log.*token"

# 2. Implementar Prioridad 1 (usar este documento como guía)

# 3. Testing
npm run dev
# Probar endpoints con Postman/Thunder Client

# 4. Documentar cambios
git add .
git commit -m "feat: implementar prioridad 1 seguridad"
```

---

## 📞 Soporte

Para dudas durante la implementación:
1. Revisar este documento
2. Consultar `FASE2_REFRESH_TOKENS.md` para contexto
3. Revisar `src/utils/auditLogger.js` para ejemplos de logging

**Última actualización**: Diciembre 2025  
**Versión**: 1.0  
**Estado**: Fase 1 y 2.1 completadas, Prioridades 1-3 pendientes
