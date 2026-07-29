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

function booleanValue(name: string, fallback: boolean): boolean {
    const rawValue = process.env[name]?.trim().toLowerCase();
    if (!rawValue) return fallback;
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    throw new Error(`${name} debe ser true o false.`);
}

const jwtSecret = required('JWT_SECRET');
const weakSecret = jwtSecret.length < 32
    || ['super_secreto_desarrollo_123', 'replace-with-at-least-32-random-characters'].includes(jwtSecret);
const configuredCorsOrigin = process.env.CORS_ORIGIN?.trim();
const speechEnabled = booleanValue('AZURE_SPEECH_ENABLED', false);
const azureSpeechEndpoint = process.env.AZURE_SPEECH_ENDPOINT?.trim() ?? '';
const azureSpeechTtsEndpoint = process.env.AZURE_SPEECH_TTS_ENDPOINT?.trim() ?? '';
const azureSpeechKey = process.env.AZURE_SPEECH_KEY?.trim() ?? '';

if (speechEnabled && (!azureSpeechEndpoint || !azureSpeechTtsEndpoint || !azureSpeechKey)) {
    throw new Error('AZURE_SPEECH_ENDPOINT y AZURE_SPEECH_KEY son obligatorios cuando Azure Speech está habilitado.');
}

if (azureSpeechTtsEndpoint) {
    try {
        new URL(azureSpeechTtsEndpoint);
    } catch {
        throw new Error('AZURE_SPEECH_TTS_ENDPOINT debe ser una URL valida.');
    }
}

if (azureSpeechEndpoint) {
    try {
        new URL(azureSpeechEndpoint);
    } catch {
        throw new Error('AZURE_SPEECH_ENDPOINT debe ser una URL válida.');
    }
}

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
    speechEnabled,
    azureSpeechEndpoint: azureSpeechEndpoint.replace(/\/$/, ''),
    azureSpeechTtsEndpoint: azureSpeechTtsEndpoint.replace(/\/$/, ''),
    azureSpeechKey,
    azureSpeechApiVersion: process.env.AZURE_SPEECH_API_VERSION?.trim() || '2025-10-15',
    azureSpeechFemaleVoice: process.env.AZURE_SPEECH_FEMALE_VOICE?.trim() || 'es-EC-AndreaNeural',
    azureSpeechMaleVoice: process.env.AZURE_SPEECH_MALE_VOICE?.trim() || 'es-EC-LuisNeural',
});
