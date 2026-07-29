import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import avatarRoutes from './routes/avatar.routes';
import certificateRoutes from './routes/certificate.routes';
import evaluationRoutes from './routes/evaluation.routes';
import participantRoutes from './routes/participant.routes';
import progressRoutes from './routes/progress.routes';
import simulationRoutes from './routes/simulation.routes';
import speechRoutes from './routes/speech.routes';
import trainingRoutes from './routes/training.routes';

export function createApp() {
    const app = express();

    app.use(cors({
        origin: env.corsOrigin,
        credentials: true,
    }));
    app.disable('x-powered-by');
    app.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        next();
    });
    app.use(express.json({ limit: '100kb' }));

    app.use('/api/auth', authRoutes);
    app.use('/api/progress', progressRoutes);
    app.use('/api/training', trainingRoutes);
    app.use('/api/avatars', avatarRoutes);
    app.use('/api/participants', participantRoutes);
    app.use('/api/evaluation', evaluationRoutes);
    app.use('/api/certificates', certificateRoutes);
    app.use('/api/simulation', simulationRoutes);
    app.use('/api/speech', speechRoutes);

    app.get('/api/health', (_req, res) => {
        res.json({ status: 'MetaTrain VR API funcionando correctamente' });
    });

    app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
        if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
            res.status(413).json({ error: 'La grabación supera el tamaño permitido.' });
            return;
        }
        next(error);
    });

    app.use((_req, res) => {
        res.status(404).json({ error: 'Ruta no encontrada.' });
    });

    return app;
}

export const app = createApp();
