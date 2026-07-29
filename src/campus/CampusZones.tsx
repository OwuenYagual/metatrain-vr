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
    type CampusProgressState,
    type CampusZoneId,
    type Vector3Tuple,
} from '../../shared/campus';
import { TRAINING_STATIONS } from '../../shared/trainingModule';
import { OfficeStationModel } from '../scene/OfficeEnvironment';
import { useTrainingStore } from '../store/useTrainingStore';
import {
    getTrainingStationPosition,
    type CampusInteractionTarget,
} from './campusTargets';

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
    color,
    position,
    label,
    stationId,
}: {
    color: string;
    position: Vector3Tuple;
    label: string;
    stationId?: string;
}) {
    const groupRef = useRef<Group>(null);
    const activeSpeech = useTrainingStore((state) => state.activeNpcSpeech);
    const speaking = Boolean(stationId && activeSpeech?.stationId === stationId);
    useFrame(({ clock }) => {
        if (groupRef.current) groupRef.current.position.y = Math.sin(clock.elapsedTime * 1.8) * 0.012;
    });

    return (
        <group ref={groupRef} position={[position[0], position[1], position[2]]}>
            <mesh position={[-0.12, 0.28, 0]} castShadow>
                <capsuleGeometry args={[0.075, 0.34, 5, 8]} />
                <meshStandardMaterial color="#25324a" />
            </mesh>
            <mesh position={[0.12, 0.28, 0]} castShadow>
                <capsuleGeometry args={[0.075, 0.34, 5, 8]} />
                <meshStandardMaterial color="#25324a" />
            </mesh>
            <mesh position={[0, 0.84, 0]} castShadow>
                <capsuleGeometry args={[0.23, 0.55, 6, 10]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.43, 0]} castShadow>
                <sphereGeometry args={[0.23, 14, 10]} />
                <meshStandardMaterial color="#c98e6c" roughness={0.85} />
            </mesh>
            <mesh position={[0, 1.55, 0.035]} scale={[1.02, 0.48, 0.82]} castShadow>
                <sphereGeometry args={[0.235, 12, 8]} />
                <meshStandardMaterial color="#2b211f" roughness={0.94} />
            </mesh>
            {!speaking && (
                <Html position={[0, 1.92, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
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
                aria-label={`${speech.label}: ${speech.fullText}`}
            >
                <strong>{speech.label}</strong>
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
    onInteract,
}: {
    target: CampusInteractionTarget;
    nearby: boolean;
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
            <Html position={[0, 2.85, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                <span className={`campus-world-label ${target.unlocked ? '' : 'is-locked'}`}>
                    {target.label}
                </span>
            </Html>
        </group>
    );
}

function InteractionBeacon({
    target,
    nearby,
    onInteract,
}: {
    target: CampusInteractionTarget;
    nearby: boolean;
    onInteract: (target: CampusInteractionTarget) => void;
}) {
    const rootRef = useRef<Group>(null);
    const [hovered, setHovered] = useState(false);
    useFrame(({ clock }) => {
        if (!rootRef.current) return;
        rootRef.current.position.y = 0.12 + Math.sin(clock.elapsedTime * 2.5) * 0.04;
        rootRef.current.rotation.y = clock.elapsedTime * 0.65;
    });
    const color = target.unlocked ? '#38bdf8' : '#94a3b8';
    return (
        <group position={[target.position[0], target.position[1], target.position[2]]}>
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

function LobbyEnvironment() {
    return (
        <>
            <RoomShell floor="#cbd5e1" wall="#e7eef7" />
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
            <GuideNpc color="#2563eb" position={[0, 0, -0.7]} label="Guía del campus" />
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
            <RoomShell floor="#dce3ec" wall="#f8fafc" />
            <InstancedColumns color="#94a3b8" />
            {TRAINING_STATIONS.slice(0, -1).map((station, index) => {
                if (!completedStationIds.includes(station.id)) return null;
                const current = getTrainingStationPosition(station.id)!;
                const next = getTrainingStationPosition(TRAINING_STATIONS[index + 1].id)!;
                return (
                    <Line
                        key={`training-route-${station.id}`}
                        points={[
                            [current[0], 0.035, current[2]],
                            [next[0], 0.035, next[2]],
                        ]}
                        color="#22c55e"
                        lineWidth={2.2}
                        dashed
                        dashSize={0.24}
                        gapSize={0.15}
                        transparent
                        opacity={0.92}
                    />
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
                            color={station.guide.color}
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

function SimulationEnvironment({ lowQuality }: { lowQuality: boolean }) {
    const pods = [-3, -1.5, 1.5, 3];
    return (
        <>
            <RoomShell floor="#111b2d" wall="#18263b" />
            <InstancedColumns color="#155e75" />
            {pods.map((x) => (
                <group key={x} position={[x, 0, 1.25]}>
                    <mesh position={[0, 0.42, 0]} castShadow>
                        <cylinderGeometry args={[0.54, 0.72, 0.84, 8]} />
                        <meshStandardMaterial color="#1e3a5f" metalness={0.28} roughness={0.52} />
                    </mesh>
                    {!lowQuality && (
                        <mesh position={[0, 1.15, 0]}>
                            <cylinderGeometry args={[0.32, 0.52, 1.35, 12, 1, true]} />
                            <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.75} transparent opacity={0.15} />
                        </mesh>
                    )}
                </group>
            ))}
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[1.3, 0.62, 0.7]} position={[0, 0.62, -1.25]} />
            </RigidBody>
            <mesh position={[0, 0.6, -1.25]} castShadow userData={{ cameraBlocker: true }}>
                <cylinderGeometry args={[1.1, 1.4, 1.2, 8]} />
                <meshStandardMaterial color="#0e7490" metalness={0.35} roughness={0.42} />
            </mesh>
            <mesh position={[0, 1.5, -1.25]} rotation={[-0.22, 0, 0]}>
                <boxGeometry args={[1.5, 0.88, 0.08]} />
                <meshStandardMaterial color="#67e8f9" emissive="#06b6d4" emissiveIntensity={0.65} />
            </mesh>
        </>
    );
}

function AssessmentEnvironment({ approved }: { approved: boolean }) {
    return (
        <>
            <RoomShell floor="#e2e8f0" wall="#f1f5f9" />
            <InstancedColumns color={approved ? '#16a34a' : '#64748b'} />
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
            <mesh position={[0, 2.3, -5.08]}>
                <circleGeometry args={[0.55, 24]} />
                <meshStandardMaterial color={approved ? '#4ade80' : '#94a3b8'} emissive={approved ? '#16a34a' : '#475569'} emissiveIntensity={0.5} />
            </mesh>
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
    onInteract,
}: {
    zoneId: CampusZoneId;
    progress: CampusProgressState;
    completedStationIds: readonly string[];
    targets: readonly CampusInteractionTarget[];
    nearbyTargetId: string | null;
    lowQuality: boolean;
    onInteract: (target: CampusInteractionTarget) => void;
}) {
    return (
        <group name={`zone-${zoneId}`}>
            {zoneId === 'lobby' && <LobbyEnvironment />}
            {zoneId === 'induction-office' && (
                <InductionEnvironment completedStationIds={completedStationIds} />
            )}
            {zoneId === 'simulation-lab' && <SimulationEnvironment lowQuality={lowQuality} />}
            {zoneId === 'assessment-room' && <AssessmentEnvironment approved={progress.approved} />}
            {targets.map((target) => target.kind === 'portal'
                ? (
                    <PortalVisual
                        key={target.id}
                        target={target}
                        nearby={nearbyTargetId === target.id}
                        onInteract={onInteract}
                    />
                )
                : (
                    <InteractionBeacon
                        key={target.id}
                        target={target}
                        nearby={nearbyTargetId === target.id}
                        onInteract={onInteract}
                    />
                ))}
        </group>
    );
}
