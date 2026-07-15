import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { env } from './config/env';

import authRoutes from './routes/auth.routes';
import progressRoutes from './routes/progress.routes';
import trainingRoutes from './routes/training.routes';
import avatarRoutes from './routes/avatar.routes';
import participantRoutes from './routes/participant.routes';
import evaluationRoutes from './routes/evaluation.routes';
import certificateRoutes from './routes/certificate.routes';
import simulationRoutes from './routes/simulation.routes';

const app = express();
app.use(cors({
    origin: env.corsOrigin,
    credentials: true
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

//Endpoint de prueba
app.get('/api/health', (_req, res) => {
    res.json({ status: 'MetaTrain VR API funcionando correctamente' });
});

app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
});

mongoose
    .connect(env.mongoUri)
    .then(() => {
        console.log('✅ Conexión a MongoDB exitosa');
        app.listen(env.port, () => {
            console.log(`🚀 Servidor backend corriendo en http://localhost:${env.port}`);
        });
    })
    .catch((err) => {
        console.error('❌ Error conectando a MongoDB:', err);
        process.exitCode = 1;
    });

