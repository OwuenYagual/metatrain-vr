import assert from 'node:assert/strict';
import test from 'node:test';
import { authService, type AuthSession } from '../src/auth/authService';
import { getOfflineSyncParticipant, setOfflineSyncParticipant } from '../src/utils/offlineSync';

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

function installBrowserStorage(): void {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: new MemoryStorage(),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: new MemoryStorage(),
    });
}

function createSession(participantId: string, expiresAt = '2099-01-01T00:00:00.000Z'): AuthSession {
    return {
        token: `token-${participantId}`,
        participant: {
            id: participantId,
            fullName: 'Ana Pérez',
            email: 'ana@example.com',
            avatarId: 'avatar_02',
            role: 'participant',
            createdAt: '2026-01-01T00:00:00.000Z',
        },
        expiresAt,
    };
}

test('login, restauración y logout mantienen el contexto offline de la sesión', async () => {
    installBrowserStorage();
    setOfflineSyncParticipant(null);
    const loginSession = createSession('participant-login');

    globalThis.fetch = async (): Promise<Response> => Response.json(loginSession);

    const session = await authService.login('ana@example.com', 'password-seguro');
    assert.equal(session.participant.id, 'participant-login');
    assert.equal(getOfflineSyncParticipant(), 'participant-login');

    authService.logout();
    assert.equal(getOfflineSyncParticipant(), null);
    assert.equal(sessionStorage.getItem('metatrain.authSession'), null);

    const restoredSession = createSession('participant-restored');
    sessionStorage.setItem('metatrain.authSession', JSON.stringify(restoredSession));
    assert.equal(authService.getCurrentSession()?.participant.id, 'participant-restored');
    assert.equal(getOfflineSyncParticipant(), 'participant-restored');

    sessionStorage.setItem(
        'metatrain.authSession',
        JSON.stringify(createSession('participant-expired', '2020-01-01T00:00:00.000Z'))
    );
    assert.equal(authService.getCurrentSession(), null);
    assert.equal(getOfflineSyncParticipant(), null);
});
