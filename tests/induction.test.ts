import assert from 'node:assert/strict';
import test from 'node:test';
import {
    INDUCTION_ACTIVITIES,
    isChecklistSelectionCorrect,
} from '../src/induction/inductionActivities';
import { TRAINING_INTERACTION_OBJECT_IDS } from '../shared/trainingModule';

test('cada estación 3D tiene una actividad de inducción configurada', () => {
    assert.deepEqual(Object.keys(INDUCTION_ACTIVITIES).sort(), [...TRAINING_INTERACTION_OBJECT_IDS].sort());
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
