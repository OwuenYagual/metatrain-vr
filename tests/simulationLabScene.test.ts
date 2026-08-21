import assert from 'node:assert/strict';
import test from 'node:test';
import { SIMULATION_STAGE_IDS } from '../shared/simulation';
import {
    getSimulationLabStageVisualStatus,
    SIMULATION_LAB_STAGE_IDS,
    SIMULATION_LAB_STAGE_POSITIONS,
    type SimulationLabSceneState,
} from '../src/campus/simulationLabScene';

function createSceneState(
    currentStageId: SimulationLabSceneState['currentStageId'],
    currentStatus: SimulationLabSceneState['stages'][number]['status'],
): SimulationLabSceneState {
    return {
        activeRun: true,
        currentStageId,
        stages: SIMULATION_STAGE_IDS.map((stageId) => ({
            stageId,
            status: stageId === currentStageId ? currentStatus : 'locked',
        })),
    };
}

test('las estaciones visuales mantienen los identificadores canónicos y dejan libre la salida', () => {
    assert.deepEqual(SIMULATION_LAB_STAGE_IDS, SIMULATION_STAGE_IDS);
    const positions = Object.values(SIMULATION_LAB_STAGE_POSITIONS);
    assert.equal(new Set(positions.map(([x, , z]) => `${x}:${z}`)).size, SIMULATION_STAGE_IDS.length);
    assert.ok(positions.every(([x]) => Math.abs(x) >= 3.2));
    assert.ok(positions.every(([, , z]) => z <= 1.25));
});

test('solo la etapa actual se destaca durante una jornada activa', () => {
    const sceneState = createSceneState('human_resources', 'awaiting_inspection');

    assert.equal(getSimulationLabStageVisualStatus(sceneState, 'human_resources'), 'active');
    assert.equal(getSimulationLabStageVisualStatus(sceneState, 'data_protection'), 'pending');
    assert.equal(getSimulationLabStageVisualStatus(sceneState, 'operations'), 'pending');
});

test('la escena diferencia una corrección pendiente y conserva las etapas completadas', () => {
    const initialState = createSceneState('operations', 'pending_correction');
    const sceneState: SimulationLabSceneState = {
        ...initialState,
        stages: initialState.stages.map((stage) => stage.stageId === 'data_protection'
            ? { ...stage, status: 'completed' }
            : stage),
    };

    assert.equal(getSimulationLabStageVisualStatus(sceneState, 'operations'), 'correction-required');
    assert.equal(getSimulationLabStageVisualStatus(sceneState, 'data_protection'), 'completed');
});

test('sin una jornada activa la vista queda en reposo salvo los logros anteriores', () => {
    const initialState = createSceneState('workplace_safety', 'ready_for_action');
    const sceneState: SimulationLabSceneState = {
        ...initialState,
        activeRun: false,
        stages: initialState.stages.map((stage) => stage.stageId === 'data_protection'
            ? { ...stage, status: 'completed' }
            : stage),
    };

    assert.equal(getSimulationLabStageVisualStatus(sceneState, 'workplace_safety'), 'pending');
    assert.equal(getSimulationLabStageVisualStatus(sceneState, 'data_protection'), 'completed');
    assert.equal(getSimulationLabStageVisualStatus(undefined, 'data_protection'), 'pending');
});
