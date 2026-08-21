import type { SpeechCapabilities, TranscriptionResult } from '../../shared/speech';
import {
    CAMPUS_GUIDE_OBJECT_ID,
    type CampusZoneId,
} from '../../shared/campus';
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

function narrationPath(stationId: string, bubbleId: string, requestedZoneId?: CampusZoneId): string {
    const zoneId = requestedZoneId
        ?? (stationId === CAMPUS_GUIDE_OBJECT_ID ? 'lobby' : 'induction-office');
    const query = new URLSearchParams({
        moduleVersion: String(APP_CONFIG.TRAINING_MODULE_VERSION),
        worldVersion: String(APP_CONFIG.CAMPUS_WORLD_VERSION),
        zoneId,
    });
    return `/speech/narrations/${encodeURIComponent(APP_CONFIG.TRAINING_MODULE_ID)}/${encodeURIComponent(stationId)}/${encodeURIComponent(bubbleId)}?${query}`;
}

function evaluationNarrationPath(questionId: string): string {
    const query = new URLSearchParams({
        moduleVersion: String(APP_CONFIG.TRAINING_MODULE_VERSION),
        worldVersion: String(APP_CONFIG.CAMPUS_WORLD_VERSION),
        zoneId: 'assessment-room',
    });
    return `/speech/evaluation-narrations/${encodeURIComponent(APP_CONFIG.TRAINING_MODULE_ID)}/${encodeURIComponent(questionId)}?${query}`;
}

async function cacheNarration(key: string, path: string): Promise<string> {
    const cached = narrationCache.get(key);
    if (cached) return cached;
    const response = await apiFetch(path);
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

    async getNarration(
        stationId: string,
        bubbleId: string,
        zoneId?: CampusZoneId,
    ): Promise<string> {
        const key = `${zoneId ?? 'default'}:${stationId}:${bubbleId}`;
        return cacheNarration(key, narrationPath(stationId, bubbleId, zoneId));
    },

    async preloadNarration(
        stationId: string,
        bubbleId: string,
        zoneId?: CampusZoneId,
    ): Promise<void> {
        await this.getNarration(stationId, bubbleId, zoneId);
    },

    async getEvaluationNarration(questionId: string): Promise<string> {
        return cacheNarration(
            `assessment-room:evaluation:${questionId}`,
            evaluationNarrationPath(questionId),
        );
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
