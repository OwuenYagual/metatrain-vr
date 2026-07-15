import { Suspense, useMemo, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { interactionSystem } from './interactionSystem';
import { useTrainingStore } from '../store/useTrainingStore';
import { PerformanceMonitor } from './performanceMonitor';
import { TRAINING_STATIONS } from '../../shared/trainingModule';

type StationVariant = 'manual' | 'folder' | 'board' | 'shield' | 'terminal';

type InteractiveProps = {
    position: readonly [number, number, number];
    id: string;
    title: string;
    variant: StationVariant;
};

function OfficeRoom() {
    const { scene } = useGLTF('/models/room.glb');
    const room = useMemo(() => scene.clone(true), [scene]);
    return <primitive object={room} position={[0, -1.5, 0]} scale={1} />;
}

function ManualModel() {
    const { scene } = useGLTF('/models/manual.glb');
    const manual = useMemo(() => scene.clone(true), [scene]);
    return <primitive object={manual} scale={0.8} />;
}

function StationVisual({ variant, completed }: { variant: StationVariant; completed: boolean }) {
    if (variant === 'manual') return <ManualModel />;

    const colors: Record<Exclude<StationVariant, 'manual'>, string> = {
        folder: '#eab308',
        board: '#0f766e',
        shield: '#2563eb',
        terminal: '#334155',
    };

    return (
        <mesh castShadow>
            {variant === 'terminal' ? <boxGeometry args={[0.9, 0.65, 0.25]} /> : null}
            {variant === 'folder' ? <boxGeometry args={[0.8, 0.55, 0.18]} /> : null}
            {variant === 'board' ? <boxGeometry args={[1.1, 0.65, 0.12]} /> : null}
            {variant === 'shield' ? <cylinderGeometry args={[0.45, 0.55, 0.18, 6]} /> : null}
            <meshStandardMaterial
                color={completed ? '#16a34a' : colors[variant]}
                emissive={completed ? '#14532d' : '#000000'}
                emissiveIntensity={completed ? 0.35 : 0}
                roughness={0.55}
                metalness={0.1}
            />
        </mesh>
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

function StationTrigger({ position, id, title, variant }: InteractiveProps) {
    const [hovered, setHovered] = useState(false);
    const { contents, completedContentIds, setActiveContent } = useTrainingStore();
    const linkedContent = contents.find((content) => content.interactionObjectId === id);
    const completed = linkedContent ? completedContentIds.includes(linkedContent._id) : false;

    const handleClick = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
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
            <StationVisual variant={variant} completed={completed} />
            {completed && <CompletedMarker />}
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

export default function TrainingScene() {
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
            <Canvas camera={{ position: [0, 4, 6], fov: 50 }} dpr={lowPerformanceMode ? 1 : [1, 1.5]}>
                <color attach="background" args={['#dbeafe']} />
                <ambientLight intensity={lowPerformanceMode ? 0.9 : 0.65} />
                {!lowPerformanceMode && <directionalLight position={[4, 8, 4]} intensity={1.2} castShadow />}
                <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={12} />
                <PerformanceMonitor onLowPerformance={() => setLowPerformanceMode(true)} />

                <Suspense fallback={null}>
                    <OfficeRoom />
                    {TRAINING_STATIONS.map((station) => <StationTrigger key={station.id} {...station} />)}
                </Suspense>
            </Canvas>
        </>
    );
}

useGLTF.preload('/models/room.glb');
useGLTF.preload('/models/manual.glb');
