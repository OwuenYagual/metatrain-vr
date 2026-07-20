export type ActivityOption = {
    id: string;
    label: string;
    feedback?: string;
};

export type ScenarioActivity = {
    kind: 'scenario';
    title: string;
    introduction: string;
    steps: Array<{
        id: string;
        prompt: string;
        options: ActivityOption[];
        correctOptionId: string;
    }>;
};

export type DirectoryActivity = {
    kind: 'directory';
    title: string;
    introduction: string;
    departments: Array<{
        id: string;
        name: string;
        purpose: string;
        person: string;
        role: string;
        channel: string;
    }>;
};

export type SequenceActivity = {
    kind: 'sequence';
    title: string;
    introduction: string;
    tasks: ActivityOption[];
    correctOrder: string[];
};

export type ChecklistActivity = {
    kind: 'checklist';
    title: string;
    introduction: string;
    options: ActivityOption[];
    correctOptionIds: string[];
};

export type InductionActivity = ScenarioActivity | DirectoryActivity | SequenceActivity | ChecklistActivity;

export const INDUCTION_ACTIVITIES: Record<string, InductionActivity> = {
    obj_manual: {
        kind: 'scenario',
        title: 'Políticas y convivencia',
        introduction: 'Resuelve situaciones cotidianas aplicando confidencialidad, respeto y uso responsable de los recursos.',
        steps: [
            {
                id: 'policy_information',
                prompt: 'Recibes información interna de un cliente. ¿Dónde debes trabajar con ella?',
                correctOptionId: 'corporate_tools',
                options: [
                    { id: 'corporate_tools', label: 'En las herramientas corporativas autorizadas.', feedback: 'Correcto. La información de la empresa permanece en canales protegidos.' },
                    { id: 'personal_email', label: 'Enviándola a mi correo personal para avanzar desde casa.', feedback: 'Los datos internos no deben salir de los canales autorizados.' },
                    { id: 'public_drive', label: 'En una carpeta pública para compartirla más rápido.', feedback: 'Una carpeta pública rompe la confidencialidad y la trazabilidad.' },
                ],
            },
            {
                id: 'policy_respect',
                prompt: 'Un comentario de un compañero te resulta ofensivo. ¿Cómo actúas?',
                correctOptionId: 'respect_channel',
                options: [
                    { id: 'respect_channel', label: 'Marco un límite con respeto y uso el canal de Talento Humano si continúa.', feedback: 'Correcto. La convivencia se protege con comunicación respetuosa y canales formales.' },
                    { id: 'public_response', label: 'Lo expongo en un chat público del equipo.', feedback: 'La exposición pública puede escalar el conflicto y no sustituye el canal formal.' },
                    { id: 'ignore_forever', label: 'Lo ignoro siempre, aunque se repita.', feedback: 'Una conducta reiterada debe reportarse para recibir acompañamiento.' },
                ],
            },
            {
                id: 'policy_resources',
                prompt: 'Necesitas instalar una aplicación para completar una tarea. ¿Qué haces?',
                correctOptionId: 'request_technology',
                options: [
                    { id: 'request_technology', label: 'Solicito la revisión e instalación al área de Tecnología.', feedback: 'Correcto. Tecnología valida seguridad, licencia y compatibilidad.' },
                    { id: 'install_anyway', label: 'La instalo directamente porque parece segura.', feedback: 'El software no autorizado puede comprometer datos y equipos.' },
                    { id: 'use_shared_password', label: 'Pido la contraseña de administrador a un compañero.', feedback: 'Las credenciales son personales y nunca deben compartirse.' },
                ],
            },
        ],
    },
    obj_rrhh: {
        kind: 'directory',
        title: 'Departamentos y personas',
        introduction: 'Explora el directorio. Debes conocer quién lidera cada área y cuándo acudir a ella.',
        departments: [
            { id: 'management', name: 'Dirección General', purpose: 'Define la estrategia y las prioridades de la empresa.', person: 'Elena Torres', role: 'Directora General', channel: 'Reunión mensual y comunicados corporativos' },
            { id: 'people', name: 'Talento Humano', purpose: 'Acompaña contratación, beneficios, desarrollo y convivencia.', person: 'Sofía Andrade', role: 'Coordinadora de Talento Humano', channel: 'Portal interno o talento@empresa.local' },
            { id: 'operations', name: 'Operaciones', purpose: 'Coordina la ejecución diaria y el cumplimiento de los servicios.', person: 'Carlos Méndez', role: 'Supervisor de Operaciones', channel: 'Reunión diaria y tablero de tareas' },
            { id: 'technology', name: 'Tecnología', purpose: 'Gestiona accesos, equipos, aplicaciones y soporte técnico.', person: 'Diego Ruiz', role: 'Líder de Tecnología', channel: 'Mesa de ayuda interna' },
            { id: 'safety', name: 'Seguridad y Salud', purpose: 'Previene riesgos y coordina la respuesta ante incidentes.', person: 'Valeria León', role: 'Responsable de SST', channel: 'Canal de incidentes y extensión 101' },
        ],
    },
    obj_funciones: {
        kind: 'sequence',
        title: 'Funciones de tu puesto',
        introduction: 'Tu puesto de referencia es Analista de Operaciones. Construye el flujo correcto de una jornada de trabajo.',
        correctOrder: ['review', 'execute', 'update', 'escalate'],
        tasks: [
            { id: 'update', label: 'Actualizar el tablero con avances y evidencias.' },
            { id: 'escalate', label: 'Comunicar bloqueos al supervisor y proponer el siguiente paso.' },
            { id: 'review', label: 'Revisar prioridades, plazos y responsables al iniciar la jornada.' },
            { id: 'execute', label: 'Ejecutar las tareas asignadas siguiendo el procedimiento vigente.' },
        ],
    },
    obj_seguridad: {
        kind: 'scenario',
        title: 'Red de apoyo',
        introduction: 'Elige el departamento correcto para resolver cada necesidad durante tu primera semana.',
        steps: [
            {
                id: 'support_access',
                prompt: 'Tu acceso a una aplicación corporativa no funciona.',
                correctOptionId: 'technology',
                options: [
                    { id: 'technology', label: 'Tecnología · Mesa de ayuda', feedback: 'Correcto. Tecnología administra accesos y soporte de aplicaciones.' },
                    { id: 'management', label: 'Dirección General', feedback: 'Dirección define prioridades, pero no gestiona accesos técnicos.' },
                    { id: 'people', label: 'Talento Humano', feedback: 'Talento Humano acompaña asuntos laborales, no accesos técnicos.' },
                ],
            },
            {
                id: 'support_benefit',
                prompt: 'Tienes una pregunta sobre un beneficio laboral.',
                correctOptionId: 'people',
                options: [
                    { id: 'operations', label: 'Operaciones', feedback: 'Operaciones coordina el servicio diario, no los beneficios.' },
                    { id: 'people', label: 'Talento Humano', feedback: 'Correcto. Talento Humano administra beneficios y acompañamiento laboral.' },
                    { id: 'technology', label: 'Tecnología', feedback: 'Tecnología atiende herramientas y equipos.' },
                ],
            },
            {
                id: 'support_incident',
                prompt: 'Detectas una condición que puede causar un accidente.',
                correctOptionId: 'safety',
                options: [
                    { id: 'safety', label: 'Seguridad y Salud · Canal de incidentes', feedback: 'Correcto. Señaliza el riesgo y activa el canal de incidentes.' },
                    { id: 'wait', label: 'Espero a que alguien más lo note.', feedback: 'Esperar deja el riesgo activo. Debes advertir y reportar.' },
                    { id: 'social', label: 'Lo publico en un grupo externo.', feedback: 'Los incidentes se gestionan por canales internos autorizados.' },
                ],
            },
        ],
    },
    obj_examen: {
        kind: 'checklist',
        title: 'Reto del primer día',
        introduction: 'Selecciona únicamente las acciones que forman parte de tus responsabilidades como Analista de Operaciones.',
        correctOptionIds: ['priorities', 'procedure', 'evidence', 'blockers'],
        options: [
            { id: 'priorities', label: 'Confirmar prioridades y plazos con el supervisor.' },
            { id: 'procedure', label: 'Seguir el procedimiento vigente al ejecutar cada tarea.' },
            { id: 'evidence', label: 'Registrar avances y evidencias en el tablero.' },
            { id: 'blockers', label: 'Comunicar bloqueos antes de que afecten el resultado.' },
            { id: 'passwords', label: 'Compartir credenciales para que el equipo avance más rápido.' },
            { id: 'changes', label: 'Cambiar un proceso sin aprobación ni registro.' },
        ],
    },
};

export function isChecklistSelectionCorrect(selectedIds: readonly string[], correctIds: readonly string[]): boolean {
    const selected = new Set(selectedIds);
    return selected.size === correctIds.length && correctIds.every((id) => selected.has(id));
}
