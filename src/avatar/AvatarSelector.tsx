import { Component, Suspense, useEffect, useMemo, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getErrorMessage } from '../api/apiClient';
import { authService, type AvatarId, type Participant } from '../auth/authService';

type AvatarOption = {
    id: AvatarId;
    label: string;
    modelUrl: string;
};

type AvatarResponse = {
    participant: Participant;
};

function isAvatarOption(value: unknown): value is AvatarOption {
    if (!value || typeof value !== 'object') return false;
    const avatar = value as Partial<AvatarOption>;
    return ['avatar_01', 'avatar_02', 'avatar_03'].includes(avatar.id ?? '')
        && typeof avatar.label === 'string'
        && typeof avatar.modelUrl === 'string'
        && avatar.modelUrl.endsWith('.glb');
}

function AvatarModel({ modelUrl }: { modelUrl: string }) {
    const { animations, scene } = useGLTF(modelUrl);
    const model = useMemo(() => scene.clone(true), [scene]);

    const { actions } = useAnimations(animations, model);

    useEffect(() => {
        const idleAction = actions.Idle;
        idleAction?.reset().fadeIn(0.2).play();
        return () => {
            idleAction?.fadeOut(0.2);
        };
    }, [actions]);

    return <primitive object={model} />;
}

class AvatarPreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('No se pudo cargar el avatar 3D:', error, info.componentStack);
    }

    render() {
        if (this.state.failed) {
            return <p style={{ padding: '2rem' }}>No se pudo cargar este modelo 3D. Selecciona otro avatar.</p>;
        }
        return this.props.children;
    }
}

function AvatarPreview({ avatar }: { avatar: AvatarOption }) {
    return (
        <AvatarPreviewBoundary key={avatar.id}>
            <div style={{ height: '420px', borderRadius: '16px', overflow: 'hidden', background: '#e8eef8' }}>
                <Canvas camera={{ position: [0, 1.2, 3], fov: 42 }} dpr={[1, 1.5]}>
                    <color attach="background" args={['#e8eef8']} />
                    <ambientLight intensity={1.4} />
                    <directionalLight position={[3, 5, 4]} intensity={2.2} />
                    <directionalLight position={[-3, 2, -2]} intensity={0.8} />
                    <Suspense fallback={null}>
                        <Bounds fit clip observe margin={1.25}>
                            <AvatarModel modelUrl={avatar.modelUrl} />
                        </Bounds>
                    </Suspense>
                    <OrbitControls makeDefault enablePan={false} minDistance={1} maxDistance={6} />
                </Canvas>
            </div>
        </AvatarPreviewBoundary>
    );
}

export default function AvatarSelector() {
    const [avatars, setAvatars] = useState<AvatarOption[]>([]);
    const [selectedId, setSelectedId] = useState<AvatarId | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const session = authService.getCurrentSession();

    useEffect(() => {
        const controller = new AbortController();

        apiFetch('/avatars', { signal: controller.signal })
            .then((response) => response.json())
            .then((data: unknown) => {
                if (!Array.isArray(data) || !data.every(isAvatarOption)) {
                    throw new Error('El servidor devolvió opciones de avatar inválidas.');
                }
                setAvatars(data);
                setSelectedId(session?.participant.avatarId ?? data[0]?.id ?? null);
            })
            .catch((requestError: unknown) => {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(requestError, 'No se pudieron cargar los avatares.'));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [session?.participant.avatarId]);

    const selectedAvatar = avatars.find((avatar) => avatar.id === selectedId) ?? null;

    const handleSaveAvatar = async () => {
        if (!selectedId || !session) return;
        setSaving(true);
        setError('');

        try {
            const response = await apiFetch(`/participants/${session.participant.id}/avatar`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatarId: selectedId }),
            });
            const result = await response.json() as AvatarResponse;
            authService.updateParticipant(result.participant);
            navigate('/campus/lobby');
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'Hubo un problema guardando el avatar.'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p style={{ padding: '3rem' }}>Cargando avatares 3D...</p>;

    return (
        <main style={{ maxWidth: '960px', margin: '2rem auto', padding: '0 1rem', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Selecciona tu avatar 3D</h1>
            <p style={{ color: '#4b5563', marginBottom: '1.5rem' }}>
                Este modelo predefinido representa tu perfil dentro del entorno 3D web.
            </p>

            {error && <p role="alert" style={{ color: '#b91c1c', marginBottom: '1rem' }}>{error}</p>}
            {selectedAvatar && <AvatarPreview avatar={selectedAvatar} />}

            <div role="radiogroup" aria-label="Avatares disponibles" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                {avatars.map((avatar) => {
                    const selected = avatar.id === selectedId;
                    return (
                        <button
                            key={avatar.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setSelectedId(avatar.id)}
                            style={{
                                border: selected ? '3px solid #2563eb' : '1px solid #cbd5e1',
                                borderRadius: '10px',
                                padding: '0.85rem 1.25rem',
                                background: selected ? '#eff6ff' : '#fff',
                                color: '#172033',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            {avatar.label}
                        </button>
                    );
                })}
            </div>

            <button
                type="button"
                onClick={handleSaveAvatar}
                disabled={!selectedId || saving}
                style={{
                    marginTop: '2rem', padding: '0.9rem 2.5rem', fontSize: '1rem',
                    background: selectedId ? '#2563eb' : '#94a3b8', color: '#fff',
                    border: 0, borderRadius: '8px', cursor: selectedId ? 'pointer' : 'not-allowed',
                }}
            >
                {saving ? 'Guardando...' : 'Confirmar y entrar'}
            </button>
        </main>
    );
}
