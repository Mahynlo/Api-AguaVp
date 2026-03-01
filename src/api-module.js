// Módulo API Controlable - AguaVP Server
// src/api-module.js

import { EventEmitter } from 'events';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { customMigrate } from './database/sqlite-migrator.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
// NOTA: server.js NO se importa aquí de forma estática.
// Se carga con dynamic import DENTRO de start(), después de setupEnvironment(),
// para que db-sqlite.js lea process.env.DB_PATH ya configurado.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Clase para controlar el servidor API de Agua VP
 * Permite iniciar/detener, configurar variables, y manejar migraciones
 */
class AguaVPServer extends EventEmitter {
    constructor(config = {}) {
        super();

        // Validar configuración requerida
        this.validateConfig(config);

        // Configuración con defaults
        this.config = {
            // Puerto del servidor
            port: config.port || process.env.PORT || 3000,

            // Ruta de la base de datos (CRÍTICO: debe estar en AppData)
            dbPath: config.dbPath || process.env.DB_PATH || './agua-vp.db',

            // Secrets (REQUERIDOS)
            jwtSecret: config.jwtSecret || process.env.JWT_SECRET,
            secretAppKey: config.secretAppKey || process.env.SECRET_APP_KEY,
            appKeyInicial: config.appKeyInicial || process.env.APPKEY_INICIAL,

            // Configuración opcional
            jwtExpiresIn: config.jwtExpiresIn || process.env.JWT_EXPIRES_IN || '15m',
            executionMode: config.executionMode || process.env.EXECUTION_MODE || 'LOCAL',
            nodeEnv: config.nodeEnv || process.env.NODE_ENV || 'production',

            // Control de migraciones
            autoMigrate: config.autoMigrate !== false, // true por default

            // Otras opciones
            ...config
        };

        this.serverInstance = null;
        this.isRunning = false;
    }

    /**
     * Valida que la configuración tenga los valores requeridos
     */
    validateConfig(config) {
        const required = ['jwtSecret', 'secretAppKey', 'appKeyInicial'];
        const missing = required.filter(key => !config[key] && !process.env[key.toUpperCase()]);

        if (missing.length > 0) {
            throw new Error(`Configuración requerida faltante: ${missing.join(', ')}`);
        }
    }

    /**
     * Asegura que existe el directorio de la base de datos
     */
    ensureDatabaseDirectory() {
        const dbDir = path.dirname(this.config.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            this.emit('log', `📁 Directorio creado: ${dbDir}`);
        }
    }

    /**
     * Aplica migraciones pendientes usando Drizzle Kit CLI
     */
    async runMigrations() {
        if (!this.config.autoMigrate) {
            this.emit('log', '⚠️ Migraciones automáticas desactivadas');
            return;
        }

        const isFirstInstall = !fs.existsSync(this.config.dbPath);

        this.emit('log', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.emit('log', '🗄️  Inicializando Base de Datos');
        this.emit('log', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (isFirstInstall) {
            this.emit('log', '📦 Primera instalación detectada');
            this.emit('log', `📁 Creando base de datos en: ${this.config.dbPath}`);
        } else {
            this.emit('log', '📂 Base de datos existente detectada');
            this.emit('log', `📁 Ubicación: ${this.config.dbPath}`);
            this.emit('log', '✅ Los datos existentes se preservarán');
        }

        try {
            this.emit('log', '🔄 Aplicando migraciones con Drizzle (programático)...');

            // Carpeta de migraciones embebida en el paquete — funciona tanto en dev
            // como en producción (dentro de node_modules/@aguavp/api-server/src/database/migrations)
            const migrationsFolder = path.join(__dirname, 'database', 'migrations');

            if (!fs.existsSync(migrationsFolder)) {
                throw new Error(`Carpeta de migraciones no encontrada: ${migrationsFolder}`);
            }

            // Abrir la BD con better-sqlite3 y ejecutar migraciones pendientes
            // usando el migrador personalizado que maneja ALTER COLUMN vía
            // recreación de tabla (patrón recomendado por SQLite)
            const sqlite = new Database(this.config.dbPath);
            sqlite.pragma('journal_mode = WAL');

            customMigrate(sqlite, migrationsFolder, (msg) => this.emit('log', msg));

            // Seed: crear superadmin por defecto si no hay usuarios
            this.seedDefaultUser(sqlite);

            sqlite.pragma('foreign_keys = ON');
            sqlite.close();

            this.emit('log', '✅ Migraciones aplicadas correctamente');
            this.emit('log', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            this.emit('log', '✅ Base de datos inicializada correctamente');
            this.emit('log', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        } catch (error) {
            this.emit('error', `Error en migraciones: ${error.message}`);
            throw error;
        }
    }

    /**
     * Crea un usuario superadmin por defecto si la tabla está vacía.
     * Esto resuelve el problema "chicken-and-egg": no se puede crear un usuario
     * sin JWT, y no se puede obtener JWT sin un usuario existente.
     * El usuario se crea con requiere_cambio_password = 1 para forzar
     * al administrador a cambiar las credenciales en el primer login.
     */
    seedDefaultUser(sqlite) {
        try {
            const row = sqlite.prepare('SELECT COUNT(*) as total FROM usuarios').get();

            if (row.total > 0) {
                this.emit('log', `👥 Usuarios existentes: ${row.total}`);
                return;
            }

            this.emit('log', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            this.emit('log', '👤 No hay usuarios — creando superadmin por defecto');

            const defaultEmail = 'admin@aguavp.com';
            const defaultUsername = 'admin';
            const defaultPassword = 'Admin123!';
            const defaultNombre = 'Administrador';
            const defaultRol = 'superadmin';

            // bcryptjs.hashSync es seguro aquí — solo se ejecuta 1 vez en primera instalación
            const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

            sqlite.prepare(`
                INSERT INTO usuarios (correo, nombre, "contraseña", username, rol, requiere_cambio_password)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(defaultEmail, defaultNombre, hashedPassword, defaultUsername, defaultRol);

            this.emit('log', '✅ Usuario superadmin creado exitosamente');
            this.emit('log', '');
            this.emit('log', '   📧 Correo:     admin@aguavp.com');
            this.emit('log', '   👤 Usuario:    admin');
            this.emit('log', '   🔑 Contraseña: Admin123!');
            this.emit('log', '   🛡️  Rol:        superadmin');
            this.emit('log', '');
            this.emit('log', '   ⚠️  IMPORTANTE: Cambie la contraseña en el primer inicio de sesión');
            this.emit('log', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        } catch (error) {
            this.emit('error', `Error al crear usuario por defecto: ${error.message}`);
            // No lanzar — el servidor puede funcionar sin seed, el usuario
            // puede crear cuentas manualmente via API si tiene acceso
        }
    }

    /**
     * Configura las variables de entorno para la API
     */
    setupEnvironment() {
        process.env.PORT = String(this.config.port);
        process.env.DB_PATH = this.config.dbPath;
        process.env.JWT_SECRET = this.config.jwtSecret;
        process.env.SECRET_APP_KEY = this.config.secretAppKey;
        process.env.APPKEY_INICIAL = this.config.appKeyInicial;
        process.env.JWT_EXPIRES_IN = this.config.jwtExpiresIn;
        process.env.EXECUTION_MODE = this.config.executionMode;
        process.env.NODE_ENV = this.config.nodeEnv;

        this.emit('log', '✅ Variables de entorno configuradas');
    }

    /**
     * Inicia el servidor
     */
    async start() {
        if (this.isRunning) {
            throw new Error('El servidor ya está corriendo');
        }

        try {
            this.emit('starting');
            this.emit('log', '\n🚀 Iniciando Agua VP API Server\n');

            // 1. Asegurar directorio de DB
            this.ensureDatabaseDirectory();

            // 2. Configurar entorno (DEBE ir antes de importar server.js)
            this.setupEnvironment();

            // 3. Aplicar migraciones
            await this.runMigrations();

            // 4. Importar server.js AHORA — db-sqlite.js lee process.env.DB_PATH ya configurado.
            //    Si ya fue importado antes (reinicio), el módulo está en caché pero el
            //    proceso.env.DB_PATH correcto ya se estableció antes de la primera carga.
            const { default: server } = await import('./server.js');

            // 5. Iniciar servidor Express
            return new Promise((resolve, reject) => {
                this.serverInstance = server.listen(this.config.port, (err) => {
                    if (err) {
                        this.emit('error', err);
                        reject(err);
                    } else {
                        this.isRunning = true;

                        const info = {
                            port: this.config.port,
                            dbPath: this.config.dbPath,
                            mode: this.config.executionMode
                        };

                        this.emit('started', info);
                        this.emit('log', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        this.emit('log', `✅ API Server corriendo en http://localhost:${this.config.port}`);
                        this.emit('log', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

                        resolve(info);
                    }
                });
            });

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Detiene el servidor
     */
    async stop() {
        if (!this.isRunning) {
            this.emit('log', '⚠️ El servidor no está corriendo');
            return;
        }

        return new Promise((resolve) => {
            this.emit('stopping');
            this.emit('log', '🛑 Deteniendo servidor...');

            this.serverInstance.close(() => {
                this.isRunning = false;
                this.serverInstance = null;
                this.emit('stopped');
                this.emit('log', '✅ Servidor detenido correctamente\n');
                resolve();
            });
        });
    }

    /**
     * Reinicia el servidor
     */
    async restart() {
        this.emit('log', '🔄 Reiniciando servidor...');
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.start();
    }

    /**
     * Obtiene el estado actual del servidor
     */
    getStatus() {
        return {
            running: this.isRunning,
            port: this.config.port,
            dbPath: this.config.dbPath,
            mode: this.config.executionMode,
            env: this.config.nodeEnv,
            // No exponer secrets
            config: {
                port: this.config.port,
                dbPath: this.config.dbPath,
                executionMode: this.config.executionMode,
                nodeEnv: this.config.nodeEnv,
                autoMigrate: this.config.autoMigrate
            }
        };
    }

    /**
     * Actualiza la configuración (solo si el servidor está detenido)
     */
    updateConfig(newConfig) {
        if (this.isRunning) {
            throw new Error('No se puede actualizar la configuración mientras el servidor está corriendo');
        }

        this.config = { ...this.config, ...newConfig };
        this.emit('log', '✅ Configuración actualizada');
    }
}

export default AguaVPServer;
