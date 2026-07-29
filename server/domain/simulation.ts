import { readRequiredString } from '../utils/validation';
import { CAMPUS_MANIFEST } from '../../shared/campus';

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
