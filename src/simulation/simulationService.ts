import { apiFetch } from '../api/apiClient';

export type SimulationOption = {
    id: string;
    text: string;
};

export type SimulationDecision = {
    id: string;
    prompt: string;
    options: SimulationOption[];
};

export type SimulationScenario = {
    id: string;
    title: string;
    introduction: string;
    decisions: SimulationDecision[];
};

export type SimulationSelection = {
    decisionId: string;
    selectedOptionId: string;
    feedback: string;
    recommended: boolean;
    timestamp?: string;
};

export type SimulationProgress = {
    scenarioId: string;
    decisions: SimulationSelection[];
    completedDecisionIds: string[];
    completedCount: number;
    requiredCount: number;
    completed: boolean;
    nextDecisionId: string | null;
};

export type SimulationPayload = {
    scenario: SimulationScenario;
    simulation: SimulationProgress;
};

function isScenario(value: unknown): value is SimulationScenario {
    if (!value || typeof value !== 'object') return false;
    const scenario = value as Partial<SimulationScenario>;
    return typeof scenario.id === 'string'
        && typeof scenario.title === 'string'
        && typeof scenario.introduction === 'string'
        && Array.isArray(scenario.decisions)
        && scenario.decisions.length > 0
        && scenario.decisions.every((decision) => Boolean(decision)
            && typeof decision.id === 'string'
            && typeof decision.prompt === 'string'
            && Array.isArray(decision.options)
            && decision.options.length >= 2
            && decision.options.every((option) => Boolean(option)
                && typeof option.id === 'string'
                && typeof option.text === 'string'));
}

function isSelection(value: unknown): value is SimulationSelection {
    if (!value || typeof value !== 'object') return false;
    const selection = value as Partial<SimulationSelection>;
    return typeof selection.decisionId === 'string'
        && typeof selection.selectedOptionId === 'string'
        && typeof selection.feedback === 'string'
        && typeof selection.recommended === 'boolean';
}

function isProgress(value: unknown): value is SimulationProgress {
    if (!value || typeof value !== 'object') return false;
    const progress = value as Partial<SimulationProgress>;
    return typeof progress.scenarioId === 'string'
        && Array.isArray(progress.decisions)
        && progress.decisions.every(isSelection)
        && Array.isArray(progress.completedDecisionIds)
        && progress.completedDecisionIds.every((id) => typeof id === 'string')
        && typeof progress.completedCount === 'number'
        && typeof progress.requiredCount === 'number'
        && typeof progress.completed === 'boolean'
        && (progress.nextDecisionId === null || typeof progress.nextDecisionId === 'string');
}

function parsePayload(value: unknown): SimulationPayload {
    if (!value || typeof value !== 'object') {
        throw new Error('El servidor devolvió una simulación inválida.');
    }
    const payload = value as Partial<SimulationPayload>;
    if (!isScenario(payload.scenario) || !isProgress(payload.simulation)) {
        throw new Error('El servidor devolvió una simulación inválida.');
    }
    return { scenario: payload.scenario, simulation: payload.simulation };
}

export const simulationService = {
    async getSimulation(moduleId: string, signal?: AbortSignal): Promise<SimulationPayload> {
        const response = await apiFetch(`/simulation/${encodeURIComponent(moduleId)}`, { signal });
        return parsePayload(await response.json());
    },

    async submitDecision(
        moduleId: string,
        scenarioId: string,
        decisionId: string,
        selectedOptionId: string,
    ): Promise<{ selection: SimulationSelection; simulation: SimulationProgress }> {
        const response = await apiFetch(`/simulation/${encodeURIComponent(moduleId)}/decisions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenarioId, decisionId, selectedOptionId }),
        });
        const payload = await response.json() as { selection?: unknown; simulation?: unknown };
        if (!isSelection(payload.selection) || !isProgress(payload.simulation)) {
            throw new Error('El servidor devolvió un avance de simulación inválido.');
        }
        return { selection: payload.selection, simulation: payload.simulation };
    },
};
