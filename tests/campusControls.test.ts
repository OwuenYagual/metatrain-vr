import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createCampusMovementState,
    getCampusCommand,
    getCampusMovementVector,
    resetCampusMovement,
    updateCampusMovementKey,
} from '../src/campus/campusControls';
import {
    THIRD_PERSON_INITIAL_PITCH,
    createThirdPersonOrbit,
    followThirdPersonOrbit,
    getCollisionSafeCameraDistance,
    getThirdPersonCameraOffset,
    updateThirdPersonOrbit,
} from '../src/campus/campusCamera';
import {
    getTrainingGuideFocusPosition,
    getTrainingStationPosition,
} from '../src/campus/campusTargets';

const EPSILON = 0.000_001;

function assertApproximatelyEqual(actual: number, expected: number): void {
    assert.ok(
        Math.abs(actual - expected) < EPSILON,
        `Se esperaba ${expected}, se recibió ${actual}.`,
    );
}

test('normaliza el movimiento diagonal para conservar la velocidad', () => {
    const state = createCampusMovementState();
    updateCampusMovementKey(state, 'KeyW', true);
    updateCampusMovementKey(state, 'KeyD', true);
    updateCampusMovementKey(state, 'ShiftLeft', true);

    const movement = getCampusMovementVector(state);
    assert.equal(movement.moving, true);
    assert.equal(movement.running, true);
    assert.ok(Math.abs(Math.hypot(movement.x, movement.z) - 1) < 0.000_001);
    assert.ok(movement.x > 0);
    assert.ok(movement.z < 0);
});

test('combina WASD y flechas sin dejar teclas atascadas', () => {
    const state = createCampusMovementState();
    assert.equal(updateCampusMovementKey(state, 'ArrowUp', true), true);
    assert.equal(updateCampusMovementKey(state, 'KeyD', true), true);
    assert.equal(updateCampusMovementKey(state, 'Space', true), false);
    resetCampusMovement(state);
    assert.deepEqual(state, createCampusMovementState());
});

test('resuelve los comandos de interacción, cámara y salida', () => {
    assert.equal(getCampusCommand('KeyE'), 'interact');
    assert.equal(getCampusCommand('Enter'), 'interact');
    assert.equal(getCampusCommand('KeyV'), 'toggle-camera');
    assert.equal(getCampusCommand('Escape'), 'escape');
    assert.equal(getCampusCommand('Space'), null);
});

test('crea una órbita de tercera persona con la inclinación inicial esperada', () => {
    const orbit = createThirdPersonOrbit(Math.PI);

    assert.equal(orbit.yaw, Math.PI);
    assert.equal(orbit.pitch, THIRD_PERSON_INITIAL_PITCH);
});

test('aplica sensibilidad horizontal y vertical sin mutar la órbita', () => {
    const orbit = createThirdPersonOrbit(0.7);
    const updated = updateThirdPersonOrbit(orbit, 100, -50);

    assert.deepEqual(orbit, {
        yaw: 0.7,
        pitch: THIRD_PERSON_INITIAL_PITCH,
    });
    assertApproximatelyEqual(updated.yaw, 0.48);
    assertApproximatelyEqual(updated.pitch, THIRD_PERSON_INITIAL_PITCH + 0.09);
});

test('acompaña suavemente la orientación del personaje al terminar el movimiento', () => {
    const orbit = createThirdPersonOrbit(0);
    const followed = followThirdPersonOrbit(orbit, Math.PI / 2, 0.2);

    assert.deepEqual(orbit, {
        yaw: 0,
        pitch: THIRD_PERSON_INITIAL_PITCH,
    });
    assert.ok(followed.yaw > orbit.yaw);
    assert.ok(followed.yaw < Math.PI / 2);
    assert.equal(followed.pitch, orbit.pitch);
});

test('sigue la ruta angular más corta al cruzar el límite de la órbita', () => {
    const orbit = createThirdPersonOrbit(Math.PI - 0.05);
    const followed = followThirdPersonOrbit(orbit, -Math.PI + 0.05, 0.2);

    assert.ok(followed.yaw > orbit.yaw);
    assert.ok(followed.yaw - orbit.yaw < 0.1);
});

test('limita la inclinación de tercera persona en ambos extremos', () => {
    const orbit = createThirdPersonOrbit(0);
    const minimum = updateThirdPersonOrbit(orbit, 0, 1_000_000);
    const lowerOverflow = updateThirdPersonOrbit(minimum, 0, 1_000_000);
    const maximum = updateThirdPersonOrbit(orbit, 0, -1_000_000);
    const upperOverflow = updateThirdPersonOrbit(maximum, 0, -1_000_000);

    assert.equal(lowerOverflow.pitch, minimum.pitch);
    assert.equal(upperOverflow.pitch, maximum.pitch);
    assert.ok(minimum.pitch < THIRD_PERSON_INITIAL_PITCH);
    assert.ok(maximum.pitch > THIRD_PERSON_INITIAL_PITCH);
});

test('calcula el offset inicial equivalente y conserva el radio orbital', () => {
    const initialOffset = getThirdPersonCameraOffset(createThirdPersonOrbit(0));
    assertApproximatelyEqual(initialOffset[0], 0);
    assertApproximatelyEqual(initialOffset[1], 1.72);
    assertApproximatelyEqual(initialOffset[2], -3.9);

    const rotatedOrbit = updateThirdPersonOrbit(
        createThirdPersonOrbit(Math.PI / 2),
        0,
        -120,
    );
    const rotatedOffset = getThirdPersonCameraOffset(rotatedOrbit);
    assertApproximatelyEqual(rotatedOffset[2], 0);
    assert.ok(rotatedOffset[0] < 0);
    assert.ok(rotatedOffset[1] > initialOffset[1]);
    assertApproximatelyEqual(
        Math.hypot(...rotatedOffset),
        Math.hypot(...initialOffset),
    );
});

test('mantiene la cámara delante de un obstáculo incluso a corta distancia', () => {
    assert.equal(getCollisionSafeCameraDistance(4, null), 4);

    const regularHit = getCollisionSafeCameraDistance(4, 0.4);
    assertApproximatelyEqual(regularHit, 0.16);
    assert.ok(regularHit < 0.4);

    const closeHit = getCollisionSafeCameraDistance(4, 0.1);
    assertApproximatelyEqual(closeHit, 0.05);
    assert.ok(closeHit < 0.1);
});

test('el enfoque de conversación apunta a la cabeza del NPC y no al centro de la estación', () => {
    const station = getTrainingStationPosition('obj_manual');
    const guide = getTrainingGuideFocusPosition('obj_manual');

    assert.ok(station);
    assert.ok(guide);
    assert.equal(guide[1], 1.52);
    assert.notDeepEqual([guide[0], guide[2]], [station[0], station[2]]);
    assert.equal(getTrainingGuideFocusPosition('missing'), undefined);
});
