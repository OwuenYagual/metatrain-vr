import { apiFetch, ApiError } from '../api/apiClient';

export type OfflineRequestMethod = 'POST' | 'PATCH' | 'PUT';

type PendingRequest = {
    id: string;
    participantId: string;
    path: string;
    method: OfflineRequestMethod;
    body: string;
    queuedAt: string;
};

const STORAGE_PREFIX = 'metatrain.pendingRequests.v2';
const LEGACY_STORAGE_KEY = 'metatrain.pendingRequests';
const MAX_PENDING_REQUESTS = 250;

let activeParticipantId: string | null = null;
let initialized = false;
let syncInFlight: Promise<void> | null = null;
let syncRequested = false;

function normalizeParticipantId(participantId: string): string {
    const normalized = participantId.trim();
    if (!normalized) throw new Error('El contexto offline requiere un participante válido.');
    return normalized;
}

function getStorageKey(participantId: string): string {
    return `${STORAGE_PREFIX}:${encodeURIComponent(participantId)}`;
}

function isPendingRequest(value: unknown, participantId: string): value is PendingRequest {
    if (!value || typeof value !== 'object') return false;

    const request = value as Partial<PendingRequest>;
    if (request.participantId !== participantId
        || typeof request.id !== 'string'
        || !request.id
        || typeof request.path !== 'string'
        || !/^\/(?!\/)/.test(request.path)
        || typeof request.body !== 'string'
        || typeof request.queuedAt !== 'string'
        || !['POST', 'PATCH', 'PUT'].includes(request.method ?? '')) {
        return false;
    }

    try {
        const payload: unknown = JSON.parse(request.body);
        return Boolean(payload)
            && typeof payload === 'object'
            && !Array.isArray(payload)
            && (payload as { clientEventId?: unknown }).clientEventId === request.id;
    } catch {
        return false;
    }
}

function readQueue(participantId: string): PendingRequest[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(getStorageKey(participantId)) ?? '[]');
        return Array.isArray(value)
            ? value.filter((item): item is PendingRequest => isPendingRequest(item, participantId))
            : [];
    } catch {
        return [];
    }
}

function saveQueue(participantId: string, queue: PendingRequest[]): void {
    const storageKey = getStorageKey(participantId);
    if (!queue.length) {
        localStorage.removeItem(storageKey);
        return;
    }
    localStorage.setItem(storageKey, JSON.stringify(queue.slice(-MAX_PENDING_REQUESTS)));
}

function enqueue(request: PendingRequest): void {
    const queue = readQueue(request.participantId);
    if (queue.some((pendingRequest) => pendingRequest.id === request.id)) return;
    queue.push(request);
    saveQueue(request.participantId, queue);
}

function isRetryable(error: unknown): boolean {
    return !(error instanceof ApiError)
        || error.status === 401
        || error.status === 408
        || error.status === 425
        || error.status === 429
        || error.status >= 500;
}

function createPendingRequest(
    participantId: string,
    path: string,
    payload: Record<string, unknown>,
    method: OfflineRequestMethod
): PendingRequest {
    if (!/^\/(?!\/)/.test(path)) throw new Error('La ruta offline debe ser relativa a la API.');

    const suppliedEventId = typeof payload.clientEventId === 'string'
        ? payload.clientEventId.trim()
        : '';
    const clientEventId = suppliedEventId || crypto.randomUUID();

    return {
        id: clientEventId,
        participantId,
        path,
        method,
        body: JSON.stringify({ ...payload, clientEventId }),
        queuedAt: new Date().toISOString(),
    };
}

async function syncActiveQueue(): Promise<void> {
    const participantId = activeParticipantId;
    if (!participantId || !navigator.onLine) return;

    const queue = readQueue(participantId);
    if (!queue.length) return;

    const remaining: PendingRequest[] = [];
    for (let index = 0; index < queue.length; index += 1) {
        const request = queue[index];

        if (activeParticipantId !== participantId) {
            remaining.push(...queue.slice(index));
            break;
        }

        try {
            await apiFetch(request.path, {
                method: request.method,
                headers: { 'Content-Type': 'application/json' },
                body: request.body,
            });
        } catch (error: unknown) {
            if (isRetryable(error)) {
                remaining.push(...queue.slice(index));
                break;
            }
        }
    }
    saveQueue(participantId, remaining);
}

async function runSyncLoop(): Promise<void> {
    while (syncRequested) {
        syncRequested = false;
        await syncActiveQueue();
    }
}

/**
 * Vincula la cola offline con la sesión autenticada. Un valor nulo suspende toda
 * sincronización sin borrar las colas que pertenecen a otros participantes.
 */
export function setOfflineSyncParticipant(participantId: string | null): void {
    const nextParticipantId = participantId === null
        ? null
        : normalizeParticipantId(participantId);
    if (activeParticipantId === nextParticipantId) return;

    activeParticipantId = nextParticipantId;
    if (initialized && activeParticipantId && navigator.onLine) {
        void syncPendingRequests();
    }
}

export function getOfflineSyncParticipant(): string | null {
    return activeParticipantId;
}

export async function sendWithOfflineFallback(
    path: string,
    payload: Record<string, unknown>,
    method: OfflineRequestMethod = 'POST'
): Promise<'sent' | 'queued'> {
    const participantId = activeParticipantId;
    if (!participantId) {
        throw new Error('No hay un participante autenticado para registrar el evento.');
    }

    const request = createPendingRequest(participantId, path, payload, method);
    try {
        await apiFetch(request.path, {
            method: request.method,
            headers: { 'Content-Type': 'application/json' },
            body: request.body,
        });
        return 'sent';
    } catch (error: unknown) {
        if (!isRetryable(error)) throw error;
        enqueue(request);
        return 'queued';
    }
}

export function syncPendingRequests(): Promise<void> {
    syncRequested = true;
    if (!syncInFlight) {
        syncInFlight = runSyncLoop().finally(() => {
            syncInFlight = null;
            if (syncRequested) void syncPendingRequests();
        });
    }
    return syncInFlight;
}

export function initializeOfflineSync(): void {
    if (initialized) return;
    initialized = true;

    // Las colas antiguas no tenían propietario y no pueden reenviarse de forma segura.
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.addEventListener('online', () => void syncPendingRequests());
    if (activeParticipantId && navigator.onLine) void syncPendingRequests();
}
