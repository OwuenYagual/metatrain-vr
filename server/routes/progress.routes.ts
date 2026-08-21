import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
    CAMPUS_MANIFEST,
    getCampusZone,
} from '../../shared/campus';
import {
    getModuleInteractionObjectIds,
    getPreviousTrainingStationId,
} from '../../shared/trainingModule';
import {
    canEnterCampusLocation,
    canUseCampusObject,
    getCampusProgressState,
    progressIdentityFilter,
    recoverPlayerLocation,
} from '../domain/campusAccess';
import {
    validateActiveCampusContext,
    validateInteractionInput,
    validateLocationInput,
    validateProgressItemInput,
} from '../domain/progress';
import {
    getCompletedSimulationDecisionIds,
    getLatestSimulationRun,
    isSimulationCompleted,
} from '../domain/simulation';
import { authenticate, canAccessParticipant } from '../middleware/auth.middleware';
import TrainingContent from '../models/content.model';
import TrainingProgress, { type ITrainingProgress } from '../models/progress.model';
import { readRequiredString } from '../utils/validation';

const router = Router();
const MAX_STORED_EVENTS = 1000;

router.use(authenticate);

function isDuplicateKeyError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

async function getRequiredContentIds(moduleId: string): Promise<string[]> {
    const objectIds = getModuleInteractionObjectIds(moduleId);
    if (!objectIds) return [];
    const contents = await TrainingContent.find({
        moduleId,
        active: true,
        interactionObjectId: { $in: objectIds },
    }).select('_id').lean();
    return contents.map(({ _id }) => String(_id));
}

function progressSummary(progress: ITrainingProgress, requiredContentIds: readonly string[]) {
    const completedSimulationDecisionIds = getCompletedSimulationDecisionIds(progress.simulationDecisions ?? []);
    const latestSimulationRun = getLatestSimulationRun(progress.simulationRuns);
    const access = getCampusProgressState(progress, requiredContentIds);
    return {
        participantId: progress.participantId,
        moduleId: progress.moduleId,
        moduleVersion: progress.moduleVersion ?? CAMPUS_MANIFEST.moduleVersion,
        worldVersion: progress.worldVersion ?? CAMPUS_MANIFEST.worldVersion,
        lastLocation: recoverPlayerLocation(progress, access),
        completedContents: progress.completedContents ?? [],
        interactionCount: (progress.interactions ?? []).length,
        simulationDecisionCount: (progress.simulationDecisions ?? []).length,
        completedSimulationDecisionIds,
        simulationRunCount: (progress.simulationRuns ?? []).length,
        latestSimulationRunId: latestSimulationRun?.runId ?? null,
        simulationCompleted: isSimulationCompleted(progress),
        score: progress.score,
        status: progress.status,
        durationSeconds: progress.durationSeconds,
        lastSavedAt: progress.lastSavedAt,
    };
}

async function findCurrentProgress(participantId: string, includeProcessedEvents = false) {
    const query = TrainingProgress.findOne(progressIdentityFilter(participantId));
    if (includeProcessedEvents) query.select('+processedClientEventIds');
    return query;
}

router.get('/:participantId', async (req: Request, res: Response): Promise<void> => {
    try {
        const participantId = String(req.params.participantId);
        const moduleValidation = readRequiredString(req.query.moduleId, 'moduleId', 100);

        if (!mongoose.isValidObjectId(participantId) || !moduleValidation.ok) {
            res.status(400).json({ error: moduleValidation.ok ? 'ID de participante inválido.' : moduleValidation.error });
            return;
        }
        if (!canAccessParticipant(req, participantId)) {
            res.status(403).json({ error: 'No puede consultar el progreso de otro participante.' });
            return;
        }
        if (moduleValidation.value !== CAMPUS_MANIFEST.moduleId) {
            res.status(404).json({ error: 'El módulo solicitado no pertenece al campus activo.' });
            return;
        }
        const requestedVersion = req.query.moduleVersion === undefined
            ? CAMPUS_MANIFEST.moduleVersion
            : Number(req.query.moduleVersion);
        if (!Number.isInteger(requestedVersion) || requestedVersion < 1) {
            res.status(400).json({ error: 'moduleVersion debe ser un entero positivo.' });
            return;
        }

        const progress = await TrainingProgress.findOne(progressIdentityFilter(
            participantId,
            moduleValidation.value,
            requestedVersion,
        ));
        if (!progress) {
            res.status(404).json({ error: 'Progreso no encontrado.' });
            return;
        }
        const requiredContentIds = await getRequiredContentIds(moduleValidation.value);
        res.json(progressSummary(progress, requiredContentIds));
    } catch (error: unknown) {
        console.error('Error obteniendo progreso:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.put('/location', async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = validateLocationInput(req.body);
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }
        const context = validateActiveCampusContext(validation.value);
        if (!context.ok) {
            res.status(409).json({ error: context.error });
            return;
        }

        const existing = await findCurrentProgress(req.auth!.id, true);
        const requiredContentIds = await getRequiredContentIds(validation.value.moduleId);
        const access = getCampusProgressState(existing, requiredContentIds);
        if (!canEnterCampusLocation(validation.value.zoneId, validation.value.spawnId, access)) {
            res.status(403).json({ error: 'La zona solicitada todavía está bloqueada.' });
            return;
        }
        if (existing?.processedClientEventIds.includes(validation.value.clientEventId)) {
            res.json({ idempotent: true, progress: progressSummary(existing, requiredContentIds) });
            return;
        }

        const now = new Date();
        let progress: ITrainingProgress | null;
        let idempotent = false;
        try {
            progress = await TrainingProgress.findOneAndUpdate(
                {
                    ...progressIdentityFilter(req.auth!.id),
                    processedClientEventIds: { $ne: validation.value.clientEventId },
                },
                {
                    $set: {
                        moduleVersion: validation.value.moduleVersion,
                        worldVersion: validation.value.worldVersion,
                        lastLocation: {
                            worldId: CAMPUS_MANIFEST.worldId,
                            worldVersion: validation.value.worldVersion,
                            zoneId: validation.value.zoneId,
                            spawnId: validation.value.spawnId,
                            savedAt: now,
                        },
                        lastSavedAt: now,
                    },
                    $setOnInsert: {
                        participantId: req.auth!.id,
                        moduleId: validation.value.moduleId,
                        status: 'in_progress',
                    },
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $push: {
                        processedClientEventIds: {
                            $each: [validation.value.clientEventId],
                            $slice: -MAX_STORED_EVENTS,
                        },
                    },
                },
                { new: true, upsert: !existing, runValidators: true, setDefaultsOnInsert: true },
            );
        } catch (error: unknown) {
            if (!isDuplicateKeyError(error)) throw error;
            progress = null;
        }
        if (!progress) {
            const current = await findCurrentProgress(req.auth!.id, true);
            idempotent = (current?.processedClientEventIds ?? [])
                .includes(validation.value.clientEventId);
            progress = current;
        }
        if (!progress) throw new Error('No se pudo recuperar el progreso actualizado.');
        res.json({ idempotent, progress: progressSummary(progress, requiredContentIds) });
    } catch (error: unknown) {
        console.error('Error guardando ubicación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/interaction', async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = validateInteractionInput(req.body, true);
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }
        const context = validateActiveCampusContext(validation.value);
        if (!context.ok) {
            res.status(409).json({ error: context.error });
            return;
        }

        const existing = await findCurrentProgress(req.auth!.id, true);
        const requiredContentIds = await getRequiredContentIds(validation.value.moduleId);
        const access = getCampusProgressState(existing, requiredContentIds);
        if (!canUseCampusObject(validation.value.zoneId, validation.value.objectId, access)) {
            res.status(403).json({ error: 'El objeto no está disponible en la zona o etapa activa.' });
            return;
        }
        if (existing?.processedClientEventIds.includes(validation.value.clientEventId)) {
            res.json({ idempotent: true, progress: progressSummary(existing, requiredContentIds) });
            return;
        }

        const now = new Date();
        let progress: ITrainingProgress | null;
        let idempotent = false;
        try {
            progress = await TrainingProgress.findOneAndUpdate(
                {
                    ...progressIdentityFilter(req.auth!.id),
                    processedClientEventIds: { $ne: validation.value.clientEventId },
                },
                {
                    $set: {
                        moduleVersion: validation.value.moduleVersion,
                        worldVersion: validation.value.worldVersion,
                        lastSavedAt: now,
                    },
                    $setOnInsert: {
                        participantId: req.auth!.id,
                        moduleId: validation.value.moduleId,
                        status: 'in_progress',
                    },
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $push: {
                        interactions: {
                            $each: [{
                                clientEventId: validation.value.clientEventId,
                                moduleVersion: validation.value.moduleVersion,
                                worldVersion: validation.value.worldVersion,
                                zoneId: validation.value.zoneId,
                                objectId: validation.value.objectId,
                                eventType: validation.value.eventType,
                                timestamp: now,
                            }],
                            $slice: -MAX_STORED_EVENTS,
                        },
                        processedClientEventIds: {
                            $each: [validation.value.clientEventId],
                            $slice: -MAX_STORED_EVENTS,
                        },
                    },
                },
                { new: true, upsert: !existing, runValidators: true, setDefaultsOnInsert: true },
            );
        } catch (error: unknown) {
            if (!isDuplicateKeyError(error)) throw error;
            progress = null;
        }
        if (!progress) {
            const current = await findCurrentProgress(req.auth!.id, true);
            idempotent = (current?.processedClientEventIds ?? [])
                .includes(validation.value.clientEventId);
            progress = current;
        }
        if (!progress) throw new Error('No se pudo recuperar el progreso actualizado.');
        res.status(idempotent ? 200 : 201).json({
            idempotent,
            progress: progressSummary(progress, requiredContentIds),
        });
    } catch (error: unknown) {
        console.error('Error guardando interacción:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/content', async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = validateProgressItemInput(req.body, 'contentId');
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }
        const context = validateActiveCampusContext(validation.value);
        if (!context.ok) {
            res.status(409).json({ error: context.error });
            return;
        }
        if (!mongoose.isValidObjectId(validation.value.itemId)) {
            res.status(400).json({ error: 'ID de contenido inválido.' });
            return;
        }

        const interactionObjectIds = getModuleInteractionObjectIds(validation.value.moduleId);
        const content = await TrainingContent.findOne({
            _id: validation.value.itemId,
            moduleId: validation.value.moduleId,
            active: true,
            ...(interactionObjectIds ? { interactionObjectId: { $in: interactionObjectIds } } : {}),
        }).select('_id interactionObjectId');
        if (!content) {
            res.status(404).json({ error: 'El contenido no pertenece al recorrido activo.' });
            return;
        }
        if (validation.value.zoneId !== 'induction-office') {
            res.status(403).json({ error: 'El contenido no pertenece a la zona indicada.' });
            return;
        }

        const clientEventId = req.body && typeof req.body === 'object'
            && typeof (req.body as Record<string, unknown>).clientEventId === 'string'
            ? validation.value.clientEventId
            : `legacy-content-${validation.value.itemId}`;
        const existing = await findCurrentProgress(req.auth!.id, true);
        const requiredContentIds = await getRequiredContentIds(validation.value.moduleId);
        if (existing?.processedClientEventIds.includes(clientEventId)) {
            res.json({ idempotent: true, progress: progressSummary(existing, requiredContentIds) });
            return;
        }
        if (existing && (existing.status === 'approved' || existing.status === 'failed')) {
            res.status(409).json({ error: 'El progreso del módulo ya está finalizado.' });
            return;
        }

        const alreadyCompleted = existing?.completedContents.includes(validation.value.itemId) ?? false;
        let requiredPreviousContentId: string | null = null;
        if (!alreadyCompleted) {
            const previousStationId = getPreviousTrainingStationId(content.interactionObjectId);
            if (previousStationId) {
                const previousContent = await TrainingContent.findOne({
                    moduleId: validation.value.moduleId,
                    interactionObjectId: previousStationId,
                    active: true,
                }).select('_id');
                requiredPreviousContentId = previousContent ? String(previousContent._id) : null;
                if (!requiredPreviousContentId
                    || !existing?.completedContents.includes(requiredPreviousContentId)) {
                    res.status(409).json({
                        error: 'Completa la estación anterior antes de guardar esta capacitación.',
                    });
                    return;
                }
            }
        }

        const now = new Date();
        const zone = getCampusZone('induction-office');
        let progress: ITrainingProgress | null;
        try {
            progress = await TrainingProgress.findOneAndUpdate(
                {
                    ...progressIdentityFilter(req.auth!.id),
                    status: { $nin: ['approved', 'failed'] },
                    processedClientEventIds: { $ne: clientEventId },
                    ...(requiredPreviousContentId ? { completedContents: requiredPreviousContentId } : {}),
                },
                {
                    $set: {
                        moduleVersion: validation.value.moduleVersion,
                        worldVersion: validation.value.worldVersion,
                        status: 'in_progress',
                        lastLocation: {
                            worldId: CAMPUS_MANIFEST.worldId,
                            worldVersion: validation.value.worldVersion,
                            zoneId: zone.id,
                            spawnId: zone.defaultSpawnId,
                            savedAt: now,
                        },
                        lastSavedAt: now,
                    },
                    $setOnInsert: {
                        participantId: req.auth!.id,
                        moduleId: validation.value.moduleId,
                    },
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $addToSet: { completedContents: validation.value.itemId },
                    $push: {
                        processedClientEventIds: {
                            $each: [clientEventId],
                            $slice: -MAX_STORED_EVENTS,
                        },
                    },
                },
                { new: true, upsert: !existing, runValidators: true, setDefaultsOnInsert: true },
            );
        } catch (error: unknown) {
            if (!isDuplicateKeyError(error)) throw error;
            progress = null;
        }
        if (!progress) {
            const current = await findCurrentProgress(req.auth!.id, true);
            if (current?.processedClientEventIds.includes(clientEventId)) {
                res.json({ idempotent: true, progress: progressSummary(current, requiredContentIds) });
                return;
            }
            res.status(409).json({ error: 'El progreso cambió; vuelve a intentar la operación.' });
            return;
        }
        res.json({ idempotent: false, progress: progressSummary(progress, requiredContentIds) });
    } catch (error: unknown) {
        if (isDuplicateKeyError(error)) {
            res.status(409).json({ error: 'El progreso cambió; vuelve a intentar la operación.' });
            return;
        }
        console.error('Error marcando contenido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
