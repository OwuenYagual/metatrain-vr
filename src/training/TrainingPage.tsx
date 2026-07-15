import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TrainingScene from '../scene/TrainingScene';
import { SceneErrorBoundary } from '../scene/SceneErrorBoundary';
import { contentService } from '../content/contentService';
import { useTrainingStore } from '../store/useTrainingStore';
import { APP_CONFIG } from '../config/appConfig';
import { authService } from '../auth/authService';
import { getErrorMessage } from '../api/apiClient';

export default function TrainingPage() {
    const { contents, setContents, activeContent, setActiveContent } = useTrainingStore();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingContent, setSavingContent] = useState(false);
    const navigate = useNavigate();
    const session = authService.getCurrentSession();

    useEffect(() => {
        if (!session?.participant.avatarId) {
            navigate('/avatar-selector', { replace: true });
            return;
        }

        const controller = new AbortController();
        contentService.getTrainingContents(APP_CONFIG.TRAINING_MODULE_ID, controller.signal)
            .then(setContents)
            .catch((requestError: unknown) => {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(requestError, 'No se pudo cargar el contenido de capacitación.'));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [navigate, session?.participant.avatarId, setContents]);

    const completeActiveContent = async () => {
        if (!activeContent) return;
        setSavingContent(true);
        try {
            await contentService.markContentCompleted(activeContent.moduleId, activeContent._id);
            setActiveContent(null);
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'No se pudo guardar el contenido completado.'));
        } finally {
            setSavingContent(false);
        }
    };

    const logout = () => {
        authService.logout();
        navigate('/login', { replace: true });
    };

    return (
        <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            <section style={{
                position: 'absolute', top: 20, left: 20, zIndex: 10, maxWidth: 420,
                background: 'rgba(255, 255, 255, 0.94)', padding: '1rem 1.25rem',
                borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'left',
            }}>
                <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Módulo 1: Inducción</h1>
                <p>Interactúa con los cinco objetos usando el puntero.</p>
                {loading && <p>Cargando contenidos...</p>}
                {!loading && contents.length < APP_CONFIG.MIN_REQUIRED_CONTENTS && (
                    <p role="alert" style={{ color: '#92400e' }}>
                        El módulo requiere al menos {APP_CONFIG.MIN_REQUIRED_CONTENTS} contenidos; se encontraron {contents.length}.
                    </p>
                )}
                {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
                <button type="button" onClick={logout} style={{ marginTop: '0.75rem' }}>Cerrar sesión</button>
            </section>

            {activeContent && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', padding: '1rem' }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="content-title" style={{
                        background: '#fff', padding: '2rem', borderRadius: '12px', color: '#172033',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.3)', maxWidth: '560px', width: '100%', textAlign: 'left',
                    }}>
                        <h2 id="content-title" style={{ marginTop: 0 }}>{activeContent.title}</h2>
                        <p style={{ lineHeight: 1.6 }}>{activeContent.body}</p>
                        <button type="button" onClick={completeActiveContent} disabled={savingContent} style={{
                            marginTop: '1rem', width: '100%', padding: '0.75rem', background: '#2563eb',
                            color: '#fff', border: 0, borderRadius: '6px', cursor: 'pointer', fontWeight: 700,
                        }}>
                            {savingContent ? 'Guardando...' : 'Comprendido'}
                        </button>
                    </section>
                </div>
            )}

            <div style={{ width: '100%', height: '100%' }}>
                <SceneErrorBoundary><TrainingScene /></SceneErrorBoundary>
            </div>
        </main>
    );
}
