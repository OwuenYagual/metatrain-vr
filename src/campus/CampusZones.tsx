import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Html, Line } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
    InstancedMesh,
    MathUtils,
    Matrix4,
    Vector3,
    type Camera,
    type Group,
    type Object3D,
} from 'three';
import {
    CAMPUS_GUIDE_OBJECT_ID,
    CAMPUS_GUIDE_POSITION,
    type CampusProgressState,
    type CampusZoneId,
    type Vector3Tuple,
} from '../../shared/campus';
import { TRAINING_STATIONS } from '../../shared/trainingModule';
import type { AvatarId } from '../auth/authService';
import { OfficeStationModel } from '../scene/OfficeEnvironment';
import { useTrainingStore } from '../store/useTrainingStore';
import { CampusAvatar } from './CampusAvatar';
import {
    getTrainingStationPosition,
    type CampusInteractionTarget,
} from './campusTargets';
import {
    SimulationLabEnvironment,
} from './SimulationLabEnvironment';
import type {
    SimulationLabSceneState,
    SimulationLabStageId,
} from './simulationLabScene';

const NPC_DIALOGUE_PROJECTED_POSITION = new Vector3();
const NPC_DIALOGUE_MARGIN_PX = 12;
const NPC_DIALOGUE_DESKTOP_PANEL_INSET_PX = 458;

function calculateNpcDialoguePosition(
    element: Object3D,
    camera: Camera,
    size: { width: number; height: number },
): number[] {
    NPC_DIALOGUE_PROJECTED_POSITION.setFromMatrixPosition(element.matrixWorld).project(camera);
    const projectedX = NPC_DIALOGUE_PROJECTED_POSITION.x * size.width / 2 + size.width / 2;
    const projectedY = -NPC_DIALOGUE_PROJECTED_POSITION.y * size.height / 2 + size.height / 2;
    const mobileLayout = size.width <= 760;
    const compactDesktopLayout = size.width < 1000;
    const bubbleWidth = mobileLayout
        ? size.width - NPC_DIALOGUE_MARGIN_PX * 2
        : compactDesktopLayout
            ? Math.min(300, size.width * 0.36)
            : Math.min(330, size.width * 0.42);
    const halfWidth = bubbleWidth / 2;
    const halfHeight = mobileLayout
        ? Math.min(70, size.height * 0.11)
        : Math.min(100, Math.max(72, size.height * 0.14));
    const minX = NPC_DIALOGUE_MARGIN_PX + halfWidth;
    const panelInset = mobileLayout ? NPC_DIALOGUE_MARGIN_PX : NPC_DIALOGUE_DESKTOP_PANEL_INSET_PX;
    const availableMaxX = size.width
        - panelInset
        - halfWidth;
    const maxX = Math.max(minX, availableMaxX);
    const minY = NPC_DIALOGUE_MARGIN_PX + halfHeight;
    const availableMaxY = mobileLayout
        ? size.height * 0.28 - NPC_DIALOGUE_MARGIN_PX - halfHeight
        : size.height - NPC_DIALOGUE_MARGIN_PX - halfHeight;
    const maxY = Math.max(minY, availableMaxY);

    return [
        MathUtils.clamp(projectedX, minX, maxX),
        MathUtils.clamp(projectedY, minY, maxY),
    ];
}

function RoomShell({ floor, wall }: { floor: string; wall: string }) {
    return (
        <>
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[5.25, 0.15, 5.25]} position={[0, -0.15, 0]} />
                <CuboidCollider args={[0.12, 1.65, 5.25]} position={[-5.25, 1.65, 0]} />
                <CuboidCollider args={[0.12, 1.65, 5.25]} position={[5.25, 1.65, 0]} />
                <CuboidCollider args={[5.25, 1.65, 0.12]} position={[0, 1.65, -5.25]} />
                <CuboidCollider args={[5.25, 1.65, 0.12]} position={[0, 1.65, 5.25]} />
                <CuboidCollider args={[5.25, 0.08, 5.25]} position={[0, 3.38, 0]} />
            </RigidBody>
            <mesh position={[0, -0.14, 0]} receiveShadow>
                <boxGeometry args={[10.5, 0.28, 10.5]} />
                <meshStandardMaterial color={floor} roughness={0.9} />
            </mesh>
            <mesh position={[-5.25, 1.65, 0]} receiveShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[0.24, 3.3, 10.5]} />
                <meshStandardMaterial color={wall} roughness={0.82} />
            </mesh>
            <mesh position={[5.25, 1.65, 0]} receiveShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[0.24, 3.3, 10.5]} />
                <meshStandardMaterial color={wall} roughness={0.82} />
            </mesh>
            <mesh position={[0, 1.65, -5.25]} receiveShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[10.5, 3.3, 0.24]} />
                <meshStandardMaterial color={wall} roughness={0.82} />
            </mesh>
            <mesh position={[0, 1.65, 5.25]} receiveShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[10.5, 3.3, 0.24]} />
                <meshStandardMaterial color={wall} roughness={0.82} />
            </mesh>
            <mesh position={[0, 3.38, 0]} receiveShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[10.5, 0.16, 10.5]} />
                <meshStandardMaterial color={wall} roughness={0.88} />
            </mesh>
            {[
                [-2.55, -2.55],
                [0, -2.55],
                [2.55, -2.55],
                [-2.55, 2.55],
                [0, 2.55],
                [2.55, 2.55],
            ].map(([x, z]) => (
                <mesh key={`${x}-${z}`} position={[x, 3.285, z]}>
                    <boxGeometry args={[1.35, 0.035, 0.5]} />
                    <meshStandardMaterial
                        color="#f8fafc"
                        emissive="#d9f5ff"
                        emissiveIntensity={0.72}
                        roughness={0.42}
                    />
                </mesh>
            ))}
        </>
    );
}

function InstancedColumns({ color }: { color: string }) {
    const meshRef = useRef<InstancedMesh>(null);
    const positions = useMemo(() => [
        [-4.45, 1.2, -4.45],
        [4.45, 1.2, -4.45],
        [-4.45, 1.2, 4.45],
        [4.45, 1.2, 4.45],
    ] as const, []);

    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        positions.forEach((position, index) => {
            mesh.setMatrixAt(
                index,
                new Matrix4().makeTranslation(position[0], position[1], position[2]),
            );
        });
        mesh.instanceMatrix.needsUpdate = true;
    }, [positions]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, undefined, positions.length]}
            castShadow
            receiveShadow
            userData={{ cameraBlocker: true }}
        >
            <cylinderGeometry args={[0.16, 0.23, 2.4, 6]} />
            <meshStandardMaterial color={color} roughness={0.78} />
        </instancedMesh>
    );
}

function GuideNpc({
    avatarId,
    position,
    label,
    stationId,
    interactionTarget,
    nearby = false,
    onInteract,
}: {
    avatarId: AvatarId;
    position: Vector3Tuple;
    label: string;
    stationId?: string;
    interactionTarget?: CampusInteractionTarget;
    nearby?: boolean;
    onInteract?: (target: CampusInteractionTarget) => void;
}) {
    const activeContent = useTrainingStore((state) => state.activeContent);
    const activeSpeech = useTrainingStore((state) => state.activeNpcSpeech);
    const [hovered, setHovered] = useState(false);
    const speaking = Boolean(stationId && activeSpeech?.stationId === stationId);
    const interactive = Boolean(interactionTarget && onInteract);

    return (
        <group
            position={[position[0], position[1], position[2]]}
            onClick={interactive ? (event) => {
                event.stopPropagation();
                onInteract?.(interactionTarget!);
            } : undefined}
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
            {interactionTarget && (
                <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.52, 0.64, 24]} />
                    <meshStandardMaterial
                        color="#38bdf8"
                        emissive="#0284c7"
                        emissiveIntensity={nearby || hovered ? 0.8 : 0.3}
                    />
                </mesh>
            )}
            <group position={[0, 0.88, 0]}>
                <CampusAvatar avatarId={avatarId} motion="idle" />
            </group>
            {!activeContent && !speaking && (
                <Html
                    position={[0, 1.92, 0]}
                    center
                    distanceFactor={8}
                    zIndexRange={[10, 6]}
                    style={{ pointerEvents: 'none' }}
                >
                    <span className="campus-npc-label">{label}</span>
                </Html>
            )}
            {stationId && <CampusNpcDialogueBubble stationId={stationId} />}
        </group>
    );
}

function CampusNpcDialogueBubble({
    stationId,
}: {
    stationId: string;
}) {
    const speech = useTrainingStore((state) => state.activeNpcSpeech);
    if (!speech || speech.stationId !== stationId) return null;

    return (
        <Html
            position={[-0.58, 2.72, 0]}
            center
            zIndexRange={[23, 16]}
            calculatePosition={calculateNpcDialoguePosition}
            style={{ pointerEvents: 'none' }}
        >
            <article
                className={`campus-npc-dialogue-bubble is-${speech.kind}`}
                key={speech.bubbleId}
                role="status"
                aria-label={speech.fullText}
            >
                <p aria-hidden="true">
                    {speech.visibleText}
                    {speech.typing && <span className="campus-npc-dialogue-cursor">▌</span>}
                </p>
            </article>
        </Html>
    );
}

function PortalVisual({
    target,
    nearby,
    hideLabel,
    onInteract,
}: {
    target: CampusInteractionTarget;
    nearby: boolean;
    hideLabel: boolean;
    onInteract: (target: CampusInteractionTarget) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const color = target.unlocked ? '#22d3ee' : '#f59e0b';
    const handleClick = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onInteract(target);
    };
    return (
        <group position={[target.position[0], target.position[1], target.position[2]]}>
            {!target.unlocked && (
                <RigidBody type="fixed" colliders={false}>
                    <CuboidCollider args={[0.78, 1.25, 0.16]} position={[0, 1.25, 0]} />
                </RigidBody>
            )}
            <mesh position={[-0.92, 1.25, 0]} castShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[0.18, 2.5, 0.38]} />
                <meshStandardMaterial color="#334155" metalness={0.25} roughness={0.55} />
            </mesh>
            <mesh position={[0.92, 1.25, 0]} castShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[0.18, 2.5, 0.38]} />
                <meshStandardMaterial color="#334155" metalness={0.25} roughness={0.55} />
            </mesh>
            <mesh position={[0, 2.48, 0]} castShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[2, 0.18, 0.38]} />
                <meshStandardMaterial color="#334155" metalness={0.25} roughness={0.55} />
            </mesh>
            <mesh
                position={[0, 1.2, 0.02]}
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
                <boxGeometry args={[1.7, 2.3, 0.12]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={nearby || hovered ? 0.65 : 0.22}
                    transparent
                    opacity={target.unlocked ? 0.24 : 0.72}
                />
            </mesh>
            {!target.unlocked && (
                <group position={[0, 1.1, -0.12]}>
                    <mesh position={[0, 0.18, 0]}>
                        <torusGeometry args={[0.22, 0.07, 8, 16, Math.PI]} />
                        <meshStandardMaterial color="#fffbeb" />
                    </mesh>
                    <mesh position={[0, -0.06, 0]}>
                        <boxGeometry args={[0.52, 0.42, 0.14]} />
                        <meshStandardMaterial color="#fffbeb" />
                    </mesh>
                </group>
            )}
            {!hideLabel && (
                <Html position={[0, 2.85, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                    <span className={`campus-world-label ${target.unlocked ? '' : 'is-locked'}`}>
                        {target.label}
                    </span>
                </Html>
            )}
        </group>
    );
}

function InteractionBeacon({
    target,
    nearby,
    hideStationTitle,
    onInteract,
}: {
    target: CampusInteractionTarget;
    nearby: boolean;
    hideStationTitle: boolean;
    onInteract: (target: CampusInteractionTarget) => void;
}) {
    const rootRef = useRef<Group>(null);
    const [hovered, setHovered] = useState(false);
    const showStationTitle = target.kind === 'simulation_terminal'
        || target.kind === 'evaluation_terminal'
        || target.kind === 'certificate_kiosk';
    useFrame(({ clock }) => {
        if (!rootRef.current) return;
        rootRef.current.position.y = 0.12 + Math.sin(clock.elapsedTime * 2.5) * 0.04;
        rootRef.current.rotation.y = clock.elapsedTime * 0.65;
    });
    const color = target.unlocked ? '#38bdf8' : '#94a3b8';
    return (
        <group position={[target.position[0], target.position[1], target.position[2]]}>
            {showStationTitle && !hideStationTitle && (
                <Html
                    position={[0, 2.2, 0]}
                    center
                    distanceFactor={8}
                    style={{ pointerEvents: 'none' }}
                >
                    <span className={`campus-world-label is-station-title ${target.unlocked ? '' : 'is-locked'}`}>
                        {target.label}
                    </span>
                </Html>
            )}
            <group ref={rootRef}>
                <mesh
                    position={[0, 1.65, 0]}
                    onClick={(event) => {
                        event.stopPropagation();
                        onInteract(target);
                    }}
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
                    <octahedronGeometry args={[nearby || hovered ? 0.22 : 0.16]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={target.unlocked ? 0.7 : 0.12} />
                </mesh>
                <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.52, 0.64, 24]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={nearby ? 0.75 : 0.24} />
                </mesh>
            </group>
        </group>
    );
}

function InductionWallPanel({
    position,
    rotation,
    accent,
}: {
    position: Vector3Tuple;
    rotation: Vector3Tuple;
    accent: string;
}) {
    return (
        <group position={position} rotation={rotation}>
            <mesh castShadow>
                <boxGeometry args={[1.55, 0.82, 0.055]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.68} />
            </mesh>
            <mesh position={[-0.58, 0, 0.034]}>
                <boxGeometry args={[0.14, 0.6, 0.025]} />
                <meshStandardMaterial color={accent} roughness={0.55} />
            </mesh>
            {[0.16, -0.02, -0.2].map((y, index) => (
                <mesh key={y} position={[0.18, y, 0.034]}>
                    <boxGeometry args={[index === 2 ? 0.58 : 0.76, 0.055, 0.025]} />
                    <meshStandardMaterial color={index === 0 ? '#475569' : '#94a3b8'} roughness={0.72} />
                </mesh>
            ))}
        </group>
    );
}

function InductionWallDecor() {
    return (
        <>
            <group position={[0, 2.42, -5.105]}>
                <mesh castShadow>
                    <boxGeometry args={[3.8, 0.96, 0.06]} />
                    <meshStandardMaterial color="#243247" roughness={0.62} />
                </mesh>
                <mesh position={[-1.48, 0, 0.045]} rotation={[0, 0, Math.PI / 4]}>
                    <boxGeometry args={[0.42, 0.42, 0.035]} />
                    <meshStandardMaterial color="#22b8cf" emissive="#0e7490" emissiveIntensity={0.18} />
                </mesh>
                <mesh position={[-1.48, 0, 0.068]} rotation={[0, 0, Math.PI / 4]}>
                    <boxGeometry args={[0.2, 0.2, 0.02]} />
                    <meshStandardMaterial color="#f8fafc" />
                </mesh>
                {[0.18, -0.06, -0.3].map((y, index) => (
                    <mesh key={y} position={[0.48, y, 0.045]}>
                        <boxGeometry args={[index === 0 ? 1.9 : 2.35, 0.08, 0.035]} />
                        <meshStandardMaterial color={index === 0 ? '#f8fafc' : '#8293a8'} roughness={0.68} />
                    </mesh>
                ))}
            </group>

            <InductionWallPanel position={[-5.105, 2.18, -2.35]} rotation={[0, Math.PI / 2, 0]} accent="#4f46e5" />
            <InductionWallPanel position={[-5.105, 2.18, 2.35]} rotation={[0, Math.PI / 2, 0]} accent="#0f766e" />
            <InductionWallPanel position={[5.105, 2.18, -2.35]} rotation={[0, -Math.PI / 2, 0]} accent="#b45309" />
            <InductionWallPanel position={[5.105, 2.18, 2.35]} rotation={[0, -Math.PI / 2, 0]} accent="#be123c" />

            <mesh position={[0, 0.62, -5.1]}>
                <boxGeometry args={[10.05, 0.08, 0.055]} />
                <meshStandardMaterial color="#22b8cf" roughness={0.62} />
            </mesh>
            <mesh position={[-5.1, 0.62, 0]} rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[10.05, 0.08, 0.055]} />
                <meshStandardMaterial color="#4f46e5" roughness={0.62} />
            </mesh>
            <mesh position={[5.1, 0.62, 0]} rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[10.05, 0.08, 0.055]} />
                <meshStandardMaterial color="#0f766e" roughness={0.62} />
            </mesh>
        </>
    );
}

function LobbyEnvironment({
    guideTarget,
    nearby,
    onInteract,
}: {
    guideTarget?: CampusInteractionTarget;
    nearby: boolean;
    onInteract: (target: CampusInteractionTarget) => void;
}) {
    return (
        <>
            <RoomShell floor="#aeb8c2" wall="#d7e6f3" />
            <InstancedColumns color="#64748b" />
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[1.65, 0.55, 0.48]} position={[0, 0.55, 0.3]} />
            </RigidBody>
            <mesh position={[0, 0.52, 0.3]} castShadow receiveShadow userData={{ cameraBlocker: true }}>
                <boxGeometry args={[3.3, 1.04, 0.96]} />
                <meshStandardMaterial color="#334155" roughness={0.62} />
            </mesh>
            <mesh position={[0, 1.05, 0.3]}>
                <boxGeometry args={[2.5, 0.05, 0.72]} />
                <meshStandardMaterial color="#67e8f9" emissive="#0891b2" emissiveIntensity={0.25} />
            </mesh>
            <GuideNpc
                avatarId="avatar_01"
                position={CAMPUS_GUIDE_POSITION}
                label="Guía del campus"
                stationId={CAMPUS_GUIDE_OBJECT_ID}
                interactionTarget={guideTarget}
                nearby={nearby}
                onInteract={onInteract}
            />
            <mesh position={[0, 2.45, -5.08]}>
                <boxGeometry args={[4.4, 0.78, 0.08]} />
                <meshStandardMaterial color="#0f172a" emissive="#0369a1" emissiveIntensity={0.25} />
            </mesh>
        </>
    );
}

function InductionEnvironment({ completedStationIds }: { completedStationIds: readonly string[] }) {
    return (
        <>
            <RoomShell floor="#bfa98b" wall="#f1e6d6" />
            <InstancedColumns color="#94a3b8" />
            <InductionWallDecor />
            {TRAINING_STATIONS.slice(0, -1).map((station, index) => {
                if (!completedStationIds.includes(station.id)) return null;
                const current = getTrainingStationPosition(station.id)!;
                const next = getTrainingStationPosition(TRAINING_STATIONS[index + 1].id)!;
                return (
                    <group key={`training-route-${station.id}`}>
                        <Line
                            points={[
                                [current[0], 0.032, current[2]],
                                [next[0], 0.032, next[2]],
                            ]}
                            color="#172554"
                            lineWidth={7}
                            dashed
                            dashSize={0.3}
                            gapSize={0.12}
                        />
                        <Line
                            points={[
                                [current[0], 0.04, current[2]],
                                [next[0], 0.04, next[2]],
                            ]}
                            color="#22d3ee"
                            lineWidth={4}
                            dashed
                            dashSize={0.3}
                            gapSize={0.12}
                        />
                    </group>
                );
            })}
            {TRAINING_STATIONS.map((station) => {
                const position = getTrainingStationPosition(station.id)!;
                const rotationY = Math.atan2(-position[0], -position[2]);
                return (
                    <group
                        key={station.id}
                        position={[position[0], 0, position[2]]}
                        rotation={[0, rotationY, 0]}
                    >
                        <RigidBody type="fixed" colliders={false}>
                            <CuboidCollider args={[0.76, 0.56, 0.6]} position={[0, 0.56, 0]} />
                        </RigidBody>
                        <group userData={{ cameraBlocker: true }}>
                            <OfficeStationModel variant={station.variant} />
                        </group>
                        <GuideNpc
                            avatarId={station.guide.avatarId}
                            position={[0.92, 0, 0.2]}
                            label={station.title}
                            stationId={station.id}
                        />
                    </group>
                );
            })}
        </>
    );
}

function SimulationEnvironment({
    lowQuality,
    sceneState,
    hideLabels,
    onStageInteract,
}: {
    lowQuality: boolean;
    sceneState?: SimulationLabSceneState;
    hideLabels: boolean;
    onStageInteract?: (stageId: SimulationLabStageId) => void;
}) {
    return (
        <>
            <RoomShell floor="#111b2d" wall="#18263b" />
            <InstancedColumns color="#155e75" />
            <SimulationLabEnvironment
                lowQuality={lowQuality}
                sceneState={sceneState}
                hideLabels={hideLabels}
                onStageInteract={onStageInteract}
            />
        </>
    );
}

function AssessmentWallDecor({ approved }: { approved: boolean }) {
    const accent = approved ? '#22c55e' : '#3b82f6';
    const accentDark = approved ? '#166534' : '#1d4ed8';

    return (
        <>
            <group position={[0, 2.35, -5.105]}>
                <mesh castShadow>
                    <boxGeometry args={[3.9, 1.02, 0.06]} />
                    <meshStandardMaterial color="#1e293b" roughness={0.6} />
                </mesh>
                <mesh position={[-1.42, 0, 0.05]}>
                    <ringGeometry args={[0.28, 0.38, 24]} />
                    <meshStandardMaterial color={accent} emissive={accentDark} emissiveIntensity={0.35} />
                </mesh>
                {approved ? (
                    <group position={[-1.42, -0.02, 0.075]}>
                        <mesh position={[-0.08, -0.04, 0]} rotation={[0, 0, -0.72]}>
                            <boxGeometry args={[0.08, 0.24, 0.025]} />
                            <meshStandardMaterial color="#dcfce7" />
                        </mesh>
                        <mesh position={[0.08, 0.02, 0]} rotation={[0, 0, 0.72]}>
                            <boxGeometry args={[0.08, 0.38, 0.025]} />
                            <meshStandardMaterial color="#dcfce7" />
                        </mesh>
                    </group>
                ) : (
                    <group position={[-1.42, 0, 0.075]}>
                        <mesh position={[0.04, 0.09, 0]} rotation={[0, 0, -0.55]}>
                            <boxGeometry args={[0.09, 0.25, 0.025]} />
                            <meshStandardMaterial color="#dbeafe" />
                        </mesh>
                        <mesh position={[-0.04, -0.09, 0]}>
                            <boxGeometry args={[0.09, 0.14, 0.025]} />
                            <meshStandardMaterial color="#dbeafe" />
                        </mesh>
                        <mesh position={[-0.04, -0.23, 0]}>
                            <circleGeometry args={[0.055, 12]} />
                            <meshStandardMaterial color="#dbeafe" />
                        </mesh>
                    </group>
                )}
                {[0.2, -0.04, -0.28].map((y, index) => (
                    <mesh key={y} position={[0.62, y, 0.05]}>
                        <boxGeometry args={[index === 0 ? 1.75 : 2.2, 0.075, 0.035]} />
                        <meshStandardMaterial color={index === 0 ? '#f8fafc' : '#94a3b8'} roughness={0.68} />
                    </mesh>
                ))}
            </group>

            {[-1.85, 1.85].map((z, panelIndex) => (
                <group
                    key={z}
                    position={[panelIndex === 0 ? -5.105 : 5.105, 2.12, z]}
                    rotation={[0, panelIndex === 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
                >
                    <mesh castShadow>
                        <boxGeometry args={[2.05, 0.86, 0.055]} />
                        <meshStandardMaterial color="#ffffff" roughness={0.72} />
                    </mesh>
                    {[0.22, 0, -0.22].map((y) => (
                        <group key={y} position={[0, y, 0.04]}>
                            <mesh position={[-0.72, 0, 0]}>
                                <circleGeometry args={[0.07, 16]} />
                                <meshStandardMaterial color={accent} emissive={accentDark} emissiveIntensity={0.16} />
                            </mesh>
                            <mesh position={[0.18, 0, 0]}>
                                <boxGeometry args={[1.35, 0.055, 0.025]} />
                                <meshStandardMaterial color={y === 0.22 ? '#475569' : '#94a3b8'} roughness={0.75} />
                            </mesh>
                        </group>
                    ))}
                </group>
            ))}

            <mesh position={[0, 0.64, -5.1]}>
                <boxGeometry args={[10.05, 0.09, 0.055]} />
                <meshStandardMaterial color={accent} emissive={accentDark} emissiveIntensity={0.12} />
            </mesh>
        </>
    );
}

function AssessmentEnvironment({ approved }: { approved: boolean }) {
    return (
        <>
            <RoomShell floor="#e2e8f0" wall="#f1f5f9" />
            <InstancedColumns color={approved ? '#16a34a' : '#64748b'} />
            <AssessmentWallDecor approved={approved} />
            {[-1.65, 1.65].map((x, index) => (
                <group key={x} position={[x, 0, -1.25]}>
                    <RigidBody type="fixed" colliders={false}>
                        <CuboidCollider args={[0.72, 0.62, 0.62]} position={[0, 0.62, 0]} />
                    </RigidBody>
                    <mesh position={[0, 0.55, 0]} castShadow userData={{ cameraBlocker: true }}>
                        <boxGeometry args={[1.35, 1.1, 1.1]} />
                        <meshStandardMaterial color={index === 1 && approved ? '#166534' : '#334155'} roughness={0.6} />
                    </mesh>
                    <mesh position={[0, 1.25, -0.2]} rotation={[-0.3, 0, 0]}>
                        <boxGeometry args={[0.92, 0.62, 0.06]} />
                        <meshStandardMaterial
                            color={index === 1 && approved ? '#86efac' : '#bfdbfe'}
                            emissive={index === 1 && approved ? '#22c55e' : '#2563eb'}
                            emissiveIntensity={0.4}
                        />
                    </mesh>
                </group>
            ))}
        </>
    );
}

export function CampusZoneEnvironment({
    zoneId,
    progress,
    completedStationIds,
    targets,
    nearbyTargetId,
    lowQuality,
    hideStationTitles,
    simulationSceneState,
    onInteract,
    onSimulationStageInteract,
}: {
    zoneId: CampusZoneId;
    progress: CampusProgressState;
    completedStationIds: readonly string[];
    targets: readonly CampusInteractionTarget[];
    nearbyTargetId: string | null;
    lowQuality: boolean;
    hideStationTitles: boolean;
    simulationSceneState?: SimulationLabSceneState;
    onInteract: (target: CampusInteractionTarget) => void;
    onSimulationStageInteract?: (stageId: SimulationLabStageId) => void;
}) {
    const campusGuideTarget = targets.find(({ kind }) => kind === 'campus_guide');

    return (
        <group name={`zone-${zoneId}`}>
            {zoneId === 'lobby' && (
                <LobbyEnvironment
                    guideTarget={campusGuideTarget}
                    nearby={nearbyTargetId === CAMPUS_GUIDE_OBJECT_ID}
                    onInteract={onInteract}
                />
            )}
            {zoneId === 'induction-office' && (
                <InductionEnvironment completedStationIds={completedStationIds} />
            )}
            {zoneId === 'simulation-lab' && (
                <SimulationEnvironment
                    lowQuality={lowQuality}
                    sceneState={simulationSceneState}
                    hideLabels={hideStationTitles}
                    onStageInteract={onSimulationStageInteract}
                />
            )}
            {zoneId === 'assessment-room' && <AssessmentEnvironment approved={progress.approved} />}
            {targets.filter(({ kind }) => kind !== 'campus_guide').map((target) => target.kind === 'portal'
                ? (
                    <PortalVisual
                        key={target.id}
                        target={target}
                        nearby={nearbyTargetId === target.id}
                        hideLabel={hideStationTitles}
                        onInteract={onInteract}
                    />
                )
                : (
                    <InteractionBeacon
                        key={target.id}
                        target={target}
                        nearby={nearbyTargetId === target.id}
                        hideStationTitle={hideStationTitles
                            || (target.kind === 'simulation_terminal' && Boolean(simulationSceneState?.activeRun))}
                        onInteract={onInteract}
                    />
                ))}
        </group>
    );
}
