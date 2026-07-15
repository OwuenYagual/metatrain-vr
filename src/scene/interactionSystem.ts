import { APP_CONFIG } from '../config/appConfig';
import { sendWithOfflineFallback } from '../utils/offlineSync';

export type InteractionEventType = 'click' | 'proximity' | 'content_opened';

export const interactionSystem = {
    async registerInteraction(objectId: string, eventType: InteractionEventType): Promise<void> {
        const result = await sendWithOfflineFallback('/progress/interaction', {
            moduleId: APP_CONFIG.TRAINING_MODULE_ID,
            objectId,
            eventType,
        });

        if (result === 'queued') {
            console.info(`Interacción en cola offline: ${objectId} (${eventType})`);
        }
    },
};
