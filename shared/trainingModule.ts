export const TRAINING_MODULE_ID = 'induccion_001';
export const TRAINING_MODULE_TITLE = 'Inducción Corporativa';
export const MIN_PASSING_SCORE = 70;

export const TRAINING_STATIONS = [
    { position: [-3.25, -0.45, -1.25], id: 'obj_manual', title: 'Políticas y convivencia', variant: 'manual' },
    { position: [3.25, -0.45, -1.25], id: 'obj_rrhh', title: 'Departamentos y personas', variant: 'folder' },
    { position: [-3.1, -0.45, 2.25], id: 'obj_funciones', title: 'Funciones de tu puesto', variant: 'board' },
    { position: [0, -0.45, -3.1], id: 'obj_seguridad', title: 'Red de apoyo', variant: 'shield' },
    { position: [3.1, -0.45, 2.25], id: 'obj_examen', title: 'Reto del primer día', variant: 'terminal' },
] as const;

export const TRAINING_CHECKPOINTS = [
    { id: 'cp_entrada', label: 'Recepción y bienvenida', position: [0, -0.48, 4] },
    { id: 'cp_politicas', label: 'Zona de políticas', position: [-1.8, -0.48, 0.2] },
    { id: 'cp_seguridad', label: 'Mapa de la empresa', position: [1.8, -0.48, -0.4] },
    { id: 'cp_cierre', label: 'Puesto de trabajo', position: [0.4, -0.48, 2.55] },
] as const;

export const TRAINING_INTERACTION_OBJECT_IDS = TRAINING_STATIONS.map((station) => station.id);
export const TRAINING_CHECKPOINT_IDS = TRAINING_CHECKPOINTS.map((checkpoint) => checkpoint.id);

export function getModuleInteractionObjectIds(moduleId: string): readonly string[] | null {
    return moduleId === TRAINING_MODULE_ID ? TRAINING_INTERACTION_OBJECT_IDS : null;
}

export function getModuleCheckpointIds(moduleId: string): readonly string[] | null {
    return moduleId === TRAINING_MODULE_ID ? TRAINING_CHECKPOINT_IDS : null;
}

export function getNextTrainingCheckpointId(visitedCheckpointIds: readonly string[]): string | null {
    return TRAINING_CHECKPOINT_IDS.find((checkpointId) => !visitedCheckpointIds.includes(checkpointId)) ?? null;
}
