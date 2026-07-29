import type { SpeechCapabilities, TranscriptionResult } from '../../shared/speech';
import { apiFetch } from '../api/apiClient';
import { APP_CONFIG } from '../config/appConfig';

const narrationCache = new Map<string, string>();
const MAX_CACHED_NARRATIONS = 20;

function isSpeechCapabilities(value: unknown): value is SpeechCapabilities {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<SpeechCapabilities>;
    return typeof candidate.narrationAvailable === 'boolean'
        && typeof candidate.transcriptionAvailable === 'boolean'
        && candidate.locale === 'es-EC'
        && typeof candidate.maxRecordingBytes === 'number'
        && typeof candidate.maxRecordingSeconds === 'number';
}

function isTranscriptionResult(value: unknown): value is TranscriptionResult {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<TranscriptionResult>;
    return typeof candidate.transcript === 'string'
        && (candidate.confidence === undefined || typeof candidate.confidence === 'number');
}

function narrationPath(stationId: string, bubbleId: string): string {
    const query = new URLSearchParams({
        moduleVersion: String(APP_CONFIG.TRAINING_MODULE_VERSION),
        worldVersion: String(APP_CONFIG.CAMPUS_WORLD_VERSION),
        zoneId: 'induction-office',
    });
    return `/speech/narrations/${encodeURIComponent(APP_CONFIG.TRAINING_MODULE_ID)}/${encodeURIComponent(stationId)}/${encodeURIComponent(bubbleId)}?${query}`;
}

export const speechService = {
    async getCapabilities(signal?: AbortSignal): Promise<SpeechCapabilities> {
        const response = await apiFetch('/speech/capabilities', { signal });
        const payload: unknown = await response.json();
        if (!isSpeechCapabilities(payload)) {
            throw new Error('El servidor devolvió capacidades de voz inválidas.');
        }
        return payload;
    },

    async getNarration(stationId: string, bubbleId: string): Promise<string> {
        const key = `${stationId}:${bubbleId}`;
        const cached = narrationCache.get(key);
        if (cached) return cached;
        const response = await apiFetch(narrationPath(stationId, bubbleId));
        const blob = await response.blob();
        if (!blob.type.startsWith('audio/')) throw new Error('La narración recibida no es audio válido.');
        const objectUrl = URL.createObjectURL(blob);
        if (narrationCache.size >= MAX_CACHED_NARRATIONS) {
            const oldest = narrationCache.entries().next().value as [string, string] | undefined;
            if (oldest) {
                URL.revokeObjectURL(oldest[1]);
                narrationCache.delete(oldest[0]);
            }
        }
        narrationCache.set(key, objectUrl);
        return objectUrl;
    },

    async preloadNarration(stationId: string, bubbleId: string): Promise<void> {
        await this.getNarration(stationId, bubbleId);
    },

    async transcribe(
        questionId: string,
        audio: Blob,
        signal?: AbortSignal,
    ): Promise<TranscriptionResult> {
        const query = new URLSearchParams({
            moduleId: APP_CONFIG.TRAINING_MODULE_ID,
            questionId,
            moduleVersion: String(APP_CONFIG.TRAINING_MODULE_VERSION),
            worldVersion: String(APP_CONFIG.CAMPUS_WORLD_VERSION),
            zoneId: 'assessment-room',
        });
        const response = await apiFetch(`/speech/transcriptions?${query}`, {
            method: 'POST',
            headers: { 'Content-Type': audio.type || 'audio/webm' },
            body: audio,
            signal,
        });
        const payload: unknown = await response.json();
        if (!isTranscriptionResult(payload)) {
            throw new Error('El servidor devolvió una transcripción inválida.');
        }
        return payload;
    },
};
