export const TRAINING_MODULE_ID = 'induccion_001';
export const MIN_PASSING_SCORE = 70;

export const TRAINING_STATIONS = [
    { position: [-2.5, -0.5, -1], id: 'obj_manual', title: 'Políticas de la Empresa', variant: 'manual' },
    { position: [2.5, -0.5, -1.5], id: 'obj_rrhh', title: 'Recursos Humanos', variant: 'folder' },
    { position: [-1.5, -0.5, 2], id: 'obj_funciones', title: 'Funciones de tu Rol', variant: 'board' },
    { position: [0, -0.5, -2.7], id: 'obj_seguridad', title: 'Seguridad Laboral', variant: 'shield' },
    { position: [1.5, -0.5, 2.5], id: 'obj_examen', title: 'Evaluación Final', variant: 'terminal' },
] as const;

export const TRAINING_CHECKPOINTS = [
    { id: 'cp_entrada', label: 'Inicio del recorrido', position: [0, 0.6, -3.2] },
    { id: 'cp_politicas', label: 'Zona de políticas', position: [2.2, 0.4, -2] },
    { id: 'cp_seguridad', label: 'Zona de seguridad', position: [-0.7, 1.1, -0.6] },
    { id: 'cp_cierre', label: 'Cierre del recorrido', position: [0.8, 2, 0.6] },
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
