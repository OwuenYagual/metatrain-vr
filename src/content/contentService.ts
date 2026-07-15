import { apiFetch } from '../api/apiClient';
import type { TrainingProgress } from '../progress/progressService';

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

    async markContentCompleted(moduleId: string, contentId: string): Promise<TrainingProgress> {
        const response = await apiFetch('/progress/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ moduleId, contentId }),
        });
        const payload = await response.json() as { progress?: TrainingProgress };
        if (!payload.progress || !Array.isArray(payload.progress.completedContents)) {
            throw new Error('El servidor devolvió un progreso inválido.');
        }
        return payload.progress;
    },
};
