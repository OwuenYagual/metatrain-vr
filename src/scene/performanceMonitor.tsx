import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { APP_CONFIG } from '../config/appConfig';

export function PerformanceMonitor({ onLowPerformance }: { onLowPerformance: () => void }) {
    const frameCount = useRef(0);
    const lastSampleAt = useRef(0);
    const lowPerformanceDuration = useRef(0);
    const activated = useRef(false);

    useFrame(() => {
        frameCount.current += 1;
        const now = performance.now();
        if (lastSampleAt.current === 0) {
            lastSampleAt.current = now;
            return;
        }
        const elapsed = now - lastSampleAt.current;
        if (elapsed < 1000) return;

        const fps = frameCount.current * 1000 / elapsed;
        frameCount.current = 0;
        lastSampleAt.current = now;

        lowPerformanceDuration.current = fps < APP_CONFIG.LOW_PERFORMANCE_FPS
            ? lowPerformanceDuration.current + elapsed
            : 0;

        if (!activated.current && lowPerformanceDuration.current >= APP_CONFIG.LOW_PERFORMANCE_DURATION_MS) {
            activated.current = true;
            onLowPerformance();
        }
    });

    return null;
}
