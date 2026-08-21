import { readRequiredString } from '../utils/validation';
import { CAMPUS_MANIFEST } from '../../shared/campus';
import {
    SIMULATION_STAGE_IDS,
    SIMULATION_SCENARIO_METADATA,
    SIMULATION_STAGE_CATALOG,
    SIMULATION_VERSION,
    type PublicSimulationScenario,
    type SimulationAttemptKind,
    type SimulationAttemptResult,
    type SimulationEvidenceObjectId,
    type SimulationRunStatus,
    type SimulationRunSummary,
    type SimulationStageId,
    type SimulationStageStatus,
} from '../../shared/simulation';

type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

export type SimulationDecisionInput = {
    clientEventId?: string;
    moduleVersion: number;
    worldVersion: number;
    zoneId: 'simulation-lab';
    durationSeconds: number;
    scenarioId: string;
    decisionId: string;
    selectedOptionId: string;
};

export type StoredSimulationDecision = {
    scenarioId: string;
    decisionId: string;
    selectedOptionId: string;
};

export const TRAINING_SIMULATION = {
    id: 'sim_primer_dia_induccion',
    title: 'Tu primer día en la empresa',
    introduction: 'Ya conoces las políticas, el organigrama y tu puesto. Recorre tres momentos de tu primera jornada y decide cómo actuar.',
    decisions: [
        {
            id: 'dec_proteger_informacion',
            prompt: '08:30 · Un compañero te envía datos de un cliente y propone continuar por tu correo personal porque el sistema está lento. ¿Qué haces?',
            options: [
                {
                    id: 'usar_canal_corporativo',
                    text: 'Mantengo la información en los canales corporativos y reporto la lentitud a Tecnología.',
                    feedback: 'Correcto. Proteges la confidencialidad y activas al departamento responsable sin sacar datos de la empresa.',
                    recommended: true,
                },
                {
                    id: 'enviar_correo_personal',
                    text: 'Acepto usar mi correo personal solo por esta vez.',
                    feedback: 'La urgencia no elimina la política de confidencialidad. Los datos deben permanecer en herramientas autorizadas.',
                    recommended: false,
                },
                {
                    id: 'compartir_cuenta',
                    text: 'Pido la cuenta de otro compañero para evitar el problema.',
                    feedback: 'Las credenciales son personales. Compartirlas rompe la trazabilidad y la seguridad.',
                    recommended: false,
                },
            ],
        },
        {
            id: 'dec_encontrar_apoyo',
            prompt: '11:00 · Necesitas confirmar cómo funciona un beneficio laboral antes de completar un trámite. ¿A quién acudes?',
            options: [
                {
                    id: 'contactar_talento',
                    text: 'Consulto a Sofía Andrade en Talento Humano por el portal interno.',
                    feedback: 'Correcto. Identificaste el área, la persona de referencia y el canal adecuado.',
                    recommended: true,
                },
                {
                    id: 'preguntar_tecnologia',
                    text: 'Abro un caso en la mesa de ayuda de Tecnología.',
                    feedback: 'Tecnología atiende accesos y herramientas. Los beneficios corresponden a Talento Humano.',
                    recommended: false,
                },
                {
                    id: 'usar_redes',
                    text: 'Busco una respuesta en una red social externa.',
                    feedback: 'Los beneficios dependen de las políticas de la empresa. Usa el canal interno para obtener información válida.',
                    recommended: false,
                },
            ],
        },
        {
            id: 'dec_cumplir_funciones',
            prompt: '15:30 · Una tarea prioritaria está bloqueada y el plazo se acerca. ¿Cómo cumples tu función?',
            options: [
                {
                    id: 'actualizar_escalar',
                    text: 'Actualizo el tablero, comunico el bloqueo a Carlos Méndez y propongo el siguiente paso.',
                    feedback: 'Correcto. Mantienes trazabilidad, escalas a tu supervisor y ayudas a proteger el resultado.',
                    recommended: true,
                },
                {
                    id: 'ocultar_bloqueo',
                    text: 'Espero hasta el final del día para informar que no se pudo completar.',
                    feedback: 'Un bloqueo comunicado tarde reduce las opciones de respuesta. Debes reportarlo en cuanto lo confirmas.',
                    recommended: false,
                },
                {
                    id: 'cambiar_proceso',
                    text: 'Cambio el procedimiento sin avisar para intentar llegar al plazo.',
                    feedback: 'Modificar un proceso sin aprobación crea riesgos. Escala el bloqueo y acuerda el siguiente paso.',
                    recommended: false,
                },
            ],
        },
    ],
} as const;

export const SIMULATION_DECISION_IDS = TRAINING_SIMULATION.decisions.map((decision) => decision.id);

export function validateSimulationDecisionInput(body: unknown): ValidationResult<SimulationDecisionInput> {
    if (!body || typeof body !== 'object') {
        return { ok: false, error: 'La decisión de simulación no es válida.' };
    }
    const input = body as Record<string, unknown>;
    const scenarioId = readRequiredString(input.scenarioId, 'scenarioId', 100);
    const decisionId = readRequiredString(input.decisionId, 'decisionId', 100);
    const selectedOptionId = readRequiredString(input.selectedOptionId, 'selectedOptionId', 100);
    if (!scenarioId.ok) return scenarioId;
    if (!decisionId.ok) return decisionId;
    if (!selectedOptionId.ok) return selectedOptionId;
    let clientEventId: string | undefined;
    if (input.clientEventId !== undefined) {
        const eventId = readRequiredString(input.clientEventId, 'clientEventId', 100);
        if (!eventId.ok) return eventId;
        clientEventId = eventId.value;
    }
    const moduleVersion = input.moduleVersion ?? CAMPUS_MANIFEST.moduleVersion;
    const worldVersion = input.worldVersion ?? CAMPUS_MANIFEST.worldVersion;
    const zoneId = input.zoneId ?? 'simulation-lab';
    const durationSeconds = input.durationSeconds ?? 0;
    if (!Number.isInteger(moduleVersion) || Number(moduleVersion) < 1) {
        return { ok: false, error: 'moduleVersion debe ser un entero positivo.' };
    }
    if (!Number.isInteger(worldVersion) || Number(worldVersion) < 1) {
        return { ok: false, error: 'worldVersion debe ser un entero positivo.' };
    }
    if (zoneId !== 'simulation-lab') {
        return { ok: false, error: 'La decisión no pertenece a la zona indicada.' };
    }
    if (!Number.isInteger(durationSeconds) || Number(durationSeconds) < 0) {
        return { ok: false, error: 'durationSeconds no es válido.' };
    }
    return {
        ok: true,
        value: {
            clientEventId,
            moduleVersion: Number(moduleVersion),
            worldVersion: Number(worldVersion),
            zoneId,
            durationSeconds: Number(durationSeconds),
            scenarioId: scenarioId.value,
            decisionId: decisionId.value,
            selectedOptionId: selectedOptionId.value,
        },
    };
}

export function getCompletedSimulationDecisionIds(decisions: readonly StoredSimulationDecision[]): string[] {
    const completedIds = new Set(
        decisions
            .filter((decision) => decision.scenarioId === TRAINING_SIMULATION.id)
            .map((decision) => decision.decisionId),
    );
    return SIMULATION_DECISION_IDS.filter((decisionId) => completedIds.has(decisionId));
}

export function getNextSimulationDecisionId(decisions: readonly StoredSimulationDecision[]): string | null {
    const completedIds = getCompletedSimulationDecisionIds(decisions);
    return SIMULATION_DECISION_IDS.find((decisionId) => !completedIds.includes(decisionId)) ?? null;
}

export function getSimulationDecision(decisionId: string) {
    return TRAINING_SIMULATION.decisions.find((decision) => decision.id === decisionId) ?? null;
}

export function getSimulationOption(decisionId: string, optionId: string) {
    return getSimulationDecision(decisionId)?.options.find((option) => option.id === optionId) ?? null;
}

export function publicSimulationScenario() {
    return {
        id: TRAINING_SIMULATION.id,
        title: TRAINING_SIMULATION.title,
        introduction: TRAINING_SIMULATION.introduction,
        decisions: TRAINING_SIMULATION.decisions.map((decision) => ({
            id: decision.id,
            prompt: decision.prompt,
            options: decision.options.map((option) => ({ id: option.id, text: option.text })),
        })),
    };
}

type SimulationMutationContext = {
    clientEventId: string;
    moduleVersion: number;
    worldVersion: number;
    zoneId: 'simulation-lab';
    durationSeconds: number;
};

export type SimulationStartInput = SimulationMutationContext & {
    restart: boolean;
};

export type SimulationInspectionInput = SimulationMutationContext & {
    stageId: SimulationStageId;
    objectId: SimulationEvidenceObjectId;
};

export type SimulationActionInput = SimulationMutationContext & {
    stageId: SimulationStageId;
    actionId: string;
};

export type StoredSimulationInspection = {
    clientEventId: string;
    stageId: SimulationStageId;
    objectId: SimulationEvidenceObjectId;
    timestamp: Date;
};

export type StoredSimulationAttempt = {
    clientEventId: string;
    stageId: SimulationStageId;
    actionId: string;
    kind: SimulationAttemptKind;
    result: SimulationAttemptResult;
    consequence: string;
    timestamp: Date;
};

export type StoredSimulationStage = {
    stageId: SimulationStageId;
    status: SimulationStageStatus;
    inspections: StoredSimulationInspection[];
    attempts: StoredSimulationAttempt[];
    completedAt?: Date;
};

export type StoredSimulationRun = {
    runId: string;
    simulationVersion: number;
    scenarioId: string;
    status: SimulationRunStatus;
    currentStageId?: SimulationStageId;
    startClientEventIds: string[];
    startedAt: Date;
    completedAt?: Date;
    lastUpdatedAt: Date;
    stages: StoredSimulationStage[];
};

type PrivateSimulationStageDetails = {
    observation: string;
    actions: Record<string, { consequence: string; recommended: boolean }>;
};

const SIMULATION_PRIVATE_DETAILS: Record<SimulationStageId, PrivateSimulationStageDetails> = {
    data_protection: {
        observation: 'La solicitud contiene datos personales de un cliente y propone continuar el trámite mediante un correo personal.',
        actions: {
            use_corporate_channel: {
                consequence: 'La información permanece protegida, el trámite conserva trazabilidad y Tecnología recibe el reporte.',
                recommended: true,
            },
            use_personal_email: {
                consequence: 'El archivo queda fuera del control de la empresa. Sofía detiene el envío y te pide corregir el canal.',
                recommended: false,
            },
            share_credentials: {
                consequence: 'Se pierde la trazabilidad de la operación. Debes cancelar el acceso compartido y escoger un canal autorizado.',
                recommended: false,
            },
        },
    },
    human_resources: {
        observation: 'El directorio asigna las consultas de beneficios a Talento Humano mediante el portal interno.',
        actions: {
            contact_human_resources: {
                consequence: 'La consulta llega al equipo responsable con el contexto necesario y recibes una respuesta verificable.',
                recommended: true,
            },
            open_technology_ticket: {
                consequence: 'Tecnología devuelve el caso porque no gestiona beneficios. Debes redirigir la solicitud al área correcta.',
                recommended: false,
            },
            ask_external_network: {
                consequence: 'La información encontrada no corresponde a las políticas internas. Debes verificarla con Talento Humano.',
                recommended: false,
            },
        },
    },
    operations: {
        observation: 'La tarea de mayor prioridad vence hoy, figura bloqueada y todavía no tiene una actualización para el supervisor.',
        actions: {
            update_board_and_escalate: {
                consequence: 'Carlos puede reorganizar el trabajo a tiempo y el equipo mantiene la trazabilidad de la decisión.',
                recommended: true,
            },
            wait_until_end_of_day: {
                consequence: 'El plazo queda en riesgo y disminuyen las alternativas del equipo. Debes comunicar el bloqueo ahora.',
                recommended: false,
            },
            change_process_silently: {
                consequence: 'El cambio crea un riesgo operativo no autorizado. Debes revertirlo y acordar el siguiente paso con tu supervisor.',
                recommended: false,
            },
        },
    },
    workplace_safety: {
        observation: 'Un cable suelto cruza el paso y puede provocar una caída. Cerca hay señalización preventiva y un canal de Seguridad y Salud.',
        actions: {
            secure_area_and_report: {
                consequence: 'La zona queda protegida mientras el equipo responsable elimina el riesgo de forma segura.',
                recommended: true,
            },
            walk_past_hazard: {
                consequence: 'Otra persona se aproxima sin advertencia. Debes asegurar la zona y realizar el reporte antes de continuar.',
                recommended: false,
            },
            repair_without_warning: {
                consequence: 'La intervención improvisada aumenta la exposición al riesgo. Debes detenerte, señalizar y solicitar apoyo especializado.',
                recommended: false,
            },
        },
    },
};

export const IMMERSIVE_TRAINING_SIMULATION = {
    ...SIMULATION_SCENARIO_METADATA,
    simulationVersion: SIMULATION_VERSION,
    stages: SIMULATION_STAGE_CATALOG.map((stage) => {
        const details = SIMULATION_PRIVATE_DETAILS[stage.id];
        return {
            ...stage,
            evidence: { ...stage.evidence, observation: details.observation },
            actions: stage.actions.map((action) => ({
                ...action,
                ...details.actions[action.id],
            })),
        };
    }),
};

function validateSimulationMutationContext(body: unknown): ValidationResult<SimulationMutationContext> {
    if (!body || typeof body !== 'object') {
        return { ok: false, error: 'El evento de simulación no es válido.' };
    }
    const input = body as Record<string, unknown>;
    const clientEventId = readRequiredString(input.clientEventId, 'clientEventId', 100);
    if (!clientEventId.ok) return clientEventId;
    const moduleVersion = input.moduleVersion ?? CAMPUS_MANIFEST.moduleVersion;
    const worldVersion = input.worldVersion ?? CAMPUS_MANIFEST.worldVersion;
    const zoneId = input.zoneId ?? 'simulation-lab';
    const durationSeconds = input.durationSeconds ?? 0;
    if (!Number.isInteger(moduleVersion) || Number(moduleVersion) < 1) {
        return { ok: false, error: 'moduleVersion debe ser un entero positivo.' };
    }
    if (!Number.isInteger(worldVersion) || Number(worldVersion) < 1) {
        return { ok: false, error: 'worldVersion debe ser un entero positivo.' };
    }
    if (zoneId !== 'simulation-lab') {
        return { ok: false, error: 'El evento no pertenece al laboratorio de simulación.' };
    }
    if (!Number.isInteger(durationSeconds) || Number(durationSeconds) < 0) {
        return { ok: false, error: 'durationSeconds no es válido.' };
    }
    return {
        ok: true,
        value: {
            clientEventId: clientEventId.value,
            moduleVersion: Number(moduleVersion),
            worldVersion: Number(worldVersion),
            zoneId,
            durationSeconds: Number(durationSeconds),
        },
    };
}

function isSimulationStageId(value: string): value is SimulationStageId {
    return SIMULATION_STAGE_IDS.includes(value as SimulationStageId);
}

export function validateSimulationStartInput(body: unknown): ValidationResult<SimulationStartInput> {
    const context = validateSimulationMutationContext(body);
    if (!context.ok) return context;
    const input = body as Record<string, unknown>;
    if (input.restart !== undefined && typeof input.restart !== 'boolean') {
        return { ok: false, error: 'restart debe ser un valor booleano.' };
    }
    return { ok: true, value: { ...context.value, restart: input.restart === true } };
}

export function validateSimulationInspectionInput(body: unknown): ValidationResult<SimulationInspectionInput> {
    const context = validateSimulationMutationContext(body);
    if (!context.ok) return context;
    const input = body as Record<string, unknown>;
    const stageId = readRequiredString(input.stageId, 'stageId', 100);
    const objectId = readRequiredString(input.objectId, 'objectId', 100);
    if (!stageId.ok) return stageId;
    if (!objectId.ok) return objectId;
    if (!isSimulationStageId(stageId.value)) {
        return { ok: false, error: 'La etapa no pertenece a la simulación activa.' };
    }
    const stage = getImmersiveSimulationStage(stageId.value);
    if (!stage || stage.evidence.objectId !== objectId.value) {
        return { ok: false, error: 'El objeto no pertenece a la etapa indicada.' };
    }
    return {
        ok: true,
        value: {
            ...context.value,
            stageId: stageId.value,
            objectId: stage.evidence.objectId,
        },
    };
}

export function validateSimulationActionInput(body: unknown): ValidationResult<SimulationActionInput> {
    const context = validateSimulationMutationContext(body);
    if (!context.ok) return context;
    const input = body as Record<string, unknown>;
    const stageId = readRequiredString(input.stageId, 'stageId', 100);
    const actionId = readRequiredString(input.actionId, 'actionId', 100);
    if (!stageId.ok) return stageId;
    if (!actionId.ok) return actionId;
    if (!isSimulationStageId(stageId.value)) {
        return { ok: false, error: 'La etapa no pertenece a la simulación activa.' };
    }
    if (!getImmersiveSimulationAction(stageId.value, actionId.value)) {
        return { ok: false, error: 'La acción no pertenece a la etapa indicada.' };
    }
    return {
        ok: true,
        value: { ...context.value, stageId: stageId.value, actionId: actionId.value },
    };
}

export function getImmersiveSimulationStage(stageId: SimulationStageId) {
    return IMMERSIVE_TRAINING_SIMULATION.stages.find((stage) => stage.id === stageId) ?? null;
}

export function getImmersiveSimulationAction(stageId: SimulationStageId, actionId: string) {
    return getImmersiveSimulationStage(stageId)?.actions.find((action) => action.id === actionId) ?? null;
}

export function getNextImmersiveSimulationStageId(stageId: SimulationStageId): SimulationStageId | null {
    const stageIndex = SIMULATION_STAGE_IDS.indexOf(stageId);
    return SIMULATION_STAGE_IDS[stageIndex + 1] ?? null;
}

export function prepareSimulationInspection(
    run: StoredSimulationRun,
    stageId: SimulationStageId,
    objectId: SimulationEvidenceObjectId,
): ValidationResult<{ observation: string }> {
    const stageDefinition = getImmersiveSimulationStage(stageId);
    const stageProgress = run.stages.find((stage) => stage.stageId === stageId);
    if (run.status !== 'in_progress') {
        return { ok: false, error: 'La jornada indicada no está activa.' };
    }
    if (!stageDefinition || stageDefinition.evidence.objectId !== objectId) {
        return { ok: false, error: 'El objeto no pertenece a la etapa indicada.' };
    }
    if (run.currentStageId !== stageId || stageProgress?.status !== 'awaiting_inspection') {
        return { ok: false, error: 'Solo puede inspeccionar el objetivo de la etapa activa.' };
    }
    return { ok: true, value: { observation: stageDefinition.evidence.observation } };
}

export type SimulationActionPlan = {
    kind: SimulationAttemptKind;
    result: SimulationAttemptResult;
    consequence: string;
    nextStageId: SimulationStageId | null;
    completesRun: boolean;
};

export function prepareSimulationAction(
    run: StoredSimulationRun,
    stageId: SimulationStageId,
    actionId: string,
): ValidationResult<SimulationActionPlan> {
    const stageProgress = run.stages.find((stage) => stage.stageId === stageId);
    const action = getImmersiveSimulationAction(stageId, actionId);
    if (run.status !== 'in_progress') {
        return { ok: false, error: 'La jornada indicada no está activa.' };
    }
    if (!action || run.currentStageId !== stageId
        || !stageProgress
        || !['ready_for_action', 'pending_correction'].includes(stageProgress.status)) {
        return { ok: false, error: 'Debe inspeccionar y resolver la etapa activa antes de continuar.' };
    }
    const nextStageId = action.recommended ? getNextImmersiveSimulationStageId(stageId) : null;
    return {
        ok: true,
        value: {
            kind: stageProgress.attempts.length === 0 ? 'initial' : 'correction',
            result: action.recommended ? 'resolved' : 'consequence',
            consequence: action.consequence,
            nextStageId,
            completesRun: action.recommended && nextStageId === null,
        },
    };
}

export function createSimulationRun(
    runId: string,
    startClientEventId: string,
    now: Date,
): StoredSimulationRun {
    return {
        runId,
        simulationVersion: SIMULATION_VERSION,
        scenarioId: IMMERSIVE_TRAINING_SIMULATION.id,
        status: 'in_progress',
        currentStageId: SIMULATION_STAGE_IDS[0],
        startClientEventIds: [startClientEventId],
        startedAt: now,
        lastUpdatedAt: now,
        stages: SIMULATION_STAGE_IDS.map((stageId, index) => ({
            stageId,
            status: index === 0 ? 'awaiting_inspection' : 'locked',
            inspections: [],
            attempts: [],
        })),
    };
}

export function getActiveSimulationRun(
    runs: readonly StoredSimulationRun[] | undefined,
): StoredSimulationRun | null {
    return [...(runs ?? [])].reverse().find((run) => (
        run.simulationVersion === SIMULATION_VERSION
        && run.scenarioId === IMMERSIVE_TRAINING_SIMULATION.id
        && run.status === 'in_progress'
    )) ?? null;
}

export function getLatestSimulationRun(
    runs: readonly StoredSimulationRun[] | undefined,
): StoredSimulationRun | null {
    return [...(runs ?? [])].reverse().find((run) => (
        run.simulationVersion === SIMULATION_VERSION
        && run.scenarioId === IMMERSIVE_TRAINING_SIMULATION.id
    )) ?? null;
}

export function hasCompletedSimulationRun(runs: readonly StoredSimulationRun[] | undefined): boolean {
    return (runs ?? []).some((run) => (
        run.simulationVersion === SIMULATION_VERSION
        && run.scenarioId === IMMERSIVE_TRAINING_SIMULATION.id
        && run.status === 'completed'
        && SIMULATION_STAGE_IDS.every((stageId) => run.stages.some((stage) => (
            stage.stageId === stageId && stage.status === 'completed'
        )))
    ));
}

export function isLegacySimulationCompleted(decisions: readonly StoredSimulationDecision[] | undefined): boolean {
    return getCompletedSimulationDecisionIds(decisions ?? []).length === SIMULATION_DECISION_IDS.length;
}

export function isSimulationCompleted(source: {
    simulationDecisions?: readonly StoredSimulationDecision[];
    simulationRuns?: readonly StoredSimulationRun[];
} | null | undefined): boolean {
    return isLegacySimulationCompleted(source?.simulationDecisions)
        || hasCompletedSimulationRun(source?.simulationRuns);
}

export function publicImmersiveSimulationScenario(): PublicSimulationScenario {
    return {
        id: IMMERSIVE_TRAINING_SIMULATION.id,
        simulationVersion: SIMULATION_VERSION,
        title: IMMERSIVE_TRAINING_SIMULATION.title,
        introduction: IMMERSIVE_TRAINING_SIMULATION.introduction,
        stages: IMMERSIVE_TRAINING_SIMULATION.stages.map((stage) => ({
            id: stage.id,
            time: stage.time,
            title: stage.title,
            objective: stage.objective,
            guide: { ...stage.guide },
            evidence: {
                objectId: stage.evidence.objectId,
                label: stage.evidence.label,
            },
            actions: stage.actions.map((action) => ({ id: action.id, label: action.label })),
        })),
    };
}

export function publicSimulationRun(run: StoredSimulationRun): SimulationRunSummary {
    const stages = run.stages.map((stage) => ({
        stageId: stage.stageId,
        status: stage.status,
        inspections: stage.inspections.map((inspection) => ({
            objectId: inspection.objectId,
            observation: getImmersiveSimulationStage(inspection.stageId)?.evidence.observation ?? '',
            timestamp: inspection.timestamp.toISOString(),
        })),
        attempts: stage.attempts.map((attempt) => ({
            actionId: attempt.actionId,
            kind: attempt.kind,
            result: attempt.result,
            consequence: attempt.consequence,
            timestamp: attempt.timestamp.toISOString(),
        })),
        ...(stage.completedAt ? { completedAt: stage.completedAt.toISOString() } : {}),
    }));
    return {
        runId: run.runId,
        simulationVersion: SIMULATION_VERSION,
        scenarioId: run.scenarioId,
        status: run.status,
        currentStageId: run.currentStageId ?? null,
        startedAt: run.startedAt.toISOString(),
        ...(run.completedAt ? { completedAt: run.completedAt.toISOString() } : {}),
        completedStageCount: stages.filter((stage) => stage.status === 'completed').length,
        requiredStageCount: SIMULATION_STAGE_IDS.length,
        stages,
    };
}
