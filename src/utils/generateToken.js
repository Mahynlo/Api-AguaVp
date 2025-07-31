/**
 * Gnerador de un token JWT
 * 
 * File: src/utils/generateToken.js
 * 
 * Descripción:
 * * - Este archivo contiene la función para generar un token JWT.
 * 
 * * Funciones:
 * * - generateToken: Genera un token JWT a partir de los datos del usuario.
 * 
 * 
 * Notas:
 * * - Se utiliza jsonwebtoken para generar el token.
 * * - Se utiliza dotenv para cargar las variables de entorno.
 */
const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      nombre:user.nombre,
      correo: user.correo,
      rol: user.rol,
      fecha_creacion: user.fecha_creacion
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

module.exports = generateToken;
