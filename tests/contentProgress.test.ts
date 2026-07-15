import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateContentProgress } from '../src/progress/contentProgress';
import { TRAINING_INTERACTION_OBJECT_IDS, TRAINING_STATIONS } from '../shared/trainingModule';

test('el recorrido publicado contiene exactamente cinco objetos interactivos únicos', () => {
    assert.equal(TRAINING_STATIONS.length, 5);
    assert.equal(new Set(TRAINING_INTERACTION_OBJECT_IDS).size, 5);
});

test('calcula el avance usando únicamente contenidos disponibles y sin duplicados', () => {
    const progress = calculateContentProgress(
        ['contenido_1', 'contenido_2', 'contenido_3', 'contenido_4', 'contenido_5'],
        ['contenido_1', 'contenido_2', 'contenido_2', 'contenido_eliminado'],
    );

    assert.deepEqual(progress, {
        completedCount: 2,
        totalCount: 5,
        percentage: 40,
    });
});

test('representa como cero un módulo que todavía no tiene contenidos', () => {
    assert.deepEqual(calculateContentProgress([], ['contenido_1']), {
        completedCount: 0,
        totalCount: 0,
        percentage: 0,
    });
});
