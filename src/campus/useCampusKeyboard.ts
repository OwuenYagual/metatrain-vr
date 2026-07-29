import { useEffect, useRef } from 'react';
import {
    createCampusMovementState,
    getCampusCommand,
    isCampusControlCode,
    resetCampusMovement,
    updateCampusMovementKey,
    type CampusMovementState,
} from './campusControls';

type CampusKeyboardOptions = {
    paused: boolean;
    onInteract: () => void;
    onToggleCamera: () => void;
    onEscape: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;
}

export function useCampusKeyboard({
    paused,
    onInteract,
    onToggleCamera,
    onEscape,
}: CampusKeyboardOptions) {
    const movementRef = useRef<CampusMovementState>(createCampusMovementState());

    useEffect(() => {
        if (paused) resetCampusMovement(movementRef.current);
    }, [paused]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const command = getCampusCommand(event.code);
            if (command === 'escape') {
                onEscape();
                resetCampusMovement(movementRef.current);
                return;
            }

            if (paused || isEditableTarget(event.target)) return;
            if (event.code === 'Enter' && event.target instanceof HTMLButtonElement) return;
            if (isCampusControlCode(event.code)) event.preventDefault();
            updateCampusMovementKey(movementRef.current, event.code, true);
            if (event.repeat) return;

            if (command === 'interact') onInteract();
            if (command === 'toggle-camera') onToggleCamera();
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            updateCampusMovementKey(movementRef.current, event.code, false);
        };

        const handleBlur = () => resetCampusMovement(movementRef.current);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, [onEscape, onInteract, onToggleCamera, paused]);

    return movementRef;
}
