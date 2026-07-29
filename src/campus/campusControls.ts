export type CampusMovementState = {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    running: boolean;
};

export type CampusMovementVector = {
    x: number;
    z: number;
    running: boolean;
    moving: boolean;
};

export type CampusCommand = 'interact' | 'toggle-camera' | 'escape' | null;

const MOVEMENT_KEYS: Readonly<Record<string, keyof CampusMovementState>> = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'backward',
    ArrowDown: 'backward',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    ShiftLeft: 'running',
    ShiftRight: 'running',
};

export function createCampusMovementState(): CampusMovementState {
    return {
        forward: false,
        backward: false,
        left: false,
        right: false,
        running: false,
    };
}

export function updateCampusMovementKey(
    state: CampusMovementState,
    code: string,
    pressed: boolean,
): boolean {
    const key = MOVEMENT_KEYS[code];
    if (!key) return false;
    state[key] = pressed;
    return true;
}

export function resetCampusMovement(state: CampusMovementState): void {
    Object.assign(state, createCampusMovementState());
}

export function getCampusMovementVector(state: CampusMovementState): CampusMovementVector {
    const rawX = Number(state.right) - Number(state.left);
    const rawZ = Number(state.backward) - Number(state.forward);
    const length = Math.hypot(rawX, rawZ);

    return {
        x: length > 0 ? rawX / length : 0,
        z: length > 0 ? rawZ / length : 0,
        running: state.running,
        moving: length > 0,
    };
}

export function getCampusCommand(code: string): CampusCommand {
    if (code === 'KeyE' || code === 'Enter') return 'interact';
    if (code === 'KeyV') return 'toggle-camera';
    if (code === 'Escape') return 'escape';
    return null;
}

export function isCampusControlCode(code: string): boolean {
    return Boolean(MOVEMENT_KEYS[code]) || getCampusCommand(code) !== null;
}

