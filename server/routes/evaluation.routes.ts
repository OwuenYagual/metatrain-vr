import { Router } from 'express';
import type { Request, Response } from 'express';
import { CAMPUS_MANIFEST, getCampusZone } from '../../shared/campus';
import EvaluationResult, { type IEvaluationResult } from '../models/evaluation.model';
import Question from '../models/question.model';
import TrainingContent from '../models/content.model';
import TrainingProgress, { type ITrainingProgress } from '../models/progress.model';
import { authenticate } from '../middleware/auth.middleware';
import { createRateLimit } from '../middleware/rateLimit.middleware';
import {
    calculateEvaluationScore,
    summarizeEvaluationRequirements,
    validateEvaluationSubmission,
} from '../domain/evaluation';
import { readRequiredString } from '../utils/validation';
import {
    getModuleInteractionObjectIds,
    MIN_PASSING_SCORE,
} from '../../shared/trainingModule';
import { getCompletedSimulationDecisionIds, SIMULATION_DECISION_IDS } from '../domain/simulation';
import { progressIdentityFilter } from '../domain/campusAccess';

const router = Router();
const evaluationSubmitRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 10 });

router.use(authenticate);

function evaluationSummary(result: IEvaluationResult) {
    return {
        id: result._id,
        moduleId: result.moduleId,
        totalQuestions: result.totalQuestions,
        correctAnswers: result.correctAnswers,
        score: result.score,
        status: result.status,
        createdAt: result.createdAt,
    };
}

async function readModuleId(req: Request, res: Response): Promise<string | null> {
    const validation = readRequiredString(req.params.moduleId, 'moduleId', 100);
    if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return null;
    }
    if (!getModuleInteractionObjectIds(validation.value)) {
        res.status(404).json({ error: 'La evaluación no está disponible para este módulo.' });
        return null;
    }
    return validation.value;
}

async function getEligibleProgress(
    participantId: string,
    moduleId: string,
    res: Response,
): Promise<ITrainingProgress | null> {
    const interactionObjectIds = getModuleInteractionObjectIds(moduleId)!;
    const requiredContents = await TrainingContent.find({
        moduleId,
        active: true,
        interactionObjectId: { $in: interactionObjectIds },
    }).select('_id').lean();

    if (requiredContents.length !== interactionObjectIds.length) {
        res.status(503).json({ error: 'El módulo no tiene configurados todos sus contenidos requeridos.' });
        return null;
    }

    const progress = await TrainingProgress.findOne(progressIdentityFilter(participantId, moduleId));
    const hasPreviousEvaluation = Boolean(await EvaluationResult.exists({ participantId, moduleId }));
    const requiredSimulationDecisionIds = hasPreviousEvaluation ? [] : SIMULATION_DECISION_IDS;
    const requirements = summarizeEvaluationRequirements({
        requiredContentIds: requiredContents.map((content) => String(content._id)),
        completedContentIds: progress?.completedContents ?? [],
        requiredSimulationDecisionIds,
        completedSimulationDecisionIds: progress
            ? getCompletedSimulationDecisionIds(progress.simulationDecisions)
            : [],
        simulationGrandfathered: hasPreviousEvaluation,
    });

    if (!progress || !requirements.eligible) {
        res.status(409).json({
            error: 'Completa las cinco actividades y la simulación antes de iniciar la evaluación.',
            requirements,
        });
        return null;
    }
    return progress;
}

async function getActiveQuestions(moduleId: string) {
    return Question.find({ moduleId, active: true }).sort({ _id: 1 });
}

router.get('/:moduleId/questions', async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = await readModuleId(req, res);
        if (!moduleId) return;
        const progress = await getEligibleProgress(req.auth!.id, moduleId, res);
        if (!progress) return;

        const questions = await getActiveQuestions(moduleId);
        if (questions.length === 0) {
            res.status(503).json({ error: 'La evaluación no tiene preguntas activas.' });
            return;
        }

        res.json({
            passingScore: MIN_PASSING_SCORE,
            questions: questions.map((question) => ({
                id: String(question._id),
                text: question.text,
                options: question.options.map((option) => ({ id: option.id, text: option.text })),
            })),
        });
    } catch (error: unknown) {
        console.error('Error obteniendo preguntas de evaluación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/:moduleId/result', async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = await readModuleId(req, res);
        if (!moduleId) return;
        const result = await EvaluationResult.findOne({ participantId: req.auth!.id, moduleId })
            .sort({ createdAt: -1, _id: -1 });
        if (!result) {
            res.status(404).json({ error: 'Todavía no existe un resultado para esta evaluación.' });
            return;
        }
        res.json({ result: evaluationSummary(result) });
    } catch (error: unknown) {
        console.error('Error obteniendo resultado de evaluación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/:moduleId/submit', evaluationSubmitRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = await readModuleId(req, res);
        if (!moduleId) return;
        const submission = validateEvaluationSubmission(req.body);
        if (!submission.ok) {
            res.status(400).json({ error: submission.error });
            return;
        }
        const input = req.body as Record<string, unknown>;
        const moduleVersion = input.moduleVersion ?? CAMPUS_MANIFEST.moduleVersion;
        const worldVersion = input.worldVersion ?? CAMPUS_MANIFEST.worldVersion;
        const zoneId = input.zoneId ?? 'assessment-room';
        const durationSeconds = input.durationSeconds ?? 0;
        if (moduleVersion !== CAMPUS_MANIFEST.moduleVersion
            || worldVersion !== CAMPUS_MANIFEST.worldVersion
            || zoneId !== 'assessment-room') {
            res.status(409).json({ error: 'La evaluación no pertenece al mundo, módulo o zona activos.' });
            return;
        }
        if (!Number.isInteger(durationSeconds) || Number(durationSeconds) < 0) {
            res.status(400).json({ error: 'durationSeconds no es válido.' });
            return;
        }

        const progress = await getEligibleProgress(req.auth!.id, moduleId, res);
        if (!progress) return;
        if (progress.status === 'approved') {
            res.status(409).json({ error: 'La evaluación ya fue aprobada.' });
            return;
        }

        const questions = await getActiveQuestions(moduleId);
        const scoreResult = calculateEvaluationScore(
            questions.map((question) => ({
                id: String(question._id),
                optionIds: question.options.map((option) => option.id),
                correctOptionId: question.correctOptionId,
            })),
            submission.value.answers,
            MIN_PASSING_SCORE,
        );
        if (!scoreResult.ok) {
            res.status(400).json({ error: scoreResult.error });
            return;
        }

        const result = await EvaluationResult.create({
            participantId: req.auth!.id,
            moduleId,
            ...scoreResult.value,
        });
        try {
            const now = new Date();
            const zone = getCampusZone('assessment-room');
            const updatedProgress = await TrainingProgress.findOneAndUpdate(
                {
                    _id: progress._id,
                    ...(scoreResult.value.status === 'failed' ? { status: { $ne: 'approved' } } : {}),
                },
                {
                    $set: {
                        moduleVersion: CAMPUS_MANIFEST.moduleVersion,
                        worldVersion: CAMPUS_MANIFEST.worldVersion,
                        ...(scoreResult.value.status === 'failed'
                            ? { score: scoreResult.value.score }
                            : {}),
                        status: scoreResult.value.status,
                        lastLocation: {
                            worldId: CAMPUS_MANIFEST.worldId,
                            worldVersion: CAMPUS_MANIFEST.worldVersion,
                            zoneId: zone.id,
                            spawnId: zone.defaultSpawnId,
                            savedAt: now,
                        },
                        lastSavedAt: now,
                    },
                    $max: {
                        durationSeconds: Number(durationSeconds),
                        ...(scoreResult.value.status === 'approved'
                            ? { score: scoreResult.value.score }
                            : {}),
                    },
                },
                { new: true, runValidators: true },
            );
            if (!updatedProgress) {
                const current = await TrainingProgress.findById(progress._id);
                if (current?.status === 'approved' && scoreResult.value.status === 'failed') {
                    await EvaluationResult.deleteOne({ _id: result._id });
                    const approvedResult = await EvaluationResult.findOne({
                        participantId: req.auth!.id,
                        moduleId,
                        status: 'approved',
                    }).sort({ score: -1, createdAt: -1, _id: -1 });
                    if (!approvedResult) throw new Error('APPROVED_RESULT_NOT_FOUND');
                    res.json({ result: evaluationSummary(approvedResult) });
                    return;
                }
                if (!current || current.status !== 'approved') {
                    throw new Error('PROGRESS_CONCURRENTLY_CHANGED');
                }
            }
        } catch (error: unknown) {
            await EvaluationResult.deleteOne({ _id: result._id });
            throw error;
        }

        res.status(201).json({ result: evaluationSummary(result) });
    } catch (error: unknown) {
        console.error('Error calificando evaluación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
