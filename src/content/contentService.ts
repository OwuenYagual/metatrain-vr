import { apiFetch } from '../api/apiClient';
import type { TrainingProgress } from '../progress/progressService';
import { APP_CONFIG } from '../config/appConfig';

export type Content = {
    _id: string;
    moduleId: string;
    title: string;
    body: string;
    order: number;
    active: boolean;
    interactionObjectId: string;
};

export const contentService = {
    async getTrainingContents(moduleId: string, signal?: AbortSignal): Promise<Content[]> {
        const response = await apiFetch(`/training/${encodeURIComponent(moduleId)}/contents`, { signal });
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('El servidor devolvió contenidos inválidos.');
        return data as Content[];
    },

    async markContentCompleted(
        moduleId: string,
        contentId: string,
        durationSeconds = 0,
    ): Promise<TrainingProgress> {
        const response = await apiFetch('/progress/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientEventId: crypto.randomUUID(),
                moduleId,
                moduleVersion: APP_CONFIG.TRAINING_MODULE_VERSION,
                worldVersion: APP_CONFIG.CAMPUS_WORLD_VERSION,
                zoneId: 'induction-office',
                contentId,
                durationSeconds: Math.max(0, Math.floor(durationSeconds)),
            }),
        });
        const payload = await response.json() as { progress?: TrainingProgress };
        if (!payload.progress || !Array.isArray(payload.progress.completedContents)) {
            throw new Error('El servidor devolvió un progreso inválido.');
        }
        return payload.progress;
    },
};
