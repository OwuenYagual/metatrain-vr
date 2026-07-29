import assert from 'node:assert/strict';
import test from 'node:test';
import {
    INDUCTION_ACTIVITIES,
    isChecklistSelectionCorrect,
} from '../shared/inductionActivities';
import {
    buildNpcSpeechBubbles,
    getNpcSpeechRevealInterval,
    NPC_BUBBLE_PAUSE_MS,
    NPC_SPEECH_SPEED_OPTIONS,
    NPC_TEXT_REVEAL_INTERVAL_MS,
} from '../src/induction/npcSpeech';
import { TRAINING_INTERACTION_OBJECT_IDS } from '../shared/trainingModule';

test('cada estación 3D tiene una actividad de inducción configurada', () => {
    assert.deepEqual(Object.keys(INDUCTION_ACTIVITIES).sort(), [...TRAINING_INTERACTION_OBJECT_IDS].sort());
});

test('cada actividad capacita antes de evaluar', () => {
    for (const activity of Object.values(INDUCTION_ACTIVITIES)) {
        assert.ok(activity.training.greeting.length > 20);
        assert.ok(activity.training.lessons.length >= 3);
        assert.ok(activity.training.lessons.every((lesson) => (
            lesson.title.length > 0
            && lesson.explanation.length > 40
            && lesson.keyPoint.length > 20
        )));
    }
});

test('el NPC presenta cada lección como una secuencia legible de globos', () => {
    const activity = INDUCTION_ACTIVITIES.obj_manual;
    const firstLessonBubbles = buildNpcSpeechBubbles(activity, 0);
    const nextLessonBubbles = buildNpcSpeechBubbles(activity, 1);

    assert.deepEqual(
        firstLessonBubbles.map((bubble) => bubble.kind),
        ['greeting', 'explanation', 'key-point'],
    );
    assert.deepEqual(
        nextLessonBubbles.map((bubble) => bubble.kind),
        ['explanation', 'key-point'],
    );
    assert.ok(firstLessonBubbles.every((bubble) => bubble.text.trim().length > 0));
});

test('la velocidad de escritura y la pausa del NPC se mantienen en un rango cómodo', () => {
    assert.ok(NPC_TEXT_REVEAL_INTERVAL_MS >= 15 && NPC_TEXT_REVEAL_INTERVAL_MS <= 35);
    assert.ok(NPC_BUBBLE_PAUSE_MS >= 500 && NPC_BUBBLE_PAUSE_MS <= 1_000);
});

test('el participante puede elegir una velocidad lenta, normal o rápida', () => {
    assert.deepEqual(
        NPC_SPEECH_SPEED_OPTIONS.map((option) => option.value),
        ['slow', 'normal', 'fast'],
    );
    assert.ok(getNpcSpeechRevealInterval('slow') > getNpcSpeechRevealInterval('normal'));
    assert.ok(getNpcSpeechRevealInterval('normal') > getNpcSpeechRevealInterval('fast'));
});

test('el directorio presenta los departamentos y una persona de referencia', () => {
    const directory = INDUCTION_ACTIVITIES.obj_rrhh;
    assert.equal(directory.kind, 'directory');
    if (directory.kind !== 'directory') return;

    assert.ok(directory.departments.length >= 4);
    assert.ok(directory.departments.every((department) => (
        department.name.length > 0
        && department.person.length > 0
        && department.role.length > 0
        && department.channel.length > 0
    )));
});

test('la tarjeta de funciones exige la selección exacta', () => {
    const checklist = INDUCTION_ACTIVITIES.obj_examen;
    assert.equal(checklist.kind, 'checklist');
    if (checklist.kind !== 'checklist') return;

    assert.equal(isChecklistSelectionCorrect(checklist.correctOptionIds, checklist.correctOptionIds), true);
    assert.equal(isChecklistSelectionCorrect([...checklist.correctOptionIds, 'passwords'], checklist.correctOptionIds), false);
    assert.equal(isChecklistSelectionCorrect(checklist.correctOptionIds.slice(1), checklist.correctOptionIds), false);
});

test('las actividades de escenarios tienen una sola respuesta correcta por situación', () => {
    const scenarios = Object.values(INDUCTION_ACTIVITIES).filter((activity) => activity.kind === 'scenario');
    assert.ok(scenarios.length >= 2);
    for (const scenario of scenarios) {
        if (scenario.kind !== 'scenario') continue;
        for (const step of scenario.steps) {
            assert.equal(step.options.filter((option) => option.id === step.correctOptionId).length, 1);
        }
    }
});
