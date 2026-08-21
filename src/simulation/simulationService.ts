import {
    SIMULATION_EVIDENCE_OBJECT_IDS,
    SIMULATION_STAGE_IDS,
    SIMULATION_VERSION,
    type PublicSimulationAction,
    type PublicSimulationScenario,
    type PublicSimulationStage,
    type SimulationActionFeedback,
    type SimulationAttemptSummary,
    type SimulationFeedback,
    type SimulationInspectionFeedback,
    type SimulationInspectionSummary,
    type SimulationMutationResponse,
    type SimulationRunSummary,
    type SimulationScenarioResponse,
    type SimulationStageId,
    type SimulationStageProgress,
    type SimulationStageStatus,
} from '../../shared/simulation';
import { apiFetch } from '../api/apiClient';
import { APP_CONFIG } from '../config/appConfig';

export type SimulationOption = PublicSimulationAction;
export type SimulationStage = PublicSimulationStage;
export type SimulationScenario = PublicSimulationScenario;
export type SimulationAttempt = SimulationAttemptSummary;
export type SimulationRun = SimulationRunSummary;
export type SimulationPayload = SimulationScenarioResponse;
export type SimulationMutationPayload = SimulationMutationResponse;

export type StartSimulationPayload = {
    idempotent: boolean;
    resumed: boolean;
    simulation: SimulationRunSummary;
};

export type {
    SimulationActionFeedback,
    SimulationFeedback,
    SimulationInspectionFeedback,
    SimulationStageId,
    SimulationStageProgress,
    SimulationStageStatus,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function isSimulationStageId(value: unknown): value is SimulationStageId {
    return SIMULATION_STAGE_IDS.some((stageId) => stageId === value);
}

function isEvidenceObjectId(value: unknown): value is SimulationInspectionSummary['objectId'] {
    return SIMULATION_EVIDENCE_OBJECT_IDS.some((objectId) => objectId === value);
}

function isAction(value: unknown): value is PublicSimulationAction {
    return isRecord(value)
        && typeof value.id === 'string'
        && typeof value.label === 'string';
}

function isStage(value: unknown): value is PublicSimulationStage {
    return isRecord(value)
        && isSimulationStageId(value.id)
        && typeof value.time === 'string'
        && typeof value.title === 'string'
        && typeof value.objective === 'string'
        && isRecord(value.guide)
        && typeof value.guide.name === 'string'
        && typeof value.guide.introduction === 'string'
        && isRecord(value.evidence)
        && isEvidenceObjectId(value.evidence.objectId)
        && typeof value.evidence.label === 'string'
        && Array.isArray(value.actions)
        && value.actions.length >= 2
        && value.actions.every(isAction);
}

function isScenario(value: unknown): value is PublicSimulationScenario {
    return isRecord(value)
        && typeof value.id === 'string'
        && value.simulationVersion === SIMULATION_VERSION
        && typeof value.title === 'string'
        && typeof value.introduction === 'string'
        && Array.isArray(value.stages)
        && value.stages.length > 0
        && value.stages.every(isStage);
}

function isStageStatus(value: unknown): value is SimulationStageStatus {
    return value === 'locked'
        || value === 'awaiting_inspection'
        || value === 'ready_for_action'
        || value === 'pending_correction'
        || value === 'completed';
}

function isInspection(value: unknown): value is SimulationInspectionSummary {
    return isRecord(value)
        && isEvidenceObjectId(value.objectId)
        && typeof value.observation === 'string'
        && typeof value.timestamp === 'string';
}

function isAttempt(value: unknown): value is SimulationAttemptSummary {
    return isRecord(value)
        && typeof value.actionId === 'string'
        && (value.kind === 'initial' || value.kind === 'correction')
        && (value.result === 'consequence' || value.result === 'resolved')
        && typeof value.consequence === 'string'
        && typeof value.timestamp === 'string';
}

function isStageProgress(value: unknown): value is SimulationStageProgress {
    return isRecord(value)
        && isSimulationStageId(value.stageId)
        && isStageStatus(value.status)
        && Array.isArray(value.inspections)
        && value.inspections.every(isInspection)
        && Array.isArray(value.attempts)
        && value.attempts.every(isAttempt)
        && (value.completedAt === undefined || typeof value.completedAt === 'string');
}

function isRun(value: unknown): value is SimulationRunSummary {
    return isRecord(value)
        && typeof value.runId === 'string'
        && value.simulationVersion === SIMULATION_VERSION
        && typeof value.scenarioId === 'string'
        && (value.status === 'in_progress'
            || value.status === 'completed'
            || value.status === 'abandoned')
        && (value.currentStageId === null || isSimulationStageId(value.currentStageId))
        && typeof value.startedAt === 'string'
        && (value.completedAt === undefined || typeof value.completedAt === 'string')
        && typeof value.completedStageCount === 'number'
        && typeof value.requiredStageCount === 'number'
        && Array.isArray(value.stages)
        && value.stages.every(isStageProgress);
}

function isInspectionFeedback(value: unknown): value is SimulationInspectionFeedback {
    return isRecord(value)
        && value.type === 'inspection'
        && isSimulationStageId(value.stageId)
        && isEvidenceObjectId(value.objectId)
        && typeof value.observation === 'string';
}

function isActionFeedback(value: unknown): value is SimulationActionFeedback {
    return isRecord(value)
        && value.type === 'action'
        && isSimulationStageId(value.stageId)
        && typeof value.actionId === 'string'
        && (value.kind === 'initial' || value.kind === 'correction')
        && (value.result === 'consequence' || value.result === 'resolved')
        && typeof value.consequence === 'string'
        && typeof value.resolved === 'boolean';
}

function parsePayload(value: unknown): SimulationScenarioResponse {
    if (!isRecord(value)
        || !isScenario(value.scenario)
        || (value.simulation !== null && !isRun(value.simulation))
        || typeof value.legacyCompleted !== 'boolean'
        || typeof value.completed !== 'boolean'
        || typeof value.canReplay !== 'boolean') {
        throw new Error('El servidor devolvió una simulación inválida.');
    }
    return {
        scenario: value.scenario,
        simulation: value.simulation,
        legacyCompleted: value.legacyCompleted,
        completed: value.completed,
        canReplay: value.canReplay,
    };
}

function parseStartPayload(value: unknown): StartSimulationPayload {
    if (!isRecord(value)
        || typeof value.idempotent !== 'boolean'
        || typeof value.resumed !== 'boolean'
        || !isRun(value.simulation)) {
        throw new Error('El servidor devolvió una jornada inválida.');
    }
    return {
        idempotent: value.idempotent,
        resumed: value.resumed,
        simulation: value.simulation,
    };
}

function parseMutationPayload(value: unknown): SimulationMutationResponse {
    const feedback = isRecord(value) ? value.feedback : undefined;
    if (!isRecord(value)
        || typeof value.idempotent !== 'boolean'
        || !isRun(value.simulation)
        || (feedback !== null
            && !isInspectionFeedback(feedback)
            && !isActionFeedback(feedback))) {
        throw new Error('El servidor devolvió un avance de simulación inválido.');
    }
    return {
        idempotent: value.idempotent,
        simulation: value.simulation,
        feedback,
    };
}

function mutationMetadata(clientEventId: string = crypto.randomUUID()) {
    return {
        clientEventId,
        moduleVersion: APP_CONFIG.TRAINING_MODULE_VERSION,
        worldVersion: APP_CONFIG.CAMPUS_WORLD_VERSION,
        zoneId: 'simulation-lab' as const,
        durationSeconds: 0,
    };
}

export const simulationService = {
    async getSimulation(moduleId: string, signal?: AbortSignal): Promise<SimulationScenarioResponse> {
        const response = await apiFetch(`/simulation/${encodeURIComponent(moduleId)}`, { signal });
        return parsePayload(await response.json());
    },

    async startRun(
        moduleId: string,
        restart = false,
        clientEventId?: string,
    ): Promise<StartSimulationPayload> {
        const response = await apiFetch(`/simulation/${encodeURIComponent(moduleId)}/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...mutationMetadata(clientEventId),
                restart,
            }),
        });
        return parseStartPayload(await response.json());
    },

    async inspectStage(
        moduleId: string,
        runId: string,
        stageId: SimulationStageId,
        objectId: SimulationInspectionSummary['objectId'],
        clientEventId?: string,
    ): Promise<SimulationMutationResponse> {
        const response = await apiFetch(
            `/simulation/${encodeURIComponent(moduleId)}/runs/${encodeURIComponent(runId)}/inspections`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...mutationMetadata(clientEventId),
                    stageId,
                    objectId,
                }),
            },
        );
        return parseMutationPayload(await response.json());
    },

    async submitAction(
        moduleId: string,
        runId: string,
        stageId: SimulationStageId,
        actionId: string,
        clientEventId?: string,
    ): Promise<SimulationMutationResponse> {
        const response = await apiFetch(
            `/simulation/${encodeURIComponent(moduleId)}/runs/${encodeURIComponent(runId)}/actions`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...mutationMetadata(clientEventId),
                    stageId,
                    actionId,
                }),
            },
        );
        return parseMutationPayload(await response.json());
    },
};
