import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CAMPUS_INTERACTION_DISTANCE,
    CAMPUS_MANIFEST,
    createDefaultPlayerLocation,
    getCampusSpawn,
    isCampusInteraction,
    isCampusZoneUnlocked,
    normalizePlayerLocation,
    validateCampusManifest,
    type WorldManifest,
} from '../shared/campus';

const MIN_SPAWN_PORTAL_MARGIN = 0.1;

test('el manifiesto del campus tiene zonas, portales y estaciones coherentes', () => {
    assert.deepEqual(validateCampusManifest(), []);
    assert.equal(CAMPUS_MANIFEST.zones.length, 4);
    assert.equal(isCampusInteraction('induction-office', 'obj_manual'), true);
    assert.equal(isCampusInteraction('lobby', 'obj_manual'), false);
});

test('los puntos de aparición quedan fuera del alcance de los portales de su zona', () => {
    for (const zone of CAMPUS_MANIFEST.zones) {
        for (const spawn of zone.spawns) {
            for (const portal of zone.portals) {
                const distance = Math.hypot(
                    spawn.position[0] - portal.position[0],
                    spawn.position[2] - portal.position[2],
                );
                assert.ok(
                    distance >= CAMPUS_INTERACTION_DISTANCE + MIN_SPAWN_PORTAL_MARGIN,
                    `${zone.id}/${spawn.id} queda demasiado cerca de ${portal.id}: ${distance.toFixed(2)} m.`,
                );
            }
        }
    }
});

test('las zonas respetan el orden pedagógico', () => {
    const initial = { trainingCompleted: false, simulationCompleted: false, approved: false };
    assert.equal(isCampusZoneUnlocked('lobby', initial), true);
    assert.equal(isCampusZoneUnlocked('induction-office', initial), true);
    assert.equal(isCampusZoneUnlocked('simulation-lab', initial), false);
    assert.equal(isCampusZoneUnlocked('assessment-room', initial), false);

    assert.equal(isCampusZoneUnlocked('simulation-lab', { ...initial, trainingCompleted: true }), true);
    assert.equal(isCampusZoneUnlocked('assessment-room', {
        ...initial,
        trainingCompleted: true,
        simulationCompleted: true,
    }), true);
});

test('una ubicación obsoleta vuelve al punto seguro del lobby', () => {
    const fallback = createDefaultPlayerLocation();
    assert.deepEqual(normalizePlayerLocation({
        worldId: CAMPUS_MANIFEST.worldId,
        worldVersion: 999,
        zoneId: 'simulation-lab',
        spawnId: 'simulation-entry',
    }), fallback);
    assert.equal(getCampusSpawn('lobby', 'missing').id, 'lobby-entry');
});

test('rechaza puntos de aparición duplicados dentro de una zona', () => {
    const lobby = CAMPUS_MANIFEST.zones[0];
    const invalidManifest: WorldManifest = {
        ...CAMPUS_MANIFEST,
        zones: [
            {
                ...lobby,
                spawns: [...lobby.spawns, { ...lobby.spawns[0] }],
            },
            ...CAMPUS_MANIFEST.zones.slice(1),
        ],
    };
    assert.ok(validateCampusManifest(invalidManifest).some((error) => (
        error.includes('Spawn duplicado')
    )));
});
