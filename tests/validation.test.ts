import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmail, validateLoginInput, validateRegistrationInput } from '../server/utils/validation';

test('normaliza el correo antes de consultar MongoDB', () => {
    assert.equal(normalizeEmail('  Usuario@Empresa.COM '), 'usuario@empresa.com');
});

test('acepta un registro válido y normaliza sus valores', () => {
    const result = validateRegistrationInput({
        fullName: '  Ana Pérez  ',
        email: ' ANA@EMPRESA.COM ',
        password: 'una-clave-segura',
    });

    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.fullName, 'Ana Pérez');
        assert.equal(result.value.email, 'ana@empresa.com');
    }
});

test('rechaza contraseñas demasiado cortas o demasiado largas', () => {
    assert.equal(validateRegistrationInput({ fullName: 'Ana', email: 'ana@empresa.com', password: '1234567' }).ok, false);
    assert.equal(validateLoginInput({ email: 'ana@empresa.com', password: 'x'.repeat(129) }).ok, false);
});
