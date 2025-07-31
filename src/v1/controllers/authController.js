/**
 * * Controlador de autenticación 
 * File: src/controllers/authController.js
 * Descripción: Controlador de autenticación para manejar el inicio de sesión, registro y cierre de sesión de usuarios.
 * 
 * @module authController
 * Funciones:
 * - login: Maneja el inicio de sesión de un usuario. Verifica las credenciales y genera un token.
 * - registrar: Maneja el registro de un nuevo usuario. Cifra la contraseña y almacena el usuario en la base de datos.
 * - logout: Maneja el cierre de sesión de un usuario. Marca la sesión como inactiva y registra la fecha de cierre.
 * 
 * 
 * 
 * Notas:
 * - Se utiliza bcryptjs para cifrar las contraseñas.
 * - Se utiliza sqlite3 para interactuar con la base de datos SQLite.
 * - Se utiliza un middleware para verificar la autenticación de los usuarios.
 * - Se utiliza un módulo externo para generar tokens JWT.
 * 
 * 
 * Pendiente de implementar:
 * - Validaciones más robustas para los datos de entrada.
 * - Manejo de errores más detallado.
 * - Registro de actividad del usuario (por ejemplo, intentos fallidos de inicio de sesión).
 * - Mejora de la seguridad (por ejemplo, limitación de intentos de inicio de sesión).
 * - Implementación de un sistema de recuperación de contraseña.
 * - Implementación de un sistema de verificación de correo electrónico.
 * - Implementación de un sistema de roles y permisos.
 * - Implementación de un sistema de auditoría para registrar cambios en los datos de los usuarios.
 * * - Implementación de un sistema de bloqueo de cuenta después de múltiples intentos fallidos de inicio de sesión.
 * * - Implementación de un sistema de expiración de tokens.
 * 
 * pruebas de implementación:
 * 
*/

const bcrypt = require('bcryptjs');
const db = require('../../database/db');
const generateToken = require('../../utils/generateToken');
const ControllerIntegration = require('../sockets/enhanced/controllerIntegration');

const authController = {
    login: (req, res) => {
        const { correo, contraseña,dispositivo } = req.body;

        if (!correo || !contraseña) {
            return res.status(400).json({ error: 'Correo y contraseña requeridos' });
        }

        const query = `SELECT * FROM usuarios WHERE correo = ?`;
        db.get(query, [correo], async (err, user) => {
            if (err) return res.status(500).json({ error: 'Error en el servidor' });
            if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

            const validPassword = await bcrypt.compare(contraseña, user.contraseña);
            if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

            const token = generateToken(user);

            // Guardar sesión
            const insertQuery = `
        INSERT INTO sesiones (usuario_id, token, direccion_ip, dispositivo)
        VALUES (?, ?, ?, ?)
      `;
            const ip = req.ip || '';
            //const dispositivo = req.headers['user-agent'] || '';

            db.run(insertQuery, [user.id, token, ip, dispositivo], function (err) {
                if (err) return res.status(500).json({ error: 'Error al guardar sesión' });

                // Datos del usuario para WebSocket
                const userData = {
                    id: user.id,
                    email: user.correo,
                    name: user.nombre,
                    username: user.username,
                    role: user.rol,
                    login_time: new Date().toISOString(),
                    ip: ip,
                    dispositivo: dispositivo
                };

                // Emitir evento de login (solo si WebSocket está disponible)
                try {
                    if (res.websocket && typeof res.websocket.trackOperation === 'function') {
                        ControllerIntegration.onUserLogin(userData); // Notificar a WebSocket 
                        res.websocket.trackOperation('user_login', {
                            user_id: user.id,
                            username: user.username
                        });
                    }
                } catch (error) {
                    console.log('WebSocket no disponible para login - esto es normal:', error.message);
                }

                res.json({
                    success: true,
                    mensaje: 'Inicio de sesión exitoso',
                    token,
                    user: {
                        id: user.id,
                        email: user.correo,
                        nombre: user.nombre,
                        username: user.username,
                        rol: user.rol,
                        activo: user.activo
                    }
                });

            });
        });
    },

    registrar: (req, res) => {
        const { correo, nombre, contrasena, username, rol } = req.body;


        if (!correo || !contrasena || !username || !rol) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        const hashedPassword = bcrypt.hashSync(contrasena, 10);// Cifrar la contraseña

        const query = `
        INSERT INTO usuarios (correo,nombre, contraseña, username, rol)
        VALUES (?, ?, ?, ?,?)
        `;

        db.run(query, [correo, nombre, hashedPassword, username, rol], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ error: 'Correo o username ya existe' });
                }
                return res.status(500).json({ error: 'Error al registrar usuario' });
            }

            res.status(201).json({ mensaje: 'Usuario registrado con éxito', id: this.lastID });
        });
    },

    logout: (req, res) => {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token requerido' });
        }

        const updateQuery = `
            UPDATE sesiones
            SET activo = 0,
                fecha_fin = datetime('now')
            WHERE token = ? AND activo = 1
        `;

        db.run(updateQuery, [token], function (err) {
            if (err) return res.status(500).json({ error: 'Error al cerrar sesión' });

            if (this.changes === 0) { // no se actualizó ninguna fila
                return res.status(404).json({ error: 'Sesión no encontrada o ya cerrada' });
            }

            res.status(200).json({ mensaje: 'Sesión cerrada con éxito' });
        });
    },

    //sessiones activas del usuario
    sesionesActivas: (req, res) => {
        const { usuarioId } = req.params;
        console.log(usuarioId);

        if (!usuarioId) {
            return res.status(400).json({ error: 'ID de usuario requerido' });
        }

        //regresar todas las seciones sin el token generado 
        const query = `
            SELECT id, usuario_id, direccion_ip, dispositivo, fecha_inicio,ubicacion
            FROM sesiones
            WHERE usuario_id = ? AND activo = 1
        `;

        db.all(query, [usuarioId], (err, sesiones) => {
            if (err) return res.status(500).json({ error: 'Error al obtener sesiones activas' });

            if (sesiones.length === 0) {
                return res.status(404).json({ mensaje: 'No se encontraron sesiones activas' });
            }

            res.json(sesiones);
        });
    }


};


module.exports = authController;




