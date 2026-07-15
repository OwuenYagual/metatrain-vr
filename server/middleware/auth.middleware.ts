import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type AuthIdentity = {
    id: string;
    role: 'participant' | 'admin';
};

declare module 'express-serve-static-core' {
    interface Request {
        auth?: AuthIdentity;
    }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
    const authorization = req.header('authorization');
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
        res.status(401).json({ error: 'Autenticación requerida.' });
        return;
    }

    try {
        const payload = jwt.verify(token, env.jwtSecret);
        if (typeof payload === 'string' || !payload.sub || !['participant', 'admin'].includes(String(payload.role))) {
            throw new Error('Token sin identidad válida.');
        }

        req.auth = {
            id: String(payload.sub),
            role: payload.role as AuthIdentity['role'],
        };
        next();
    } catch {
        res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }
}

export function requireRole(...allowedRoles: AuthIdentity['role'][]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.auth || !allowedRoles.includes(req.auth.role)) {
            res.status(403).json({ error: 'No tiene permisos para realizar esta acción.' });
            return;
        }
        next();
    };
}

export function canAccessParticipant(req: Request, participantId: string): boolean {
    return Boolean(req.auth && (req.auth.role === 'admin' || req.auth.id === participantId));
}
