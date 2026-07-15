import { readRequiredString } from '../utils/validation';

export const INTERACTION_EVENT_TYPES = ['click', 'proximity', 'content_opened'] as const;
export type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];

type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

export type InteractionInput = {
    moduleId: string;
    objectId: string;
    eventType: InteractionEventType;
};

export function validateInteractionInput(body: unknown): ValidationResult<InteractionInput> {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Interacción inválida.' };
    const input = body as Record<string, unknown>;
    const moduleId = readRequiredString(input.moduleId, 'moduleId', 100);
    const objectId = readRequiredString(input.objectId, 'objectId', 100);

    if (!moduleId.ok) return moduleId;
    if (!objectId.ok) return objectId;
    if (typeof input.eventType !== 'string' || !INTERACTION_EVENT_TYPES.includes(input.eventType as InteractionEventType)) {
        return { ok: false, error: 'eventType no es válido.' };
    }

    return {
        ok: true,
        value: { moduleId: moduleId.value, objectId: objectId.value, eventType: input.eventType as InteractionEventType },
    };
}

export function validateProgressItemInput(
    body: unknown,
    fieldName: 'checkpointId' | 'contentId'
): ValidationResult<{ moduleId: string; itemId: string }> {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Datos de progreso inválidos.' };
    const input = body as Record<string, unknown>;
    const moduleId = readRequiredString(input.moduleId, 'moduleId', 100);
    const itemId = readRequiredString(input[fieldName], fieldName, 100);
    if (!moduleId.ok) return moduleId;
    if (!itemId.ok) return itemId;
    return { ok: true, value: { moduleId: moduleId.value, itemId: itemId.value } };
}
