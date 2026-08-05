import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Router, raw, type Request, type Response } from 'express';
import {
    CAMPUS_MANIFEST,
    isCampusZoneUnlocked,
} from '../../shared/campus';
import {
    MAX_RECORDING_SECONDS,
    MAX_TRANSCRIPTION_BYTES,
    resolveNarration,
    SPEECH_LOCALE,
} from '../../shared/speech';
import { getModuleInteractionObjectIds } from '../../shared/trainingModule';
import { env } from '../config/env';
import { getCampusProgressState, progressIdentityFilter } from '../domain/campusAccess';
import { synthesizeNarration, transcribeEvaluationAnswer } from '../domain/azureSpeech';
import { authenticate } from '../middleware/auth.middleware';
import { createRateLimit } from '../middleware/rateLimit.middleware';
import TrainingContent from '../models/content.model';
import TrainingProgress from '../models/progress.model';
import Question from '../models/question.model';

const router = Router();
const narrationCache = new Map<string, Buffer>();
const narrationRateLimit = createRateLimit({
    windowMs: 60 * 1000,
    maxRequests: 60,
    key: (req) => req.auth?.id ?? 'anonymous',
});
const transcriptionRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    maxRequests: 30,
    key: (req) => req.auth?.id ?? 'anonymous',
});

router.use(authenticate);

function hasActiveCampusContext(req: Request, expectedZoneId: string): boolean {
    return req.query.moduleVersion === String(CAMPUS_MANIFEST.moduleVersion)
        && req.query.worldVersion === String(CAMPUS_MANIFEST.worldVersion)
        && req.query.zoneId === expectedZoneId;
}

router.get('/capabilities', (_req, res) => {
    res.json({
        narrationAvailable: env.speechEnabled,
        transcriptionAvailable: env.speechEnabled,
        locale: SPEECH_LOCALE,
        maxRecordingBytes: MAX_TRANSCRIPTION_BYTES,
        maxRecordingSeconds: MAX_RECORDING_SECONDS,
    });
});

router.get(
    '/narrations/:moduleId/:stationId/:bubbleId',
    narrationRateLimit,
    async (req: Request, res: Response): Promise<void> => {
        try {
            if (!env.speechEnabled) {
                res.status(503).json({ error: 'La narración por voz no está configurada.' });
                return;
            }
            if (req.params.moduleId !== CAMPUS_MANIFEST.moduleId) {
                res.status(409).json({ error: 'La narración no pertenece al mundo, módulo o zona activos.' });
                return;
            }
            const stationId = typeof req.params.stationId === 'string' ? req.params.stationId : '';
            const bubbleId = typeof req.params.bubbleId === 'string' ? req.params.bubbleId : '';
            const descriptor = resolveNarration(stationId, bubbleId);
            if (!descriptor) {
                res.status(404).json({ error: 'La narración solicitada no existe.' });
                return;
            }
            if (!hasActiveCampusContext(req, descriptor.zoneId)) {
                res.status(409).json({ error: 'La narración no pertenece al mundo, módulo o zona activos.' });
                return;
            }
            const cacheKey = [
                CAMPUS_MANIFEST.moduleVersion,
                CAMPUS_MANIFEST.worldVersion,
                descriptor.stationId,
                descriptor.bubbleId,
                descriptor.voice.voiceName,
                descriptor.voice.ratePercent,
                descriptor.voice.pitchPercent,
            ].join(':');
            const etag = `"${createHash('sha256').update(cacheKey).digest('base64url')}"`;
            if (req.header('if-none-match') === etag) {
                res.status(304).end();
                return;
            }
            let audio = narrationCache.get(cacheKey);
            if (!audio) {
                audio = await synthesizeNarration(descriptor);
                if (narrationCache.size >= 50) {
                    const oldest = narrationCache.keys().next().value as string | undefined;
                    if (oldest) narrationCache.delete(oldest);
                }
                narrationCache.set(cacheKey, audio);
            }
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Length', audio.length);
            res.setHeader('Cache-Control', 'private, max-age=86400');
            res.setHeader('ETag', etag);
            res.send(audio);
        } catch (error: unknown) {
            console.error('Error generando narración de NPC:', error);
            res.status(502).json({ error: 'No se pudo generar la narración. Intente nuevamente.' });
        }
    },
);

router.post(
    '/transcriptions',
    transcriptionRateLimit,
    raw({
        type: ['audio/webm', 'audio/ogg'],
        limit: MAX_TRANSCRIPTION_BYTES,
    }),
    async (req: Request, res: Response): Promise<void> => {
        try {
            if (!env.speechEnabled) {
                res.status(503).json({ error: 'Las respuestas por voz no están configuradas.' });
                return;
            }
            const moduleId = typeof req.query.moduleId === 'string' ? req.query.moduleId : '';
            const questionId = typeof req.query.questionId === 'string' ? req.query.questionId : '';
            if (!getModuleInteractionObjectIds(moduleId)
                || !hasActiveCampusContext(req, 'assessment-room')) {
                res.status(409).json({ error: 'La respuesta no pertenece al mundo, módulo o zona activos.' });
                return;
            }
            if (!mongoose.isValidObjectId(questionId)) {
                res.status(400).json({ error: 'questionId no es válido.' });
                return;
            }
            const contentIds = await TrainingContent.find({ moduleId, active: true })
                .where('interactionObjectId').in([...(getModuleInteractionObjectIds(moduleId) ?? [])])
                .select('_id')
                .lean();
            const progress = await TrainingProgress.findOne(progressIdentityFilter(req.auth!.id, moduleId));
            const access = getCampusProgressState(
                progress,
                contentIds.map((content) => String(content._id)),
            );
            if (!isCampusZoneUnlocked('assessment-room', access)) {
                res.status(403).json({ error: 'La evaluación todavía está bloqueada.' });
                return;
            }
            const question = await Question.findOne({ _id: questionId, moduleId, active: true })
                .select('_id')
                .lean();
            if (!question) {
                res.status(404).json({ error: 'La pregunta no pertenece a la evaluación activa.' });
                return;
            }
            const mimeType = req.header('content-type')?.split(';')[0] ?? '';
            if (!['audio/webm', 'audio/ogg'].includes(mimeType)) {
                res.status(415).json({ error: 'El formato de audio no es compatible.' });
                return;
            }
            if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
                res.status(400).json({ error: 'No se recibió audio para transcribir.' });
                return;
            }
            const result = await transcribeEvaluationAnswer(req.body, mimeType);
            if (!result.transcript) {
                res.status(422).json({ error: 'No se pudo reconocer una respuesta. Intente nuevamente.' });
                return;
            }
            res.json(result);
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'PayloadTooLargeError') {
                res.status(413).json({ error: 'La grabación supera el tamaño permitido.' });
                return;
            }
            console.error('Error transcribiendo respuesta de evaluación:', error);
            res.status(502).json({ error: 'No se pudo transcribir la respuesta. Intente nuevamente.' });
        }
    },
);

export default router;
