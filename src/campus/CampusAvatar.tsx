import {
    Component,
    Suspense,
    useEffect,
    useMemo,
    useRef,
    type ErrorInfo,
    type ReactNode,
    type RefObject,
} from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Box3, Group, MathUtils, Mesh, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarId } from '../auth/authService';

export type AvatarMotion = 'idle' | 'walk' | 'run';

type AvatarPalette = {
    uniform: string;
    accent: string;
    skin: string;
    hair: string;
    trousers: string;
};

const AVATAR_PALETTES: Record<AvatarId, AvatarPalette> = {
    avatar_01: {
        uniform: '#3157d5',
        accent: '#7dd3fc',
        skin: '#a96f4f',
        hair: '#1f2937',
        trousers: '#172554',
    },
    avatar_02: {
        uniform: '#0f766e',
        accent: '#99f6e4',
        skin: '#d9a17e',
        hair: '#4a2c22',
        trousers: '#134e4a',
    },
    avatar_03: {
        uniform: '#7c3aed',
        accent: '#ddd6fe',
        skin: '#714b3a',
        hair: '#111827',
        trousers: '#3b0764',
    },
};

function Limb({
    side,
    color,
    limbRef,
}: {
    side: -1 | 1;
    color: string;
    limbRef: RefObject<Group | null>;
}) {
    return (
        <group ref={limbRef} position={[side * 0.23, -0.38, 0]}>
            <mesh position={[0, -0.24, 0]} castShadow>
                <capsuleGeometry args={[0.09, 0.35, 5, 8]} />
                <meshStandardMaterial color={color} roughness={0.82} />
            </mesh>
            <mesh position={[0, -0.47, 0.045]} castShadow>
                <boxGeometry args={[0.2, 0.12, 0.36]} />
                <meshStandardMaterial color="#111827" roughness={0.9} />
            </mesh>
        </group>
    );
}

function Arm({
    side,
    uniform,
    skin,
    limbRef,
}: {
    side: -1 | 1;
    uniform: string;
    skin: string;
    limbRef: RefObject<Group | null>;
}) {
    return (
        <group ref={limbRef} position={[side * 0.34, 0.17, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
                <capsuleGeometry args={[0.075, 0.36, 5, 8]} />
                <meshStandardMaterial color={uniform} roughness={0.78} />
            </mesh>
            <mesh position={[0, -0.47, 0]} castShadow>
                <sphereGeometry args={[0.09, 10, 8]} />
                <meshStandardMaterial color={skin} roughness={0.86} />
            </mesh>
        </group>
    );
}

function ProceduralCampusAvatar({
    avatarId,
    motion,
    hidden = false,
}: {
    avatarId: AvatarId;
    motion: AvatarMotion;
    hidden?: boolean;
}) {
    const rootRef = useRef<Group>(null);
    const leftArmRef = useRef<Group>(null);
    const rightArmRef = useRef<Group>(null);
    const leftLegRef = useRef<Group>(null);
    const rightLegRef = useRef<Group>(null);
    const elapsedRef = useRef(0);
    const palette = AVATAR_PALETTES[avatarId];

    useFrame((_, delta) => {
        elapsedRef.current += delta;
        const speed = motion === 'run' ? 11 : motion === 'walk' ? 7 : 2;
        const amount = motion === 'run' ? 0.82 : motion === 'walk' ? 0.5 : 0.035;
        const cycle = Math.sin(elapsedRef.current * speed) * amount;
        const bodyBob = motion === 'idle'
            ? Math.sin(elapsedRef.current * 2) * 0.012
            : Math.abs(Math.sin(elapsedRef.current * speed)) * 0.025;

        if (rootRef.current) rootRef.current.position.y = bodyBob;
        if (leftArmRef.current) leftArmRef.current.rotation.x = MathUtils.lerp(
            leftArmRef.current.rotation.x,
            cycle,
            Math.min(1, delta * 12),
        );
        if (rightArmRef.current) rightArmRef.current.rotation.x = MathUtils.lerp(
            rightArmRef.current.rotation.x,
            -cycle,
            Math.min(1, delta * 12),
        );
        if (leftLegRef.current) leftLegRef.current.rotation.x = MathUtils.lerp(
            leftLegRef.current.rotation.x,
            -cycle,
            Math.min(1, delta * 14),
        );
        if (rightLegRef.current) rightLegRef.current.rotation.x = MathUtils.lerp(
            rightLegRef.current.rotation.x,
            cycle,
            Math.min(1, delta * 14),
        );
    });

    return (
        <group ref={rootRef} visible={!hidden} name={`campus-${avatarId}`} userData={{ ignoreCameraCollision: true }}>
            <Limb side={-1} color={palette.trousers} limbRef={leftLegRef} />
            <Limb side={1} color={palette.trousers} limbRef={rightLegRef} />
            <mesh position={[0, 0.13, 0]} castShadow>
                <capsuleGeometry args={[0.28, 0.48, 7, 12]} />
                <meshStandardMaterial color={palette.uniform} roughness={0.72} />
            </mesh>
            <mesh position={[0, 0.12, 0.285]} castShadow>
                <boxGeometry args={[0.22, 0.16, 0.025]} />
                <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.12} />
            </mesh>
            <Arm side={-1} uniform={palette.uniform} skin={palette.skin} limbRef={leftArmRef} />
            <Arm side={1} uniform={palette.uniform} skin={palette.skin} limbRef={rightArmRef} />
            <mesh position={[0, 0.7, 0]} castShadow>
                <sphereGeometry args={[0.245, 16, 12]} />
                <meshStandardMaterial color={palette.skin} roughness={0.82} />
            </mesh>
            <mesh position={[0, 0.825, 0.03]} scale={[1.02, 0.52, 0.86]} castShadow>
                <sphereGeometry args={[0.25, 14, 10]} />
                <meshStandardMaterial color={palette.hair} roughness={0.92} />
            </mesh>
            <mesh position={[-0.075, 0.72, 0.225]}>
                <sphereGeometry args={[0.022, 8, 6]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[0.075, 0.72, 0.225]}>
                <sphereGeometry args={[0.022, 8, 6]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>
        </group>
    );
}

const AVATAR_MODEL_PATHS: Record<AvatarId, string> = {
    avatar_01: '/models/avatars/avatar_01.glb',
    avatar_02: '/models/avatars/avatar_02.glb',
    avatar_03: '/models/avatars/avatar_03.glb',
};

const AVATAR_ROTATION_Y: Record<AvatarId, number> = {
    avatar_01: 0,
    avatar_02: 0,
    avatar_03: 0,
};

const MOTION_CLIPS: Record<AvatarMotion, string> = {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
};

function AnimatedAvatarModel({
    avatarId,
    motion,
    hidden,
}: {
    avatarId: AvatarId;
    motion: AvatarMotion;
    hidden: boolean;
}) {
    const path = AVATAR_MODEL_PATHS[avatarId];
    const { scene, animations } = useGLTF(path);
    const model = useMemo(() => {
        const cloned = cloneSkeleton(scene);
        cloned.traverse((object) => {
            if (object instanceof Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        return cloned;
    }, [scene]);
    const transform = useMemo(() => {
        const bounds = new Box3().setFromObject(model);
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        const scale = size.y > 0 ? 1.72 / size.y : 1;
        return {
            scale,
            position: [
                -center.x * scale,
                -0.88 - bounds.min.y * scale,
                -center.z * scale,
            ] as [number, number, number],
        };
    }, [model]);
    const { actions } = useAnimations(animations, model);

    const missingClip = (['Idle', 'Walk', 'Run'] as const)
        .find((clipName) => !animations.some((clip) => clip.name === clipName));

    useEffect(() => {
        const clipName = MOTION_CLIPS[motion];
        const action = actions[clipName];
        if (!action) {
            console.warn(`El avatar ${avatarId} no contiene la animación ${clipName}.`);
            return undefined;
        }
        action.reset().fadeIn(0.16).play();
        return () => {
            action.fadeOut(0.16);
        };
    }, [actions, avatarId, motion]);

    if (missingClip) {
        throw new Error(`El avatar ${avatarId} no contiene la animación ${missingClip}.`);
    }

    return (
        <primitive
            object={model}
            visible={!hidden}
            scale={transform.scale}
            position={transform.position}
            rotation={[0, AVATAR_ROTATION_Y[avatarId], 0]}
            userData={{ ignoreCameraCollision: true }}
        />
    );
}

class AvatarAssetBoundary extends Component<
    { children: ReactNode; fallback: ReactNode; assetPath: string },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(`No se pudo cargar el asset ${this.props.assetPath}.`, error, info.componentStack);
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

export function CampusAvatar({
    avatarId,
    motion,
    hidden = false,
}: {
    avatarId: AvatarId;
    motion: AvatarMotion;
    hidden?: boolean;
}) {
    const fallback = (
        <ProceduralCampusAvatar avatarId={avatarId} motion={motion} hidden={hidden} />
    );
    return (
        <AvatarAssetBoundary
            key={avatarId}
            assetPath={AVATAR_MODEL_PATHS[avatarId]}
            fallback={fallback}
        >
            <Suspense fallback={fallback}>
                <AnimatedAvatarModel avatarId={avatarId} motion={motion} hidden={hidden} />
            </Suspense>
        </AvatarAssetBoundary>
    );
}

Object.values(AVATAR_MODEL_PATHS).forEach((path) => useGLTF.preload(path));
