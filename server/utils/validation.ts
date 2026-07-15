export type RegistrationInput = {
    fullName: string;
    email: string;
    password: string;
};

export type LoginInput = {
    email: string;
    password: string;
};

type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

export function validateRegistrationInput(body: unknown): ValidationResult<RegistrationInput> {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Datos de registro inválidos.' };

    const input = body as Record<string, unknown>;
    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
    const password = typeof input.password === 'string' ? input.password : '';

    if (fullName.length < 2 || fullName.length > 100) {
        return { ok: false, error: 'El nombre debe contener entre 2 y 100 caracteres.' };
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        return { ok: false, error: 'El correo electrónico no es válido.' };
    }
    if (password.length < 8 || password.length > 128) {
        return { ok: false, error: 'La contraseña debe contener entre 8 y 128 caracteres.' };
    }

    return { ok: true, value: { fullName, email, password } };
}

export function validateLoginInput(body: unknown): ValidationResult<LoginInput> {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Credenciales inválidas.' };

    const input = body as Record<string, unknown>;
    const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
    const password = typeof input.password === 'string' ? input.password : '';

    if (!EMAIL_PATTERN.test(email) || password.length < 8 || password.length > 128) {
        return { ok: false, error: 'Credenciales inválidas.' };
    }

    return { ok: true, value: { email, password } };
}

export function readRequiredString(value: unknown, fieldName: string, maxLength = 100): ValidationResult<string> {
    if (typeof value !== 'string') return { ok: false, error: `${fieldName} es obligatorio.` };
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
        return { ok: false, error: `${fieldName} debe contener entre 1 y ${maxLength} caracteres.` };
    }
    return { ok: true, value: normalized };
}
