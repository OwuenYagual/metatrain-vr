import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Participant from '../models/participant.model';
import { isAvatarId } from '../domain/avatars';
import { authenticate, canAccessParticipant } from '../middleware/auth.middleware';
import { toParticipantDto } from '../utils/participantDto';

const router = Router();

router.patch('/:id/avatar', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = String(req.params.id);
        const { avatarId } = req.body as { avatarId?: unknown };

        if (!mongoose.isValidObjectId(id)) {
            res.status(400).json({ error: 'ID de participante inválido.' });
            return;
        }
        if (!canAccessParticipant(req, id)) {
            res.status(403).json({ error: 'No puede modificar el avatar de otro participante.' });
            return;
        }
        if (!isAvatarId(avatarId)) {
            res.status(400).json({ error: 'ID de avatar inválido.' });
            return;
        }

        const participant = await Participant.findByIdAndUpdate(
            id,
            { avatarId },
            { new: true, runValidators: true }
        );

        if (!participant) {
            res.status(404).json({ error: 'Participante no encontrado.' });
            return;
        }

        res.json({ message: 'Avatar actualizado exitosamente', participant: toParticipantDto(participant) });
    } catch (error: unknown) {
        console.error('Error actualizando avatar:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
