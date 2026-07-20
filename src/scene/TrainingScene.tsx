import { Suspense, useMemo, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import { interactionSystem } from './interactionSystem';
import { useTrainingStore } from '../store/useTrainingStore';
import { PerformanceMonitor } from './performanceMonitor';
import {
    getNextTrainingCheckpointId,
    TRAINING_CHECKPOINTS,
    TRAINING_STATIONS,
} from '../../shared/trainingModule';
import { progressService } from '../progress/progressService';
import { APP_CONFIG } from '../config/appConfig';
import { getErrorMessage } from '../api/apiClient';
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
};

type TrainingSceneProps = {
    onCheckpointSaved: (message: string) => void;
    onCheckpointError: (message: string) => void;
};

type CheckpointProps = {
    checkpoint: (typeof TRAINING_CHECKPOINTS)[number];
    index: number;
    onSaved: (message: string) => void;
    onError: (message: string) => void;
};

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

function StationTrigger({ position, id, title, variant }: InteractiveProps) {
    const [hovered, setHovered] = useState(false);
    const { contents, completedContentIds, setActiveContent } = useTrainingStore();
    const linkedContent = contents.find((content) => content.interactionObjectId === id);
    const completed = linkedContent ? completedContentIds.includes(linkedContent._id) : false;

    const openStation = () => {
        void interactionSystem.registerInteraction(id, 'click').catch((error: unknown) => {
            console.error('No se pudo registrar la interacción:', error);
        });

        if (!linkedContent) {
            console.warn(`No existe contenido asociado a ${id} (${title}).`);
            return;
        }

        setActiveContent(linkedContent);
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
            scale={hovered ? 1.15 : 1}
            onClick={handleClick}
            onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(true);
                document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
                setHovered(false);
                document.body.style.cursor = 'auto';
            }}
        >
            <OfficeStationModel variant={variant} />
            {completed && <CompletedMarker />}
            <Html position={[0, 1.85, 0]} center distanceFactor={7} style={{ pointerEvents: 'auto' }}>
                <button
                    type="button"
                    className={`station-label ${hovered ? 'is-hovered' : ''} ${completed ? 'is-completed' : ''}`}
                    data-station-id={id}
                    aria-label={`Iniciar ${title}`}
                    onClick={(event) => {
                        event.stopPropagation();
                        openStation();
                    }}
                >
                    <span>{completed ? '✓ Superada' : 'Actividad'}</span>
                    <strong>{title}</strong>
                </button>
            </Html>
        </group>
    );
}

function CheckpointTrigger({ checkpoint, index, onSaved, onError }: CheckpointProps) {
    const [hovered, setHovered] = useState(false);
    const [saving, setSaving] = useState(false);
    const { visitedCheckpointIds, setVisitedCheckpointIds } = useTrainingStore();
    const visited = visitedCheckpointIds.includes(checkpoint.id);
    const nextCheckpointId = getNextTrainingCheckpointId(visitedCheckpointIds);
    const available = !visited && checkpoint.id === nextCheckpointId;
    const locked = !visited && !available;
    const markerColor = visited ? '#22c55e' : available ? '#2563eb' : '#64748b';

    const saveCheckpoint = async () => {
        if (saving) return;
        if (visited) {
            onSaved(`El checkpoint “${checkpoint.label}” ya está registrado.`);
            return;
        }
        if (locked) {
            const previousCheckpoint = TRAINING_CHECKPOINTS[index - 1];
            onError(`Primero visita el checkpoint “${previousCheckpoint?.label ?? 'anterior'}”.`);
            return;
        }

        setSaving(true);
        try {
            const progress = await progressService.markCheckpointVisited(
                APP_CONFIG.TRAINING_MODULE_ID,
                checkpoint.id,
            );
            setVisitedCheckpointIds(progress.visitedCheckpoints);
            onSaved(`Checkpoint “${checkpoint.label}” registrado correctamente.`);
            void interactionSystem.registerInteraction(checkpoint.id, 'click').catch((error: unknown) => {
                console.error('No se pudo registrar la interacción del checkpoint:', error);
            });
        } catch (error: unknown) {
            onError(getErrorMessage(error, 'No se pudo guardar el checkpoint.'));
        } finally {
            setSaving(false);
        }
    };

    const handleClick = async (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        await saveCheckpoint();
    };

    return (
        <group
            position={[...checkpoint.position] as [number, number, number]}
            scale={hovered && !locked ? 1.12 : 1}
            onClick={(event) => void handleClick(event)}
            onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(true);
                document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
                setHovered(false);
                document.body.style.cursor = 'auto';
            }}
        >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.38, 0.58, 32]} />
                <meshStandardMaterial
                    color={markerColor}
                    emissive={available || visited ? markerColor : '#000000'}
                    emissiveIntensity={available || visited ? 0.55 : 0}
                    transparent={locked}
                    opacity={locked ? 0.45 : 1}
                />
            </mesh>
            <mesh position={[0, 0.42, 0]}>
                <cylinderGeometry args={[0.09, 0.18, 0.8, 8]} />
                <meshStandardMaterial
                    color={saving ? '#eab308' : markerColor}
                    emissive={available || visited ? markerColor : '#000000'}
                    emissiveIntensity={available || visited ? 0.45 : 0}
                    transparent={locked}
                    opacity={locked ? 0.45 : 1}
                />
            </mesh>
            {(available || visited) && (
                <Html position={[0, 1.05, 0]} center distanceFactor={8} style={{ pointerEvents: 'auto' }}>
                    <button
                        type="button"
                        className={`checkpoint-label ${visited ? 'is-visited' : ''}`}
                        data-checkpoint-id={checkpoint.id}
                        aria-label={`${visited ? 'Recorrido visitado' : 'Registrar recorrido'}: ${checkpoint.label}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            void saveCheckpoint();
                        }}
                    >
                        {visited ? '✓' : `${index + 1}`} · {checkpoint.label}
                    </button>
                </Html>
            )}
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

export default function TrainingScene({ onCheckpointSaved, onCheckpointError }: TrainingSceneProps) {
    const [lowPerformanceMode, setLowPerformanceMode] = useState(false);
    const webGlAvailable = useMemo(() => supportsWebGL(), []);

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
                <p style={{ position: 'absolute', right: 20, top: 20, zIndex: 11, padding: '0.5rem 0.75rem', background: '#fffbeb', color: '#92400e', borderRadius: 6 }}>
                    Modo rendimiento activado
                </p>
            )}
            <Canvas shadows={!lowPerformanceMode} camera={{ position: [0, 6.1, 11.5], fov: 50 }} dpr={lowPerformanceMode ? 1 : [1, 1.5]}>
                <color attach="background" args={['#cfe3f4']} />
                <ambientLight intensity={lowPerformanceMode ? 0.9 : 0.65} />
                {!lowPerformanceMode && <directionalLight position={[4, 8, 4]} intensity={1.2} castShadow />}
                <OrbitControls makeDefault target={[0, 0.55, 0]} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={4} maxDistance={17} />
                <PerformanceMonitor onLowPerformance={() => setLowPerformanceMode(true)} />

                <Suspense fallback={null}>
                    <CorporateOffice />
                    {TRAINING_STATIONS.map((station) => <StationTrigger key={station.id} {...station} />)}
                    {TRAINING_CHECKPOINTS.map((checkpoint, index) => (
                        <CheckpointTrigger
                            key={checkpoint.id}
                            checkpoint={checkpoint}
                            index={index}
                            onSaved={onCheckpointSaved}
                            onError={onCheckpointError}
                        />
                    ))}
                </Suspense>
            </Canvas>
        </>
    );
}

OFFICE_MODEL_PATH_LIST.forEach((path) => useGLTF.preload(path));
