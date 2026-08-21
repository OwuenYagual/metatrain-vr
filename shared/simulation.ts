export const SIMULATION_VERSION = 2;

export const SIMULATION_STAGE_IDS = [
    'data_protection',
    'human_resources',
    'operations',
    'workplace_safety',
] as const;

export type SimulationStageId = (typeof SIMULATION_STAGE_IDS)[number];

export const SIMULATION_EVIDENCE_OBJECT_IDS = [
    'sim_data_workstation',
    'sim_hr_directory',
    'sim_operations_board',
    'sim_safety_hazard',
] as const;

export type SimulationEvidenceObjectId = (typeof SIMULATION_EVIDENCE_OBJECT_IDS)[number];

export type SimulationStageStatus =
    | 'locked'
    | 'awaiting_inspection'
    | 'ready_for_action'
    | 'pending_correction'
    | 'completed';

export type SimulationRunStatus = 'in_progress' | 'completed' | 'abandoned';
export type SimulationAttemptKind = 'initial' | 'correction';
export type SimulationAttemptResult = 'consequence' | 'resolved';

export type PublicSimulationAction = {
    id: string;
    label: string;
};

export type PublicSimulationStage = {
    id: SimulationStageId;
    time: string;
    title: string;
    objective: string;
    guide: {
        name: string;
        introduction: string;
    };
    evidence: {
        objectId: SimulationEvidenceObjectId;
        label: string;
    };
    actions: PublicSimulationAction[];
};

export type PublicSimulationScenario = {
    id: string;
    simulationVersion: typeof SIMULATION_VERSION;
    title: string;
    introduction: string;
    stages: PublicSimulationStage[];
};

export type SimulationInspectionSummary = {
    objectId: SimulationEvidenceObjectId;
    observation: string;
    timestamp: string;
};

export type SimulationAttemptSummary = {
    actionId: string;
    kind: SimulationAttemptKind;
    result: SimulationAttemptResult;
    consequence: string;
    timestamp: string;
};

export type SimulationStageProgress = {
    stageId: SimulationStageId;
    status: SimulationStageStatus;
    inspections: SimulationInspectionSummary[];
    attempts: SimulationAttemptSummary[];
    completedAt?: string;
};

export type SimulationRunSummary = {
    runId: string;
    simulationVersion: typeof SIMULATION_VERSION;
    scenarioId: string;
    status: SimulationRunStatus;
    currentStageId: SimulationStageId | null;
    startedAt: string;
    completedAt?: string;
    completedStageCount: number;
    requiredStageCount: number;
    stages: SimulationStageProgress[];
};

export type SimulationInspectionFeedback = {
    type: 'inspection';
    stageId: SimulationStageId;
    objectId: SimulationEvidenceObjectId;
    observation: string;
};

export type SimulationActionFeedback = {
    type: 'action';
    stageId: SimulationStageId;
    actionId: string;
    kind: SimulationAttemptKind;
    result: SimulationAttemptResult;
    consequence: string;
    resolved: boolean;
};

export type SimulationFeedback = SimulationInspectionFeedback | SimulationActionFeedback;

export type SimulationScenarioResponse = {
    scenario: PublicSimulationScenario;
    simulation: SimulationRunSummary | null;
    legacyCompleted: boolean;
    completed: boolean;
    canReplay: boolean;
};

export type SimulationMutationResponse = {
    idempotent: boolean;
    simulation: SimulationRunSummary;
    feedback: SimulationFeedback | null;
};

export const SIMULATION_SCENARIO_METADATA = {
    id: 'sim_primer_dia_inmersivo',
    title: 'Tu primer día en la empresa',
    introduction: 'Vive cuatro momentos de tu jornada, observa el entorno y resuelve cada situación mediante acciones concretas.',
} as const;

export const SIMULATION_STAGE_CATALOG = [
    {
        id: 'data_protection',
        time: '08:30',
        title: 'Protección de datos',
        objective: 'Revisa la solicitud del cliente y gestiona su información por un canal seguro.',
        guide: {
            name: 'Sofía Andrade',
            introduction: 'Antes de responder, revisa la solicitud pendiente y confirma qué información contiene.',
        },
        evidence: {
            objectId: 'sim_data_workstation',
            label: 'Computador con solicitud pendiente',
        },
        actions: [
            {
                id: 'use_corporate_channel',
                label: 'Mantener los datos en el canal corporativo y reportar la lentitud',
            },
            {
                id: 'use_personal_email',
                label: 'Enviar los datos por el correo personal para avanzar rápido',
            },
            {
                id: 'share_credentials',
                label: 'Solicitar las credenciales de otra persona',
            },
        ],
    },
    {
        id: 'human_resources',
        time: '10:30',
        title: 'Talento Humano',
        objective: 'Consulta el directorio y localiza a la persona responsable de los beneficios laborales.',
        guide: {
            name: 'Elena Torres',
            introduction: 'El directorio interno indica qué área y persona atienden cada tipo de solicitud.',
        },
        evidence: {
            objectId: 'sim_hr_directory',
            label: 'Directorio interno de áreas',
        },
        actions: [
            {
                id: 'ask_external_network',
                label: 'Buscar la respuesta en una red social externa',
            },
            {
                id: 'contact_human_resources',
                label: 'Contactar a Talento Humano mediante el portal interno',
            },
            {
                id: 'open_technology_ticket',
                label: 'Abrir un caso en la mesa de ayuda de Tecnología',
            },
        ],
    },
    {
        id: 'operations',
        time: '13:30',
        title: 'Operaciones',
        objective: 'Prioriza el trabajo pendiente y comunica un bloqueo antes de que afecte el plazo.',
        guide: {
            name: 'Carlos Méndez',
            introduction: 'Observa el tablero: una tarea prioritaria está bloqueada y depende de otro equipo.',
        },
        evidence: {
            objectId: 'sim_operations_board',
            label: 'Tablero de tareas del equipo',
        },
        actions: [
            {
                id: 'wait_until_end_of_day',
                label: 'Esperar hasta el final del día para informar el bloqueo',
            },
            {
                id: 'change_process_silently',
                label: 'Cambiar el procedimiento sin avisar para ganar tiempo',
            },
            {
                id: 'update_board_and_escalate',
                label: 'Actualizar el tablero, informar el bloqueo y proponer el siguiente paso',
            },
        ],
    },
    {
        id: 'workplace_safety',
        time: '15:30',
        title: 'Seguridad y apoyo',
        objective: 'Identifica el riesgo, asegura el área y repórtalo mediante el canal establecido.',
        guide: {
            name: 'Valeria León',
            introduction: 'Hay un riesgo en la zona de paso. Examínalo antes de decidir cómo actuar.',
        },
        evidence: {
            objectId: 'sim_safety_hazard',
            label: 'Riesgo en la zona de paso',
        },
        actions: [
            {
                id: 'repair_without_warning',
                label: 'Manipular el cable sin señalizar ni avisar',
            },
            {
                id: 'secure_area_and_report',
                label: 'Señalizar el área y reportar el riesgo a Seguridad y Salud',
            },
            {
                id: 'walk_past_hazard',
                label: 'Continuar la jornada y dejar el riesgo para otra persona',
            },
        ],
    },
] as const;
