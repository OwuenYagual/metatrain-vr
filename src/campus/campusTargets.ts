import {
    getCampusZone,
    isUnlockRuleSatisfied,
    type CampusProgressState,
    type CampusZoneId,
    type InteractableManifest,
    type PortalManifest,
    type Vector3Tuple,
} from '../../shared/campus';
import {
    isTrainingStationUnlocked,
    TRAINING_STATIONS,
} from '../../shared/trainingModule';

export type CampusInteractionKind = InteractableManifest['kind'] | 'portal';

export type CampusInteractionTarget = {
    id: string;
    label: string;
    kind: CampusInteractionKind;
    position: Vector3Tuple;
    unlocked: boolean;
    lockedMessage?: string;
    portal?: PortalManifest;
};

const STATION_POSITIONS = new Map<string, Vector3Tuple>(
    TRAINING_STATIONS.map((station) => [
        station.id,
        [station.position[0], 0, station.position[2]] as Vector3Tuple,
    ]),
);

export function getTrainingStationPosition(stationId: string): Vector3Tuple | undefined {
    return STATION_POSITIONS.get(stationId);
}

export function getTrainingGuideFocusPosition(stationId: string): Vector3Tuple | undefined {
    const stationPosition = getTrainingStationPosition(stationId);
    if (!stationPosition) return undefined;

    const rotationY = Math.atan2(-stationPosition[0], -stationPosition[2]);
    const localX = 0.92;
    const localZ = 0.2;
    return [
        stationPosition[0] + Math.cos(rotationY) * localX + Math.sin(rotationY) * localZ,
        1.52,
        stationPosition[2] - Math.sin(rotationY) * localX + Math.cos(rotationY) * localZ,
    ];
}

export function getLockedMessage(kind: CampusInteractionKind): string {
    if (kind === 'simulation_terminal') return 'Completa las cuatro estaciones de inducción.';
    if (kind === 'evaluation_terminal') return 'Completa el laboratorio de simulación.';
    if (kind === 'certificate_kiosk') return 'Aprueba la evaluación para emitir tu certificado.';
    if (kind === 'training_station') return 'Completa primero la estación anterior.';
    return 'Completa la etapa anterior para abrir esta puerta.';
}

export function buildCampusInteractionTargets(
    zoneId: CampusZoneId,
    progress: CampusProgressState,
    completedStationIds: readonly string[],
): CampusInteractionTarget[] {
    const zone = getCampusZone(zoneId);
    const portals = zone.portals.map((portal): CampusInteractionTarget => {
        const unlocked = isUnlockRuleSatisfied(portal.unlockRule, progress);
        return {
            id: portal.id,
            label: portal.label,
            kind: 'portal',
            position: portal.position,
            unlocked,
            lockedMessage: unlocked ? undefined : getLockedMessage('portal'),
            portal,
        };
    });
    const interactables = zone.interactables.map((interactable): CampusInteractionTarget => {
        const position = getTrainingStationPosition(interactable.id) ?? interactable.position;
        const ruleUnlocked = isUnlockRuleSatisfied(interactable.unlockRule, progress);
        const stationUnlocked = interactable.kind !== 'training_station'
            || isTrainingStationUnlocked(interactable.id, completedStationIds);
        const unlocked = ruleUnlocked && stationUnlocked;
        return {
            id: interactable.id,
            label: interactable.label,
            kind: interactable.kind,
            position,
            unlocked,
            lockedMessage: unlocked ? undefined : getLockedMessage(interactable.kind),
        };
    });
    return [...portals, ...interactables];
}
