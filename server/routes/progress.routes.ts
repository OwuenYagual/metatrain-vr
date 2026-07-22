import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import TrainingProgress, { type ITrainingProgress } from '../models/progress.model';
import TrainingContent from '../models/content.model';
import { authenticate, canAccessParticipant } from '../middleware/auth.middleware';
import { validateInteractionInput, validateProgressItemInput } from '../domain/progress';
import { readRequiredString } from '../utils/validation';
import {
    getModuleInteractionObjectIds,
    getPreviousTrainingStationId,
} from '../../shared/trainingModule';
import { getCompletedSimulationDecisionIds, SIMULATION_DECISION_IDS } from '../domain/simulation';

const router = Router();
const MAX_STORED_INTERACTIONS = 1000;

router.use(authenticate);

function progressSummary(progress: ITrainingProgress) {
    const completedSimulationDecisionIds = getCompletedSimulationDecisionIds(progress.simulationDecisions);
    return {
        participantId: progress.participantId,
        moduleId: progress.moduleId,
        completedContents: progress.completedContents,
        interactionCount: progress.interactions.length,
        simulationDecisionCount: progress.simulationDecisions.length,
        completedSimulationDecisionIds,
        simulationCompleted: completedSimulationDecisionIds.length === SIMULATION_DECISION_IDS.length,
        score: progress.score,
        status: progress.status,
        durationSeconds: progress.durationSeconds,
        lastSavedAt: progress.lastSavedAt,
    };
}

async function getEditableProgress(participantId: string, moduleId: string): Promise<ITrainingProgress> {
    let progress = await TrainingProgress.findOne({ participantId, moduleId });
    if (!progress) {
        progress = new TrainingProgress({ participantId, moduleId, status: 'in_progress' });
    }

    if (progress.status === 'approved' || progress.status === 'failed') {
        throw new Error('PROGRESS_FINALIZED');
    }

    progress.status = 'in_progress';
    progress.lastSavedAt = new Date();
    return progress;
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

        const progress = await TrainingProgress.findOne({ participantId, moduleId: moduleValidation.value });
        if (!progress) {
            res.status(404).json({ error: 'Progreso no encontrado.' });
            return;
        }

        res.json(progressSummary(progress));
    } catch (error: unknown) {
        console.error('Error obteniendo progreso:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/interaction', async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = validateInteractionInput(req.body);
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }

        const progress = await getEditableProgress(req.auth!.id, validation.value.moduleId);
        progress.interactions.push({
            objectId: validation.value.objectId,
            eventType: validation.value.eventType,
            timestamp: new Date(),
        });
        if (progress.interactions.length > MAX_STORED_INTERACTIONS) {
            progress.interactions.splice(0, progress.interactions.length - MAX_STORED_INTERACTIONS);
        }
        await progress.save();

        res.status(201).json({ progress: progressSummary(progress) });
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'PROGRESS_FINALIZED') {
            res.status(409).json({ error: 'El progreso del módulo ya está finalizado.' });
            return;
        }
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

        const progress = await getEditableProgress(req.auth!.id, validation.value.moduleId);
        const alreadyCompleted = progress.completedContents.includes(validation.value.itemId);
        if (!alreadyCompleted) {
            const previousStationId = getPreviousTrainingStationId(content.interactionObjectId);
            if (previousStationId) {
                const previousContent = await TrainingContent.findOne({
                    moduleId: validation.value.moduleId,
                    interactionObjectId: previousStationId,
                    active: true,
                }).select('_id');
                if (!previousContent || !progress.completedContents.includes(String(previousContent._id))) {
                    res.status(409).json({
                        error: 'Completa la estación anterior antes de guardar esta capacitación.',
                    });
                    return;
                }
            }
            progress.completedContents.push(validation.value.itemId);
        }
        await progress.save();
        res.status(200).json({ progress: progressSummary(progress) });
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'PROGRESS_FINALIZED') {
            res.status(409).json({ error: 'El progreso del módulo ya está finalizado.' });
            return;
        }
        console.error('Error marcando contenido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
