import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthSession } from '../src/auth/authService';
import {
    getOfflineSyncParticipant,
    sendWithOfflineFallback,
    setOfflineSyncParticipant,
    syncPendingRequests,
} from '../src/utils/offlineSync';

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length(): number {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

type FetchCall = {
    body: Record<string, unknown>;
    method: string;
};

function installBrowserStorage(): void {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: new MemoryStorage(),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: new MemoryStorage(),
    });
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: true },
    });
}

function activateParticipant(participantId: string): void {
    const session: AuthSession = {
        token: `token-${participantId}`,
        participant: {
            id: participantId,
            fullName: participantId,
            email: `${participantId}@example.com`,
            avatarId: 'avatar_01',
            role: 'participant',
            createdAt: '2026-01-01T00:00:00.000Z',
        },
        expiresAt: '2099-01-01T00:00:00.000Z',
    };
    sessionStorage.setItem('metatrain.authSession', JSON.stringify(session));
    setOfflineSyncParticipant(participantId);
}

test('aísla las colas por participante y conserva clientEventId en los reintentos', async () => {
    installBrowserStorage();
    const calls: FetchCall[] = [];
    let onlineRequestSucceeds = false;

    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls.push({
            body: JSON.parse(String(init?.body)) as Record<string, unknown>,
            method: init?.method ?? 'GET',
        });
        if (!onlineRequestSucceeds) throw new TypeError('network unavailable');
        return new Response(null, { status: 204 });
    };

    activateParticipant('participant-a');
    assert.equal(await sendWithOfflineFallback('/progress/interaction', {
        objectId: 'station-1',
    }), 'queued');
    const participantAEventId = calls[0].body.clientEventId;
    assert.equal(typeof participantAEventId, 'string');

    activateParticipant('participant-b');
    assert.equal(await sendWithOfflineFallback('/progress/location', {
        zoneId: 'lobby',
        clientEventId: 'location-event-b',
    }, 'PUT'), 'queued');

    onlineRequestSucceeds = true;
    await syncPendingRequests();

    assert.equal(calls.length, 3);
    assert.equal(calls[2].body.clientEventId, 'location-event-b');
    assert.equal(calls[2].method, 'PUT');
    assert.equal(localStorage.length, 1, 'la cola del otro participante debe permanecer intacta');

    activateParticipant('participant-a');
    await syncPendingRequests();

    assert.equal(calls.length, 4);
    assert.equal(calls[3].body.clientEventId, participantAEventId);
    assert.equal(localStorage.length, 0);
    assert.equal(getOfflineSyncParticipant(), 'participant-a');

    setOfflineSyncParticipant(null);
    await assert.rejects(
        sendWithOfflineFallback('/progress/interaction', { objectId: 'station-2' }),
        /participante autenticado/
    );
});
