import { TRAINING_MODULE_ID, TRAINING_STATIONS } from '../../shared/trainingModule';

export const APP_CONFIG = {
    API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    TRAINING_MODULE_ID,
    MIN_PASSING_SCORE: 70,
    AUTOSAVE_INTERVAL_MS: 15_000,
    TARGET_FPS: 60,
    MIN_ACCEPTABLE_FPS: 30,
    LOW_PERFORMANCE_FPS: 20,
    LOW_PERFORMANCE_DURATION_MS: 10_000,
    MAX_SCENE_SIZE_MB: 25,
    MAX_TEXTURE_SIZE_PX: 2048,
    MIN_REQUIRED_INTERACTIONS: 3,
    MIN_REQUIRED_CHECKPOINTS: 4,
    MIN_REQUIRED_CONTENTS: TRAINING_STATIONS.length,
    CERTIFICATE_ENABLED: true,
    // El MVP usa puntero/raycast. Una futura entrada WebXR deberá consumir los mismos servicios de interacción.
    IMMERSIVE_INPUT_MODE: 'pointer',
} as const;
