/**
 * Generador de tokens JWT con sistema de Access y Refresh Tokens
 * 
 * File: src/utils/generateToken.js
 * 
 * Descripción:
 * - Sistema de autenticación con dos tipos de tokens:
 *   * Access Token: 15 minutos de duración, para operaciones normales
 *   * Refresh Token: 7 días de duración, para renovar access tokens
 * 
 * Funciones:
 * - generateAccessToken: Genera un access token de corta duración
 * - generateRefreshToken: Genera un refresh token de larga duración
 * - generateTokenPair: Genera ambos tokens simultáneamente
 * 
 * Notas:
 * - Se utiliza jsonwebtoken para generar los tokens
 * - Los refresh tokens deben guardarse en la base de datos
 * - Los access tokens no se guardan en BD, solo se validan por firma
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Genera un Access Token de corta duración (15 minutos)
 * @param {Object} user - Datos del usuario
 * @param {string} tokenType - Tipo de token: 'user' o 'app'
 * @returns {string} Access Token JWT
 */
export function generateAccessToken(user, tokenType = 'user') {
  const payload = {
    id: user.id,
    type: tokenType,
    username: user.username,
    nombre: user.nombre,
    correo: user.correo,
    rol: user.rol,
    fecha_creacion: user.fecha_creacion
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: '15m' } // 15 minutos
  );
}

/**
 * Genera un Refresh Token único de larga duración (7 días)
 * @param {Object} user - Datos del usuario
 * @param {string} tokenType - Tipo de token: 'user' o 'app'
 * @returns {Object} { token, expiresAt }
 */
export function generateRefreshToken(user, tokenType = 'user') {
  // Generar token único y seguro
  const uniqueToken = crypto.randomBytes(64).toString('hex');
  
  // Calcular fecha de expiración (7 días)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Crear payload con información mínima
  const payload = {
    jti: uniqueToken, // JWT ID único
    id: user.id,
    type: tokenType
  };

  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // 7 días
  );

  return {
    token,
    expiresAt: expiresAt.toISOString()
  };
}

/**
 * Genera un par completo de Access y Refresh Tokens
 * @param {Object} user - Datos del usuario
 * @param {string} tokenType - Tipo de token: 'user' o 'app'
 * @returns {Object} { accessToken, refreshToken, refreshExpiresAt }
 */
export function generateTokenPair(user, tokenType = 'user') {
  const accessToken = generateAccessToken(user, tokenType);
  const { token: refreshToken, expiresAt } = generateRefreshToken(user, tokenType);

  return {
    accessToken,
    refreshToken,
    refreshExpiresAt: expiresAt
  };
}

/**
 * Función legacy para compatibilidad con código existente
 * @deprecated Usar generateTokenPair() o generateAccessToken() en su lugar
 */
function generateToken(user) {
  return generateAccessToken(user, 'user');
}

export default generateToken;
