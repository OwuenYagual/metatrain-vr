import { Router } from 'express';
import type { Request, Response } from 'express';
import TrainingContent from '../models/content.model';
import TrainingProgress, { type ITrainingProgress, type ISimulationDecision } from '../models/progress.model';
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
import {
    getModuleCheckpointIds,
    getModuleInteractionObjectIds,
    TRAINING_MODULE_ID,
} from '../../shared/trainingModule';

const router = Router();
const decisionRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 30 });

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
    const checkpointIds = getModuleCheckpointIds(moduleId)!;
    const contents = await TrainingContent.find({
        moduleId,
        active: true,
        interactionObjectId: { $in: interactionObjectIds },
    }).select('_id').lean();
    if (contents.length !== interactionObjectIds.length) {
        res.status(503).json({ error: 'El módulo no tiene configurados todos sus contenidos requeridos.' });
        return null;
    }

    const progress = await TrainingProgress.findOne({ participantId, moduleId });
    const completedContents = new Set(progress?.completedContents ?? []);
    const visitedCheckpoints = new Set(progress?.visitedCheckpoints ?? []);
    const requiredContentIds = contents.map((content) => String(content._id));
    const contentsCompleted = requiredContentIds.filter((contentId) => completedContents.has(contentId)).length;
    const checkpointsCompleted = checkpointIds.filter((checkpointId) => visitedCheckpoints.has(checkpointId)).length;
    if (!progress || contentsCompleted !== requiredContentIds.length || checkpointsCompleted !== checkpointIds.length) {
        res.status(409).json({
            error: 'Completa los cinco contenidos y los cuatro checkpoints antes de iniciar la simulación.',
            requirements: {
                contents: { completed: contentsCompleted, required: requiredContentIds.length },
                checkpoints: { completed: checkpointsCompleted, required: checkpointIds.length },
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

        const existingDecision = progress.simulationDecisions.find((storedDecision) => (
            storedDecision.scenarioId === TRAINING_SIMULATION.id
            && storedDecision.decisionId === decision.id
        ));
        const nextDecisionId = getNextSimulationDecisionId(progress.simulationDecisions);
        if (!existingDecision && nextDecisionId !== decision.id) {
            res.status(409).json({ error: 'Debe completar las decisiones de la simulación en orden.' });
            return;
        }

        if (existingDecision) {
            existingDecision.selectedOptionId = option.id;
            existingDecision.timestamp = new Date();
        } else {
            progress.simulationDecisions.push({
                participantId: progress.participantId,
                scenarioId: TRAINING_SIMULATION.id,
                decisionId: decision.id,
                selectedOptionId: option.id,
                timestamp: new Date(),
            } as ISimulationDecision);
        }
        progress.status = 'in_progress';
        progress.lastSavedAt = new Date();
        await progress.save();

        res.status(201).json({
            selection: {
                decisionId: decision.id,
                selectedOptionId: option.id,
                feedback: option.feedback,
                recommended: option.recommended,
            },
            simulation: simulationSummary(progress),
        });
    } catch (error: unknown) {
        console.error('Error guardando decisión de simulación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
