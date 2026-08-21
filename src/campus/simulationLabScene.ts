import type { Vector3Tuple } from '../../shared/campus';
import {
    SIMULATION_STAGE_IDS,
    type SimulationStageId,
    type SimulationStageStatus,
} from '../../shared/simulation';

export const SIMULATION_LAB_STAGE_IDS = SIMULATION_STAGE_IDS;
export type SimulationLabStageId = SimulationStageId;
export type SimulationLabStageStatus = SimulationStageStatus;
export type SimulationLabStageVisualStatus = 'pending' | 'active' | 'correction-required' | 'completed';

export type SimulationLabStageState = {
    stageId: SimulationLabStageId;
    status: SimulationLabStageStatus;
};

export type SimulationLabSceneState = {
    activeRun: boolean;
    currentStageId: SimulationLabStageId | null;
    stages: readonly SimulationLabStageState[];
};

export const SIMULATION_LAB_STAGE_POSITIONS: Readonly<Record<SimulationLabStageId, Vector3Tuple>> = {
    data_protection: [-3.25, 0, -2.85],
    human_resources: [3.25, 0, -2.85],
    operations: [3.35, 0, 1.25],
    workplace_safety: [-3.35, 0, 1.25],
};

export function getSimulationLabStageVisualStatus(
    sceneState: SimulationLabSceneState | undefined,
    stageId: SimulationLabStageId,
): SimulationLabStageVisualStatus {
    const storedStatus = sceneState?.stages.find((stage) => stage.stageId === stageId)?.status;
    if (storedStatus === 'completed') return 'completed';
    if (!sceneState?.activeRun || sceneState.currentStageId !== stageId) return 'pending';
    if (storedStatus === 'pending_correction') return 'correction-required';
    return storedStatus === 'locked' ? 'pending' : 'active';
}
