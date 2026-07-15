import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Participant from '../models/participant.model';
import { env } from '../config/env';
import { createRateLimit } from '../middleware/rateLimit.middleware';
import { toParticipantDto } from '../utils/participantDto';
import { validateLoginInput, validateRegistrationInput } from '../utils/validation';

const router = Router();
const authRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 20 });

// Endpoint: POST /api/auth/register 
router.post('/register', authRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = validateRegistrationInput(req.body);
        if (!validation.ok) {
            res.status(400).json({ error: validation.error });
            return;
        }
        const { fullName, email, password } = validation.value;

        // Verificar si el email ya está registrado
        const existingParticipant = await Participant.findOne({ email });
        if (existingParticipant) {
            // Rechazar registro con HTTP 409 
            res.status(409).json({ error: 'Este correo ya está registrado.' });
            return;
        }

        // Hashear la contraseña
        const passwordHash = await bcrypt.hash(password, 12);

        // Crear el nuevo participante
        const newParticipant = new Participant({
            fullName,
            email,
            passwordHash
        });

        await newParticipant.save();

        res.status(201).json({ message: 'Cuenta creada exitosamente. Por favor, inicie sesión.' });
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
            res.status(409).json({ error: 'Este correo ya está registrado.' });
            return;
        }
        console.error('Error en el registro:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint: POST /api/auth/login 
router.post('/login', authRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = validateLoginInput(req.body);
        if (!validation.ok) {
            res.status(401).json({ error: validation.error });
            return;
        }
        const { email, password } = validation.value;

        // Buscar al participante
        const participant = await Participant.findOne({ email }).select('+passwordHash');
        if (!participant) {
            // Mostrar error exacto solicitado 
            res.status(401).json({ error: 'Credenciales inválidas.' }); // 
            return;
        }

        // Comparar la contraseña ingresada con el hash guardado
        const isMatch = await bcrypt.compare(password, participant.passwordHash);
        if (!isMatch) {
            res.status(401).json({ error: 'Credenciales inválidas.' });
            return;
        }

        const token = jwt.sign(
            { role: participant.role },
            env.jwtSecret,
            { subject: participant._id.toString(), expiresIn: env.jwtExpiresInSeconds }
        );

        // Calcular fecha de expiración para enviar al frontend
        const expiresAt = new Date(Date.now() + env.jwtExpiresInSeconds * 1000).toISOString();

        // Retornar la estructura AuthSession esperada por el contrato
        res.json({
            token,
            expiresAt,
            participant: toParticipantDto(participant)
        });
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint: POST /api/auth/logout 
router.post('/logout', (_req: Request, res: Response) => {
    // Con JWT, el cierre de sesión real ocurre en el frontend eliminando el token.
    // Este endpoint se provee para cumplir con el contrato de la API y permitir futuras implementaciones de listas negras de tokens si se requiere.
    res.status(204).send();
});

export default router;
