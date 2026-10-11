/**
 * Script de Prueba - Password Validator
 * 
 * File: src/utils/testPasswordValidator.js
 * 
 * Descripción: Script para probar el validador de contraseñas
 * 
 * Uso: node src/utils/testPasswordValidator.js
 */

import { 
    validatePassword, 
    calculatePasswordStrength,
    generateSecurePassword,
    formatValidationErrors 
} from './passwordValidator.js';

console.log('='.repeat(80));
console.log('🔐 TEST DE VALIDADOR DE CONTRASEÑAS');
console.log('='.repeat(80));
console.log();

// Lista de contraseñas de prueba
const testPasswords = [
    { pass: '123456', descripcion: 'Contraseña común (solo números)' },
    { pass: 'password', descripcion: 'Contraseña común' },
    { pass: 'Pass123', descripcion: 'Sin carácter especial' },
    { pass: 'pass123!', descripcion: 'Sin mayúscula' },
    { pass: 'PASSWORD123!', descripcion: 'Sin minúscula' },
    { pass: 'Password!', descripcion: 'Sin número' },
    { pass: 'Pass12', descripcion: 'Muy corta' },
    { pass: 'qwerty123', descripcion: 'Contraseña común con secuencia' },
    { pass: 'MyP@ss123', descripcion: 'Válida básica' },
    { pass: 'Secur3!Pass', descripcion: 'Válida fuerte' },
    { pass: 'C0mpl3x#2024!', descripcion: 'Válida muy fuerte' },
    { pass: 'abcd1234', descripcion: 'Secuencia alfabética' },
    { pass: '12345678', descripcion: 'Secuencia numérica común' },
    { pass: 'Admin@123', descripcion: 'Predecible' },
    { pass: 'Tr0ng$P@ssw0rd2024', descripcion: 'Excelente' }
];

console.log('📊 PRUEBAS DE VALIDACIÓN\n');

testPasswords.forEach((test, index) => {
    console.log(`\n${index + 1}. Probando: "${test.pass}"`);
    console.log(`   Descripción: ${test.descripcion}`);
    
    const validation = validatePassword(test.pass);
    const strength = calculatePasswordStrength(test.pass);
    
    if (validation.valid) {
        console.log(`   ✅ VÁLIDA`);
    } else {
        console.log(`   ❌ INVÁLIDA`);
        console.log(`   Errores:`);
        validation.errors.forEach(error => {
            console.log(`      - ${error}`);
        });
    }
    
    console.log(`   Fortaleza: ${strength.strength} (${strength.score}/100)`);
});

console.log('\n' + '='.repeat(80));
console.log('🎲 GENERACIÓN DE CONTRASEÑAS SEGURAS\n');

console.log('Generando 5 contraseñas aleatorias seguras:\n');

for (let i = 1; i <= 5; i++) {
    const password = generateSecurePassword(16);
    const validation = validatePassword(password);
    const strength = calculatePasswordStrength(password);
    
    console.log(`${i}. ${password}`);
    console.log(`   Válida: ${validation.valid ? '✅' : '❌'}`);
    console.log(`   Fortaleza: ${strength.strength} (${strength.score}/100)\n`);
}

console.log('='.repeat(80));
console.log('📋 FORMATO DE ERRORES\n');

const weakPass = validatePassword('weak');
console.log('Contraseña: "weak"');
console.log('\nErrores formateados:');
console.log(formatValidationErrors(weakPass.errors));

console.log('\n' + '='.repeat(80));
console.log('✅ PRUEBAS COMPLETADAS');
console.log('='.repeat(80));
