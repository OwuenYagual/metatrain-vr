import { apiFetch, ApiError } from '../api/apiClient';
import { APP_CONFIG } from '../config/appConfig';

export type EvaluationOption = {
    id: string;
    text: string;
};

export type EvaluationQuestion = {
    id: string;
    text: string;
    options: EvaluationOption[];
};

export type EvaluationAnswer = {
    questionId: string;
    optionId: string;
};

export type EvaluationResult = {
    id: string;
    moduleId: string;
    totalQuestions: number;
    correctAnswers: number;
    score: number;
    status: 'approved' | 'failed';
    createdAt: string;
};

type QuestionsPayload = {
    passingScore: number;
    questions: EvaluationQuestion[];
};

function isEvaluationQuestion(value: unknown): value is EvaluationQuestion {
    if (!value || typeof value !== 'object') return false;
    const question = value as Partial<EvaluationQuestion>;
    return typeof question.id === 'string'
        && typeof question.text === 'string'
        && Array.isArray(question.options)
        && question.options.length >= 2
        && question.options.every((option) => Boolean(option)
            && typeof option.id === 'string'
            && typeof option.text === 'string');
}

function isEvaluationResult(value: unknown): value is EvaluationResult {
    if (!value || typeof value !== 'object') return false;
    const result = value as Partial<EvaluationResult>;
    return typeof result.id === 'string'
        && typeof result.moduleId === 'string'
        && typeof result.totalQuestions === 'number'
        && typeof result.correctAnswers === 'number'
        && typeof result.score === 'number'
        && (result.status === 'approved' || result.status === 'failed')
        && typeof result.createdAt === 'string';
}

export const evaluationService = {
    async getQuestions(moduleId: string, signal?: AbortSignal): Promise<QuestionsPayload> {
        const response = await apiFetch(
            `/evaluation/${encodeURIComponent(moduleId)}/questions`,
            { signal },
        );
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object') {
            throw new Error('El servidor devolvió una evaluación inválida.');
        }
        const data = payload as Partial<QuestionsPayload>;
        if (typeof data.passingScore !== 'number'
            || !Array.isArray(data.questions)
            || !data.questions.every(isEvaluationQuestion)) {
            throw new Error('El servidor devolvió una evaluación inválida.');
        }
        return { passingScore: data.passingScore, questions: data.questions };
    },

    async getLatestResult(moduleId: string, signal?: AbortSignal): Promise<EvaluationResult | null> {
        try {
            const response = await apiFetch(
                `/evaluation/${encodeURIComponent(moduleId)}/result`,
                { signal },
            );
            const payload = await response.json() as { result?: unknown };
            if (!isEvaluationResult(payload.result)) {
                throw new Error('El servidor devolvió un resultado inválido.');
            }
            return payload.result;
        } catch (error: unknown) {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        }
    },

    async submit(moduleId: string, answers: EvaluationAnswer[]): Promise<EvaluationResult> {
        const response = await apiFetch(`/evaluation/${encodeURIComponent(moduleId)}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                moduleVersion: APP_CONFIG.TRAINING_MODULE_VERSION,
                worldVersion: APP_CONFIG.CAMPUS_WORLD_VERSION,
                zoneId: 'assessment-room',
                durationSeconds: 0,
                answers,
            }),
        });
        const payload = await response.json() as { result?: unknown };
        if (!isEvaluationResult(payload.result)) {
            throw new Error('El servidor devolvió un resultado inválido.');
        }
        return payload.result;
    },
};
