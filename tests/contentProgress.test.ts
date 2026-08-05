import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { INDUCTION_ACTIVITIES } from '../shared/inductionActivities';
import { calculateContentProgress, getCompletedStationIds } from '../src/progress/contentProgress';
import {
    getCompletedTrainingRouteSegmentCount,
    getPreviousTrainingStationId,
    isTrainingStationUnlocked,
    TRAINING_INTERACTION_OBJECT_IDS,
    TRAINING_STATIONS,
} from '../shared/trainingModule';

test('el recorrido publicado contiene exactamente cuatro objetos interactivos únicos', () => {
    assert.equal(TRAINING_STATIONS.length, 4);
    assert.equal(new Set(TRAINING_INTERACTION_OBJECT_IDS).size, 4);
});

test('la ruta conserva el orden pedagógico de las cuatro estaciones', () => {
    assert.deepEqual(TRAINING_INTERACTION_OBJECT_IDS, [
        'obj_manual',
        'obj_rrhh',
        'obj_funciones',
        'obj_seguridad',
    ]);
    assert.equal(TRAINING_STATIONS.every(({ position }) => position[1] === -0.45), true);
    assert.deepEqual(TRAINING_STATIONS.map(({ position }) => [position[0], position[2]]), [
        [-3.35, -3.1],
        [3.35, -3.1],
        [3.35, 3.1],
        [-3.35, 3.1],
    ]);
});

test('cada estación cuenta con un NPC capacitador identificado', () => {
    const kenneyAvatarIds = new Set(['avatar_01', 'avatar_02', 'avatar_03']);
    assert.equal(TRAINING_STATIONS.every(({ guide }) => (
        guide.name.length > 0
        && guide.role.length > 0
        && /^#[0-9a-f]{6}$/i.test(guide.color)
        && kenneyAvatarIds.has(guide.avatarId)
    )), true);
    assert.equal(new Set(TRAINING_STATIONS.map(({ guide }) => guide.name)).size, TRAINING_STATIONS.length);
    assert.deepEqual(
        [...new Set(TRAINING_STATIONS.map(({ guide }) => guide.avatarId))].sort(),
        [...kenneyAvatarIds].sort(),
    );
});

test('los capacitadores y responsables de área tienen retratos locales', () => {
    const directory = INDUCTION_ACTIVITIES.obj_rrhh;
    assert.equal(directory.kind, 'directory');
    if (directory.kind !== 'directory') return;

    const imageUrls = [
        ...TRAINING_STATIONS.map(({ guide }) => guide.imageUrl),
        ...directory.departments.map(({ imageUrl }) => imageUrl),
    ];
    assert.equal(imageUrls.every((imageUrl) => (
        imageUrl.startsWith('/images/people/')
        && existsSync(resolve('public', imageUrl.slice(1)))
    )), true);
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
    assert.equal(getCompletedTrainingRouteSegmentCount(TRAINING_INTERACTION_OBJECT_IDS), 3);
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
