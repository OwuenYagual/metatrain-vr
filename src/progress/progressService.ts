import { apiFetch, ApiError } from '../api/apiClient';

export type TrainingProgress = {
    participantId: string;
    moduleId: string;
    visitedCheckpoints: string[];
    completedContents: string[];
    score: number | null;
    status: 'not_started' | 'in_progress' | 'approved' | 'failed';
    durationSeconds: number;
    lastSavedAt: string;
};

export const progressService = {
    async getParticipantProgress(
        participantId: string,
        moduleId: string,
        signal?: AbortSignal,
    ): Promise<TrainingProgress | null> {
        try {
            const response = await apiFetch(
                `/progress/${encodeURIComponent(participantId)}?moduleId=${encodeURIComponent(moduleId)}`,
                { signal },
            );
            return await response.json() as TrainingProgress;
        } catch (error: unknown) {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        }
    },
};
