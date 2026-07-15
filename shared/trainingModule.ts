export const TRAINING_MODULE_ID = 'induccion_001';

export const TRAINING_STATIONS = [
    { position: [-2.5, -0.5, -1], id: 'obj_manual', title: 'Políticas de la Empresa', variant: 'manual' },
    { position: [2.5, -0.5, -1.5], id: 'obj_rrhh', title: 'Recursos Humanos', variant: 'folder' },
    { position: [-1.5, -0.5, 2], id: 'obj_funciones', title: 'Funciones de tu Rol', variant: 'board' },
    { position: [0, -0.5, -2.7], id: 'obj_seguridad', title: 'Seguridad Laboral', variant: 'shield' },
    { position: [1.5, -0.5, 2.5], id: 'obj_examen', title: 'Evaluación Final', variant: 'terminal' },
] as const;

export const TRAINING_INTERACTION_OBJECT_IDS = TRAINING_STATIONS.map((station) => station.id);

export function getModuleInteractionObjectIds(moduleId: string): readonly string[] | null {
    return moduleId === TRAINING_MODULE_ID ? TRAINING_INTERACTION_OBJECT_IDS : null;
}
