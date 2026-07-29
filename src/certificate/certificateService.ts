import { apiFetch, ApiError } from '../api/apiClient';

export type CertificateSummary = {
    certificateId: string;
    moduleId: string;
    moduleTitle: string;
    score: number;
    status: 'generated';
    issuedAt: string;
};

function isCertificateSummary(value: unknown): value is CertificateSummary {
    if (!value || typeof value !== 'object') return false;
    const certificate = value as Partial<CertificateSummary>;
    return typeof certificate.certificateId === 'string'
        && typeof certificate.moduleId === 'string'
        && typeof certificate.moduleTitle === 'string'
        && typeof certificate.score === 'number'
        && certificate.status === 'generated'
        && typeof certificate.issuedAt === 'string';
}

async function readCertificate(response: Response): Promise<CertificateSummary> {
    const payload = await response.json() as { certificate?: unknown };
    if (!isCertificateSummary(payload.certificate)) {
        throw new Error('El servidor devolvió un certificado inválido.');
    }
    return payload.certificate;
}

export const certificateService = {
    async getCertificate(moduleId: string, signal?: AbortSignal): Promise<CertificateSummary | null> {
        try {
            const response = await apiFetch(`/certificates/${encodeURIComponent(moduleId)}`, { signal });
            return await readCertificate(response);
        } catch (error: unknown) {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        }
    },

    async issueCertificate(moduleId: string): Promise<CertificateSummary> {
        const response = await apiFetch(`/certificates/${encodeURIComponent(moduleId)}/issue`, {
            method: 'POST',
        });
        return readCertificate(response);
    },

    async downloadCertificate(moduleId: string): Promise<Blob> {
        const response = await apiFetch(`/certificates/${encodeURIComponent(moduleId)}/download`);
        const blob = await response.blob();
        if (blob.type !== 'application/pdf') {
            throw new Error('El servidor no devolvió un certificado PDF válido.');
        }
        return blob;
    },
};
