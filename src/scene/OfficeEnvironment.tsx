import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Mesh, Vector3 } from 'three';
import { OFFICE_MODEL_PATHS, type OfficeModelPath } from './officeAssets';

export type StationVariant = 'manual' | 'folder' | 'board' | 'shield' | 'terminal';

type Vector3Tuple = readonly [number, number, number];

type OfficeModelProps = {
    path: OfficeModelPath;
    position?: Vector3Tuple;
    rotation?: Vector3Tuple;
    scale?: number | Vector3Tuple;
};

function OfficeModel({
    path,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = 1,
}: OfficeModelProps) {
    const { scene } = useGLTF(path);
    const model = useMemo(() => {
        const clone = scene.clone(true);
        const bounds = new Box3().setFromObject(clone);
        const center = bounds.getCenter(new Vector3());

        clone.position.set(-center.x, -bounds.min.y, -center.z);
        clone.traverse((object) => {
            if (object instanceof Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });

        return clone;
    }, [scene]);

    return (
        <group
            position={[...position] as [number, number, number]}
            rotation={[...rotation] as [number, number, number]}
            scale={typeof scale === 'number' ? scale : [...scale] as [number, number, number]}
        >
            <primitive object={model} />
        </group>
    );
}

function ZoneRug({ position, color }: { position: Vector3Tuple; color: string }) {
    return (
        <mesh position={[position[0], 0.025, position[2]]} receiveShadow>
            <boxGeometry args={[2.5, 0.035, 2.15]} />
            <meshStandardMaterial color={color} roughness={0.92} />
        </mesh>
    );
}

export function CorporateOffice() {
    return (
        <group position={[0, -0.5, 0]}>
            <mesh position={[0, -0.08, 0]} receiveShadow>
                <boxGeometry args={[10.5, 0.16, 9.5]} />
                <meshStandardMaterial color="#d8dee8" roughness={0.88} />
            </mesh>

            <mesh position={[0, 1.45, -4.65]} receiveShadow>
                <boxGeometry args={[10.5, 3.05, 0.18]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.8} />
            </mesh>
            <mesh position={[-5.15, 1.45, 0]} receiveShadow>
                <boxGeometry args={[0.18, 3.05, 9.5]} />
                <meshStandardMaterial color="#eef2f7" roughness={0.8} />
            </mesh>
            <mesh position={[5.15, 1.45, 0]} receiveShadow>
                <boxGeometry args={[0.18, 3.05, 9.5]} />
                <meshStandardMaterial color="#eef2f7" roughness={0.8} />
            </mesh>

            <mesh position={[0, 1.55, -4.52]}>
                <boxGeometry args={[3.2, 1.25, 0.06]} />
                <meshStandardMaterial color="#173b63" roughness={0.6} />
            </mesh>
            <mesh position={[0, 1.55, -4.47]}>
                <circleGeometry args={[0.46, 32]} />
                <meshStandardMaterial color="#38bdf8" emissive="#075985" emissiveIntensity={0.25} />
            </mesh>

            <ZoneRug position={[-3.25, 0, -1.25]} color="#dbeafe" />
            <ZoneRug position={[3.25, 0, -1.25]} color="#ccfbf1" />
            <ZoneRug position={[-3.1, 0, 2.25]} color="#ede9fe" />
            <ZoneRug position={[3.1, 0, 2.25]} color="#fef3c7" />

            <OfficeModel path={OFFICE_MODEL_PATHS.loungeSofa} position={[-3.75, 0, 3.75]} rotation={[0, 0.2, 0]} scale={1.45} />
            <OfficeModel path={OFFICE_MODEL_PATHS.coffeeTable} position={[-2.5, 0, 3.75]} scale={1.15} />
            <OfficeModel path={OFFICE_MODEL_PATHS.floorLamp} position={[-4.65, 0, 3.6]} scale={1.35} />
            <OfficeModel path={OFFICE_MODEL_PATHS.pottedPlant} position={[-4.45, 0, -3.8]} scale={1.45} />
            <OfficeModel path={OFFICE_MODEL_PATHS.pottedPlant} position={[4.45, 0, -3.8]} rotation={[0, Math.PI, 0]} scale={1.45} />
            <OfficeModel path={OFFICE_MODEL_PATHS.smallPlant} position={[4.45, 0, 3.9]} scale={1.65} />
        </group>
    );
}

export function OfficeStationModel({ variant }: { variant: StationVariant }) {
    if (variant === 'manual') {
        return (
            <group>
                <OfficeModel path={OFFICE_MODEL_PATHS.bookcase} scale={1.55} />
                <OfficeModel path={OFFICE_MODEL_PATHS.books} position={[0, 1.38, 0.08]} rotation={[0, -0.25, 0]} scale={2.1} />
            </group>
        );
    }

    if (variant === 'folder') {
        return (
            <group>
                <OfficeModel path={OFFICE_MODEL_PATHS.coffeeTable} scale={1.55} />
                <OfficeModel path={OFFICE_MODEL_PATHS.display} position={[0, 0.38, 0]} scale={1.45} />
            </group>
        );
    }

    if (variant === 'board') {
        return (
            <group>
                <OfficeModel path={OFFICE_MODEL_PATHS.desk} scale={1.7} />
                <OfficeModel path={OFFICE_MODEL_PATHS.laptop} position={[0, 0.65, -0.02]} rotation={[0, Math.PI, 0]} scale={0.72} />
                <OfficeModel path={OFFICE_MODEL_PATHS.deskChair} position={[0, 0, 0.72]} rotation={[0, Math.PI, 0]} scale={1.45} />
            </group>
        );
    }

    if (variant === 'shield') {
        return (
            <group>
                <OfficeModel path={OFFICE_MODEL_PATHS.loungeChair} position={[-0.55, 0, 0]} rotation={[0, 0.55, 0]} scale={1.25} />
                <OfficeModel path={OFFICE_MODEL_PATHS.loungeChair} position={[0.55, 0, 0]} rotation={[0, -0.55, 0]} scale={1.25} />
                <OfficeModel path={OFFICE_MODEL_PATHS.coffeeTable} position={[0, 0, 0.55]} scale={0.9} />
            </group>
        );
    }

    return (
        <group>
            <OfficeModel path={OFFICE_MODEL_PATHS.desk} scale={1.65} />
            <OfficeModel path={OFFICE_MODEL_PATHS.monitor} position={[0, 0.64, -0.08]} scale={1.25} />
            <OfficeModel path={OFFICE_MODEL_PATHS.keyboard} position={[0, 0.66, 0.28]} scale={1.35} />
            <OfficeModel path={OFFICE_MODEL_PATHS.deskChair} position={[0, 0, 0.76]} rotation={[0, Math.PI, 0]} scale={1.4} />
        </group>
    );
}
