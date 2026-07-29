export type ThirdPersonOrbit = {
    yaw: number;
    pitch: number;
};

const THIRD_PERSON_HORIZONTAL_DISTANCE = 3.9;
const THIRD_PERSON_HEIGHT = 1.72;
const THIRD_PERSON_DISTANCE = Math.hypot(
    THIRD_PERSON_HORIZONTAL_DISTANCE,
    THIRD_PERSON_HEIGHT,
);
const THIRD_PERSON_YAW_SENSITIVITY = 0.0022;
const THIRD_PERSON_PITCH_SENSITIVITY = 0.0018;
const THIRD_PERSON_MIN_PITCH = 0.08;
const THIRD_PERSON_MAX_PITCH = 1.05;
const THIRD_PERSON_FOLLOW_SPEED = 5;
const CAMERA_COLLISION_PADDING = 0.24;
const CAMERA_MIN_DISTANCE = 0.08;

export const THIRD_PERSON_INITIAL_PITCH = Math.atan2(
    THIRD_PERSON_HEIGHT,
    THIRD_PERSON_HORIZONTAL_DISTANCE,
);

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function shortestAngleDifference(from: number, to: number): number {
    const fullTurn = Math.PI * 2;
    return ((to - from + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}

export function createThirdPersonOrbit(initialYaw: number): ThirdPersonOrbit {
    return {
        yaw: initialYaw,
        pitch: THIRD_PERSON_INITIAL_PITCH,
    };
}

export function updateThirdPersonOrbit(
    orbit: ThirdPersonOrbit,
    deltaX: number,
    deltaY: number,
): ThirdPersonOrbit {
    return {
        yaw: orbit.yaw - deltaX * THIRD_PERSON_YAW_SENSITIVITY,
        pitch: clamp(
            orbit.pitch - deltaY * THIRD_PERSON_PITCH_SENSITIVITY,
            THIRD_PERSON_MIN_PITCH,
            THIRD_PERSON_MAX_PITCH,
        ),
    };
}

export function followThirdPersonOrbit(
    orbit: ThirdPersonOrbit,
    targetYaw: number,
    deltaSeconds: number,
): ThirdPersonOrbit {
    const interpolation = 1 - Math.exp(
        -Math.max(0, deltaSeconds) * THIRD_PERSON_FOLLOW_SPEED,
    );
    return {
        yaw: orbit.yaw + shortestAngleDifference(orbit.yaw, targetYaw) * interpolation,
        pitch: orbit.pitch,
    };
}

export function getThirdPersonCameraOffset(
    orbit: ThirdPersonOrbit,
): readonly [number, number, number] {
    const horizontalDistance = Math.cos(orbit.pitch) * THIRD_PERSON_DISTANCE;
    return [
        -Math.sin(orbit.yaw) * horizontalDistance,
        Math.sin(orbit.pitch) * THIRD_PERSON_DISTANCE,
        -Math.cos(orbit.yaw) * horizontalDistance,
    ];
}

export function getCollisionSafeCameraDistance(
    desiredDistance: number,
    hitDistance: number | null,
): number {
    if (hitDistance === null) return desiredDistance;

    const minimumBeforeHit = Math.min(CAMERA_MIN_DISTANCE, hitDistance * 0.5);
    const paddedDistance = Math.max(0, hitDistance - CAMERA_COLLISION_PADDING);
    return Math.min(
        desiredDistance,
        Math.max(minimumBeforeHit, paddedDistance),
    );
}
