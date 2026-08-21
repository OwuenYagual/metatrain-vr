import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CAMPUS_MANIFEST, getCampusZone } from '../../shared/campus';
import TrainingContent from '../models/content.model';
import TrainingProgress, { type ITrainingProgress } from '../models/progress.model';
import { authenticate } from '../middleware/auth.middleware';
import { createRateLimit } from '../middleware/rateLimit.middleware';
import { readRequiredString } from '../utils/validation';
import {
    getCompletedSimulationDecisionIds,
    createSimulationRun,
    getActiveSimulationRun,
    getImmersiveSimulationStage,
    getLatestSimulationRun,
    getNextSimulationDecisionId,
    getSimulationDecision,
    getSimulationOption,
    isLegacySimulationCompleted,
    isSimulationCompleted,
    prepareSimulationAction,
    prepareSimulationInspection,
    publicImmersiveSimulationScenario,
    publicSimulationRun,
    SIMULATION_DECISION_IDS,
    TRAINING_SIMULATION,
    validateSimulationActionInput,
    validateSimulationDecisionInput,
    validateSimulationInspectionInput,
    validateSimulationStartInput,
} from '../domain/simulation';
import { progressIdentityFilter } from '../domain/campusAccess';
import {
    getModuleInteractionObjectIds,
    TRAINING_MODULE_ID,
} from '../../shared/trainingModule';

const router = Router();
const decisionRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 30 });
const immersiveEventRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 120 });
const MAX_STORED_EVENTS = 1000;
const MAX_STORED_SIMULATION_RUNS = 20;

router.use(authenticate);

function readSupportedModuleId(req: Request, res: Response): string | null {
    const validation = readRequiredString(req.params.moduleId, 'moduleId', 100);
    if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return null;
    }
    if (validation.value !== TRAINING_MODULE_ID) {
        res.status(404).json({ error: 'La simulación no está disponible para este módulo.' });
        return null;
    }
    return validation.value;
}

async function getGuidedRouteProgress(participantId: string, moduleId: string, res: Response) {
    const interactionObjectIds = getModuleInteractionObjectIds(moduleId)!;
    const contents = await TrainingContent.find({
        moduleId,
        active: true,
        interactionObjectId: { $in: interactionObjectIds },
    }).select('_id').lean();
    if (contents.length !== interactionObjectIds.length) {
        res.status(503).json({ error: 'El módulo no tiene configurados todos sus contenidos requeridos.' });
        return null;
    }

    const progress = await TrainingProgress.findOne(progressIdentityFilter(participantId, moduleId));
    const completedContents = new Set(progress?.completedContents ?? []);
    const requiredContentIds = contents.map((content) => String(content._id));
    const contentsCompleted = requiredContentIds.filter((contentId) => completedContents.has(contentId)).length;
    if (!progress || contentsCompleted !== requiredContentIds.length) {
        res.status(409).json({
            error: 'Completa las cuatro actividades antes de iniciar la simulación.',
            requirements: {
                contents: { completed: contentsCompleted, required: requiredContentIds.length },
            },
        });
        return null;
    }
    return progress;
}

function simulationSummary(progress: ITrainingProgress) {
    const decisions = progress.simulationDecisions
        .filter((decision) => decision.scenarioId === TRAINING_SIMULATION.id)
        .map((decision) => {
            const option = getSimulationOption(decision.decisionId, decision.selectedOptionId);
            return {
                decisionId: decision.decisionId,
                selectedOptionId: decision.selectedOptionId,
                feedback: option?.feedback ?? '',
                recommended: option?.recommended ?? false,
                timestamp: decision.timestamp,
            };
        });
    const completedDecisionIds = getCompletedSimulationDecisionIds(progress.simulationDecisions);
    return {
        scenarioId: TRAINING_SIMULATION.id,
        decisions,
        completedDecisionIds,
        completedCount: completedDecisionIds.length,
        requiredCount: SIMULATION_DECISION_IDS.length,
        completed: completedDecisionIds.length === SIMULATION_DECISION_IDS.length,
        nextDecisionId: getNextSimulationDecisionId(progress.simulationDecisions),
    };
}

function replaySelection(progress: ITrainingProgress, clientEventId: string) {
    const storedDecision = progress.simulationDecisions.find((candidate) => (
        candidate.clientEventId === clientEventId
    ));
    if (!storedDecision) return null;
    const storedOption = getSimulationOption(storedDecision.decisionId, storedDecision.selectedOptionId);
    if (!storedOption) return null;
    return {
        decisionId: storedDecision.decisionId,
        selectedOptionId: storedDecision.selectedOptionId,
        feedback: storedOption.feedback,
        recommended: storedOption.recommended,
    };
}

function validateActiveSimulationContext(
    input: { moduleVersion: number; worldVersion: number },
    res: Response,
): boolean {
    if (input.moduleVersion !== CAMPUS_MANIFEST.moduleVersion
        || input.worldVersion !== CAMPUS_MANIFEST.worldVersion) {
        res.status(409).json({ error: 'El evento no pertenece al mundo y módulo activos.' });
        return false;
    }
    return true;
}

function readRunId(req: Request, res: Response): string | null {
    const validation = readRequiredString(req.params.runId, 'runId', 100);
    if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return null;
    }
    return validation.value;
}

function runById(progress: ITrainingProgress, runId: string) {
    return (progress.simulationRuns ?? []).find((run) => run.runId === runId) ?? null;
}

function findStartEvent(progress: ITrainingProgress, clientEventId: string) {
    return (progress.simulationRuns ?? []).find((run) => (
        run.startClientEventIds.includes(clientEventId)
    )) ?? null;
}

function findInspectionEvent(progress: ITrainingProgress, clientEventId: string) {
    for (const run of progress.simulationRuns ?? []) {
        for (const stage of run.stages) {
            const inspection = stage.inspections.find((candidate) => (
                candidate.clientEventId === clientEventId
            ));
            if (inspection) return { run, inspection };
        }
    }
    return null;
}

function findActionEvent(progress: ITrainingProgress, clientEventId: string) {
    for (const run of progress.simulationRuns ?? []) {
        for (const stage of run.stages) {
            const attempt = stage.attempts.find((candidate) => candidate.clientEventId === clientEventId);
            if (attempt) return { run, attempt };
        }
    }
    return null;
}

function simulationScenarioResponse(progress: ITrainingProgress) {
    const activeRun = getActiveSimulationRun(progress.simulationRuns);
    const latestRun = activeRun ?? getLatestSimulationRun(progress.simulationRuns);
    return {
        scenario: publicImmersiveSimulationScenario(),
        simulation: latestRun ? publicSimulationRun(latestRun) : null,
        legacyCompleted: isLegacySimulationCompleted(progress.simulationDecisions),
        completed: isSimulationCompleted(progress),
        canReplay: isSimulationCompleted(progress),
    };
}

function simulationLocation(now: Date, worldVersion: number) {
    const zone = getCampusZone('simulation-lab');
    return {
        worldId: CAMPUS_MANIFEST.worldId,
        worldVersion,
        zoneId: zone.id,
        spawnId: zone.defaultSpawnId,
        savedAt: now,
    };
}

function processedEventPush(clientEventId: string) {
    return {
        $each: [clientEventId],
        $slice: -MAX_STORED_EVENTS,
    };
}

function inspectionFeedback(stageId: Parameters<typeof getImmersiveSimulationStage>[0]) {
    const stage = getImmersiveSimulationStage(stageId)!;
    return {
        type: 'inspection' as const,
        stageId,
        objectId: stage.evidence.objectId,
        observation: stage.evidence.observation,
    };
}

function actionFeedback(
    attempt: {
        stageId: Parameters<typeof getImmersiveSimulationStage>[0];
        actionId: string;
        kind: 'initial' | 'correction';
        result: 'consequence' | 'resolved';
        consequence: string;
    },
) {
    return {
        type: 'action' as const,
        stageId: attempt.stageId,
        actionId: attempt.actionId,
        kind: attempt.kind,
        result: attempt.result,
        consequence: attempt.consequence,
        resolved: attempt.result === 'resolved',
    };
}

router.get('/:moduleId', async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = readSupportedModuleId(req, res);
        if (!moduleId) return;
        const progress = await getGuidedRouteProgress(req.auth!.id, moduleId, res);
        if (!progress) return;
        res.json(simulationScenarioResponse(progress));
    } catch (error: unknown) {
        console.error('Error obteniendo simulación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/:moduleId/runs', immersiveEventRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = readSupportedModuleId(req, res);
        if (!moduleId) return;
        const validation = validateSimulationStartInput(req.body);
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }
        if (!validateActiveSimulationContext(validation.value, res)) return;
        const progress = await getGuidedRouteProgress(req.auth!.id, moduleId, res);
        if (!progress) return;
        const progressWithEvents = await TrainingProgress.findById(progress._id)
            .select('+processedClientEventIds');
        if (!progressWithEvents) {
            res.status(409).json({ error: 'El progreso cambió; vuelve a intentar la operación.' });
            return;
        }

        const replayedRun = findStartEvent(progressWithEvents, validation.value.clientEventId);
        if (replayedRun) {
            res.json({
                idempotent: true,
                resumed: replayedRun.startClientEventIds[0] !== validation.value.clientEventId,
                simulation: publicSimulationRun(replayedRun),
                feedback: null,
            });
            return;
        }
        if (progressWithEvents.processedClientEventIds.includes(validation.value.clientEventId)) {
            res.status(409).json({ error: 'clientEventId ya fue utilizado por otro evento.' });
            return;
        }

        const activeRun = getActiveSimulationRun(progressWithEvents.simulationRuns);
        const now = new Date();
        if (activeRun && !validation.value.restart) {
            const updated = await TrainingProgress.findOneAndUpdate(
                {
                    _id: progressWithEvents._id,
                    processedClientEventIds: { $ne: validation.value.clientEventId },
                    simulationRuns: {
                        $elemMatch: {
                            runId: activeRun.runId,
                            status: 'in_progress',
                            currentStageId: activeRun.currentStageId,
                        },
                    },
                },
                {
                    $set: {
                        lastLocation: simulationLocation(now, validation.value.worldVersion),
                        lastSavedAt: now,
                        'simulationRuns.$[run].lastUpdatedAt': now,
                    },
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $push: {
                        processedClientEventIds: processedEventPush(validation.value.clientEventId),
                        'simulationRuns.$[run].startClientEventIds': validation.value.clientEventId,
                    },
                },
                {
                    new: true,
                    runValidators: true,
                    arrayFilters: [{ 'run.runId': activeRun.runId, 'run.status': 'in_progress' }],
                },
            );
            const resumedRun = updated ? runById(updated, activeRun.runId) : null;
            if (!updated || !resumedRun) {
                res.status(409).json({ error: 'La jornada cambió; vuelve a intentar la operación.' });
                return;
            }
            res.status(201).json({
                idempotent: false,
                resumed: true,
                simulation: publicSimulationRun(resumedRun),
                feedback: null,
            });
            return;
        }

        const newRun = createSimulationRun(randomUUID(), validation.value.clientEventId, now);
        let updatedProgress: ITrainingProgress | null;
        if (activeRun) {
            const plainRuns = progressWithEvents.toObject().simulationRuns ?? [];
            const nextRuns = [
                ...plainRuns.map((run) => run.runId === activeRun.runId
                    ? { ...run, status: 'abandoned' as const, currentStageId: undefined, lastUpdatedAt: now }
                    : run),
                newRun,
            ].slice(-MAX_STORED_SIMULATION_RUNS);
            updatedProgress = await TrainingProgress.findOneAndUpdate(
                {
                    _id: progressWithEvents._id,
                    processedClientEventIds: { $ne: validation.value.clientEventId },
                    simulationRuns: {
                        $elemMatch: {
                            runId: activeRun.runId,
                            status: 'in_progress',
                            lastUpdatedAt: activeRun.lastUpdatedAt,
                        },
                    },
                },
                {
                    $set: {
                        simulationRuns: nextRuns,
                        lastLocation: simulationLocation(now, validation.value.worldVersion),
                        lastSavedAt: now,
                    },
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $push: {
                        processedClientEventIds: processedEventPush(validation.value.clientEventId),
                    },
                },
                { new: true, runValidators: true },
            );
        } else {
            updatedProgress = await TrainingProgress.findOneAndUpdate(
                {
                    _id: progressWithEvents._id,
                    processedClientEventIds: { $ne: validation.value.clientEventId },
                    simulationRuns: {
                        $not: {
                            $elemMatch: {
                                simulationVersion: newRun.simulationVersion,
                                scenarioId: newRun.scenarioId,
                                status: 'in_progress',
                            },
                        },
                    },
                },
                {
                    $set: {
                        lastLocation: simulationLocation(now, validation.value.worldVersion),
                        lastSavedAt: now,
                    },
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $push: {
                        simulationRuns: {
                            $each: [newRun],
                            $slice: -MAX_STORED_SIMULATION_RUNS,
                        },
                        processedClientEventIds: processedEventPush(validation.value.clientEventId),
                    },
                },
                { new: true, runValidators: true },
            );
        }

        if (!updatedProgress) {
            const current = await TrainingProgress.findById(progressWithEvents._id)
                .select('+processedClientEventIds');
            const replay = current ? findStartEvent(current, validation.value.clientEventId) : null;
            if (replay) {
                res.json({
                    idempotent: true,
                    resumed: replay.startClientEventIds[0] !== validation.value.clientEventId,
                    simulation: publicSimulationRun(replay),
                    feedback: null,
                });
                return;
            }
            res.status(409).json({ error: 'La jornada cambió; vuelve a intentar la operación.' });
            return;
        }
        const storedRun = runById(updatedProgress, newRun.runId);
        if (!storedRun) throw new Error('No se pudo recuperar la jornada iniciada.');
        res.status(201).json({
            idempotent: false,
            resumed: false,
            simulation: publicSimulationRun(storedRun),
            feedback: null,
        });
    } catch (error: unknown) {
        console.error('Error iniciando simulación inmersiva:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post(
    '/:moduleId/runs/:runId/inspections',
    immersiveEventRateLimit,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const moduleId = readSupportedModuleId(req, res);
            const runId = readRunId(req, res);
            if (!moduleId || !runId) return;
            const validation = validateSimulationInspectionInput(req.body);
            if (!validation.ok) {
                res.status(400).json({ error: validation.error });
                return;
            }
            if (!validateActiveSimulationContext(validation.value, res)) return;
            const progress = await getGuidedRouteProgress(req.auth!.id, moduleId, res);
            if (!progress) return;
            const progressWithEvents = await TrainingProgress.findById(progress._id)
                .select('+processedClientEventIds');
            if (!progressWithEvents) {
                res.status(409).json({ error: 'El progreso cambió; vuelve a intentar la operación.' });
                return;
            }

            const replay = findInspectionEvent(progressWithEvents, validation.value.clientEventId);
            if (replay) {
                if (replay.run.runId !== runId
                    || replay.inspection.stageId !== validation.value.stageId
                    || replay.inspection.objectId !== validation.value.objectId) {
                    res.status(409).json({ error: 'clientEventId ya fue utilizado por otro evento.' });
                    return;
                }
                res.json({
                    idempotent: true,
                    simulation: publicSimulationRun(replay.run),
                    feedback: inspectionFeedback(replay.inspection.stageId),
                });
                return;
            }
            if (progressWithEvents.processedClientEventIds.includes(validation.value.clientEventId)) {
                res.status(409).json({ error: 'clientEventId ya fue utilizado por otro evento.' });
                return;
            }
            const run = runById(progressWithEvents, runId);
            if (!run) {
                res.status(409).json({ error: 'La jornada indicada no está activa.' });
                return;
            }
            const inspectionPlan = prepareSimulationInspection(
                run,
                validation.value.stageId,
                validation.value.objectId,
            );
            if (!inspectionPlan.ok) {
                res.status(409).json({ error: inspectionPlan.error });
                return;
            }

            const now = new Date();
            const updatedProgress = await TrainingProgress.findOneAndUpdate(
                {
                    _id: progressWithEvents._id,
                    processedClientEventIds: { $ne: validation.value.clientEventId },
                    simulationRuns: {
                        $elemMatch: {
                            runId,
                            status: 'in_progress',
                            currentStageId: validation.value.stageId,
                            stages: {
                                $elemMatch: {
                                    stageId: validation.value.stageId,
                                    status: 'awaiting_inspection',
                                },
                            },
                        },
                    },
                },
                {
                    $set: {
                        lastLocation: simulationLocation(now, validation.value.worldVersion),
                        lastSavedAt: now,
                        'simulationRuns.$[run].lastUpdatedAt': now,
                        'simulationRuns.$[run].stages.$[stage].status': 'ready_for_action',
                    },
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $push: {
                        processedClientEventIds: processedEventPush(validation.value.clientEventId),
                        'simulationRuns.$[run].stages.$[stage].inspections': {
                            clientEventId: validation.value.clientEventId,
                            stageId: validation.value.stageId,
                            objectId: validation.value.objectId,
                            timestamp: now,
                        },
                    },
                },
                {
                    new: true,
                    runValidators: true,
                    arrayFilters: [
                        { 'run.runId': runId, 'run.status': 'in_progress' },
                        { 'stage.stageId': validation.value.stageId, 'stage.status': 'awaiting_inspection' },
                    ],
                },
            );
            if (!updatedProgress) {
                const current = await TrainingProgress.findById(progressWithEvents._id)
                    .select('+processedClientEventIds');
                const concurrentReplay = current
                    ? findInspectionEvent(current, validation.value.clientEventId)
                    : null;
                if (concurrentReplay && concurrentReplay.run.runId === runId) {
                    res.json({
                        idempotent: true,
                        simulation: publicSimulationRun(concurrentReplay.run),
                        feedback: inspectionFeedback(concurrentReplay.inspection.stageId),
                    });
                    return;
                }
                res.status(409).json({ error: 'La etapa cambió; vuelve a intentar la operación.' });
                return;
            }
            const updatedRun = runById(updatedProgress, runId);
            if (!updatedRun) throw new Error('No se pudo recuperar la jornada actualizada.');
            res.status(201).json({
                idempotent: false,
                simulation: publicSimulationRun(updatedRun),
                feedback: inspectionFeedback(validation.value.stageId),
            });
        } catch (error: unknown) {
            console.error('Error guardando inspección de simulación:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },
);

router.post(
    '/:moduleId/runs/:runId/actions',
    immersiveEventRateLimit,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const moduleId = readSupportedModuleId(req, res);
            const runId = readRunId(req, res);
            if (!moduleId || !runId) return;
            const validation = validateSimulationActionInput(req.body);
            if (!validation.ok) {
                res.status(400).json({ error: validation.error });
                return;
            }
            if (!validateActiveSimulationContext(validation.value, res)) return;
            const progress = await getGuidedRouteProgress(req.auth!.id, moduleId, res);
            if (!progress) return;
            const progressWithEvents = await TrainingProgress.findById(progress._id)
                .select('+processedClientEventIds');
            if (!progressWithEvents) {
                res.status(409).json({ error: 'El progreso cambió; vuelve a intentar la operación.' });
                return;
            }

            const replay = findActionEvent(progressWithEvents, validation.value.clientEventId);
            if (replay) {
                if (replay.run.runId !== runId
                    || replay.attempt.stageId !== validation.value.stageId
                    || replay.attempt.actionId !== validation.value.actionId) {
                    res.status(409).json({ error: 'clientEventId ya fue utilizado por otro evento.' });
                    return;
                }
                res.json({
                    idempotent: true,
                    simulation: publicSimulationRun(replay.run),
                    feedback: actionFeedback(replay.attempt),
                });
                return;
            }
            if (progressWithEvents.processedClientEventIds.includes(validation.value.clientEventId)) {
                res.status(409).json({ error: 'clientEventId ya fue utilizado por otro evento.' });
                return;
            }

            const run = runById(progressWithEvents, runId);
            const stageProgress = run?.stages.find((stage) => stage.stageId === validation.value.stageId);
            if (!run) {
                res.status(409).json({ error: 'La jornada indicada no está activa.' });
                return;
            }
            const actionPlan = prepareSimulationAction(
                run,
                validation.value.stageId,
                validation.value.actionId,
            );
            if (!actionPlan.ok || !stageProgress) {
                res.status(409).json({
                    error: actionPlan.ok
                        ? 'La etapa no existe en la jornada activa.'
                        : actionPlan.error,
                });
                return;
            }

            const now = new Date();
            const attempt = {
                clientEventId: validation.value.clientEventId,
                stageId: validation.value.stageId,
                actionId: validation.value.actionId,
                kind: actionPlan.value.kind,
                result: actionPlan.value.result,
                consequence: actionPlan.value.consequence,
                timestamp: now,
            };
            const nextStageId = actionPlan.value.nextStageId;
            const expectedStatus = stageProgress.status;
            const setUpdate: Record<string, unknown> = {
                lastLocation: simulationLocation(now, validation.value.worldVersion),
                lastSavedAt: now,
                'simulationRuns.$[run].lastUpdatedAt': now,
            };
            if (actionPlan.value.result === 'consequence') {
                setUpdate['simulationRuns.$[run].stages.$[stage].status'] = 'pending_correction';
            } else {
                setUpdate['simulationRuns.$[run].stages.$[stage].status'] = 'completed';
                setUpdate['simulationRuns.$[run].stages.$[stage].completedAt'] = now;
                if (nextStageId) {
                    setUpdate['simulationRuns.$[run].currentStageId'] = nextStageId;
                    setUpdate['simulationRuns.$[run].stages.$[next].status'] = 'awaiting_inspection';
                } else {
                    setUpdate['simulationRuns.$[run].status'] = 'completed';
                    setUpdate['simulationRuns.$[run].completedAt'] = now;
                }
            }
            const update: Record<string, unknown> = {
                $set: setUpdate,
                $max: { durationSeconds: validation.value.durationSeconds },
                $push: {
                    processedClientEventIds: processedEventPush(validation.value.clientEventId),
                    'simulationRuns.$[run].stages.$[stage].attempts': attempt,
                },
            };
            if (actionPlan.value.completesRun) {
                update.$unset = { 'simulationRuns.$[run].currentStageId': 1 };
            }
            const arrayFilters: Record<string, unknown>[] = [
                { 'run.runId': runId, 'run.status': 'in_progress' },
                { 'stage.stageId': validation.value.stageId, 'stage.status': expectedStatus },
            ];
            if (nextStageId) arrayFilters.push({ 'next.stageId': nextStageId, 'next.status': 'locked' });

            const updatedProgress = await TrainingProgress.findOneAndUpdate(
                {
                    _id: progressWithEvents._id,
                    processedClientEventIds: { $ne: validation.value.clientEventId },
                    simulationRuns: {
                        $elemMatch: {
                            runId,
                            status: 'in_progress',
                            currentStageId: validation.value.stageId,
                            stages: {
                                $elemMatch: {
                                    stageId: validation.value.stageId,
                                    status: expectedStatus,
                                },
                            },
                        },
                    },
                },
                update,
                { new: true, runValidators: true, arrayFilters },
            );
            if (!updatedProgress) {
                const current = await TrainingProgress.findById(progressWithEvents._id)
                    .select('+processedClientEventIds');
                const concurrentReplay = current
                    ? findActionEvent(current, validation.value.clientEventId)
                    : null;
                if (concurrentReplay && concurrentReplay.run.runId === runId) {
                    res.json({
                        idempotent: true,
                        simulation: publicSimulationRun(concurrentReplay.run),
                        feedback: actionFeedback(concurrentReplay.attempt),
                    });
                    return;
                }
                res.status(409).json({ error: 'La etapa cambió; vuelve a intentar la operación.' });
                return;
            }
            const updatedRun = runById(updatedProgress, runId);
            if (!updatedRun) throw new Error('No se pudo recuperar la jornada actualizada.');
            res.status(201).json({
                idempotent: false,
                simulation: publicSimulationRun(updatedRun),
                feedback: actionFeedback(attempt),
            });
        } catch (error: unknown) {
            console.error('Error guardando acción de simulación:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },
);

router.post('/:moduleId/decisions', decisionRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = readSupportedModuleId(req, res);
        if (!moduleId) return;
        const validation = validateSimulationDecisionInput(req.body);
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }
        if (validation.value.scenarioId !== TRAINING_SIMULATION.id) {
            res.status(400).json({ error: 'El escenario no pertenece al módulo activo.' });
            return;
        }
        if (validation.value.moduleVersion !== CAMPUS_MANIFEST.moduleVersion
            || validation.value.worldVersion !== CAMPUS_MANIFEST.worldVersion) {
            res.status(409).json({ error: 'La decisión no pertenece al mundo y módulo activos.' });
            return;
        }
        const decision = getSimulationDecision(validation.value.decisionId);
        const option = getSimulationOption(validation.value.decisionId, validation.value.selectedOptionId);
        if (!decision || !option) {
            res.status(400).json({ error: 'La decisión u opción no pertenece a la simulación activa.' });
            return;
        }

        const progress = await getGuidedRouteProgress(req.auth!.id, moduleId, res);
        if (!progress) return;
        if (progress.status === 'approved' || progress.status === 'failed') {
            res.status(409).json({ error: 'El progreso del módulo ya está finalizado.' });
            return;
        }

        const clientEventId = validation.value.clientEventId
            ?? `legacy-simulation-${decision.id}`;
        const progressWithEvents = await TrainingProgress.findById(progress._id)
            .select('+processedClientEventIds');
        if (!progressWithEvents) {
            res.status(409).json({ error: 'El progreso cambió; vuelve a intentar la operación.' });
            return;
        }
        if ((progressWithEvents.processedClientEventIds ?? []).includes(clientEventId)) {
            const selection = replaySelection(progressWithEvents, clientEventId);
            if (!selection) {
                res.status(409).json({ error: 'clientEventId ya fue utilizado por otro evento.' });
                return;
            }
            res.json({
                idempotent: true,
                selection,
                simulation: simulationSummary(progressWithEvents),
            });
            return;
        }

        const existingDecision = progressWithEvents.simulationDecisions.find((storedDecision) => (
            storedDecision.scenarioId === TRAINING_SIMULATION.id
            && storedDecision.decisionId === decision.id
        ));
        const nextDecisionId = getNextSimulationDecisionId(progressWithEvents.simulationDecisions);
        if (!existingDecision && nextDecisionId !== decision.id) {
            res.status(409).json({ error: 'Debe completar las decisiones de la simulación en orden.' });
            return;
        }

        const now = new Date();
        const zone = getCampusZone('simulation-lab');
        const commonUpdate = {
            moduleVersion: validation.value.moduleVersion,
            worldVersion: validation.value.worldVersion,
            status: 'in_progress' as const,
            lastLocation: {
                worldId: CAMPUS_MANIFEST.worldId,
                worldVersion: validation.value.worldVersion,
                zoneId: zone.id,
                spawnId: zone.defaultSpawnId,
                savedAt: now,
            },
            lastSavedAt: now,
        };
        const eventPush = {
            processedClientEventIds: {
                $each: [clientEventId],
                $slice: -MAX_STORED_EVENTS,
            },
        };
        const progressFilter = {
            _id: progressWithEvents._id,
            status: { $nin: ['approved', 'failed'] },
            processedClientEventIds: { $ne: clientEventId },
        };
        const updatedProgress = existingDecision
            ? await TrainingProgress.findOneAndUpdate(
                {
                    ...progressFilter,
                    simulationDecisions: {
                        $elemMatch: {
                            scenarioId: TRAINING_SIMULATION.id,
                            decisionId: decision.id,
                        },
                    },
                },
                {
                    $set: {
                        ...commonUpdate,
                        'simulationDecisions.$[target].selectedOptionId': option.id,
                        'simulationDecisions.$[target].timestamp': now,
                        'simulationDecisions.$[target].clientEventId': clientEventId,
                        'simulationDecisions.$[target].moduleVersion': validation.value.moduleVersion,
                        'simulationDecisions.$[target].worldVersion': validation.value.worldVersion,
                        'simulationDecisions.$[target].zoneId': validation.value.zoneId,
                    },
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $push: eventPush,
                },
                {
                    new: true,
                    runValidators: true,
                    arrayFilters: [{
                        'target.scenarioId': TRAINING_SIMULATION.id,
                        'target.decisionId': decision.id,
                    }],
                },
            )
            : await TrainingProgress.findOneAndUpdate(
                {
                    ...progressFilter,
                    simulationDecisions: {
                        $not: {
                            $elemMatch: {
                                scenarioId: TRAINING_SIMULATION.id,
                                decisionId: decision.id,
                            },
                        },
                    },
                },
                {
                    $set: commonUpdate,
                    $max: { durationSeconds: validation.value.durationSeconds },
                    $push: {
                        simulationDecisions: {
                            participantId: progressWithEvents.participantId,
                            clientEventId,
                            moduleVersion: validation.value.moduleVersion,
                            worldVersion: validation.value.worldVersion,
                            zoneId: validation.value.zoneId,
                            scenarioId: TRAINING_SIMULATION.id,
                            decisionId: decision.id,
                            selectedOptionId: option.id,
                            timestamp: now,
                        },
                        ...eventPush,
                    },
                },
                { new: true, runValidators: true },
            );
        if (!updatedProgress) {
            const current = await TrainingProgress.findById(progressWithEvents._id)
                .select('+processedClientEventIds');
            if (current?.processedClientEventIds.includes(clientEventId)) {
                const selection = replaySelection(current, clientEventId);
                if (!selection) {
                    res.status(409).json({ error: 'clientEventId ya fue utilizado por otro evento.' });
                    return;
                }
                res.json({
                    idempotent: true,
                    selection,
                    simulation: simulationSummary(current),
                });
                return;
            }
            res.status(409).json({ error: 'El progreso cambió; vuelve a intentar la operación.' });
            return;
        }

        res.status(201).json({
            idempotent: false,
            selection: {
                decisionId: decision.id,
                selectedOptionId: option.id,
                feedback: option.feedback,
                recommended: option.recommended,
            },
            simulation: simulationSummary(updatedProgress),
        });
    } catch (error: unknown) {
        console.error('Error guardando decisión de simulación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
