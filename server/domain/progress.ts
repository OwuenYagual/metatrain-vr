import {
    CAMPUS_MANIFEST,
    CAMPUS_WORLD_VERSION,
    getCampusZone,
    isCampusZoneId,
    TRAINING_MODULE_VERSION,
    type CampusZoneId,
} from '../../shared/campus';
import { readRequiredString } from '../utils/validation';

export const INTERACTION_EVENT_TYPES = ['click', 'proximity', 'content_opened'] as const;
export type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];

const MAX_DURATION_SECONDS = 10 * 365 * 24 * 60 * 60;

type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

export type CampusEventContext = {
    clientEventId: string;
    moduleId: string;
    moduleVersion: number;
    worldVersion: number;
    zoneId: CampusZoneId;
    durationSeconds: number;
};

export type InteractionInput = CampusEventContext & {
    objectId: string;
    eventType: InteractionEventType;
};

export type LocationInput = CampusEventContext & {
    spawnId: string;
};

function readPositiveInteger(
    value: unknown,
    fieldName: string,
    fallback?: number,
): ValidationResult<number> {
    if (value === undefined && fallback !== undefined) return { ok: true, value: fallback };
    if (!Number.isInteger(value) || Number(value) < 1) {
        return { ok: false, error: `${fieldName} debe ser un entero positivo.` };
    }
    return { ok: true, value: Number(value) };
}

function readDurationSeconds(value: unknown): ValidationResult<number> {
    if (value === undefined) return { ok: true, value: 0 };
    if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > MAX_DURATION_SECONDS) {
        return { ok: false, error: 'durationSeconds no es válido.' };
    }
    return { ok: true, value: Number(value) };
}

function inferZoneId(objectId?: string): CampusZoneId {
    if (objectId) {
        const zone = CAMPUS_MANIFEST.zones.find(({ interactables }) => (
            interactables.some(({ id }) => id === objectId)
        ));
        if (zone) return zone.id;
    }
    return CAMPUS_MANIFEST.defaultZoneId;
}

function validateCampusEventContext(
    input: Record<string, unknown>,
    options: { requireContext: boolean; inferredZoneId?: CampusZoneId },
): ValidationResult<CampusEventContext> {
    const moduleId = readRequiredString(input.moduleId, 'moduleId', 100);
    if (!moduleId.ok) return moduleId;

    const clientEventId = input.clientEventId === undefined && !options.requireContext
        ? { ok: true as const, value: 'legacy-event' }
        : readRequiredString(input.clientEventId, 'clientEventId', 100);
    if (!clientEventId.ok) return clientEventId;

    const moduleVersion = readPositiveInteger(
        input.moduleVersion,
        'moduleVersion',
        options.requireContext ? undefined : TRAINING_MODULE_VERSION,
    );
    if (!moduleVersion.ok) return moduleVersion;
    const worldVersion = readPositiveInteger(
        input.worldVersion,
        'worldVersion',
        options.requireContext ? undefined : CAMPUS_WORLD_VERSION,
    );
    if (!worldVersion.ok) return worldVersion;

    const rawZoneId = input.zoneId ?? (!options.requireContext ? options.inferredZoneId : undefined);
    if (!isCampusZoneId(rawZoneId)) {
        return { ok: false, error: 'zoneId no pertenece al campus activo.' };
    }
    const durationSeconds = readDurationSeconds(input.durationSeconds);
    if (!durationSeconds.ok) return durationSeconds;

    return {
        ok: true,
        value: {
            clientEventId: clientEventId.value,
            moduleId: moduleId.value,
            moduleVersion: moduleVersion.value,
            worldVersion: worldVersion.value,
            zoneId: rawZoneId,
            durationSeconds: durationSeconds.value,
        },
    };
}

export function validateActiveCampusContext(context: CampusEventContext): ValidationResult<CampusEventContext> {
    if (context.moduleId !== CAMPUS_MANIFEST.moduleId
        || context.moduleVersion !== CAMPUS_MANIFEST.moduleVersion
        || context.worldVersion !== CAMPUS_MANIFEST.worldVersion) {
        return { ok: false, error: 'El evento no pertenece al mundo y módulo activos.' };
    }
    return { ok: true, value: context };
}

export function validateInteractionInput(
    body: unknown,
    requireContext = false,
): ValidationResult<InteractionInput> {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Interacción inválida.' };
    const input = body as Record<string, unknown>;
    const objectId = readRequiredString(input.objectId, 'objectId', 100);
    if (!objectId.ok) return objectId;
    const context = validateCampusEventContext(input, {
        requireContext,
        inferredZoneId: inferZoneId(objectId.value),
    });
    if (!context.ok) return context;
    if (typeof input.eventType !== 'string'
        || !INTERACTION_EVENT_TYPES.includes(input.eventType as InteractionEventType)) {
        return { ok: false, error: 'eventType no es válido.' };
    }

    return {
        ok: true,
        value: {
            ...context.value,
            objectId: objectId.value,
            eventType: input.eventType as InteractionEventType,
        },
    };
}

export function validateProgressItemInput(
    body: unknown,
    fieldName: 'contentId',
    requireContext = false,
): ValidationResult<CampusEventContext & { itemId: string }> {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Datos de progreso inválidos.' };
    const input = body as Record<string, unknown>;
    const itemId = readRequiredString(input[fieldName], fieldName, 100);
    if (!itemId.ok) return itemId;
    const context = validateCampusEventContext(input, {
        requireContext,
        inferredZoneId: 'induction-office',
    });
    if (!context.ok) return context;
    return { ok: true, value: { ...context.value, itemId: itemId.value } };
}

export function validateLocationInput(body: unknown): ValidationResult<LocationInput> {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Ubicación inválida.' };
    const input = body as Record<string, unknown>;
    const context = validateCampusEventContext(input, { requireContext: true });
    if (!context.ok) return context;
    const spawnId = readRequiredString(input.spawnId, 'spawnId', 100);
    if (!spawnId.ok) return spawnId;
    const zone = getCampusZone(context.value.zoneId);
    if (!zone.spawns.some(({ id }) => id === spawnId.value)) {
        return { ok: false, error: 'El punto de aparición no pertenece a la zona indicada.' };
    }
    return { ok: true, value: { ...context.value, spawnId: spawnId.value } };
}
