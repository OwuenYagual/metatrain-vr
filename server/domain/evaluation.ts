import { readRequiredString } from '../utils/validation';

type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

export type EvaluationAnswer = {
    questionId: string;
    optionId: string;
};

export type ScorableQuestion = {
    id: string;
    optionIds: readonly string[];
    correctOptionId: string;
};

export type EvaluationScore = {
    totalQuestions: number;
    correctAnswers: number;
    score: number;
    status: 'approved' | 'failed';
};

export type EvaluationRequirements = {
    requiredContentIds: readonly string[];
    completedContentIds: readonly string[];
    requiredCheckpointIds: readonly string[];
    visitedCheckpointIds: readonly string[];
    requiredSimulationDecisionIds?: readonly string[];
    completedSimulationDecisionIds?: readonly string[];
    simulationGrandfathered?: boolean;
};

export function validateEvaluationSubmission(
    body: unknown,
): ValidationResult<{ answers: EvaluationAnswer[] }> {
    if (!body || typeof body !== 'object') {
        return { ok: false, error: 'La entrega de la evaluación no es válida.' };
    }

    const answers = (body as Record<string, unknown>).answers;
    if (!Array.isArray(answers) || answers.length === 0 || answers.length > 100) {
        return { ok: false, error: 'Debe enviar entre 1 y 100 respuestas.' };
    }

    const normalizedAnswers: EvaluationAnswer[] = [];
    const questionIds = new Set<string>();
    for (const answer of answers) {
        if (!answer || typeof answer !== 'object') {
            return { ok: false, error: 'Cada respuesta debe identificar su pregunta y opción.' };
        }
        const input = answer as Record<string, unknown>;
        const questionId = readRequiredString(input.questionId, 'questionId', 100);
        const optionId = readRequiredString(input.optionId, 'optionId', 100);
        if (!questionId.ok) return questionId;
        if (!optionId.ok) return optionId;
        if (questionIds.has(questionId.value)) {
            return { ok: false, error: 'No puede responder dos veces la misma pregunta.' };
        }
        questionIds.add(questionId.value);
        normalizedAnswers.push({ questionId: questionId.value, optionId: optionId.value });
    }

    return { ok: true, value: { answers: normalizedAnswers } };
}

export function calculateEvaluationScore(
    questions: readonly ScorableQuestion[],
    answers: readonly EvaluationAnswer[],
    passingScore: number,
): ValidationResult<EvaluationScore> {
    if (questions.length === 0) {
        return { ok: false, error: 'La evaluación no tiene preguntas activas.' };
    }
    if (answers.length !== questions.length) {
        return { ok: false, error: 'Debe responder todas las preguntas de la evaluación.' };
    }

    const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.optionId]));
    if (answersByQuestion.size !== answers.length) {
        return { ok: false, error: 'No puede responder dos veces la misma pregunta.' };
    }

    let correctAnswers = 0;
    for (const question of questions) {
        const selectedOptionId = answersByQuestion.get(question.id);
        if (!selectedOptionId || !question.optionIds.includes(selectedOptionId)) {
            return { ok: false, error: 'Las preguntas u opciones enviadas ya no son válidas.' };
        }
        if (selectedOptionId === question.correctOptionId) correctAnswers += 1;
    }

    const score = Math.round((correctAnswers / questions.length) * 100);
    return {
        ok: true,
        value: {
            totalQuestions: questions.length,
            correctAnswers,
            score,
            status: score >= passingScore ? 'approved' : 'failed',
        },
    };
}

export function summarizeEvaluationRequirements(requirements: EvaluationRequirements) {
    const completedContentIds = new Set(requirements.completedContentIds);
    const visitedCheckpointIds = new Set(requirements.visitedCheckpointIds);
    const requiredSimulationDecisionIds = requirements.requiredSimulationDecisionIds ?? [];
    const completedSimulationDecisionIds = new Set(requirements.completedSimulationDecisionIds ?? []);
    const completedContents = requirements.requiredContentIds.filter((id) => completedContentIds.has(id)).length;
    const visitedCheckpoints = requirements.requiredCheckpointIds.filter((id) => visitedCheckpointIds.has(id)).length;
    const completedSimulationDecisions = requiredSimulationDecisionIds
        .filter((id) => completedSimulationDecisionIds.has(id)).length;

    return {
        contents: {
            completed: completedContents,
            required: requirements.requiredContentIds.length,
        },
        checkpoints: {
            completed: visitedCheckpoints,
            required: requirements.requiredCheckpointIds.length,
        },
        simulation: {
            completed: completedSimulationDecisions,
            required: requiredSimulationDecisionIds.length,
            grandfathered: requirements.simulationGrandfathered ?? false,
        },
        eligible: completedContents === requirements.requiredContentIds.length
            && visitedCheckpoints === requirements.requiredCheckpointIds.length
            && completedSimulationDecisions === requiredSimulationDecisionIds.length,
    };
}
