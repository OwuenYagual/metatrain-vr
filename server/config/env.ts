import { loadEnvFile } from 'node:process';

try {
    loadEnvFile();
} catch (error: unknown) {
    const isMissingFile = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    if (!isMissingFile) throw error;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Falta la variable de entorno obligatoria ${name}.`);
    return value;
}

function positiveInteger(name: string, fallback: number): number {
    const rawValue = process.env[name];
    if (!rawValue) return fallback;

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} debe ser un entero positivo.`);
    }
    return value;
}

const jwtSecret = required('JWT_SECRET');
const weakSecret = jwtSecret.length < 32
    || ['super_secreto_desarrollo_123', 'replace-with-at-least-32-random-characters'].includes(jwtSecret);
const configuredCorsOrigin = process.env.CORS_ORIGIN?.trim();

if (nodeEnv === 'production' && weakSecret) {
    throw new Error('JWT_SECRET debe contener al menos 32 caracteres aleatorios en producción.');
}

if (nodeEnv !== 'production' && weakSecret) {
    console.warn('⚠ JWT_SECRET es débil y solo debe utilizarse para desarrollo local.');
}

if (nodeEnv === 'production' && !configuredCorsOrigin) {
    throw new Error('CORS_ORIGIN es obligatorio en producción.');
}

export const env = Object.freeze({
    nodeEnv,
    port: positiveInteger('PORT', 3000),
    mongoUri: required('MONGO_URI'),
    jwtSecret,
    jwtExpiresInSeconds: positiveInteger('JWT_EXPIRES_IN_SECONDS', 8 * 60 * 60),
    corsOrigin: configuredCorsOrigin || 'http://localhost:5173',
});
