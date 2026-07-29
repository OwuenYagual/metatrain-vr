import { APP_CONFIG } from '../config/appConfig';
import { sendWithOfflineFallback } from '../utils/offlineSync';
import type { CampusZoneId } from '../../shared/campus';

export type InteractionEventType = 'click' | 'proximity' | 'content_opened';

export const interactionSystem = {
    async registerInteraction(
        objectId: string,
        eventType: InteractionEventType,
        zoneId: CampusZoneId = 'induction-office',
        durationSeconds = 0,
    ): Promise<void> {
        const result = await sendWithOfflineFallback('/progress/interaction', {
            moduleId: APP_CONFIG.TRAINING_MODULE_ID,
            moduleVersion: APP_CONFIG.TRAINING_MODULE_VERSION,
            worldVersion: APP_CONFIG.CAMPUS_WORLD_VERSION,
            zoneId,
            objectId,
            eventType,
            durationSeconds: Math.max(0, Math.floor(durationSeconds)),
        });

        if (result === 'queued') {
            console.info(`Interacción en cola offline: ${objectId} (${eventType})`);
        }
    },
};
