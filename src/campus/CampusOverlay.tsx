import { useEffect, useRef, type ReactNode } from 'react';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden'));
}

export function CampusOverlay({
    title,
    children,
    onClose,
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
}) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (document.pointerLockElement) document.exitPointerLock();
        closeRef.current?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = getFocusableElements(dialogRef.current);
            if (!focusable.length) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="campus-overlay-backdrop">
            <div
                ref={dialogRef}
                className="campus-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="campus-overlay-title"
                tabIndex={-1}
            >
                <header className="campus-overlay-header">
                    <div>
                        <p>Actividad inmersiva</p>
                        <h2 id="campus-overlay-title">{title}</h2>
                    </div>
                    <button ref={closeRef} type="button" onClick={onClose} aria-label={`Cerrar ${title}`}>
                        ×
                    </button>
                </header>
                <div className="campus-overlay-content">{children}</div>
            </div>
        </div>
    );
}
