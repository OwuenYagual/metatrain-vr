import { authService } from '../auth/authService';
import { APP_CONFIG } from '../config/appConfig';

export class ApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function readError(response: Response): Promise<string> {
    try {
        const payload = await response.json() as { error?: unknown };
        return typeof payload.error === 'string' ? payload.error : 'La solicitud no pudo completarse.';
    } catch {
        return 'La solicitud no pudo completarse.';
    }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = authService.getAccessToken();
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`${APP_CONFIG.API_URL}${path}`, { ...init, headers });
    if (!response.ok) {
        const message = await readError(response);
        if (response.status === 401) authService.logout();
        throw new ApiError(message, response.status);
    }
    return response;
}

export function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}
