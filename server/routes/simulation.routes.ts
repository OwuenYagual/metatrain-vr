import { Router } from 'express';
import type { Request, Response } from 'express';
import { CAMPUS_MANIFEST, getCampusZone } from '../../shared/campus';
import TrainingContent from '../models/content.model';
import TrainingProgress, { type ITrainingProgress } from '../models/progress.model';
import { authenticate } from '../middleware/auth.middleware';
import { createRateLimit } from '../middleware/rateLimit.middleware';
import { readRequiredString } from '../utils/validation';
import {
    getCompletedSimulationDecisionIds,
    getNextSimulationDecisionId,
    getSimulationDecision,
    getSimulationOption,
    publicSimulationScenario,
    SIMULATION_DECISION_IDS,
    TRAINING_SIMULATION,
    validateSimulationDecisionInput,
} from '../domain/simulation';
import { progressIdentityFilter } from '../domain/campusAccess';
import {
    getModuleInteractionObjectIds,
    TRAINING_MODULE_ID,
} from '../../shared/trainingModule';

const router = Router();
const decisionRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 30 });
const MAX_STORED_EVENTS = 1000;

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

router.get('/:moduleId', async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = readSupportedModuleId(req, res);
        if (!moduleId) return;
        const progress = await getGuidedRouteProgress(req.auth!.id, moduleId, res);
        if (!progress) return;
        res.json({ scenario: publicSimulationScenario(), simulation: simulationSummary(progress) });
    } catch (error: unknown) {
        console.error('Error obteniendo simulación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

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
