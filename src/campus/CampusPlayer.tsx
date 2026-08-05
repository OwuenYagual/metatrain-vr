import { useEffect, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
    CapsuleCollider,
    RigidBody,
    useRapier,
    type RapierRigidBody,
} from '@react-three/rapier';
import {
    Euler,
    MathUtils,
    Object3D,
    PerspectiveCamera,
    Vector3,
} from 'three';
import type { AvatarId } from '../auth/authService';
import {
    CAMPUS_INTERACTION_DISTANCE,
    type SpawnManifest,
    type Vector3Tuple,
} from '../../shared/campus';
import { getCampusMovementVector, type CampusMovementState } from './campusControls';
import {
    createThirdPersonOrbit,
    followThirdPersonOrbit,
    getCollisionSafeCameraDistance,
    getThirdPersonCameraOffset,
    updateThirdPersonOrbit,
} from './campusCamera';
import { CampusAvatar, type AvatarMotion } from './CampusAvatar';
import type { CampusInteractionTarget } from './campusTargets';

export type CampusCameraMode = 'third-person' | 'first-person';

const PLAYER_CENTER_HEIGHT = 0.88;
const WALK_SPEED = 2.35;
const RUN_SPEED = 4.4;
const MANUAL_CAMERA_FOLLOW_DELAY_MS = 1_200;

function getClosestTarget(
    position: Vector3,
    targets: readonly CampusInteractionTarget[],
): CampusInteractionTarget | null {
    let closest: CampusInteractionTarget | null = null;
    let closestDistance = CAMPUS_INTERACTION_DISTANCE;
    for (const target of targets) {
        const distance = Math.hypot(
            target.position[0] - position.x,
            target.position[2] - position.z,
        );
        if (distance <= closestDistance) {
            closest = target;
            closestDistance = distance;
        }
    }
    return closest;
}

function shortestAngleDifference(from: number, to: number): number {
    return MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
}

export function CampusPlayer({
    avatarId,
    spawn,
    movementRef,
    cameraMode,
    paused,
    conversationFocusTarget,
    targets,
    onNearbyTargetChange,
    onStep,
}: {
    avatarId: AvatarId;
    spawn: SpawnManifest;
    movementRef: RefObject<CampusMovementState>;
    cameraMode: CampusCameraMode;
    paused: boolean;
    conversationFocusTarget: Vector3Tuple | null;
    targets: readonly CampusInteractionTarget[];
    onNearbyTargetChange: (target: CampusInteractionTarget | null) => void;
    onStep: () => void;
}) {
    const bodyRef = useRef<RapierRigidBody>(null);
    const avatarRootRef = useRef<Object3D>(null);
    const [motion, setMotion] = useState<AvatarMotion>('idle');
    const motionRef = useRef<AvatarMotion>('idle');
    const nearbyIdRef = useRef<string | null>(null);
    const avatarYawRef = useRef(spawn.rotationY);
    const thirdPersonOrbitRef = useRef(createThirdPersonOrbit(spawn.rotationY));
    const thirdPersonDraggingRef = useRef(false);
    const lastManualCameraMoveAtRef = useRef(Number.NEGATIVE_INFINITY);
    const cameraYawRef = useRef(spawn.rotationY + Math.PI);
    const cameraPitchRef = useRef(-0.04);
    const cameraFocusObjectRef = useRef(new PerspectiveCamera());
    const conversationFocusKeyRef = useRef<string | null>(null);
    const cameraBeforeConversationRef = useRef<{ yaw: number; pitch: number } | null>(null);
    const cameraInitializedRef = useRef(false);
    const stepDistanceRef = useRef(0);
    const { camera, gl } = useThree();
    const { rapier, world } = useRapier();
    const characterControllerRef = useRef<ReturnType<typeof world.createCharacterController> | null>(null);

    useEffect(() => {
        // StrictMode replays effects without recreating memoized render values. Keep creation and
        // disposal in the same effect so a replay can never leave a freed controller in useFrame.
        const controller = world.createCharacterController(0.015);
        controller.enableAutostep(0.36, 0.18, false);
        controller.enableSnapToGround(0.24);
        controller.setMaxSlopeClimbAngle(50 * Math.PI / 180);
        controller.setMinSlopeSlideAngle(58 * Math.PI / 180);
        controller.setApplyImpulsesToDynamicBodies(false);
        characterControllerRef.current = controller;

        return () => {
            if (characterControllerRef.current === controller) {
                characterControllerRef.current = null;
            }
            world.removeCharacterController(controller);
        };
    }, [world]);

    useEffect(() => {
        if (cameraMode !== 'third-person') return undefined;
        const canvas = gl.domElement;
        let activePointerId: number | null = null;
        let dragDistance = 0;
        let suppressNextClick = false;
        let clickResetTimeout: number | null = null;

        const stopDragging = (event: PointerEvent) => {
            if (event.pointerId !== activePointerId) return;
            if (event.type === 'pointerup' && dragDistance > 4) {
                suppressNextClick = true;
                if (clickResetTimeout !== null) window.clearTimeout(clickResetTimeout);
                clickResetTimeout = window.setTimeout(() => {
                    suppressNextClick = false;
                    clickResetTimeout = null;
                }, 0);
            }
            thirdPersonDraggingRef.current = false;
            activePointerId = null;
            if (canvas.hasPointerCapture(event.pointerId)) {
                canvas.releasePointerCapture(event.pointerId);
            }
        };
        const handlePointerDown = (event: PointerEvent) => {
            if (event.button !== 0) return;
            thirdPersonDraggingRef.current = true;
            lastManualCameraMoveAtRef.current = performance.now();
            activePointerId = event.pointerId;
            dragDistance = 0;
            canvas.setPointerCapture(event.pointerId);
            canvas.focus({ preventScroll: true });
        };
        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerId !== activePointerId || (event.buttons & 1) === 0) return;
            dragDistance += Math.hypot(event.movementX, event.movementY);
            lastManualCameraMoveAtRef.current = performance.now();
            thirdPersonOrbitRef.current = updateThirdPersonOrbit(
                thirdPersonOrbitRef.current,
                event.movementX,
                event.movementY,
            );
            canvas.dispatchEvent(new CustomEvent('campus-camera-orbit-change', {
                detail: { ...thirdPersonOrbitRef.current },
            }));
        };
        const handleClickCapture = (event: MouseEvent) => {
            if (!suppressNextClick) return;
            suppressNextClick = false;
            event.preventDefault();
            event.stopImmediatePropagation();
        };

        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', stopDragging);
        canvas.addEventListener('pointercancel', stopDragging);
        canvas.addEventListener('lostpointercapture', stopDragging);
        canvas.addEventListener('click', handleClickCapture, true);
        return () => {
            canvas.removeEventListener('pointerdown', handlePointerDown);
            canvas.removeEventListener('pointermove', handlePointerMove);
            canvas.removeEventListener('pointerup', stopDragging);
            canvas.removeEventListener('pointercancel', stopDragging);
            canvas.removeEventListener('lostpointercapture', stopDragging);
            canvas.removeEventListener('click', handleClickCapture, true);
            thirdPersonDraggingRef.current = false;
            if (clickResetTimeout !== null) window.clearTimeout(clickResetTimeout);
        };
    }, [cameraMode, gl.domElement]);

    useEffect(() => {
        if (cameraMode !== 'first-person') return undefined;
        cameraYawRef.current = avatarYawRef.current + Math.PI;
        const handlePointerMove = (event: PointerEvent) => {
            if (document.pointerLockElement !== gl.domElement) return;
            cameraYawRef.current -= event.movementX * 0.0022;
            cameraPitchRef.current = MathUtils.clamp(
                cameraPitchRef.current - event.movementY * 0.0018,
                -1.15,
                1.05,
            );
        };
        document.addEventListener('pointermove', handlePointerMove);
        return () => document.removeEventListener('pointermove', handlePointerMove);
    }, [cameraMode, gl.domElement]);

    useFrame((_, rawDelta) => {
        const body = bodyRef.current;
        if (!body) return;
        const delta = Math.min(rawDelta, 0.05);
        const translation = body.translation();
        const playerPosition = new Vector3(translation.x, translation.y, translation.z);
        const nearby = getClosestTarget(playerPosition, targets);
        if ((nearby?.id ?? null) !== nearbyIdRef.current) {
            nearbyIdRef.current = nearby?.id ?? null;
            onNearbyTargetChange(nearby);
        }

        const movement = getCampusMovementVector(movementRef.current);
        const desiredMotion: AvatarMotion = paused || !movement.moving
            ? 'idle'
            : movement.running ? 'run' : 'walk';
        if (motionRef.current !== desiredMotion) {
            motionRef.current = desiredMotion;
            setMotion(desiredMotion);
        }

        if (!paused && movement.moving) {
            const characterController = characterControllerRef.current;
            if (!characterController) return;
            const cameraForward = new Vector3();
            camera.getWorldDirection(cameraForward);
            cameraForward.y = 0;
            if (cameraForward.lengthSq() < 0.001) cameraForward.set(0, 0, -1);
            cameraForward.normalize();
            const cameraRight = new Vector3().crossVectors(cameraForward, new Vector3(0, 1, 0)).normalize();
            const worldMovement = cameraRight.multiplyScalar(movement.x)
                .add(cameraForward.multiplyScalar(-movement.z))
                .normalize();
            const speed = movement.running ? RUN_SPEED : WALK_SPEED;
            const collider = body.collider(0);
            if (collider) {
                characterController.computeColliderMovement(collider, {
                    x: worldMovement.x * speed * delta,
                    y: -0.55 * delta,
                    z: worldMovement.z * speed * delta,
                });
                const corrected = characterController.computedMovement();
                body.setNextKinematicTranslation({
                    x: translation.x + corrected.x,
                    y: translation.y + corrected.y,
                    z: translation.z + corrected.z,
                });
            }

            const targetYaw = Math.atan2(worldMovement.x, worldMovement.z);
            avatarYawRef.current += shortestAngleDifference(avatarYawRef.current, targetYaw)
                * Math.min(1, delta * (movement.running ? 14 : 10));
            stepDistanceRef.current += speed * delta;
            const stepLength = movement.running ? 0.72 : 0.58;
            if (stepDistanceRef.current >= stepLength) {
                stepDistanceRef.current %= stepLength;
                onStep();
            }
        } else {
            stepDistanceRef.current = 0;
        }

        if (avatarRootRef.current) avatarRootRef.current.rotation.y = avatarYawRef.current;

        const updatedTranslation = body.translation();
        const updatedPosition = new Vector3(updatedTranslation.x, updatedTranslation.y, updatedTranslation.z);
        if (!conversationFocusTarget && conversationFocusKeyRef.current) {
            const previousCamera = cameraBeforeConversationRef.current;
            if (previousCamera) {
                cameraYawRef.current = previousCamera.yaw;
                cameraPitchRef.current = previousCamera.pitch;
            }
            cameraBeforeConversationRef.current = null;
            conversationFocusKeyRef.current = null;
        }
        if (cameraMode === 'first-person') {
            const headPosition = updatedPosition.clone().add(new Vector3(0, 0.62, 0));
            if (conversationFocusTarget) {
                const focusTarget = new Vector3(...conversationFocusTarget);
                const focusKey = conversationFocusTarget.join(':');
                if (conversationFocusKeyRef.current !== focusKey) {
                    const previousCamera = {
                        yaw: cameraYawRef.current,
                        pitch: cameraPitchRef.current,
                    };
                    cameraBeforeConversationRef.current ??= previousCamera;
                    camera.position.copy(headPosition);
                    camera.rotation.copy(new Euler(
                        previousCamera.pitch,
                        previousCamera.yaw,
                        0,
                        'YXZ',
                    ));
                    conversationFocusKeyRef.current = focusKey;
                }

                const focusDirection = focusTarget.clone().sub(headPosition);
                cameraYawRef.current = Math.atan2(-focusDirection.x, -focusDirection.z);
                cameraPitchRef.current = Math.atan2(
                    focusDirection.y,
                    Math.hypot(focusDirection.x, focusDirection.z),
                );

                camera.position.copy(headPosition);
                const interpolation = 1 - Math.exp(-delta * 5.5);
                const focusObject = cameraFocusObjectRef.current;
                focusObject.position.copy(headPosition);
                focusObject.lookAt(focusTarget);
                camera.quaternion.slerp(focusObject.quaternion, interpolation);
                cameraInitializedRef.current = true;
                return;
            }
            camera.position.copy(headPosition);
            camera.rotation.copy(new Euler(
                cameraPitchRef.current,
                cameraYawRef.current,
                0,
                'YXZ',
            ));
            cameraInitializedRef.current = true;
            return;
        }

        const manualFollowDelayElapsed = performance.now()
            - lastManualCameraMoveAtRef.current >= MANUAL_CAMERA_FOLLOW_DELAY_MS;
        if (!paused
            && !movement.moving
            && !thirdPersonDraggingRef.current
            && manualFollowDelayElapsed) {
            thirdPersonOrbitRef.current = followThirdPersonOrbit(
                thirdPersonOrbitRef.current,
                avatarYawRef.current,
                delta,
            );
        }

        const lookTarget = updatedPosition.clone().add(new Vector3(0, 0.28, 0));
        const [offsetX, offsetY, offsetZ] = getThirdPersonCameraOffset(
            thirdPersonOrbitRef.current,
        );
        const desiredOffset = new Vector3(offsetX, offsetY, offsetZ);
        const desiredPosition = lookTarget.clone().add(desiredOffset);
        const rayDirection = desiredPosition.clone().sub(lookTarget);
        const desiredDistance = rayDirection.length();
        rayDirection.normalize();
        const hit = world.castRay(
            new rapier.Ray(lookTarget, rayDirection),
            desiredDistance,
            true,
            undefined,
            undefined,
            undefined,
            body,
        );
        const safeDistance = getCollisionSafeCameraDistance(
            desiredDistance,
            hit?.timeOfImpact ?? null,
        );
        const collisionSafePosition = lookTarget.clone().addScaledVector(rayDirection, safeDistance);

        if (!cameraInitializedRef.current) {
            camera.position.copy(collisionSafePosition);
            cameraInitializedRef.current = true;
        } else {
            camera.position.lerp(collisionSafePosition, 1 - Math.exp(-delta * 9));
        }
        camera.lookAt(lookTarget);
    });

    return (
        <RigidBody
            ref={bodyRef}
            type="kinematicPosition"
            colliders={false}
            position={[spawn.position[0], spawn.position[1] + PLAYER_CENTER_HEIGHT, spawn.position[2]]}
            enabledRotations={[false, false, false]}
            canSleep={false}
        >
            <CapsuleCollider args={[0.55, 0.32]} friction={0} />
            <group ref={avatarRootRef}>
                <CampusAvatar avatarId={avatarId} motion={motion} hidden={cameraMode === 'first-person'} />
            </group>
        </RigidBody>
    );
}
