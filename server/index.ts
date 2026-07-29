import mongoose from 'mongoose';
import { env } from './config/env';
import { app } from './app';
import { migrateLegacyProgress } from './migrations/progress.migration';

async function startServer(): Promise<void> {
    await mongoose.connect(env.mongoUri);
    await migrateLegacyProgress();
    console.log('Conexión a MongoDB exitosa');
    app.listen(env.port, () => {
        console.log(`Servidor backend corriendo en http://localhost:${env.port}`);
    });
}

startServer().catch((error: unknown) => {
    console.error('Error iniciando el servidor:', error);
    process.exitCode = 1;
});

