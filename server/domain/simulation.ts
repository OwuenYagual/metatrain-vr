import { readRequiredString } from '../utils/validation';

type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

export type SimulationDecisionInput = {
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
    id: 'sim_incidente_seguridad',
    title: 'Respuesta ante un incidente de seguridad',
    introduction: 'Durante tu primera semana detectas una situación que puede afectar a otras personas. Decide cómo actuar siguiendo las políticas revisadas.',
    decisions: [
        {
            id: 'dec_detectar_riesgo',
            prompt: 'Encuentras un derrame en un pasillo de circulación. ¿Qué haces primero?',
            options: [
                {
                    id: 'aislar_reportar',
                    text: 'Señalizo el área y reporto el incidente por el canal definido.',
                    feedback: 'Correcto. Reducir la exposición y activar el canal formal protege a las personas y permite una respuesta coordinada.',
                    recommended: true,
                },
                {
                    id: 'continuar_trabajo',
                    text: 'Continúo con mi trabajo y espero que otra persona lo reporte.',
                    feedback: 'Esperar mantiene el riesgo activo. Debes advertir a otras personas y reportar la situación de inmediato.',
                    recommended: false,
                },
                {
                    id: 'limpiar_sin_equipo',
                    text: 'Intento limpiarlo sin equipo ni indicaciones.',
                    feedback: 'Intervenir sin protección puede aumentar el riesgo. Primero aísla el área y utiliza el canal de reporte.',
                    recommended: false,
                },
            ],
        },
        {
            id: 'dec_presion_operativa',
            prompt: 'Un compañero propone omitir el protocolo para terminar más rápido. ¿Cómo respondes?',
            options: [
                {
                    id: 'mantener_protocolo',
                    text: 'Mantengo el protocolo y explico que la seguridad tiene prioridad.',
                    feedback: 'Correcto. La presión operativa no justifica omitir controles ni exponer al equipo.',
                    recommended: true,
                },
                {
                    id: 'aceptar_atajo',
                    text: 'Acepto el atajo porque parece una situación menor.',
                    feedback: 'Los controles deben aplicarse incluso cuando el incidente parece menor. Un atajo puede agravar la situación.',
                    recommended: false,
                },
                {
                    id: 'ignorar_companero',
                    text: 'No respondo y me retiro sin informar a nadie.',
                    feedback: 'Retirarte sin comunicar deja el riesgo sin control. Mantén el protocolo y escala la situación si es necesario.',
                    recommended: false,
                },
            ],
        },
        {
            id: 'dec_cerrar_incidente',
            prompt: 'El incidente ya fue atendido. ¿Qué acción ayuda a cerrar el proceso?',
            options: [
                {
                    id: 'documentar_seguir',
                    text: 'Registro los hechos y sigo las indicaciones del responsable del área.',
                    feedback: 'Correcto. Documentar hechos verificables permite seguimiento, aprendizaje y prevención.',
                    recommended: true,
                },
                {
                    id: 'publicar_foto',
                    text: 'Publico una fotografía del incidente en mis redes sociales.',
                    feedback: 'La información interna debe manejarse por canales autorizados. Documenta el caso en el sistema definido.',
                    recommended: false,
                },
                {
                    id: 'no_registrar',
                    text: 'No registro nada porque el problema ya fue resuelto.',
                    feedback: 'Sin registro se pierde trazabilidad. El cierre requiere documentar lo ocurrido y las acciones realizadas.',
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
    return {
        ok: true,
        value: {
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
