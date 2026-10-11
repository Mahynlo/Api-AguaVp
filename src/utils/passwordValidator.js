/**
 * Validador de Contraseñas
 * 
 * File: src/utils/passwordValidator.js
 * 
 * Descripción: Utilidad para validar la fortaleza de contraseñas
 * y asegurar que cumplan con los requisitos mínimos de seguridad.
 * 
 * Requisitos:
 * - Mínimo 8 caracteres
 * - Al menos 1 mayúscula
 * - Al menos 1 número
 * - Al menos 1 carácter especial
 * - No permitir contraseñas comunes
 */

// Lista de contraseñas comunes prohibidas
const COMMON_PASSWORDS = [
    '123456',
    'password',
    '12345678',
    'qwerty',
    '123456789',
    '12345',
    '1234',
    '111111',
    '1234567',
    'dragon',
    '123123',
    'baseball',
    'iloveyou',
    '1234567890',
    '000000',
    'password123',
    'abc123',
    'qwerty123',
    'password1',
    'admin',
    'letmein',
    'welcome',
    'monkey',
    'sunshine',
    'master',
    'admin123',
    'aguavp',
    'aguavp123',
    'admin123456'
];

/**
 * Valida si una contraseña cumple con los requisitos de seguridad
 * @param {string} password - Contraseña a validar
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validatePassword(password) {
    const errors = [];

    // Verificar si la contraseña está vacía o es null
    if (!password || typeof password !== 'string') {
        return {
            valid: false,
            errors: ['La contraseña es requerida']
        };
    }

    // Convertir a string y limpiar espacios
    const pass = password.trim();

    // 1. Verificar longitud mínima (8 caracteres)
    if (pass.length < 8) {
        errors.push('La contraseña debe tener al menos 8 caracteres');
    }

    // 2. Verificar longitud máxima (128 caracteres - límite razonable)
    if (pass.length > 128) {
        errors.push('La contraseña no puede exceder 128 caracteres');
    }

    // 3. Verificar al menos una mayúscula
    if (!/[A-Z]/.test(pass)) {
        errors.push('La contraseña debe contener al menos una letra mayúscula');
    }

    // 4. Verificar al menos una minúscula
    if (!/[a-z]/.test(pass)) {
        errors.push('La contraseña debe contener al menos una letra minúscula');
    }

    // 5. Verificar al menos un número
    if (!/[0-9]/.test(pass)) {
        errors.push('La contraseña debe contener al menos un número');
    }

    // 6. Verificar al menos un carácter especial
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) {
        errors.push('La contraseña debe contener al menos un carácter especial (!@#$%^&*()_+-=[]{};\':"|,.<>/?)');
    }

    // 7. Verificar que no sea una contraseña común
    if (COMMON_PASSWORDS.includes(pass.toLowerCase())) {
        errors.push('Esta contraseña es demasiado común. Por favor, elige una más segura');
    }

    // 8. Verificar que no contenga solo números
    if (/^\d+$/.test(pass)) {
        errors.push('La contraseña no puede contener solo números');
    }

    // 9. Verificar que no tenga secuencias obvias
    if (hasSequentialCharacters(pass)) {
        errors.push('La contraseña no puede contener secuencias obvias (ej: 123, abc)');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Verifica si la contraseña contiene secuencias obvias
 * @param {string} password - Contraseña a verificar
 * @returns {boolean} - true si contiene secuencias obvias
 */
function hasSequentialCharacters(password) {
    const sequences = [
        '0123456789',
        '9876543210',
        'abcdefghijklmnopqrstuvwxyz',
        'zyxwvutsrqponmlkjihgfedcba',
        'qwertyuiop',
        'asdfghjkl',
        'zxcvbnm'
    ];

    const lowerPass = password.toLowerCase();

    for (const sequence of sequences) {
        // Buscar secuencias de 4 o más caracteres consecutivos
        for (let i = 0; i <= sequence.length - 4; i++) {
            const chunk = sequence.substring(i, i + 4);
            if (lowerPass.includes(chunk)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Calcula la fortaleza de una contraseña (0-100)
 * @param {string} password - Contraseña a evaluar
 * @returns {Object} - { score: number, strength: string }
 */
export function calculatePasswordStrength(password) {
    if (!password) {
        return { score: 0, strength: 'Muy débil' };
    }

    let score = 0;

    // Longitud (hasta 40 puntos)
    if (password.length >= 8) score += 10;
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;
    if (password.length >= 20) score += 10;

    // Variedad de caracteres (hasta 40 puntos)
    if (/[a-z]/.test(password)) score += 10; // minúsculas
    if (/[A-Z]/.test(password)) score += 10; // mayúsculas
    if (/[0-9]/.test(password)) score += 10; // números
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 10; // especiales

    // Complejidad (hasta 20 puntos)
    const uniqueChars = new Set(password).size;
    if (uniqueChars >= 6) score += 5;
    if (uniqueChars >= 10) score += 5;
    if (uniqueChars >= 15) score += 10;

    // Penalizaciones
    if (COMMON_PASSWORDS.includes(password.toLowerCase())) score -= 30;
    if (hasSequentialCharacters(password)) score -= 20;
    if (/^(.)\1+$/.test(password)) score -= 30; // todos caracteres iguales

    // Asegurar que esté entre 0 y 100
    score = Math.max(0, Math.min(100, score));

    // Determinar el nivel de fortaleza
    let strength;
    if (score < 30) strength = 'Muy débil';
    else if (score < 50) strength = 'Débil';
    else if (score < 70) strength = 'Media';
    else if (score < 90) strength = 'Fuerte';
    else strength = 'Muy fuerte';

    return { score, strength };
}

/**
 * Genera una contraseña segura aleatoria
 * @param {number} length - Longitud de la contraseña (por defecto 16)
 * @returns {string} - Contraseña generada
 */
export function generateSecurePassword(length = 16) {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = lowercase + uppercase + numbers + special;
    let password = '';

    // Asegurar al menos uno de cada tipo
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Rellenar el resto
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Mezclar los caracteres
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Formatea los errores de validación para mostrar al usuario
 * @param {string[]} errors - Array de errores
 * @returns {string} - Mensaje formateado
 */
export function formatValidationErrors(errors) {
    if (!errors || errors.length === 0) {
        return '';
    }

    if (errors.length === 1) {
        return errors[0];
    }

    return `La contraseña no cumple con los siguientes requisitos:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
}

export default {
    validatePassword,
    calculatePasswordStrength,
    generateSecurePassword,
    formatValidationErrors
};
