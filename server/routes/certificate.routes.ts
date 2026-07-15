import { Router } from 'express';
import type { Request, Response } from 'express';
import Certificate, { type ICertificate } from '../models/certificate.model';
import EvaluationResult from '../models/evaluation.model';
import Participant from '../models/participant.model';
import { authenticate } from '../middleware/auth.middleware';
import { createRateLimit } from '../middleware/rateLimit.middleware';
import { buildCertificatePdf, createCertificateId } from '../domain/certificate';
import { readRequiredString } from '../utils/validation';
import { TRAINING_MODULE_ID, TRAINING_MODULE_TITLE } from '../../shared/trainingModule';

const router = Router();
const issueRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 10 });
const verifyRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 60 });

function certificateSummary(certificate: ICertificate) {
    return {
        certificateId: certificate.certificateId,
        moduleId: certificate.moduleId,
        moduleTitle: TRAINING_MODULE_TITLE,
        score: certificate.score,
        status: certificate.status,
        issuedAt: certificate.issuedAt,
    };
}

function readSupportedModuleId(req: Request, res: Response): string | null {
    const validation = readRequiredString(req.params.moduleId, 'moduleId', 100);
    if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return null;
    }
    if (validation.value !== TRAINING_MODULE_ID) {
        res.status(404).json({ error: 'El certificado no está disponible para este módulo.' });
        return null;
    }
    return validation.value;
}

router.get('/verify/:certificateId', verifyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = readRequiredString(req.params.certificateId, 'certificateId', 100);
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }
        const certificate = await Certificate.findOne({ certificateId: validation.value, status: 'generated' });
        if (!certificate) {
            res.status(404).json({ error: 'Certificado no encontrado.' });
            return;
        }
        const participant = await Participant.findById(certificate.participantId).select('fullName');
        if (!participant) {
            res.status(404).json({ error: 'Certificado no encontrado.' });
            return;
        }
        res.json({
            certificate: {
                ...certificateSummary(certificate),
                participantName: participant.fullName,
            },
        });
    } catch (error: unknown) {
        console.error('Error verificando certificado:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/:moduleId', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = readSupportedModuleId(req, res);
        if (!moduleId) return;
        const certificate = await Certificate.findOne({ participantId: req.auth!.id, moduleId });
        if (!certificate || certificate.status !== 'generated') {
            res.status(404).json({ error: 'Todavía no existe un certificado para este módulo.' });
            return;
        }
        res.json({ certificate: certificateSummary(certificate) });
    } catch (error: unknown) {
        console.error('Error obteniendo certificado:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/:moduleId/issue', authenticate, issueRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = readSupportedModuleId(req, res);
        if (!moduleId) return;

        const existingCertificate = await Certificate.findOne({ participantId: req.auth!.id, moduleId });
        if (existingCertificate?.status === 'generated') {
            res.json({ certificate: certificateSummary(existingCertificate) });
            return;
        }

        const approvedResult = await EvaluationResult.findOne({
            participantId: req.auth!.id,
            moduleId,
            status: 'approved',
        }).sort({ createdAt: -1, _id: -1 });
        if (!approvedResult) {
            res.status(403).json({ error: 'Debe aprobar la evaluación antes de emitir el certificado.' });
            return;
        }

        const issuedAt = new Date();
        const certificate = existingCertificate ?? new Certificate({ participantId: req.auth!.id, moduleId });
        certificate.certificateId = createCertificateId(issuedAt);
        certificate.score = approvedResult.score;
        certificate.status = 'generated';
        certificate.issuedAt = issuedAt;
        certificate.reason = undefined;
        await certificate.save();
        res.status(201).json({ certificate: certificateSummary(certificate) });
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
            const moduleId = String(req.params.moduleId);
            const certificate = await Certificate.findOne({ participantId: req.auth!.id, moduleId });
            if (certificate) {
                res.json({ certificate: certificateSummary(certificate) });
                return;
            }
        }
        console.error('Error emitiendo certificado:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/:moduleId/download', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const moduleId = readSupportedModuleId(req, res);
        if (!moduleId) return;
        const certificate = await Certificate.findOne({
            participantId: req.auth!.id,
            moduleId,
            status: 'generated',
        });
        if (!certificate?.certificateId || !certificate.issuedAt) {
            res.status(404).json({ error: 'Emita el certificado antes de descargarlo.' });
            return;
        }
        const participant = await Participant.findById(req.auth!.id).select('fullName');
        if (!participant) {
            res.status(404).json({ error: 'Participante no encontrado.' });
            return;
        }

        const pdf = await buildCertificatePdf({
            certificateId: certificate.certificateId,
            participantName: participant.fullName,
            score: certificate.score,
            issuedAt: certificate.issuedAt,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="certificado-metatrain.pdf"');
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(Buffer.from(pdf));
    } catch (error: unknown) {
        console.error('Error descargando certificado:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
