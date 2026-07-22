import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateContentProgress, getCompletedStationIds } from '../src/progress/contentProgress';
import {
    getCompletedTrainingRouteSegmentCount,
    getPreviousTrainingStationId,
    isTrainingStationUnlocked,
    TRAINING_INTERACTION_OBJECT_IDS,
    TRAINING_STATIONS,
} from '../shared/trainingModule';

test('el recorrido publicado contiene exactamente cinco objetos interactivos únicos', () => {
    assert.equal(TRAINING_STATIONS.length, 5);
    assert.equal(new Set(TRAINING_INTERACTION_OBJECT_IDS).size, 5);
});

test('la ruta conserva el orden pedagógico de las cinco estaciones', () => {
    assert.deepEqual(TRAINING_INTERACTION_OBJECT_IDS, [
        'obj_manual',
        'obj_rrhh',
        'obj_funciones',
        'obj_seguridad',
        'obj_examen',
    ]);
    assert.equal(TRAINING_STATIONS.every(({ position }) => position[1] === -0.45), true);
});

test('cada estación cuenta con un NPC capacitador identificado', () => {
    assert.equal(TRAINING_STATIONS.every(({ guide }) => (
        guide.name.length > 0
        && guide.role.length > 0
        && /^#[0-9a-f]{6}$/i.test(guide.color)
    )), true);
    assert.equal(new Set(TRAINING_STATIONS.map(({ guide }) => guide.name)).size, TRAINING_STATIONS.length);
});

test('habilita las estaciones una por una según el orden del recorrido', () => {
    assert.equal(isTrainingStationUnlocked('obj_manual', []), true);
    assert.equal(isTrainingStationUnlocked('obj_rrhh', []), false);
    assert.equal(isTrainingStationUnlocked('obj_rrhh', ['obj_manual']), true);
    assert.equal(isTrainingStationUnlocked('obj_funciones', ['obj_manual']), false);
    assert.equal(isTrainingStationUnlocked('obj_desconocido', TRAINING_INTERACTION_OBJECT_IDS), false);
    assert.equal(getPreviousTrainingStationId('obj_manual'), null);
    assert.equal(getPreviousTrainingStationId('obj_funciones'), 'obj_rrhh');
});

test('pinta únicamente los tramos consecutivos ya recorridos', () => {
    assert.equal(getCompletedTrainingRouteSegmentCount([]), 0);
    assert.equal(getCompletedTrainingRouteSegmentCount(['obj_manual']), 1);
    assert.equal(getCompletedTrainingRouteSegmentCount(['obj_manual', 'obj_rrhh']), 2);
    assert.equal(getCompletedTrainingRouteSegmentCount(['obj_funciones']), 0);
    assert.equal(getCompletedTrainingRouteSegmentCount(TRAINING_INTERACTION_OBJECT_IDS), 4);
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

test('traduce el progreso guardado a estaciones completadas', () => {
    const contents = [
        { _id: 'c1', interactionObjectId: 'obj_manual' },
        { _id: 'c2', interactionObjectId: 'obj_rrhh' },
    ];
    assert.deepEqual(getCompletedStationIds(contents, ['c1', 'contenido_antiguo']), ['obj_manual']);
});
