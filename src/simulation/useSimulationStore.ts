import { create } from 'zustand';
import { getErrorMessage } from '../api/apiClient';
import { APP_CONFIG } from '../config/appConfig';
import {
    simulationService,
    type SimulationFeedback,
    type SimulationPayload,
    type SimulationRun,
    type SimulationScenario,
    type SimulationStage,
    type SimulationStageId,
    type SimulationStageProgress,
} from './simulationService';

export type SimulationStoreState = {
    payload: SimulationPayload | null;
    scenario: SimulationScenario | null;
    simulation: SimulationRun | null;
    currentStage: SimulationStage | null;
    feedback: SimulationFeedback | null;
    loading: boolean;
    saving: boolean;
    error: string;
    loadSimulation: (signal?: AbortSignal) => Promise<void>;
    startRun: (restart?: boolean) => Promise<void>;
    replay: () => Promise<void>;
    inspectStage: (stageId: SimulationStageId) => Promise<void>;
    submitAction: (stageId: SimulationStageId, optionId: string) => Promise<void>;
    clearFeedback: () => void;
    reset: () => void;
};

type SimulationData = Pick<
    SimulationStoreState,
    'payload' | 'scenario' | 'simulation' | 'currentStage'
>;

const emptyData: SimulationData = {
    payload: null,
    scenario: null,
    simulation: null,
    currentStage: null,
};

let loadVersion = 0;
const pendingClientEventIds = new Map<string, string>();

function clientEventIdFor(operationKey: string): string {
    const existing = pendingClientEventIds.get(operationKey);
    if (existing) return existing;
    const clientEventId = crypto.randomUUID();
    pendingClientEventIds.set(operationKey, clientEventId);
    return clientEventId;
}

function findCurrentStage(
    scenario: SimulationScenario | null,
    simulation: SimulationRun | null,
): SimulationStage | null {
    if (!scenario || !simulation?.currentStageId) return null;
    return scenario.stages.find(({ id }) => id === simulation.currentStageId) ?? null;
}

function dataFromPayload(payload: SimulationPayload): SimulationData {
    return {
        payload,
        scenario: payload.scenario,
        simulation: payload.simulation,
        currentStage: findCurrentStage(payload.scenario, payload.simulation),
    };
}

function dataFromRun(
    currentPayload: SimulationPayload | null,
    scenario: SimulationScenario | null,
    simulation: SimulationRun,
): SimulationData {
    const nextPayload = currentPayload && {
        ...currentPayload,
        simulation,
        completed: currentPayload.completed || simulation.status === 'completed',
        canReplay: simulation.status === 'completed' || simulation.status === 'abandoned',
    };
    return {
        payload: nextPayload,
        scenario,
        simulation,
        currentStage: findCurrentStage(scenario, simulation),
    };
}

function aborted(error: unknown, signal?: AbortSignal): boolean {
    return signal?.aborted === true
        || (error instanceof DOMException && error.name === 'AbortError');
}

export const useSimulationStore = create<SimulationStoreState>()((set, get) => ({
    ...emptyData,
    feedback: null,
    loading: false,
    saving: false,
    error: '',

    loadSimulation: async (signal) => {
        if (get().saving) return;
        const requestVersion = ++loadVersion;
        set({ loading: true, error: '', feedback: null });
        try {
            const payload = await simulationService.getSimulation(
                APP_CONFIG.TRAINING_MODULE_ID,
                signal,
            );
            if (requestVersion !== loadVersion || signal?.aborted) return;
            pendingClientEventIds.clear();
            set({
                ...dataFromPayload(payload),
                error: '',
            });
        } catch (requestError: unknown) {
            if (requestVersion === loadVersion && !aborted(requestError, signal)) {
                set({
                    error: getErrorMessage(
                        requestError,
                        'No se pudo cargar la simulación del primer día.',
                    ),
                });
            }
        } finally {
            if (requestVersion === loadVersion) set({ loading: false });
        }
    },

    startRun: async (restart = false) => {
        const stateBeforeStart = get();
        if (stateBeforeStart.saving) return;
        if (!stateBeforeStart.payload || !stateBeforeStart.scenario) {
            set({ error: 'Carga la simulación antes de iniciar la jornada.' });
            return;
        }
        loadVersion += 1;
        set({ loading: false, saving: true, error: '', feedback: null });
        const operationKey = `start:${stateBeforeStart.simulation?.runId ?? 'none'}:${restart}`;
        const clientEventId = clientEventIdFor(operationKey);
        try {
            const response = await simulationService.startRun(
                APP_CONFIG.TRAINING_MODULE_ID,
                restart,
                clientEventId,
            );
            pendingClientEventIds.delete(operationKey);
            const state = get();
            set({
                ...dataFromRun(state.payload, state.scenario, response.simulation),
                error: '',
            });
        } catch (requestError: unknown) {
            set({
                error: getErrorMessage(
                    requestError,
                    restart
                        ? 'No se pudo iniciar una nueva jornada.'
                        : 'No se pudo iniciar la jornada.',
                ),
            });
        } finally {
            set({ saving: false });
        }
    },

    replay: async () => get().startRun(true),

    inspectStage: async (stageId) => {
        const state = get();
        if (state.saving) return;
        const stage = state.scenario?.stages.find(({ id }) => id === stageId);
        if (!state.simulation || !stage) {
            set({ error: 'No se encontró la situación que quieres inspeccionar.' });
            return;
        }

        loadVersion += 1;
        set({ loading: false, saving: true, error: '', feedback: null });
        const operationKey = `inspect:${state.simulation.runId}:${stageId}`;
        const clientEventId = clientEventIdFor(operationKey);
        try {
            const response = await simulationService.inspectStage(
                APP_CONFIG.TRAINING_MODULE_ID,
                state.simulation.runId,
                stageId,
                stage.evidence.objectId,
                clientEventId,
            );
            pendingClientEventIds.delete(operationKey);
            const current = get();
            set({
                ...dataFromRun(current.payload, current.scenario, response.simulation),
                feedback: response.feedback,
                error: '',
            });
        } catch (requestError: unknown) {
            set({
                error: getErrorMessage(
                    requestError,
                    'No se pudo registrar la inspección.',
                ),
            });
        } finally {
            set({ saving: false });
        }
    },

    submitAction: async (stageId, optionId) => {
        const state = get();
        if (state.saving) return;
        const validOption = state.scenario?.stages
            .find(({ id }) => id === stageId)
            ?.actions.some(({ id }) => id === optionId);
        if (!state.simulation || !validOption) {
            set({ error: 'La acción seleccionada no está disponible.' });
            return;
        }

        loadVersion += 1;
        set({ loading: false, saving: true, error: '', feedback: null });
        const operationKey = `action:${state.simulation.runId}:${stageId}:${optionId}`;
        const clientEventId = clientEventIdFor(operationKey);
        try {
            const response = await simulationService.submitAction(
                APP_CONFIG.TRAINING_MODULE_ID,
                state.simulation.runId,
                stageId,
                optionId,
                clientEventId,
            );
            pendingClientEventIds.delete(operationKey);
            const current = get();
            set({
                ...dataFromRun(current.payload, current.scenario, response.simulation),
                feedback: response.feedback,
                error: '',
            });
        } catch (requestError: unknown) {
            set({
                error: getErrorMessage(
                    requestError,
                    'No se pudo ejecutar la acción.',
                ),
            });
        } finally {
            set({ saving: false });
        }
    },

    clearFeedback: () => set({ feedback: null }),

    reset: () => {
        loadVersion += 1;
        pendingClientEventIds.clear();
        set({
            ...emptyData,
            feedback: null,
            loading: false,
            saving: false,
            error: '',
        });
    },
}));

export const selectCurrentStageProgress = (
    state: SimulationStoreState,
): SimulationStageProgress | null => {
    if (!state.currentStage) return null;
    return state.simulation?.stages.find(
        ({ stageId }) => stageId === state.currentStage?.id,
    ) ?? null;
};

export const selectSimulationCompleted = (state: SimulationStoreState): boolean => (
    state.payload?.completed === true
);

export const selectCurrentRunCompleted = (state: SimulationStoreState): boolean => (
    state.simulation?.status === 'completed'
);

export function selectStageProgress(stageId: SimulationStageId) {
    return (state: SimulationStoreState): SimulationStageProgress | null => (
        state.simulation?.stages.find((stage) => stage.stageId === stageId) ?? null
    );
}

export const loadSimulation = (signal?: AbortSignal) => (
    useSimulationStore.getState().loadSimulation(signal)
);

export const startRun = (restart = false) => useSimulationStore.getState().startRun(restart);

export const replay = () => useSimulationStore.getState().replay();

export const inspectStage = (stageId: SimulationStageId) => (
    useSimulationStore.getState().inspectStage(stageId)
);

export const submitAction = (stageId: SimulationStageId, optionId: string) => (
    useSimulationStore.getState().submitAction(stageId, optionId)
);

export const clearFeedback = () => useSimulationStore.getState().clearFeedback();

export const reset = () => useSimulationStore.getState().reset();
