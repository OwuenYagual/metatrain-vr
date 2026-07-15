import { apiFetch, ApiError } from '../api/apiClient';

type PendingRequest = {
    id: string;
    path: string;
    method: 'POST' | 'PATCH';
    body: string;
    queuedAt: string;
};

const STORAGE_KEY = 'metatrain.pendingRequests';

function readQueue(): PendingRequest[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        return Array.isArray(value) ? value.filter((item): item is PendingRequest => {
            if (!item || typeof item !== 'object') return false;
            const request = item as Partial<PendingRequest>;
            return typeof request.id === 'string'
                && typeof request.path === 'string'
                && typeof request.body === 'string'
                && typeof request.queuedAt === 'string'
                && (request.method === 'POST' || request.method === 'PATCH');
        }) : [];
    } catch {
        return [];
    }
}

function saveQueue(queue: PendingRequest[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-250)));
}

function enqueue(path: string, method: PendingRequest['method'], body: string) {
    const queue = readQueue();
    queue.push({
        id: crypto.randomUUID(),
        path,
        method,
        body,
        queuedAt: new Date().toISOString(),
    });
    saveQueue(queue);
}

export async function sendWithOfflineFallback(
    path: string,
    payload: unknown,
    method: PendingRequest['method'] = 'POST'
): Promise<'sent' | 'queued'> {
    const body = JSON.stringify(payload);
    try {
        await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body });
        return 'sent';
    } catch (error: unknown) {
        const recoverable = !(error instanceof ApiError) || error.status === 429 || error.status >= 500;
        if (!recoverable) throw error;
        enqueue(path, method, body);
        return 'queued';
    }
}

export async function syncPendingRequests(): Promise<void> {
    const queue = readQueue();
    if (!queue.length || !navigator.onLine) return;

    const remaining: PendingRequest[] = [];
    for (const request of queue) {
        try {
            await apiFetch(request.path, {
                method: request.method,
                headers: { 'Content-Type': 'application/json' },
                body: request.body,
            });
        } catch (error: unknown) {
            if (!(error instanceof ApiError) || error.status === 429 || error.status >= 500) {
                remaining.push(request);
            }
        }
    }
    saveQueue(remaining);
}

let initialized = false;

export function initializeOfflineSync(): void {
    if (initialized) return;
    initialized = true;
    window.addEventListener('online', () => void syncPendingRequests());
    if (navigator.onLine) void syncPendingRequests();
}
