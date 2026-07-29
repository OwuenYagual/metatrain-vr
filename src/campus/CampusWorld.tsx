import {
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type RefObject,
} from 'react';
import { AdaptiveDpr, useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import type { AvatarId } from '../auth/authService';
import type {
    CampusProgressState,
    CampusZoneId,
    SpawnManifest,
} from '../../shared/campus';
import { OFFICE_MODEL_PATH_LIST } from '../scene/officeAssets';
import { PerformanceMonitor } from '../scene/performanceMonitor';
import type { CampusMovementState } from './campusControls';
import { CampusPlayer, type CampusCameraMode } from './CampusPlayer';
import {
    CampusZoneEnvironment,
} from './CampusZones';
import type { CampusInteractionTarget } from './campusTargets';

type ZoneVisualSettings = {
    background: string;
    fog: string;
    ambient: number;
    sun: string;
};

const ZONE_VISUALS: Record<CampusZoneId, ZoneVisualSettings> = {
    lobby: { background: '#b9ddf1', fog: '#c7e2f1', ambient: 0.72, sun: '#fff7d6' },
    'induction-office': { background: '#cfe3f4', fog: '#dbeaf4', ambient: 0.78, sun: '#fff7e5' },
    'simulation-lab': { background: '#081426', fog: '#0e2137', ambient: 0.44, sun: '#67e8f9' },
    'assessment-room': { background: '#dbe7f0', fog: '#e2e8f0', ambient: 0.7, sun: '#ffffff' },
};

function SceneDiagnostics({ zoneId }: { zoneId: CampusZoneId }) {
    const { gl } = useThree();
    useEffect(() => {
        const canvas = gl.domElement;
        const handleLost = (event: Event) => {
            event.preventDefault();
            console.error('El contexto WebGL del campus se perdió.', { zoneId });
        };
        const handleRestored = () => {
            console.info('El contexto WebGL del campus fue restaurado.', { zoneId });
        };
        canvas.addEventListener('webglcontextlost', handleLost);
        canvas.addEventListener('webglcontextrestored', handleRestored);
        return () => {
            canvas.removeEventListener('webglcontextlost', handleLost);
            canvas.removeEventListener('webglcontextrestored', handleRestored);
        };
    }, [gl.domElement, zoneId]);
    return null;
}

function preloadNextZoneAssets(zoneId: CampusZoneId, progress: CampusProgressState): void {
    const inductionCanLoad = zoneId === 'lobby' || zoneId === 'induction-office';
    if (inductionCanLoad || progress.trainingCompleted) {
        OFFICE_MODEL_PATH_LIST.forEach((path) => useGLTF.preload(path));
    }
}

function supportsWebGL(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

export function CampusWorld({
    zoneId,
    spawn,
    avatarId,
    progress,
    completedStationIds,
    targets,
    movementRef,
    cameraMode,
    paused,
    nearbyTargetId,
    onNearbyTargetChange,
    onInteract,
    onStep,
    onCanvasReady,
    onQualityChange,
}: {
    zoneId: CampusZoneId;
    spawn: SpawnManifest;
    avatarId: AvatarId;
    progress: CampusProgressState;
    completedStationIds: readonly string[];
    targets: readonly CampusInteractionTarget[];
    movementRef: RefObject<CampusMovementState>;
    cameraMode: CampusCameraMode;
    paused: boolean;
    nearbyTargetId: string | null;
    onNearbyTargetChange: (target: CampusInteractionTarget | null) => void;
    onInteract: (target: CampusInteractionTarget) => void;
    onStep: () => void;
    onCanvasReady: (canvas: HTMLCanvasElement) => void;
    onQualityChange: (quality: 'high' | 'adaptive') => void;
}) {
    const [lowQuality, setLowQuality] = useState(false);
    const webGlAvailable = useMemo(() => supportsWebGL(), []);
    const visuals = ZONE_VISUALS[zoneId];

    useEffect(() => {
        preloadNextZoneAssets(zoneId, progress);
    }, [progress, zoneId]);

    const handleLowPerformance = useCallback(() => {
        setLowQuality(true);
        console.info('Calidad del campus ajustada al modo adaptable.', { zoneId });
        onQualityChange('adaptive');
    }, [onQualityChange, zoneId]);

    if (!webGlAvailable) {
        return (
            <section className="campus-webgl-error" role="alert">
                <h2>Este dispositivo no soporta el campus 3D</h2>
                <p>Actualiza el navegador o habilita la aceleración gráfica para continuar.</p>
                <button type="button" onClick={() => window.location.reload()}>Reintentar</button>
            </section>
        );
    }

    return (
        <Canvas
            className="campus-canvas"
            aria-label={`Campus 3D: ${zoneId}`}
            shadows={!lowQuality}
            dpr={lowQuality ? 1 : [1, 1.5]}
            camera={{ fov: 52, near: 0.08, far: 70 }}
            gl={{
                antialias: !lowQuality,
                powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => onCanvasReady(gl.domElement)}
        >
            <color attach="background" args={[visuals.background]} />
            <fog attach="fog" args={[visuals.fog, 12, 34]} />
            <ambientLight intensity={lowQuality ? visuals.ambient + 0.2 : visuals.ambient} />
            {!lowQuality && (
                <directionalLight
                    color={visuals.sun}
                    position={[4, 8, 5]}
                    intensity={1.35}
                    castShadow
                    shadow-mapSize={[1024, 1024]}
                    shadow-camera-far={22}
                />
            )}
            <hemisphereLight args={[visuals.sun, '#172033', lowQuality ? 0.6 : 0.42]} />
            <SceneDiagnostics zoneId={zoneId} />
            <AdaptiveDpr pixelated />
            <PerformanceMonitor onLowPerformance={handleLowPerformance} />
            <Suspense fallback={null}>
                <Physics gravity={[0, -9.81, 0]} timeStep="vary">
                    <CampusZoneEnvironment
                        zoneId={zoneId}
                        progress={progress}
                        completedStationIds={completedStationIds}
                        targets={targets}
                        nearbyTargetId={nearbyTargetId}
                        lowQuality={lowQuality}
                        onInteract={onInteract}
                    />
                    <CampusPlayer
                        avatarId={avatarId}
                        spawn={spawn}
                        movementRef={movementRef}
                        cameraMode={cameraMode}
                        paused={paused}
                        targets={targets}
                        onNearbyTargetChange={onNearbyTargetChange}
                        onStep={onStep}
                    />
                </Physics>
            </Suspense>
        </Canvas>
    );
}
