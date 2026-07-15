import { Router } from 'express';
import type { Request, Response } from 'express';
import { AVAILABLE_AVATARS } from '../domain/avatars';

const router = Router();

// Endpoint: GET /api/avatars
// Devuelve las opciones estáticas disponibles 
router.get('/', (_req: Request, res: Response) => {
    res.json(AVAILABLE_AVATARS);
});

export default router;
