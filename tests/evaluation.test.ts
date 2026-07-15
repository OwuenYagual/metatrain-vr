import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateEvaluationScore,
    summarizeEvaluationRequirements,
    validateEvaluationSubmission,
    type EvaluationAnswer,
    type ScorableQuestion,
} from '../server/domain/evaluation';

const questions: ScorableQuestion[] = [
    { id: 'q1', optionIds: ['a', 'b'], correctOptionId: 'a' },
    { id: 'q2', optionIds: ['a', 'b'], correctOptionId: 'b' },
    { id: 'q3', optionIds: ['a', 'b'], correctOptionId: 'a' },
    { id: 'q4', optionIds: ['a', 'b'], correctOptionId: 'b' },
    { id: 'q5', optionIds: ['a', 'b'], correctOptionId: 'a' },
];

test('rechaza respuestas duplicadas antes de calificar', () => {
    const result = validateEvaluationSubmission({
        answers: [
            { questionId: 'q1', optionId: 'a' },
            { questionId: 'q1', optionId: 'b' },
        ],
    });
    assert.equal(result.ok, false);
});

test('aprueba cuatro respuestas correctas de cinco con 80 por ciento', () => {
    const answers: EvaluationAnswer[] = [
        { questionId: 'q1', optionId: 'a' },
        { questionId: 'q2', optionId: 'b' },
        { questionId: 'q3', optionId: 'a' },
        { questionId: 'q4', optionId: 'b' },
        { questionId: 'q5', optionId: 'b' },
    ];
    const result = calculateEvaluationScore(questions, answers, 70);
    assert.deepEqual(result, {
        ok: true,
        value: {
            totalQuestions: 5,
            correctAnswers: 4,
            score: 80,
            status: 'approved',
        },
    });
});

test('no aprueba tres respuestas correctas de cinco con 60 por ciento', () => {
    const answers: EvaluationAnswer[] = [
        { questionId: 'q1', optionId: 'a' },
        { questionId: 'q2', optionId: 'b' },
        { questionId: 'q3', optionId: 'a' },
        { questionId: 'q4', optionId: 'a' },
        { questionId: 'q5', optionId: 'b' },
    ];
    const result = calculateEvaluationScore(questions, answers, 70);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.score, 60);
        assert.equal(result.value.status, 'failed');
    }
});

test('rechaza opciones que no pertenecen a la pregunta activa', () => {
    const answers: EvaluationAnswer[] = questions.map((question) => ({
        questionId: question.id,
        optionId: question.id === 'q3' ? 'opcion_inexistente' : question.correctOptionId,
    }));
    const result = calculateEvaluationScore(questions, answers, 70);
    assert.equal(result.ok, false);
});

test('exige completar contenidos y checkpoints canónicos', () => {
    const requirements = summarizeEvaluationRequirements({
        requiredContentIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
        completedContentIds: ['c1', 'c2', 'c3', 'c4', 'contenido_antiguo'],
        requiredCheckpointIds: ['p1', 'p2', 'p3', 'p4'],
        visitedCheckpointIds: ['p1', 'p2', 'p3', 'p4', 'checkpoint_antiguo'],
        requiredSimulationDecisionIds: ['d1', 'd2', 'd3'],
        completedSimulationDecisionIds: ['d1', 'd2'],
    });
    assert.deepEqual(requirements, {
        contents: { completed: 4, required: 5 },
        checkpoints: { completed: 4, required: 4 },
        simulation: { completed: 2, required: 3, grandfathered: false },
        eligible: false,
    });
});

test('habilita la evaluación cuando recorrido y simulación están completos', () => {
    const requirements = summarizeEvaluationRequirements({
        requiredContentIds: ['c1', 'c2'],
        completedContentIds: ['c1', 'c2'],
        requiredCheckpointIds: ['p1', 'p2'],
        visitedCheckpointIds: ['p1', 'p2'],
        requiredSimulationDecisionIds: ['d1', 'd2', 'd3'],
        completedSimulationDecisionIds: ['d1', 'd2', 'd3'],
    });
    assert.equal(requirements.eligible, true);
    assert.deepEqual(requirements.simulation, { completed: 3, required: 3, grandfathered: false });
});

test('conserva compatibilidad para una evaluación emitida antes de la simulación', () => {
    const requirements = summarizeEvaluationRequirements({
        requiredContentIds: ['c1'],
        completedContentIds: ['c1'],
        requiredCheckpointIds: ['p1'],
        visitedCheckpointIds: ['p1'],
        requiredSimulationDecisionIds: [],
        completedSimulationDecisionIds: [],
        simulationGrandfathered: true,
    });
    assert.equal(requirements.eligible, true);
    assert.deepEqual(requirements.simulation, { completed: 0, required: 0, grandfathered: true });
});
