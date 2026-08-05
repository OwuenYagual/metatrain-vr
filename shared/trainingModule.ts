export const TRAINING_MODULE_ID = 'induccion_001';
export const TRAINING_MODULE_TITLE = 'Inducción Corporativa';
export const MIN_PASSING_SCORE = 70;

export const TRAINING_STATIONS = [
    {
        position: [-3.35, -0.45, -3.1],
        id: 'obj_manual',
        title: 'Políticas y convivencia',
        variant: 'manual',
        guide: { name: 'Sofía Andrade', role: 'Guía de Talento Humano', color: '#4f46e5', imageUrl: '/images/people/sofia-andrade.webp', avatarId: 'avatar_02' },
    },
    {
        position: [3.35, -0.45, -3.1],
        id: 'obj_rrhh',
        title: 'Departamentos y personas',
        variant: 'folder',
        guide: { name: 'Elena Torres', role: 'Guía de la organización', color: '#0f766e', imageUrl: '/images/people/elena-torres.webp', avatarId: 'avatar_03' },
    },
    {
        position: [3.35, -0.45, 3.1],
        id: 'obj_funciones',
        title: 'Funciones de tu puesto',
        variant: 'board',
        guide: { name: 'Carlos Méndez', role: 'Supervisor de Operaciones', color: '#b45309', imageUrl: '/images/people/carlos-mendez.webp', avatarId: 'avatar_01' },
    },
    {
        position: [-3.35, -0.45, 3.1],
        id: 'obj_seguridad',
        title: 'Red de apoyo',
        variant: 'shield',
        guide: { name: 'Valeria León', role: 'Guía de Seguridad y Salud', color: '#be123c', imageUrl: '/images/people/valeria-leon.webp', avatarId: 'avatar_02' },
    },
] as const;

export const TRAINING_INTERACTION_OBJECT_IDS = TRAINING_STATIONS.map((station) => station.id);

export function getModuleInteractionObjectIds(moduleId: string): readonly string[] | null {
    return moduleId === TRAINING_MODULE_ID ? TRAINING_INTERACTION_OBJECT_IDS : null;
}

export function getPreviousTrainingStationId(stationId: string): string | null {
    const stationIndex = TRAINING_INTERACTION_OBJECT_IDS.indexOf(
        stationId as (typeof TRAINING_INTERACTION_OBJECT_IDS)[number],
    );
    if (stationIndex <= 0) return null;
    return TRAINING_INTERACTION_OBJECT_IDS[stationIndex - 1] ?? null;
}

export function isTrainingStationUnlocked(
    stationId: string,
    completedStationIds: readonly string[],
): boolean {
    const stationIndex = TRAINING_INTERACTION_OBJECT_IDS.indexOf(
        stationId as (typeof TRAINING_INTERACTION_OBJECT_IDS)[number],
    );
    if (stationIndex < 0) return false;
    if (stationIndex === 0) return true;
    return completedStationIds.includes(TRAINING_INTERACTION_OBJECT_IDS[stationIndex - 1]);
}

export function getCompletedTrainingRouteSegmentCount(
    completedStationIds: readonly string[],
): number {
    let completedSegments = 0;
    for (let index = 0; index < TRAINING_INTERACTION_OBJECT_IDS.length - 1; index += 1) {
        if (!completedStationIds.includes(TRAINING_INTERACTION_OBJECT_IDS[index])) break;
        completedSegments += 1;
    }
    return completedSegments;
}
