import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, Line, OrbitControls, useGLTF } from '@react-three/drei';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { interactionSystem } from './interactionSystem';
import { useTrainingStore } from '../store/useTrainingStore';
import { PerformanceMonitor } from './performanceMonitor';
import {
    getCompletedTrainingRouteSegmentCount,
    isTrainingStationUnlocked,
    TRAINING_STATIONS,
} from '../../shared/trainingModule';
import { getCompletedStationIds } from '../progress/contentProgress';
import {
    CorporateOffice,
    OfficeStationModel,
    type StationVariant,
} from './OfficeEnvironment';
import { OFFICE_MODEL_PATH_LIST } from './officeAssets';
import './TrainingScene.css';

type InteractiveProps = {
    position: readonly [number, number, number];
    id: string;
    title: string;
    variant: StationVariant;
    guide: (typeof TRAINING_STATIONS)[number]['guide'];
    onOpen: () => void;
};

type TrainingSceneProps = {
    onStationOpen?: () => void;
};

const GUIDE_POSITION: [number, number, number] = [1.05, 0, 0.25];
const OVERVIEW_CAMERA_POSITION = new Vector3(0, 6.1, 11.5);
const OVERVIEW_CAMERA_TARGET = new Vector3(0, 0.55, 0);
const CAMERA_TRANSITION_SECONDS = 0.8;
const FOCUS_CAMERA_DISTANCE = 6.3;

type CameraFocusProps = {
    focusPosition: readonly [number, number, number] | null;
    controlsRef: { current: OrbitControlsImpl | null };
};

function CameraFocusController({ focusPosition, controlsRef }: CameraFocusProps) {
    const transition = useRef({
        key: 'overview',
        elapsed: CAMERA_TRANSITION_SECONDS,
        active: false,
        fromPosition: OVERVIEW_CAMERA_POSITION.clone(),
        fromTarget: OVERVIEW_CAMERA_TARGET.clone(),
        toPosition: OVERVIEW_CAMERA_POSITION.clone(),
        toTarget: OVERVIEW_CAMERA_TARGET.clone(),
    });

    useFrame(({ camera }, delta) => {
        const controls = controlsRef.current;
        if (!controls) return;

        const nextKey = focusPosition ? focusPosition.join(':') : 'overview';
        if (transition.current.key !== nextKey) {
            transition.current.key = nextKey;
            transition.current.elapsed = 0;
            transition.current.active = true;
            transition.current.fromPosition.copy(camera.position);
            transition.current.fromTarget.copy(controls.target);

            if (focusPosition) {
                transition.current.toPosition.set(
                    focusPosition[0] + 0.45,
                    3.45,
                    focusPosition[2] + FOCUS_CAMERA_DISTANCE,
                );
                transition.current.toTarget.set(
                    focusPosition[0] + 0.45,
                    0.65,
                    focusPosition[2],
                );
            } else {
                transition.current.toPosition.copy(OVERVIEW_CAMERA_POSITION);
                transition.current.toTarget.copy(OVERVIEW_CAMERA_TARGET);
            }
            controls.enabled = false;
        }

        if (!transition.current.active) return;

        transition.current.elapsed = Math.min(
            CAMERA_TRANSITION_SECONDS,
            transition.current.elapsed + delta,
        );
        const progress = transition.current.elapsed / CAMERA_TRANSITION_SECONDS;
        const easedProgress = 1 - ((1 - progress) ** 3);
        camera.position.lerpVectors(
            transition.current.fromPosition,
            transition.current.toPosition,
            easedProgress,
        );
        controls.target.lerpVectors(
            transition.current.fromTarget,
            transition.current.toTarget,
            easedProgress,
        );
        controls.update();

        if (progress >= 1) {
            transition.current.active = false;
            controls.enabled = true;
        }
    });

    return null;
}

function TrainingCamera({ focusPosition }: { focusPosition: CameraFocusProps['focusPosition'] }) {
    const controlsRef = useRef<OrbitControlsImpl>(null);

    return (
        <>
            <OrbitControls
                ref={controlsRef}
                makeDefault
                target={[0, 0.55, 0]}
                maxPolarAngle={Math.PI / 2 - 0.05}
                minDistance={4}
                maxDistance={17}
            />
            <CameraFocusController focusPosition={focusPosition} controlsRef={controlsRef} />
        </>
    );
}

function NpcGuideModel({ color, unlocked }: { color: string; unlocked: boolean }) {
    const uniformColor = unlocked ? color : '#94a3b8';
    const markerColor = unlocked ? '#22c55e' : '#64748b';

    return (
        <group position={GUIDE_POSITION}>
            <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <ringGeometry args={[0.38, 0.48, 32]} />
                <meshStandardMaterial
                    color={markerColor}
                    emissive={unlocked ? '#166534' : '#000000'}
                    emissiveIntensity={unlocked ? 0.35 : 0}
                />
            </mesh>
            <mesh position={[-0.13, 0.3, 0]} castShadow>
                <capsuleGeometry args={[0.09, 0.38, 6, 12]} />
                <meshStandardMaterial color="#273449" roughness={0.85} />
            </mesh>
            <mesh position={[0.13, 0.3, 0]} castShadow>
                <capsuleGeometry args={[0.09, 0.38, 6, 12]} />
                <meshStandardMaterial color="#273449" roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.9, 0]} castShadow>
                <capsuleGeometry args={[0.28, 0.62, 8, 16]} />
                <meshStandardMaterial color={uniformColor} roughness={0.72} />
            </mesh>
            <mesh position={[-0.34, 0.93, 0]} rotation={[0, 0, -0.18]} castShadow>
                <capsuleGeometry args={[0.075, 0.48, 6, 12]} />
                <meshStandardMaterial color={uniformColor} roughness={0.72} />
            </mesh>
            <mesh position={[0.34, 0.93, 0]} rotation={[0, 0, 0.18]} castShadow>
                <capsuleGeometry args={[0.075, 0.48, 6, 12]} />
                <meshStandardMaterial color={uniformColor} roughness={0.72} />
            </mesh>
            <mesh position={[0, 1.55, 0]} castShadow>
                <sphereGeometry args={[0.27, 20, 16]} />
                <meshStandardMaterial color="#d8a47f" roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.72, -0.12]} scale={[1.03, 0.55, 0.75]} castShadow>
                <sphereGeometry args={[0.275, 20, 16]} />
                <meshStandardMaterial color="#312e2b" roughness={0.95} />
            </mesh>
            <mesh position={[-0.075, 1.59, 0.245]}>
                <sphereGeometry args={[0.024, 10, 8]} />
                <meshStandardMaterial color="#172033" />
            </mesh>
            <mesh position={[0.075, 1.59, 0.245]}>
                <sphereGeometry args={[0.024, 10, 8]} />
                <meshStandardMaterial color="#172033" />
            </mesh>
            <mesh position={[0, 1.02, 0.282]}>
                <boxGeometry args={[0.22, 0.13, 0.025]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.6} />
            </mesh>
        </group>
    );
}

function CompletedMarker() {
    return (
        <>
            <mesh position={[0, -0.48, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.72, 0.07, 12, 32]} />
                <meshStandardMaterial color="#22c55e" emissive="#166534" emissiveIntensity={0.65} />
            </mesh>
            <mesh position={[0, 0.9, 0]}>
                <octahedronGeometry args={[0.18]} />
                <meshStandardMaterial color="#22c55e" emissive="#166534" emissiveIntensity={0.75} />
            </mesh>
        </>
    );
}

function NpcDialogueBubble({ stationId, guide }: { stationId: string; guide: InteractiveProps['guide'] }) {
    const speech = useTrainingStore((state) => state.activeNpcSpeech);
    if (!speech || speech.stationId !== stationId) return null;

    return (
        <Html
            position={[GUIDE_POSITION[0] - 0.75, 2.85, GUIDE_POSITION[2]]}
            center
            distanceFactor={6.5}
            style={{ pointerEvents: 'none' }}
        >
            <article
                className={`station-dialogue-bubble is-${speech.kind}`}
                key={speech.bubbleId}
                role="status"
                aria-label={`${guide.name}. ${speech.fullText}`}
            >
                <span className="station-dialogue-speaker">{guide.name}</span>
                <p aria-hidden="true">
                    {speech.visibleText}
                    {speech.typing && <span className="station-dialogue-cursor">▌</span>}
                </p>
            </article>
        </Html>
    );
}

function StationTrigger({ position, id, title, variant, guide, onOpen }: InteractiveProps) {
    const [hovered, setHovered] = useState(false);
    const contents = useTrainingStore((state) => state.contents);
    const completedContentIds = useTrainingStore((state) => state.completedContentIds);
    const setActiveContent = useTrainingStore((state) => state.setActiveContent);
    const activeContent = useTrainingStore((state) => state.activeContent);
    const linkedContent = contents.find((content) => content.interactionObjectId === id);
    const completed = linkedContent ? completedContentIds.includes(linkedContent._id) : false;
    const completedStationIds = getCompletedStationIds(contents, completedContentIds);
    const unlocked = Boolean(linkedContent) && isTrainingStationUnlocked(id, completedStationIds);
    const active = activeContent?.interactionObjectId === id;

    const openStation = () => {
        if (!unlocked) return;

        void interactionSystem.registerInteraction(id, 'click').catch((error: unknown) => {
            console.error('No se pudo registrar la interacción:', error);
        });

        if (!linkedContent) {
            console.warn(`No existe contenido asociado a ${id} (${title}).`);
            return;
        }

        setActiveContent(linkedContent);
        onOpen();
        void interactionSystem.registerInteraction(id, 'content_opened').catch((error: unknown) => {
            console.error('No se pudo registrar la apertura del contenido:', error);
        });
    };

    const handleClick = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        openStation();
    };

    return (
        <group
            position={[...position] as [number, number, number]}
            visible={!activeContent || active}
            scale={hovered && unlocked ? 1.15 : 1}
            onClick={handleClick}
            onPointerOver={(event) => {
                event.stopPropagation();
                if (!unlocked) return;
                setHovered(true);
                document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
                setHovered(false);
                document.body.style.cursor = 'auto';
            }}
        >
            <OfficeStationModel variant={variant} />
            <NpcGuideModel color={guide.color} unlocked={unlocked} />
            {completed && <CompletedMarker />}
            {active && <NpcDialogueBubble stationId={id} guide={guide} />}
            {unlocked && !completed && !activeContent && (
                <Html position={[GUIDE_POSITION[0], 2.15, GUIDE_POSITION[2]]} center distanceFactor={7} style={{ pointerEvents: 'auto' }}>
                    <button
                        type="button"
                        className={`station-label ${hovered ? 'is-hovered' : ''}`}
                        data-station-id={id}
                        aria-label={`Habla con ${guide.name} sobre ${title}.`}
                        onClick={(event) => {
                            event.stopPropagation();
                            openStation();
                        }}
                    >
                        Habla con <strong>{guide.name}</strong> sobre <span>{title}</span>.
                    </button>
                </Html>
            )}
        </group>
    );
}

function TrainingRoute() {
    const contents = useTrainingStore((state) => state.contents);
    const completedContentIds = useTrainingStore((state) => state.completedContentIds);
    const activeContent = useTrainingStore((state) => state.activeContent);
    const completedStationIds = getCompletedStationIds(contents, completedContentIds);
    const completedSegmentCount = getCompletedTrainingRouteSegmentCount(completedStationIds);

    if (activeContent) return null;

    return (
        <group>
            {TRAINING_STATIONS.slice(0, -1).map((station, index) => {
                const nextStation = TRAINING_STATIONS[index + 1];
                const completed = index < completedSegmentCount;
                return (
                    <Line
                        key={`${station.id}-${nextStation.id}`}
                        points={[
                            [station.position[0], -0.4, station.position[2]],
                            [nextStation.position[0], -0.4, nextStation.position[2]],
                        ]}
                        color={completed ? '#16a34a' : '#94a3b8'}
                        lineWidth={completed ? 4 : 3}
                        dashed
                        dashSize={0.32}
                        gapSize={0.2}
                        transparent
                        opacity={completed ? 0.94 : 0.52}
                    />
                );
            })}
        </group>
    );
}

function supportsWebGL(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

export default function TrainingScene({ onStationOpen = () => undefined }: TrainingSceneProps) {
    const [lowPerformanceMode, setLowPerformanceMode] = useState(false);
    const webGlAvailable = useMemo(() => supportsWebGL(), []);
    const activeContent = useTrainingStore((state) => state.activeContent);
    const focusPosition = useMemo(() => (
        TRAINING_STATIONS.find(({ id }) => id === activeContent?.interactionObjectId)?.position ?? null
    ), [activeContent?.interactionObjectId]);

    if (!webGlAvailable) {
        return (
            <section role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Este dispositivo no soporta el entorno 3D</h2>
                <p>Actualiza el navegador o habilita la aceleración gráfica para continuar.</p>
                <button type="button" onClick={() => window.location.reload()}>Reintentar</button>
            </section>
        );
    }

    return (
        <>
            {lowPerformanceMode && (
                <div
                    className="performance-mode-indicator"
                    role="status"
                    aria-label="Modo rendimiento activado"
                    title="Modo rendimiento activado"
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4.4 16.5a8 8 0 1 1 15.2 0" />
                        <path d="m12 13 4-4" />
                        <circle cx="12" cy="13" r="1.35" />
                    </svg>
                </div>
            )}
            <Canvas shadows={!lowPerformanceMode} camera={{ position: [0, 6.1, 11.5], fov: 50 }} dpr={lowPerformanceMode ? 1 : [1, 1.5]}>
                <color attach="background" args={['#cfe3f4']} />
                <ambientLight intensity={lowPerformanceMode ? 0.9 : 0.65} />
                {!lowPerformanceMode && <directionalLight position={[4, 8, 4]} intensity={1.2} castShadow />}
                <TrainingCamera focusPosition={focusPosition} />
                <PerformanceMonitor onLowPerformance={() => setLowPerformanceMode(true)} />

                <Suspense fallback={null}>
                    <CorporateOffice />
                    <TrainingRoute />
                    {TRAINING_STATIONS.map((station) => (
                        <StationTrigger key={station.id} {...station} onOpen={onStationOpen} />
                    ))}
                </Suspense>
            </Canvas>
        </>
    );
}

OFFICE_MODEL_PATH_LIST.forEach((path) => useGLTF.preload(path));
