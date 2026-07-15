import { APP_CONFIG } from '../config/appConfig';

export type AvatarId = 'avatar_01' | 'avatar_02' | 'avatar_03';

export type Participant = {
    id: string;
    fullName: string;
    email: string;
    avatarId: AvatarId | null;
    role: 'participant' | 'admin';
    createdAt: string;
};

export type AuthSession = {
    token: string;
    participant: Participant;
    expiresAt: string;
};

const SESSION_STORAGE_KEY = 'metatrain.authSession';

async function readApiError(response: Response, fallback: string): Promise<string> {
    try {
        const payload = await response.json() as { error?: unknown };
        return typeof payload.error === 'string' ? payload.error : fallback;
    } catch {
        return fallback;
    }
}

function isAuthSession(value: unknown): value is AuthSession {
    if (!value || typeof value !== 'object') return false;
    const session = value as Partial<AuthSession>;
    return typeof session.token === 'string'
        && typeof session.expiresAt === 'string'
        && Boolean(session.participant)
        && typeof session.participant?.id === 'string';
}

export const authService = {
    async register(fullName: string, email: string, password: string): Promise<void> {
        const response = await fetch(`${APP_CONFIG.API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password }),
        });

        if (!response.ok) throw new Error(await readApiError(response, 'Error en el registro'));
    },

    async login(email: string, password: string): Promise<AuthSession> {
        const response = await fetch(`${APP_CONFIG.API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) throw new Error(await readApiError(response, 'Credenciales inválidas'));

        const session: unknown = await response.json();
        if (!isAuthSession(session)) throw new Error('El servidor devolvió una sesión inválida.');

        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
        localStorage.removeItem('token');
        localStorage.removeItem('participant');
        return session;
    },

    logout(): void {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem('token');
        localStorage.removeItem('participant');
    },

    getCurrentSession(): AuthSession | null {
        const rawSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!rawSession) return null;

        try {
            const session: unknown = JSON.parse(rawSession);
            if (!isAuthSession(session) || Date.parse(session.expiresAt) <= Date.now()) {
                this.logout();
                return null;
            }
            return session;
        } catch {
            this.logout();
            return null;
        }
    },

    getAccessToken(): string | null {
        return this.getCurrentSession()?.token ?? null;
    },

    updateParticipant(participant: Participant): void {
        const session = this.getCurrentSession();
        if (!session) return;
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, participant }));
    },
};
