import type { FilterQuery } from 'mongoose';
import {
    CAMPUS_MANIFEST,
    createDefaultPlayerLocation,
    getCampusZone,
    isCampusZoneUnlocked,
    isUnlockRuleSatisfied,
    normalizePlayerLocation,
    type CampusProgressState,
    type CampusZoneId,
    type PlayerLocation,
} from '../../shared/campus';
import { TRAINING_INTERACTION_OBJECT_IDS } from '../../shared/trainingModule';
import type { ITrainingProgress } from '../models/progress.model';
import { getCompletedSimulationDecisionIds, SIMULATION_DECISION_IDS } from './simulation';

export type ProgressAccessSource = Pick<
    ITrainingProgress,
    'completedContents' | 'simulationDecisions' | 'status' | 'lastLocation'
>;

export function progressIdentityFilter(
    participantId: string,
    moduleId = CAMPUS_MANIFEST.moduleId,
    moduleVersion = CAMPUS_MANIFEST.moduleVersion,
): FilterQuery<ITrainingProgress> {
    const base = { participantId, moduleId };
    if (moduleVersion !== 1) return { ...base, moduleVersion };
    return {
        ...base,
        $or: [
            { moduleVersion },
            { moduleVersion: { $exists: false } },
        ],
    };
}

export function getCampusProgressState(
    progress: ProgressAccessSource | null | undefined,
    requiredContentIds: readonly string[],
): CampusProgressState {
    const completedContents = new Set(progress?.completedContents ?? []);
    const trainingCompleted = requiredContentIds.length === TRAINING_INTERACTION_OBJECT_IDS.length
        && requiredContentIds.every((contentId) => completedContents.has(contentId));
    const completedSimulationIds = progress
        ? getCompletedSimulationDecisionIds(progress.simulationDecisions ?? [])
        : [];
    return {
        trainingCompleted,
        simulationCompleted: completedSimulationIds.length === SIMULATION_DECISION_IDS.length,
        approved: progress?.status === 'approved',
    };
}

export function recoverPlayerLocation(
    progress: ProgressAccessSource | null | undefined,
    access: CampusProgressState,
): PlayerLocation {
    const normalized = normalizePlayerLocation(progress?.lastLocation);
    return isCampusZoneUnlocked(normalized.zoneId, access)
        ? normalized
        : createDefaultPlayerLocation();
}

export function canEnterCampusLocation(
    zoneId: CampusZoneId,
    spawnId: string,
    access: CampusProgressState,
): boolean {
    const zone = getCampusZone(zoneId);
    return zone.spawns.some(({ id }) => id === spawnId)
        && isCampusZoneUnlocked(zoneId, access);
}

export function canUseCampusObject(
    zoneId: CampusZoneId,
    objectId: string,
    access: CampusProgressState,
): boolean {
    const zone = getCampusZone(zoneId);
    if (!isCampusZoneUnlocked(zoneId, access)) return false;
    const object = zone.interactables.find(({ id }) => id === objectId)
        ?? zone.portals.find(({ id }) => id === objectId);
    return Boolean(object && isUnlockRuleSatisfied(object.unlockRule, access));
}
