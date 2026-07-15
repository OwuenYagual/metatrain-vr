import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TrainingScene from '../scene/TrainingScene';
import { SceneErrorBoundary } from '../scene/SceneErrorBoundary';
import { contentService } from '../content/contentService';
import { useTrainingStore } from '../store/useTrainingStore';
import { APP_CONFIG } from '../config/appConfig';
import { authService } from '../auth/authService';
import { getErrorMessage } from '../api/apiClient';
import { progressService } from '../progress/progressService';
import { calculateContentProgress, calculateProgress } from '../progress/contentProgress';
import {
    getNextTrainingCheckpointId,
    TRAINING_CHECKPOINT_IDS,
    TRAINING_CHECKPOINTS,
} from '../../shared/trainingModule';

export default function TrainingPage() {
    const {
        contents,
        setContents,
        activeContent,
        setActiveContent,
        completedContentIds,
        setCompletedContentIds,
        visitedCheckpointIds,
        setVisitedCheckpointIds,
    } = useTrainingStore();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingContent, setSavingContent] = useState(false);
    const [checkpointNotice, setCheckpointNotice] = useState('');
    const [moduleStatus, setModuleStatus] = useState<'not_started' | 'in_progress' | 'approved' | 'failed'>('not_started');
    const [moduleScore, setModuleScore] = useState<number | null>(null);
    const navigate = useNavigate();
    const session = authService.getCurrentSession();
    const participantId = session?.participant.id;

    const contentProgress = useMemo(() => calculateContentProgress(
        contents.map((content) => content._id),
        completedContentIds,
    ), [completedContentIds, contents]);
    const completedContentSet = useMemo(
        () => new Set(completedContentIds),
        [completedContentIds],
    );
    const checkpointProgress = useMemo(() => calculateProgress(
        TRAINING_CHECKPOINT_IDS,
        visitedCheckpointIds,
    ), [visitedCheckpointIds]);
    const visitedCheckpointSet = useMemo(
        () => new Set(visitedCheckpointIds),
        [visitedCheckpointIds],
    );
    const nextCheckpointId = getNextTrainingCheckpointId(visitedCheckpointIds);
    const requiredContentsCompleted = contentProgress.totalCount >= APP_CONFIG.MIN_REQUIRED_CONTENTS
        && contentProgress.completedCount === contentProgress.totalCount;
    const requiredCheckpointsCompleted = checkpointProgress.completedCount === APP_CONFIG.MIN_REQUIRED_CHECKPOINTS;
    const guidedRouteCompleted = requiredContentsCompleted && requiredCheckpointsCompleted;
    const activeContentCompleted = activeContent
        ? completedContentSet.has(activeContent._id)
        : false;

    useEffect(() => {
        if (!session?.participant.avatarId || !participantId) {
            navigate('/avatar-selector', { replace: true });
            return;
        }

        const controller = new AbortController();
        setContents([]);
        setCompletedContentIds([]);
        setVisitedCheckpointIds([]);
        setActiveContent(null);

        Promise.all([
            contentService.getTrainingContents(APP_CONFIG.TRAINING_MODULE_ID, controller.signal),
            progressService.getParticipantProgress(
                participantId,
                APP_CONFIG.TRAINING_MODULE_ID,
                controller.signal,
            ),
        ])
            .then(([loadedContents, savedProgress]) => {
                setContents(loadedContents);
                setCompletedContentIds(savedProgress?.completedContents ?? []);
                setVisitedCheckpointIds(savedProgress?.visitedCheckpoints ?? []);
                setModuleStatus(savedProgress?.status ?? 'not_started');
                setModuleScore(savedProgress?.score ?? null);
            })
            .catch((requestError: unknown) => {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(requestError, 'No se pudo cargar la capacitación o su progreso.'));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [
        navigate,
        participantId,
        session?.participant.avatarId,
        setActiveContent,
        setCompletedContentIds,
        setVisitedCheckpointIds,
        setContents,
    ]);

    const completeActiveContent = async () => {
        if (!activeContent) return;
        if (activeContentCompleted) {
            setActiveContent(null);
            return;
        }

        setSavingContent(true);
        setError('');
        try {
            const savedProgress = await contentService.markContentCompleted(
                activeContent.moduleId,
                activeContent._id,
            );
            setCompletedContentIds(savedProgress.completedContents);
            setModuleStatus(savedProgress.status);
            setModuleScore(savedProgress.score);
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
                position: 'absolute', top: 20, left: 20, zIndex: 10,
                width: 'min(420px, calc(100vw - 40px))', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
                background: 'rgba(255, 255, 255, 0.94)', padding: '1rem 1.25rem',
                borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'left', boxSizing: 'border-box',
            }}>
                <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Módulo 1: Inducción</h1>
                <p>Visita los cuatro checkpoints en orden e interactúa con los cinco objetos usando el puntero.</p>
                {loading && <p>Cargando contenidos...</p>}
                {!loading && (
                    <section aria-labelledby="checkpoint-progress-title" aria-live="polite" style={{ marginTop: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
                            <h2 id="checkpoint-progress-title" style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>
                                Checkpoints del recorrido
                            </h2>
                            <strong>{checkpointProgress.completedCount} de {checkpointProgress.totalCount}</strong>
                        </div>
                        <progress
                            aria-label="Checkpoints visitados"
                            value={checkpointProgress.completedCount}
                            max={checkpointProgress.totalCount}
                            style={{ width: '100%', height: '0.85rem', accentColor: '#2563eb' }}
                        />
                        <ol style={{ listStyle: 'none', padding: 0, margin: '0.35rem 0 0.9rem', display: 'grid', gap: '0.25rem' }}>
                            {TRAINING_CHECKPOINTS.map((checkpoint) => {
                                const visited = visitedCheckpointSet.has(checkpoint.id);
                                const next = checkpoint.id === nextCheckpointId;
                                const status = visited ? 'Visitado' : next ? 'Siguiente' : 'Bloqueado';
                                const color = visited ? '#166534' : next ? '#1d4ed8' : '#64748b';
                                return (
                                    <li key={checkpoint.id} style={{ color }}>
                                        <span aria-hidden="true">{visited ? '✓' : next ? '●' : '○'}</span>{' '}
                                        {checkpoint.label}
                                        <span style={{ fontSize: '0.85rem' }}> — {status}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                )}
                {!loading && contentProgress.totalCount > 0 && (
                    <section aria-labelledby="content-progress-title" aria-live="polite" style={{ borderTop: '1px solid #cbd5e1', paddingTop: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
                            <h2 id="content-progress-title" style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>
                                Avance de contenidos
                            </h2>
                            <strong>{contentProgress.completedCount} de {contentProgress.totalCount}</strong>
                        </div>
                        <progress
                            aria-label="Contenidos revisados"
                            value={contentProgress.completedCount}
                            max={contentProgress.totalCount}
                            style={{ width: '100%', height: '1rem', accentColor: '#16a34a' }}
                        />
                        <p style={{ margin: '0.25rem 0 0.75rem', fontSize: '0.9rem' }}>
                            {contentProgress.percentage}% revisado
                        </p>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.3rem' }}>
                            {contents.map((content) => {
                                const completed = completedContentSet.has(content._id);
                                return (
                                    <li key={content._id} style={{ color: completed ? '#166534' : '#475569' }}>
                                        <span aria-hidden="true">{completed ? '✓' : '○'}</span>{' '}
                                        {content.title}
                                        <span style={{ fontSize: '0.85rem' }}> — {completed ? 'Revisado' : 'Pendiente'}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
                {guidedRouteCompleted ? (
                    <section style={{ padding: '0.75rem', margin: '0.9rem 0 0', background: '#dcfce7', color: '#166534', borderRadius: 6 }}>
                        <p role="status" style={{ fontWeight: 600 }}>
                            Recorrido completo: la evaluación final está habilitada.
                        </p>
                        {(moduleStatus === 'approved' || moduleStatus === 'failed') && moduleScore !== null && (
                            <p style={{ marginTop: '0.4rem' }}>
                                Último resultado: {moduleScore}% · {moduleStatus === 'approved' ? 'Aprobado' : 'No aprobado'}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={() => navigate('/evaluation')}
                            style={{ marginTop: '0.65rem', padding: '0.65rem 0.8rem', background: '#166534', color: '#fff', border: 0, borderRadius: 6, fontWeight: 700 }}
                        >
                            {moduleStatus === 'approved' || moduleStatus === 'failed'
                                ? 'Ver resultado de la evaluación'
                                : 'Iniciar evaluación final'}
                        </button>
                    </section>
                ) : requiredContentsCompleted ? (
                    <p role="status" style={{ padding: '0.65rem', margin: '0.9rem 0 0', background: '#eff6ff', color: '#1d4ed8', borderRadius: 6 }}>
                        Has revisado todos los contenidos. Completa los checkpoints pendientes.
                    </p>
                ) : requiredCheckpointsCompleted ? (
                    <p role="status" style={{ padding: '0.65rem', margin: '0.9rem 0 0', background: '#eff6ff', color: '#1d4ed8', borderRadius: 6 }}>
                        Has visitado todos los checkpoints. Revisa los contenidos pendientes.
                    </p>
                ) : null}
                {checkpointNotice && <p role="status" style={{ marginTop: '0.65rem', color: '#166534' }}>{checkpointNotice}</p>}
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
                        {activeContentCompleted && (
                            <p role="status" style={{ color: '#166534', fontWeight: 600 }}>
                                Este contenido ya fue revisado.
                            </p>
                        )}
                        <button type="button" onClick={completeActiveContent} disabled={savingContent} style={{
                            marginTop: '1rem', width: '100%', padding: '0.75rem', background: '#2563eb',
                            color: '#fff', border: 0, borderRadius: '6px', cursor: 'pointer', fontWeight: 700,
                        }}>
                            {savingContent ? 'Guardando...' : activeContentCompleted ? 'Cerrar' : 'Comprendido'}
                        </button>
                    </section>
                </div>
            )}

            <div style={{ width: '100%', height: '100%' }}>
                <SceneErrorBoundary>
                    <TrainingScene
                        onCheckpointSaved={(message) => {
                            setError('');
                            setCheckpointNotice(message);
                        }}
                        onCheckpointError={(message) => {
                            setCheckpointNotice('');
                            setError(message);
                        }}
                    />
                </SceneErrorBoundary>
            </div>
        </main>
    );
}
