import { apiFetch, ApiError } from '../api/apiClient';
import type { CampusZoneId, PlayerLocation } from '../../shared/campus';
import { APP_CONFIG } from '../config/appConfig';
import { sendWithOfflineFallback } from '../utils/offlineSync';

export type TrainingProgress = {
    participantId: string;
    moduleId: string;
    moduleVersion: number;
    worldVersion: number;
    lastLocation: PlayerLocation;
    completedContents: string[];
    simulationDecisionCount: number;
    completedSimulationDecisionIds: string[];
    simulationCompleted: boolean;
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
                `/progress/${encodeURIComponent(participantId)}?moduleId=${encodeURIComponent(moduleId)}&moduleVersion=${APP_CONFIG.TRAINING_MODULE_VERSION}`,
                { signal },
            );
            return await response.json() as TrainingProgress;
        } catch (error: unknown) {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        }
    },

    async saveLocation(
        zoneId: CampusZoneId,
        spawnId: string,
        durationSeconds: number,
    ): Promise<'sent' | 'queued'> {
        return sendWithOfflineFallback('/progress/location', {
            moduleId: APP_CONFIG.TRAINING_MODULE_ID,
            moduleVersion: APP_CONFIG.TRAINING_MODULE_VERSION,
            worldVersion: APP_CONFIG.CAMPUS_WORLD_VERSION,
            zoneId,
            spawnId,
            durationSeconds: Math.max(0, Math.floor(durationSeconds)),
        }, 'PUT');
    },
};
