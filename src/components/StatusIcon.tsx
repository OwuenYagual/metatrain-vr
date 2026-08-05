type StatusIconName = 'active' | 'check' | 'lock' | 'pending' | 'retry';

export function StatusIcon({ name }: { name: StatusIconName }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            aria-hidden="true"
            focusable="false"
        >
            {name === 'active' && <path d="m9 6 8 6-8 6Z" fill="currentColor" stroke="none" />}
            {name === 'check' && <path d="m5 12.5 4.25 4L19 7" />}
            {name === 'lock' && (
                <>
                    <rect x="6.5" y="10" width="11" height="9" rx="2" />
                    <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
                </>
            )}
            {name === 'pending' && <circle cx="12" cy="12" r="5.5" />}
            {name === 'retry' && (
                <>
                    <path d="M20 7v5h-5" />
                    <path d="M19 12a7 7 0 1 0-2.05 4.95" />
                </>
            )}
        </svg>
    );
}
