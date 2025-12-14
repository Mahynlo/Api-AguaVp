# ✅ Checklist Pre-Producción - API Agua VP

**Fecha**: Diciembre 2025  
**Estado Actual**: 7/10 - Listo para pruebas internas  
**Objetivo**: 8.5/10 - Production Ready

---

## 🟢 YA IMPLEMENTADO

### Seguridad Base
- [x] Rate Limiting (5 limiters configurados)
- [x] Validación de contraseñas (9 reglas)
- [x] Refresh Tokens (15min access, 7 días refresh)
- [x] Hashing bcrypt (salt factor 10)
- [x] JWT firmados y verificados
- [x] Migraciones de BD (tablas completas)
- [x] AppKeys con expiración 90 días
- [x] Verificación de tokens revocados
- [x] Logs seguros (sin tokens expuestos)
- [x] .gitignore básico

**Nivel de Seguridad**: ⭐⭐⭐⭐⭐⭐⭐ (7/10)

---

## 🔴 PRIORIDAD CRÍTICA - Hacer ANTES de Beta

### 1. Configurar HTTPS (30 minutos)

**Estado**: ❌ Pendiente  
**Impacto**: 🔴 CRÍTICO - Sin HTTPS, tokens viajan sin encriptar

**Opción A - Desarrollo/Testing (Certificado Autofirmado)**:
```powershell
# Crear directorio
mkdir certs

# Generar certificado (válido 365 días)
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes

# Configuración mínima:
# Country Name: CO
# State: Cundinamarca
# City: Bogota
# Organization: Agua VP
# Common Name: localhost
```

**Opción B - Pre-Producción/Beta (Let's Encrypt)**:
```powershell
# Instalar Certbot
choco install certbot

# Generar certificado (dominio real)
certbot certonly --standalone -d api.aguavp.com
```

**Modificar `src/server.js`**:
```javascript
import https from 'https';
import fs from 'fs';

// Configuración HTTPS
if (process.env.NODE_ENV === 'production' || process.env.USE_HTTPS === 'true') {
  const httpsOptions = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH || './certs/key.pem'),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH || './certs/cert.pem')
  };

  https.createServer(httpsOptions, app).listen(3443, () => {
    console.log('🔒 HTTPS Server running on https://localhost:3443');
  });
} else {
  // Solo HTTP en desarrollo
  app.listen(PORT, () => {
    console.log(`⚠️  HTTP Server on http://localhost:${PORT} (DEV ONLY)`);
  });
}
```

**Variables `.env`**:
```env
USE_HTTPS=true
SSL_KEY_PATH=./certs/key.pem
SSL_CERT_PATH=./certs/cert.pem
```

**Verificación**:
- [ ] Certificados generados en `/certs`
- [ ] Servidor inicia en puerto 3443 (HTTPS)
- [ ] Navegador muestra candado (autofirmado = advertencia esperada)
- [ ] API responde correctamente en HTTPS

---

### 2. Configurar CORS Restrictivo (15 minutos)

**Estado**: ❌ Pendiente  
**Impacto**: 🟡 MEDIO - Acepta peticiones de cualquier origen

**Problema Actual**:
```javascript
app.use(cors()); // ⚠️ Acepta CUALQUIER origen
```

**Solución**:
```javascript
// src/server.js
import cors from 'cors';

const corsOptions = {
  origin: function (origin, callback) {
    // Lista blanca de orígenes permitidos
    const whitelist = process.env.CORS_ORIGINS 
      ? process.env.CORS_ORIGINS.split(',')
      : [
          'http://localhost:5173',  // Frontend Dev
          'http://localhost:3000',  // Testing
        ];

    // En producción, rechazar requests sin origin
    if (process.env.NODE_ENV === 'production' && !origin) {
      return callback(new Error('Not allowed by CORS'));
    }

    // Permitir si está en whitelist
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Permitir cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-app-key']
};

app.use(cors(corsOptions));
```

**Variables `.env`**:
```env
# Desarrollo
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Pre-Producción
CORS_ORIGINS=https://beta.aguavp.com,https://app-beta.aguavp.com

# Producción
CORS_ORIGINS=https://aguavp.com,https://app.aguavp.com
```

**Verificación**:
- [ ] Requests desde orígenes permitidos funcionan
- [ ] Requests desde orígenes no permitidos son rechazados
- [ ] Navegador muestra error CORS en consola para orígenes bloqueados

---

### 3. Actualizar .gitignore (2 minutos)

**Estado**: ✅ Básico, ⚠️ Mejorar  
**Impacto**: 🟡 MEDIO - Evitar exponer secretos

**Agregar**:
```gitignore
# Actual
node_modules/
.env
dist/
package-lock.json
db-local.js

# AGREGAR:
# Variables de entorno
.env.local
.env.production
.env.*.local

# Certificados SSL
certs/
*.pem
*.key
*.crt
*.cert

# Base de datos
*.db
*.sqlite
*.sqlite3

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Sistema Operativo
.DS_Store
Thumbs.db

# Backups
backup/
*.backup
*.bak
```

**Verificación**:
```powershell
# Verificar que .env NO está trackeado
git ls-files | Select-String ".env"

# Si aparece, removerlo:
git rm --cached .env
git commit -m "Remove .env from git"
```

---

## 🟡 PRIORIDAD ALTA - Recomendado para Beta

### 4. Integrar Audit Logger (30 minutos)

**Estado**: 🟡 Creado pero NO usado  
**Impacto**: 🟡 MEDIO - Sin visibilidad de eventos de seguridad

**Archivo existe**: `src/utils/auditLogger.js` ✅

**Integrar en `authController.js`**:
```javascript
import { logSecurityEvent, EVENTOS, SEVERIDAD } from '../../utils/auditLogger.js';

// En login() - Éxito
await logSecurityEvent(EVENTOS.LOGIN, {
  usuario_id: user.id,
  usuario_email: user.correo,
  ip: req.ip,
  user_agent: req.headers['user-agent'],
  dispositivo: dispositivo
}, SEVERIDAD.INFO);

// En login() - Fallo
await logSecurityEvent(EVENTOS.FAILED_LOGIN, {
  usuario_email: correo,
  ip: req.ip,
  user_agent: req.headers['user-agent'],
  razon: 'Contraseña incorrecta'
}, SEVERIDAD.WARNING);

// En registrar()
await logSecurityEvent(EVENTOS.REGISTRO_USUARIO, {
  usuario_id: nuevoUsuarioId,
  usuario_email: correo,
  username: username,
  rol: rolNormalizado,
  ip: req.ip
}, SEVERIDAD.INFO);

// En logout()
await logSecurityEvent(EVENTOS.LOGOUT, {
  usuario_id: req.usuario.id,
  ip: req.ip
}, SEVERIDAD.INFO);

// En refresh()
await logSecurityEvent(EVENTOS.TOKEN_GENERADO, {
  usuario_id: decoded.id,
  tipo: 'refresh',
  ip: req.ip
}, SEVERIDAD.INFO);

// En revokeRefreshToken()
await logSecurityEvent(EVENTOS.TOKEN_REVOCADO, {
  usuario_id: req.user.id,
  ip: req.ip,
  razon: 'Revocación manual'
}, SEVERIDAD.WARNING);
```

**Integrar en `authMiddleware.js`**:
```javascript
// Cuando se detecta token revocado
import { logSecurityEvent, EVENTOS, SEVERIDAD } from '../../utils/auditLogger.js';

if (revokeCheck.rows.length > 0) {
  await logSecurityEvent(EVENTOS.ACCESO_DENEGADO, {
    ip: req.ip,
    razon: 'Token revocado',
    token_preview: token.substring(0, 10) + '...'
  }, SEVERIDAD.WARNING);
  
  return res.status(401).json({ 
    error: "Token revocado",
    code: "TOKEN_REVOKED"
  });
}
```

**Verificación**:
- [ ] Logs aparecen en tabla `auditoria_seguridad`
- [ ] Login exitoso registra evento
- [ ] Login fallido registra evento
- [ ] Tokens revocados registran intento de acceso

---

### 5. Mensajes de Error Genéricos (20 minutos)

**Estado**: ❌ Pendiente  
**Impacto**: 🟢 BAJO - Previene enumeración de usuarios

**Cambios en `authController.js`**:
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
  await logSecurityEvent(EVENTOS.FAILED_LOGIN, {
    correo_intento: correo,
    ip: req.ip,
    razon: result.rows.length === 0 ? 'Usuario no existe' : 'Contraseña incorrecta'
  }, SEVERIDAD.WARNING);
  
  return res.status(401).json({ 
    error: "Credenciales inválidas" // Mensaje genérico
  });
}
```

---

## 🟢 OPCIONAL - Mejoras Adicionales

### 6. Limpieza Automática de Tokens (45 minutos)

**Crear**: `src/utils/tokenCleanup.js`

(Código del plan de seguridad)

### 7. Validación de Inputs con express-validator (1 hora)

**Instalar**:
```powershell
npm install express-validator
```

(Código del plan de seguridad)

---

## 📊 Nivel de Seguridad por Fase

| Fase | Nivel | Estado | Puede usarse para |
|------|-------|--------|-------------------|
| **Actual** | 7.0/10 | ✅ Listo | Testing interno, desarrollo |
| **+ P. Crítica** | 8.0/10 | ⏳ 1 hora | Beta privada, testing con usuarios |
| **+ P. Alta** | 8.5/10 | ⏳ 2 horas | Pre-producción, staging |
| **+ Opcional** | 9.0/10 | ⏳ 4 horas | Producción completa |

---

## 🚀 Comandos de Verificación

### Testing de Seguridad
```powershell
# 1. Verificar rate limiting
for ($i=1; $i -le 20; $i++) {
  Invoke-RestMethod -Uri "http://localhost:3000/api/v2/auth/login" -Method POST
}

# 2. Verificar tokens revocados
# Insertar en BD: INSERT INTO tokens_revocados (token) VALUES ('test_token');
# Luego intentar usar ese token

# 3. Verificar HTTPS
curl https://localhost:3443/api/v2/app/version -k

# 4. Verificar CORS
curl -H "Origin: http://evil.com" http://localhost:3000/api/v2/clientes/listar
```

### Verificar Logs
```sql
-- Ver últimos eventos de seguridad
SELECT * FROM auditoria_seguridad 
ORDER BY fecha_evento DESC 
LIMIT 50;

-- Intentos de login fallidos
SELECT * FROM auditoria_seguridad 
WHERE tipo_evento = 'failed_login' 
ORDER BY fecha_evento DESC;

-- Tokens revocados usados
SELECT * FROM auditoria_seguridad 
WHERE tipo_evento = 'acceso_denegado' 
  AND detalles LIKE '%revocado%';
```

---

## ✅ Checklist Final Pre-Producción

### Crítico (Obligatorio)
- [ ] HTTPS configurado y funcionando
- [ ] CORS restrictivo implementado
- [ ] .gitignore actualizado
- [ ] Variables .env no en Git

### Importante (Muy Recomendado)
- [ ] Audit logger integrado
- [ ] Mensajes de error genéricos
- [ ] Testing de seguridad completo

### Opcional (Mejoría)
- [ ] Limpieza automática tokens
- [ ] Validación de inputs
- [ ] Monitoreo de logs activo

---

## 🎯 Recomendación Final

**Para Pruebas Internas**: ✅ **LISTO AHORA**
- Puedes empezar testing inmediatamente
- En ambiente local/desarrollo
- Sin exponer a Internet

**Para Beta Privada**: ⏳ **1-2 HORAS MÁS**
- Completar Prioridad Crítica
- Implementar al menos 2 de Prioridad Alta
- Testing de seguridad básico

**Para Producción Real**: ⏳ **3-4 HORAS MÁS**
- Completar TODO Prioridad Crítica
- Completar TODO Prioridad Alta
- Al menos 50% de Opcional
- Testing exhaustivo de seguridad
- Monitoreo configurado

---

**Última actualización**: Diciembre 13, 2025  
**Versión**: 1.0  
**Estado**: Listo para testing interno, preparando para beta
