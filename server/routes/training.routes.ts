import { Router } from 'express';
import type { Request, Response } from 'express';
import TrainingContent from '../models/content.model';
import { authenticate } from '../middleware/auth.middleware';
import { readRequiredString } from '../utils/validation';
import { getModuleInteractionObjectIds } from '../../shared/trainingModule';

const router = Router();

// Endpoint: GET /api/training/:moduleId/contents
router.get('/:moduleId/contents', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = readRequiredString(req.params.moduleId, 'moduleId', 100);
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }
        const interactionObjectIds = getModuleInteractionObjectIds(validation.value);
        const contents = await TrainingContent.find({
            moduleId: validation.value,
            active: true,
            ...(interactionObjectIds ? { interactionObjectId: { $in: interactionObjectIds } } : {}),
        })
            .sort({ order: 1 })
            .lean();
        res.json(contents);
    } catch (error) {
        console.error('Error obteniendo contenidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;
