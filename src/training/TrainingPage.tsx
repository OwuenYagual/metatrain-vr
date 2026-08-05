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
import { calculateContentProgress, getCompletedStationIds } from '../progress/contentProgress';
import { isTrainingStationUnlocked, TRAINING_STATIONS } from '../../shared/trainingModule';
import InductionActivityPanel from '../induction/InductionActivityPanel';
import { StatusIcon } from '../components/StatusIcon';
import './TrainingPage.css';

export default function TrainingPage() {
    const contents = useTrainingStore((state) => state.contents);
    const setContents = useTrainingStore((state) => state.setContents);
    const activeContent = useTrainingStore((state) => state.activeContent);
    const setActiveContent = useTrainingStore((state) => state.setActiveContent);
    const completedContentIds = useTrainingStore((state) => state.completedContentIds);
    const setCompletedContentIds = useTrainingStore((state) => state.setCompletedContentIds);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingContent, setSavingContent] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [moduleStatus, setModuleStatus] = useState<'not_started' | 'in_progress' | 'approved' | 'failed'>('not_started');
    const [moduleScore, setModuleScore] = useState<number | null>(null);
    const [simulationCompleted, setSimulationCompleted] = useState(false);
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
    const completedStationIds = useMemo(
        () => getCompletedStationIds(contents, completedContentIds),
        [completedContentIds, contents],
    );
    const requiredContentsCompleted = contentProgress.totalCount >= APP_CONFIG.MIN_REQUIRED_CONTENTS
        && contentProgress.completedCount === contentProgress.totalCount;
    const moduleFinalized = moduleStatus === 'approved' || moduleStatus === 'failed';
    const evaluationAvailable = simulationCompleted || moduleFinalized;
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
                setModuleStatus(savedProgress?.status ?? 'not_started');
                setModuleScore(savedProgress?.score ?? null);
                setSimulationCompleted(savedProgress?.simulationCompleted ?? false);
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
            setSimulationCompleted(savedProgress.simulationCompleted);
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
        <main className="training-page">
            <button
                type="button"
                className={`training-menu-toggle ${menuOpen ? 'is-open' : ''}`}
                aria-label={menuOpen ? 'Cerrar menú de capacitación' : 'Abrir menú de capacitación'}
                aria-expanded={menuOpen}
                aria-controls="training-navigation"
                onClick={() => setMenuOpen((current) => !current)}
            >
                <span className="training-menu-icon" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </span>
            </button>

            {menuOpen && (
                <section id="training-navigation" className="training-hud">
                    <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Inducción: conoce tu empresa</h1>
                    <p>Sigue la ruta entrecortada, conversa con cada guía y observa cómo se pinta de verde al superar las estaciones.</p>
                {loading && <p>Cargando contenidos...</p>}
                {!loading && contentProgress.totalCount > 0 && (
                    <section aria-labelledby="content-progress-title" aria-live="polite" style={{ marginTop: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
                            <h2 id="content-progress-title" style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>
                                Estaciones interactivas
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
                            {contentProgress.percentage}% completado
                        </p>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.3rem' }}>
                            {contents.map((content) => {
                                const completed = completedContentSet.has(content._id);
                                const station = TRAINING_STATIONS.find(({ id }) => id === content.interactionObjectId);
                                const unlocked = isTrainingStationUnlocked(
                                    content.interactionObjectId,
                                    completedStationIds,
                                );
                                const status = completed ? 'Superada' : unlocked ? 'Disponible' : 'Bloqueada';
                                return (
                                    <li key={content._id}>
                                        <button
                                            type="button"
                                            aria-label={unlocked
                                                ? `Habla con ${station?.guide.name ?? 'tu guía'} sobre ${content.title}.`
                                                : `${content.title}: bloqueada hasta completar la estación anterior.`}
                                            onClick={() => {
                                                if (unlocked) {
                                                    setActiveContent(content);
                                                    setMenuOpen(false);
                                                }
                                            }}
                                            disabled={!unlocked}
                                            style={{
                                                width: '100%',
                                                border: `1px solid ${completed ? '#86efac' : unlocked ? '#cbd5e1' : '#d8dee8'}`,
                                                borderRadius: 6,
                                                background: completed ? '#f0fdf4' : unlocked ? '#f8fafc' : '#e2e8f0',
                                                padding: '0.42rem 0.55rem',
                                                color: completed ? '#166534' : unlocked ? '#334155' : '#64748b',
                                                textAlign: 'left',
                                                cursor: unlocked ? 'pointer' : 'not-allowed',
                                                opacity: unlocked ? 1 : 0.72,
                                            }}
                                        >
                                            <span aria-hidden="true">
                                                <StatusIcon name={completed ? 'check' : unlocked ? 'active' : 'lock'} />
                                            </span>{' '}
                                            {content.title}
                                            <span style={{ fontSize: '0.85rem' }}> — {status}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
                {requiredContentsCompleted && (
                    <section style={{ padding: '0.75rem', margin: '0.9rem 0 0', background: evaluationAvailable ? '#dcfce7' : '#fff7ed', color: evaluationAvailable ? '#166534' : '#9a3412', borderRadius: 6 }}>
                        <p role="status" style={{ fontWeight: 600 }}>
                            {evaluationAvailable
                                ? 'Inducción y reto de integración completos: la evaluación final está habilitada.'
                                : 'Recorrido completo: aplica lo aprendido en el reto de tu primer día.'}
                        </p>
                        {moduleFinalized && moduleScore !== null && (
                            <p style={{ marginTop: '0.4rem' }}>
                                Último resultado: {moduleScore}% · {moduleStatus === 'approved' ? 'Aprobado' : 'No aprobado'}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setMenuOpen(false);
                                navigate(evaluationAvailable ? '/evaluation' : '/simulation');
                            }}
                            style={{ marginTop: '0.65rem', padding: '0.65rem 0.8rem', background: evaluationAvailable ? '#166534' : '#c2410c', color: '#fff', border: 0, borderRadius: 6, fontWeight: 700 }}
                        >
                            {moduleFinalized
                                ? 'Ver resultado de la evaluación'
                                : simulationCompleted
                                    ? 'Iniciar evaluación final'
                                    : 'Iniciar reto de integración'}
                        </button>
                    </section>
                )}
                {!loading && contents.length < APP_CONFIG.MIN_REQUIRED_CONTENTS && (
                    <p role="alert" style={{ color: '#92400e' }}>
                        El módulo requiere al menos {APP_CONFIG.MIN_REQUIRED_CONTENTS} contenidos; se encontraron {contents.length}.
                    </p>
                )}
                {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
                    <button type="button" onClick={logout} style={{ marginTop: '0.75rem' }}>Cerrar sesión</button>
                </section>
            )}

            {activeContent && (
                <InductionActivityPanel
                    key={activeContent._id}
                    content={activeContent}
                    alreadyCompleted={activeContentCompleted}
                    saving={savingContent}
                    onComplete={() => void completeActiveContent()}
                    onClose={() => setActiveContent(null)}
                />
            )}

            <div className={`training-scene-shell ${activeContent ? 'has-active-station' : ''}`}>
                <SceneErrorBoundary>
                    <TrainingScene onStationOpen={() => setMenuOpen(false)} />
                </SceneErrorBoundary>
            </div>
        </main>
    );
}
