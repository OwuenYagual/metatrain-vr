import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from './authService';

function UserIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </svg>
    );
}

export function UserMenu({ embedded = false }: { embedded?: boolean }) {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return undefined;

        const closeMenu = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopImmediatePropagation();
            setOpen(false);
            triggerRef.current?.focus();
        };

        document.addEventListener('pointerdown', closeMenu);
        window.addEventListener('keydown', closeOnEscape, { capture: true });
        return () => {
            document.removeEventListener('pointerdown', closeMenu);
            window.removeEventListener('keydown', closeOnEscape, { capture: true });
        };
    }, [open]);

    const logout = () => {
        authService.logout();
        navigate('/login', { replace: true });
    };

    return (
        <div
            className={`global-user-menu ${embedded ? 'is-embedded' : ''}`}
            ref={menuRef}
        >
            {open && (
                <div className="global-user-popover" role="menu" aria-label="Menú de usuario">
                    <button type="button" role="menuitem" onClick={logout}>Cerrar sesión</button>
                </div>
            )}
            <button
                ref={triggerRef}
                type="button"
                className={open ? 'is-active' : ''}
                aria-label={open ? 'Cerrar menú de usuario' : 'Abrir menú de usuario'}
                aria-haspopup="menu"
                aria-expanded={open}
                title="Usuario"
                onClick={() => setOpen((current) => !current)}
            >
                <UserIcon />
            </button>
        </div>
    );
}
