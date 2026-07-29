import {
    TRAINING_INTERACTION_OBJECT_IDS,
    TRAINING_MODULE_ID,
    TRAINING_STATIONS,
} from './trainingModule';

export const CAMPUS_WORLD_ID = 'corporate-campus';
export const CAMPUS_WORLD_VERSION = 1;
export const TRAINING_MODULE_VERSION = 1;
export const CAMPUS_INTERACTION_DISTANCE = 2.2;

export const CAMPUS_ZONE_IDS = [
    'lobby',
    'induction-office',
    'simulation-lab',
    'assessment-room',
] as const;

export type CampusZoneId = (typeof CAMPUS_ZONE_IDS)[number];
export type Vector3Tuple = readonly [number, number, number];

export type UnlockRule =
    | { type: 'always' }
    | { type: 'training_complete' }
    | { type: 'simulation_complete' }
    | { type: 'approved' };

export type SpawnManifest = {
    id: string;
    position: Vector3Tuple;
    rotationY: number;
};

export type PortalManifest = {
    id: string;
    label: string;
    position: Vector3Tuple;
    targetZoneId: CampusZoneId;
    targetSpawnId: string;
    unlockRule: UnlockRule;
};

export type InteractableManifest = {
    id: string;
    label: string;
    kind: 'training_station' | 'simulation_terminal' | 'evaluation_terminal' | 'certificate_kiosk';
    position: Vector3Tuple;
    unlockRule: UnlockRule;
};

export type ZoneManifest = {
    id: CampusZoneId;
    title: string;
    description: string;
    environment: 'lobby' | 'office' | 'laboratory' | 'assessment';
    ambientCue: 'reception' | 'office' | 'laboratory' | 'assessment';
    unlockRule: UnlockRule;
    defaultSpawnId: string;
    spawns: readonly SpawnManifest[];
    portals: readonly PortalManifest[];
    interactables: readonly InteractableManifest[];
};

export type WorldManifest = {
    worldId: string;
    worldVersion: number;
    moduleId: string;
    moduleVersion: number;
    defaultZoneId: CampusZoneId;
    zones: readonly ZoneManifest[];
};

export type PlayerLocation = {
    worldId: string;
    worldVersion: number;
    zoneId: CampusZoneId;
    spawnId: string;
};

export type CampusProgressState = {
    trainingCompleted: boolean;
    simulationCompleted: boolean;
    approved: boolean;
};

const ALWAYS: UnlockRule = { type: 'always' };
const TRAINING_COMPLETE: UnlockRule = { type: 'training_complete' };
const SIMULATION_COMPLETE: UnlockRule = { type: 'simulation_complete' };
const APPROVED: UnlockRule = { type: 'approved' };

export const CAMPUS_MANIFEST: WorldManifest = {
    worldId: CAMPUS_WORLD_ID,
    worldVersion: CAMPUS_WORLD_VERSION,
    moduleId: TRAINING_MODULE_ID,
    moduleVersion: TRAINING_MODULE_VERSION,
    defaultZoneId: 'lobby',
    zones: [
        {
            id: 'lobby',
            title: 'Vestíbulo corporativo',
            description: 'Punto central del campus y acceso a cada etapa de la inducción.',
            environment: 'lobby',
            ambientCue: 'reception',
            unlockRule: ALWAYS,
            defaultSpawnId: 'lobby-entry',
            spawns: [
                { id: 'lobby-entry', position: [0, 0, 4.5], rotationY: Math.PI },
                { id: 'from-induction', position: [-3.2, 0, -1.9], rotationY: 0 },
                { id: 'from-simulation', position: [0, 0, -1.9], rotationY: 0 },
                { id: 'from-assessment', position: [3.2, 0, -1.9], rotationY: 0 },
            ],
            portals: [
                {
                    id: 'lobby-to-induction',
                    label: 'Centro de inducción',
                    position: [-3.2, 0, -4.25],
                    targetZoneId: 'induction-office',
                    targetSpawnId: 'office-entry',
                    unlockRule: ALWAYS,
                },
                {
                    id: 'lobby-to-simulation',
                    label: 'Laboratorio de simulación',
                    position: [0, 0, -4.25],
                    targetZoneId: 'simulation-lab',
                    targetSpawnId: 'simulation-entry',
                    unlockRule: TRAINING_COMPLETE,
                },
                {
                    id: 'lobby-to-assessment',
                    label: 'Sala de evaluación',
                    position: [3.2, 0, -4.25],
                    targetZoneId: 'assessment-room',
                    targetSpawnId: 'assessment-entry',
                    unlockRule: SIMULATION_COMPLETE,
                },
            ],
            interactables: [],
        },
        {
            id: 'induction-office',
            title: 'Centro de inducción',
            description: 'Oficina con las cinco estaciones formativas y sus guías.',
            environment: 'office',
            ambientCue: 'office',
            unlockRule: ALWAYS,
            defaultSpawnId: 'office-entry',
            spawns: [{ id: 'office-entry', position: [0, 0, 1.75], rotationY: Math.PI }],
            portals: [
                {
                    id: 'induction-to-lobby',
                    label: 'Volver al vestíbulo',
                    position: [0, 0, 4.45],
                    targetZoneId: 'lobby',
                    targetSpawnId: 'from-induction',
                    unlockRule: ALWAYS,
                },
            ],
            interactables: TRAINING_STATIONS.map((station, index) => ({
                id: station.id,
                label: `Estación de inducción ${index + 1}`,
                kind: 'training_station' as const,
                position: [station.position[0], 0, station.position[2]] as Vector3Tuple,
                unlockRule: ALWAYS,
            })),
        },
        {
            id: 'simulation-lab',
            title: 'Laboratorio de simulación',
            description: 'Escenario para practicar las decisiones del primer día.',
            environment: 'laboratory',
            ambientCue: 'laboratory',
            unlockRule: TRAINING_COMPLETE,
            defaultSpawnId: 'simulation-entry',
            spawns: [{ id: 'simulation-entry', position: [0, 0, 1.75], rotationY: Math.PI }],
            portals: [
                {
                    id: 'simulation-to-lobby',
                    label: 'Volver al vestíbulo',
                    position: [0, 0, 4.45],
                    targetZoneId: 'lobby',
                    targetSpawnId: 'from-simulation',
                    unlockRule: ALWAYS,
                },
            ],
            interactables: [
                {
                    id: 'obj_simulation_terminal',
                    label: 'Reto del primer día',
                    kind: 'simulation_terminal',
                    position: [0, 0, -1.25],
                    unlockRule: TRAINING_COMPLETE,
                },
            ],
        },
        {
            id: 'assessment-room',
            title: 'Sala de evaluación',
            description: 'Evaluación final y emisión del certificado de aprobación.',
            environment: 'assessment',
            ambientCue: 'assessment',
            unlockRule: SIMULATION_COMPLETE,
            defaultSpawnId: 'assessment-entry',
            spawns: [{ id: 'assessment-entry', position: [0, 0, 1.75], rotationY: Math.PI }],
            portals: [
                {
                    id: 'assessment-to-lobby',
                    label: 'Volver al vestíbulo',
                    position: [0, 0, 4.45],
                    targetZoneId: 'lobby',
                    targetSpawnId: 'from-assessment',
                    unlockRule: ALWAYS,
                },
            ],
            interactables: [
                {
                    id: 'obj_evaluation_terminal',
                    label: 'Evaluación final',
                    kind: 'evaluation_terminal',
                    position: [-1.65, 0, -1.25],
                    unlockRule: SIMULATION_COMPLETE,
                },
                {
                    id: 'obj_certificate_kiosk',
                    label: 'Certificado',
                    kind: 'certificate_kiosk',
                    position: [1.65, 0, -1.25],
                    unlockRule: APPROVED,
                },
            ],
        },
    ],
};

export function isCampusZoneId(value: unknown): value is CampusZoneId {
    return typeof value === 'string'
        && CAMPUS_ZONE_IDS.includes(value as CampusZoneId);
}

export function getCampusZone(zoneId: CampusZoneId): ZoneManifest {
    return CAMPUS_MANIFEST.zones.find(({ id }) => id === zoneId)!;
}

export function getCampusSpawn(zoneId: CampusZoneId, spawnId?: string): SpawnManifest {
    const zone = getCampusZone(zoneId);
    return zone.spawns.find(({ id }) => id === spawnId)
        ?? zone.spawns.find(({ id }) => id === zone.defaultSpawnId)!;
}

export function isUnlockRuleSatisfied(
    rule: UnlockRule,
    progress: CampusProgressState,
): boolean {
    switch (rule.type) {
        case 'always':
            return true;
        case 'training_complete':
            return progress.trainingCompleted;
        case 'simulation_complete':
            return progress.simulationCompleted;
        case 'approved':
            return progress.approved;
    }
}

export function isCampusZoneUnlocked(
    zoneId: CampusZoneId,
    progress: CampusProgressState,
): boolean {
    return isUnlockRuleSatisfied(getCampusZone(zoneId).unlockRule, progress);
}

export function isCampusInteraction(zoneId: CampusZoneId, objectId: string): boolean {
    return getCampusZone(zoneId).interactables.some(({ id }) => id === objectId);
}

export function createDefaultPlayerLocation(): PlayerLocation {
    const zone = getCampusZone(CAMPUS_MANIFEST.defaultZoneId);
    return {
        worldId: CAMPUS_MANIFEST.worldId,
        worldVersion: CAMPUS_MANIFEST.worldVersion,
        zoneId: zone.id,
        spawnId: zone.defaultSpawnId,
    };
}

export function normalizePlayerLocation(value: unknown): PlayerLocation {
    const fallback = createDefaultPlayerLocation();
    if (!value || typeof value !== 'object') return fallback;

    const input = value as Partial<PlayerLocation>;
    if (input.worldId !== CAMPUS_MANIFEST.worldId
        || input.worldVersion !== CAMPUS_MANIFEST.worldVersion
        || !isCampusZoneId(input.zoneId)
        || typeof input.spawnId !== 'string') {
        return fallback;
    }

    const spawn = getCampusZone(input.zoneId).spawns.find(({ id }) => id === input.spawnId);
    return spawn ? input as PlayerLocation : fallback;
}

export function validateCampusManifest(manifest: WorldManifest = CAMPUS_MANIFEST): string[] {
    const errors: string[] = [];
    const zoneIds = new Set<string>();
    const portalIds = new Set<string>();
    const interactionIds = new Set<string>();

    if (manifest.worldVersion < 1 || manifest.moduleVersion < 1) {
        errors.push('Las versiones del mundo y del módulo deben ser positivas.');
    }

    for (const zone of manifest.zones) {
        if (zoneIds.has(zone.id)) errors.push(`Zona duplicada: ${zone.id}.`);
        zoneIds.add(zone.id);
        const spawnIds = new Set<string>();
        for (const spawn of zone.spawns) {
            if (spawnIds.has(spawn.id)) {
                errors.push(`Spawn duplicado en ${zone.id}: ${spawn.id}.`);
            }
            spawnIds.add(spawn.id);
        }
        if (!spawnIds.has(zone.defaultSpawnId)) {
            errors.push(`La zona ${zone.id} no contiene su spawn predeterminado.`);
        }
        for (const portal of zone.portals) {
            if (portalIds.has(portal.id)) errors.push(`Portal duplicado: ${portal.id}.`);
            portalIds.add(portal.id);
        }
        for (const interactable of zone.interactables) {
            if (interactionIds.has(interactable.id)) {
                errors.push(`Interactuable duplicado: ${interactable.id}.`);
            }
            interactionIds.add(interactable.id);
        }
    }

    if (!zoneIds.has(manifest.defaultZoneId)) {
        errors.push('La zona predeterminada no existe.');
    }

    for (const zone of manifest.zones) {
        for (const portal of zone.portals) {
            const target = manifest.zones.find(({ id }) => id === portal.targetZoneId);
            if (!target) {
                errors.push(`El portal ${portal.id} apunta a una zona inexistente.`);
            } else if (!target.spawns.some(({ id }) => id === portal.targetSpawnId)) {
                errors.push(`El portal ${portal.id} apunta a un spawn inexistente.`);
            }
        }
    }

    for (const stationId of TRAINING_INTERACTION_OBJECT_IDS) {
        if (!interactionIds.has(stationId)) {
            errors.push(`Falta la estación requerida ${stationId}.`);
        }
    }

    const reachable = new Set<string>([manifest.defaultZoneId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const zone of manifest.zones) {
            if (!reachable.has(zone.id)) continue;
            for (const portal of zone.portals) {
                if (!reachable.has(portal.targetZoneId)) {
                    reachable.add(portal.targetZoneId);
                    changed = true;
                }
            }
        }
    }
    for (const zone of manifest.zones) {
        if (!reachable.has(zone.id)) errors.push(`La zona ${zone.id} no es alcanzable.`);
    }

    return errors;
}
