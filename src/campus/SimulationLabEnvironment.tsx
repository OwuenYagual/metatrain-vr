import { useEffect, useState, type ReactNode } from 'react';
import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { Vector3Tuple } from '../../shared/campus';
import {
    getSimulationLabStageVisualStatus,
    SIMULATION_LAB_STAGE_IDS,
    SIMULATION_LAB_STAGE_POSITIONS,
    type SimulationLabSceneState,
    type SimulationLabStageId,
    type SimulationLabStageVisualStatus,
} from './simulationLabScene';
import { CampusAvatar } from './CampusAvatar';

type StageConfig = {
    id: SimulationLabStageId;
    title: string;
    time: string;
    accent: string;
    position: Vector3Tuple;
};

const STAGE_CONFIGS: readonly StageConfig[] = [
    {
        id: 'data_protection',
        title: 'Datos y correo',
        time: '08:30',
        accent: '#38bdf8',
        position: SIMULATION_LAB_STAGE_POSITIONS.data_protection,
    },
    {
        id: 'human_resources',
        title: 'Talento Humano',
        time: '10:30',
        accent: '#a78bfa',
        position: SIMULATION_LAB_STAGE_POSITIONS.human_resources,
    },
    {
        id: 'operations',
        title: 'Operaciones',
        time: '13:30',
        accent: '#fb923c',
        position: SIMULATION_LAB_STAGE_POSITIONS.operations,
    },
    {
        id: 'workplace_safety',
        title: 'Seguridad y apoyo',
        time: '15:30',
        accent: '#facc15',
        position: SIMULATION_LAB_STAGE_POSITIONS.workplace_safety,
    },
];

const TERMINAL_POSITION: Vector3Tuple = [0, 0, -1.25];

function getStatusColor(status: SimulationLabStageVisualStatus, accent: string): string {
    if (status === 'completed') return '#22c55e';
    if (status === 'correction-required') return '#f59e0b';
    if (status === 'active') return accent;
    return '#64748b';
}

function getStatusLabel(status: SimulationLabStageVisualStatus): string {
    if (status === 'completed') return 'Situación resuelta';
    if (status === 'correction-required') return 'Acción correctiva pendiente';
    if (status === 'active') return 'Objetivo actual';
    return 'Pendiente';
}

function CompletionMark({ color }: { color: string }) {
    return (
        <group position={[0, 0.03, 0.01]}>
            <mesh position={[-0.075, -0.025, 0]} rotation={[0, 0, -0.7]}>
                <boxGeometry args={[0.06, 0.2, 0.035]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} />
            </mesh>
            <mesh position={[0.075, 0.045, 0]} rotation={[0, 0, 0.72]}>
                <boxGeometry args={[0.06, 0.32, 0.035]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} />
            </mesh>
        </group>
    );
}

function CorrectionMark() {
    return (
        <group>
            <mesh position={[0, 0.07, 0]}>
                <boxGeometry args={[0.065, 0.23, 0.04]} />
                <meshStandardMaterial color="#fff7ed" emissive="#f59e0b" emissiveIntensity={0.35} />
            </mesh>
            <mesh position={[0, -0.11, 0]}>
                <sphereGeometry args={[0.045, 10, 8]} />
                <meshStandardMaterial color="#fff7ed" emissive="#f59e0b" emissiveIntensity={0.35} />
            </mesh>
        </group>
    );
}

function StageStatusMarker({
    status,
    color,
}: {
    status: SimulationLabStageVisualStatus;
    color: string;
}) {
    return (
        <group position={[0, 1.92, -0.32]}>
            <mesh>
                <circleGeometry args={[0.24, 20]} />
                <meshStandardMaterial
                    color="#0f172a"
                    emissive={color}
                    emissiveIntensity={status === 'pending' ? 0.08 : 0.28}
                />
            </mesh>
            <mesh position={[0, 0, 0.012]}>
                <ringGeometry args={[0.205, 0.24, 20]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
            </mesh>
            {status === 'completed' && <CompletionMark color="#dcfce7" />}
            {status === 'correction-required' && <CorrectionMark />}
            {status === 'active' && (
                <mesh position={[0, 0, 0.02]}>
                    <octahedronGeometry args={[0.105]} />
                    <meshStandardMaterial color="#f8fafc" emissive={color} emissiveIntensity={0.8} />
                </mesh>
            )}
        </group>
    );
}

function StageLabel({
    config,
    status,
}: {
    config: StageConfig;
    status: SimulationLabStageVisualStatus;
}) {
    const color = getStatusColor(status, config.accent);
    return (
        <Html
            position={[0, 2.38, 0]}
            center
            distanceFactor={8}
            zIndexRange={[9, 5]}
            style={{ pointerEvents: 'none' }}
        >
            <span
                className="campus-world-label is-station-title"
                style={{
                    borderColor: color,
                    boxShadow: status === 'active' || status === 'correction-required'
                        ? `0 0 20px ${color}66`
                        : undefined,
                    color: status === 'pending' ? '#cbd5e1' : '#f8fafc',
                }}
            >
                <small style={{ color, marginRight: '0.38rem' }}>{config.time}</small>
                {config.title}
                <small style={{ display: 'block', marginTop: '0.16rem', color }}>
                    {getStatusLabel(status)}
                </small>
            </span>
        </Html>
    );
}

function StageShell({
    config,
    status,
    lowQuality,
    hideLabel,
    onInteract,
    children,
}: {
    config: StageConfig;
    status: SimulationLabStageVisualStatus;
    lowQuality: boolean;
    hideLabel: boolean;
    onInteract?: (stageId: SimulationLabStageId) => void;
    children: ReactNode;
}) {
    const [hovered, setHovered] = useState(false);
    const rotationY = Math.atan2(-config.position[0], -config.position[2]);
    const interactive = (status === 'active' || status === 'correction-required') && Boolean(onInteract);
    const color = getStatusColor(status, config.accent);

    useEffect(() => () => {
        if (hovered) document.body.style.cursor = 'auto';
    }, [hovered]);

    const handleClick = (event: ThreeEvent<MouseEvent>) => {
        if (!interactive) return;
        event.stopPropagation();
        onInteract?.(config.id);
    };

    return (
        <group
            position={[config.position[0], config.position[1], config.position[2]]}
            rotation={[0, rotationY, 0]}
            onClick={interactive ? handleClick : undefined}
            onPointerOver={interactive ? (event) => {
                event.stopPropagation();
                setHovered(true);
                document.body.style.cursor = 'pointer';
            } : undefined}
            onPointerOut={interactive ? () => {
                setHovered(false);
                document.body.style.cursor = 'auto';
            } : undefined}
        >
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[1.15, 0.52, 0.72]} position={[0, 0.52, -0.04]} />
            </RigidBody>
            <mesh position={[0, 0.025, 0]} receiveShadow>
                <cylinderGeometry args={[1.28, 1.38, 0.05, 12]} />
                <meshStandardMaterial
                    color={status === 'pending' ? '#1e293b' : '#172033'}
                    emissive={color}
                    emissiveIntensity={status === 'pending' ? 0.02 : hovered ? 0.38 : 0.18}
                    roughness={0.72}
                />
            </mesh>
            {(status === 'active' || status === 'correction-required') && (
                <mesh position={[0, 0.058, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[1.02, 1.17, 28]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.75} />
                </mesh>
            )}
            {status === 'completed' && (
                <mesh position={[0, 0.058, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[1.02, 1.17, 28]} />
                    <meshStandardMaterial color="#22c55e" emissive="#15803d" emissiveIntensity={0.42} />
                </mesh>
            )}
            {!lowQuality && status !== 'pending' && (
                <pointLight position={[0, 1.45, 0.45]} color={color} intensity={1.1} distance={3.2} />
            )}
            <group userData={{ cameraBlocker: true }}>{children}</group>
            <StageStatusMarker status={status} color={color} />
            {!hideLabel && <StageLabel config={config} status={status} />}
        </group>
    );
}

function DataAndMailStation({ status }: { status: SimulationLabStageVisualStatus }) {
    const screen = status === 'completed'
        ? '#86efac'
        : status === 'correction-required'
            ? '#fbbf24'
            : '#7dd3fc';
    return (
        <>
            <mesh position={[0, 0.68, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.95, 0.12, 0.92]} />
                <meshStandardMaterial color="#475569" roughness={0.68} />
            </mesh>
            {[-0.78, 0.78].map((x) => (
                <mesh key={x} position={[x, 0.34, -0.26]} castShadow>
                    <boxGeometry args={[0.11, 0.68, 0.11]} />
                    <meshStandardMaterial color="#334155" metalness={0.28} roughness={0.55} />
                </mesh>
            ))}
            <mesh position={[0, 1.18, -0.28]} rotation={[-0.08, 0, 0]} castShadow>
                <boxGeometry args={[1.16, 0.7, 0.08]} />
                <meshStandardMaterial color="#0f172a" roughness={0.48} />
            </mesh>
            <mesh position={[0, 1.18, -0.23]} rotation={[-0.08, 0, 0]}>
                <planeGeometry args={[1.02, 0.56]} />
                <meshStandardMaterial color={screen} emissive={screen} emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0, 0.82, -0.28]}>
                <boxGeometry args={[0.08, 0.25, 0.08]} />
                <meshStandardMaterial color="#64748b" metalness={0.4} />
            </mesh>
            <group position={[0.52, 0.78, 0.22]} rotation={[-Math.PI / 2, 0, -0.18]}>
                <mesh>
                    <boxGeometry args={[0.48, 0.32, 0.035]} />
                    <meshStandardMaterial color="#f8fafc" roughness={0.72} />
                </mesh>
                <Line points={[[-0.23, 0.14, 0.023], [0, -0.02, 0.023], [0.23, 0.14, 0.023]]} color="#38bdf8" lineWidth={2} />
            </group>
        </>
    );
}

function PeopleDirectoryStation({ status }: { status: SimulationLabStageVisualStatus }) {
    const accent = getStatusColor(status, '#a78bfa');
    return (
        <>
            <group position={[-0.72, 0.88, -0.12]}>
                <CampusAvatar avatarId="avatar_02" motion="idle" />
            </group>
            <mesh position={[0.56, 0.94, -0.2]} castShadow>
                <boxGeometry args={[0.92, 1.55, 0.18]} />
                <meshStandardMaterial color="#334155" roughness={0.62} />
            </mesh>
            <mesh position={[0.56, 1.02, -0.09]}>
                <planeGeometry args={[0.72, 1.16]} />
                <meshStandardMaterial color="#f8fafc" emissive={accent} emissiveIntensity={0.1} />
            </mesh>
            {[1.34, 1.03, 0.72].map((y, index) => (
                <group key={y} position={[0.56, y, -0.075]}>
                    <mesh position={[-0.23, 0, 0]}>
                        <circleGeometry args={[0.085, 12]} />
                        <meshStandardMaterial color={index === 0 ? accent : '#94a3b8'} />
                    </mesh>
                    <mesh position={[0.13, 0.045, 0]}>
                        <boxGeometry args={[0.34, 0.055, 0.018]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                    <mesh position={[0.08, -0.055, 0]}>
                        <boxGeometry args={[0.44, 0.035, 0.018]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                </group>
            ))}
        </>
    );
}

function OperationsStation({ status }: { status: SimulationLabStageVisualStatus }) {
    const accent = getStatusColor(status, '#fb923c');
    const completed = status === 'completed';
    return (
        <>
            <mesh position={[0, 1.06, -0.38]} castShadow>
                <boxGeometry args={[2.05, 1.45, 0.14]} />
                <meshStandardMaterial color="#1e293b" roughness={0.62} />
            </mesh>
            <mesh position={[0, 1.08, -0.295]}>
                <planeGeometry args={[1.82, 1.18]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.78} />
            </mesh>
            {[-0.55, 0, 0.55].map((x, column) => (
                <group key={x}>
                    <mesh position={[x, 1.52, -0.275]}>
                        <boxGeometry args={[0.43, 0.08, 0.025]} />
                        <meshStandardMaterial color={column === 1 ? accent : '#64748b'} />
                    </mesh>
                    {[1.28, 0.98, 0.68].map((y, card) => (
                        <mesh key={y} position={[x, y, -0.263]} rotation={[0, 0, (column + card) % 2 ? 0.04 : -0.035]}>
                            <boxGeometry args={[0.42, 0.2, 0.02]} />
                            <meshStandardMaterial
                                color={completed && column === 2 ? '#86efac' : card === 1 ? '#fde68a' : '#bfdbfe'}
                                roughness={0.76}
                            />
                        </mesh>
                    ))}
                </group>
            ))}
            <mesh position={[0, 0.35, 0.35]} castShadow>
                <boxGeometry args={[1.55, 0.62, 0.62]} />
                <meshStandardMaterial color="#475569" roughness={0.7} />
            </mesh>
        </>
    );
}

function SafetyStation({ status }: { status: SimulationLabStageVisualStatus }) {
    const corrected = status === 'completed';
    const accent = corrected ? '#22c55e' : status === 'correction-required' ? '#f97316' : '#facc15';
    return (
        <>
            <mesh position={[-0.2, 0.045, 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.68, 22]} />
                <meshStandardMaterial
                    color={corrected ? '#14532d' : '#0e7490'}
                    emissive={accent}
                    emissiveIntensity={corrected ? 0.08 : 0.18}
                    transparent
                    opacity={corrected ? 0.28 : 0.62}
                />
            </mesh>
            {[-0.72, 0.64].map((x) => (
                <group key={x} position={[x, 0, 0.22]}>
                    <mesh position={[0, 0.32, 0]} castShadow>
                        <coneGeometry args={[0.24, 0.64, 10]} />
                        <meshStandardMaterial color={accent} roughness={0.7} />
                    </mesh>
                    <mesh position={[0, 0.12, 0]}>
                        <torusGeometry args={[0.17, 0.035, 8, 14]} />
                        <meshStandardMaterial color="#f8fafc" />
                    </mesh>
                </group>
            ))}
            <mesh position={[0.72, 0.72, -0.28]} castShadow>
                <boxGeometry args={[0.54, 1.18, 0.22]} />
                <meshStandardMaterial color="#334155" roughness={0.62} />
            </mesh>
            <mesh position={[0.72, 0.87, -0.155]}>
                <planeGeometry args={[0.38, 0.48]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.38} />
            </mesh>
            <mesh position={[0.72, 0.42, -0.14]}>
                <circleGeometry args={[0.1, 16]} />
                <meshStandardMaterial color="#f8fafc" emissive={accent} emissiveIntensity={0.24} />
            </mesh>
        </>
    );
}

function CentralSimulationTerminal({ sceneState }: { sceneState?: SimulationLabSceneState }) {
    const completed = sceneState?.stages.length === SIMULATION_LAB_STAGE_IDS.length
        && sceneState.stages.every((stage) => stage.status === 'completed');
    const currentConfig = STAGE_CONFIGS.find(({ id }) => id === sceneState?.currentStageId);
    const screenColor = completed ? '#86efac' : currentConfig?.accent ?? '#67e8f9';
    return (
        <>
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[1.3, 0.62, 0.7]} position={[0, 0.62, -1.25]} />
            </RigidBody>
            <mesh position={[0, 0.6, -1.25]} castShadow userData={{ cameraBlocker: true }}>
                <cylinderGeometry args={[1.1, 1.4, 1.2, 8]} />
                <meshStandardMaterial
                    color={sceneState?.activeRun ? '#1e3a5f' : '#0e7490'}
                    metalness={0.35}
                    roughness={0.42}
                />
            </mesh>
            <mesh position={[0, 1.5, -1.25]} rotation={[-0.22, 0, 0]}>
                <boxGeometry args={[1.5, 0.88, 0.08]} />
                <meshStandardMaterial color={screenColor} emissive={screenColor} emissiveIntensity={0.65} />
            </mesh>
            <mesh position={[0, 0.08, -1.25]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.42, 1.5, 28]} />
                <meshStandardMaterial
                    color={screenColor}
                    emissive={screenColor}
                    emissiveIntensity={sceneState?.activeRun ? 0.18 : 0.55}
                />
            </mesh>
        </>
    );
}

export function SimulationLabEnvironment({
    lowQuality,
    sceneState,
    hideLabels = false,
    onStageInteract,
}: {
    lowQuality: boolean;
    sceneState?: SimulationLabSceneState;
    hideLabels?: boolean;
    onStageInteract?: (stageId: SimulationLabStageId) => void;
}) {
    const currentConfig = STAGE_CONFIGS.find(({ id }) => id === sceneState?.currentStageId);
    return (
        <>
            {currentConfig && sceneState?.activeRun && (
                <>
                    <Line
                        points={[
                            [TERMINAL_POSITION[0], 0.033, TERMINAL_POSITION[2]],
                            [currentConfig.position[0], 0.033, currentConfig.position[2]],
                        ]}
                        color="#020617"
                        lineWidth={7}
                        dashed
                        dashSize={0.34}
                        gapSize={0.14}
                    />
                    <Line
                        points={[
                            [TERMINAL_POSITION[0], 0.042, TERMINAL_POSITION[2]],
                            [currentConfig.position[0], 0.042, currentConfig.position[2]],
                        ]}
                        color={getStatusColor(
                            getSimulationLabStageVisualStatus(sceneState, currentConfig.id),
                            currentConfig.accent,
                        )}
                        lineWidth={4}
                        dashed
                        dashSize={0.34}
                        gapSize={0.14}
                    />
                </>
            )}
            {STAGE_CONFIGS.map((config) => {
                const status = getSimulationLabStageVisualStatus(sceneState, config.id);
                return (
                    <StageShell
                        key={config.id}
                        config={config}
                        status={status}
                        lowQuality={lowQuality}
                        hideLabel={hideLabels}
                        onInteract={onStageInteract}
                    >
                        {config.id === 'data_protection' && <DataAndMailStation status={status} />}
                        {config.id === 'human_resources' && <PeopleDirectoryStation status={status} />}
                        {config.id === 'operations' && <OperationsStation status={status} />}
                        {config.id === 'workplace_safety' && <SafetyStation status={status} />}
                    </StageShell>
                );
            })}
            <CentralSimulationTerminal sceneState={sceneState} />
        </>
    );
}
