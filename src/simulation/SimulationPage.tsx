import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../auth/authService';
import { getErrorMessage } from '../api/apiClient';
import { APP_CONFIG } from '../config/appConfig';
import {
    simulationService,
    type SimulationProgress,
    type SimulationScenario,
    type SimulationSelection,
} from './simulationService';
import { StatusIcon } from '../components/StatusIcon';
import './SimulationPage.css';

export default function SimulationPage() {
    const [scenario, setScenario] = useState<SimulationScenario | null>(null);
    const [progress, setProgress] = useState<SimulationProgress | null>(null);
    const [selectedOptionId, setSelectedOptionId] = useState('');
    const [feedback, setFeedback] = useState<SimulationSelection | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const session = authService.getCurrentSession();
    const currentDecision = useMemo(
        () => scenario?.decisions.find((decision) => decision.id === progress?.nextDecisionId) ?? null,
        [progress?.nextDecisionId, scenario],
    );

    useEffect(() => {
        const controller = new AbortController();
        simulationService.getSimulation(APP_CONFIG.TRAINING_MODULE_ID, controller.signal)
            .then((payload) => {
                setScenario(payload.scenario);
                setProgress(payload.simulation);
            })
            .catch((requestError: unknown) => {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(requestError, 'No se pudo cargar la simulación.'));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, []);

    const submitDecision = async () => {
        if (!scenario || !currentDecision || !selectedOptionId) return;
        setSaving(true);
        setError('');
        try {
            const response = await simulationService.submitDecision(
                APP_CONFIG.TRAINING_MODULE_ID,
                scenario.id,
                currentDecision.id,
                selectedOptionId,
            );
            setProgress(response.simulation);
            setFeedback(response.selection);
            setSelectedOptionId('');
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'No se pudo guardar la decisión.'));
        } finally {
            setSaving(false);
        }
    };

    const logout = () => {
        authService.logout();
        navigate('/login', { replace: true });
    };

    return (
        <main className="simulation-page">
            <header className="simulation-header">
                <div>
                    <p>Inducción · Reto de integración</p>
                    <h1>{scenario?.title ?? 'Tu primer día en la empresa'}</h1>
                    {session?.participant.fullName && <span>En capacitación: {session.participant.fullName}</span>}
                </div>
                <div className="simulation-header-actions">
                    <button type="button" onClick={() => navigate('/training')}>Volver a la oficina</button>
                    <button type="button" onClick={logout}>Cerrar sesión</button>
                </div>
            </header>

            {loading && <p className="simulation-loading" role="status">Preparando tu primera jornada...</p>}
            {error && <p className="simulation-error" role="alert">{error}</p>}

            {!loading && scenario && progress && (
                <div className="simulation-workspace">
                    <section className="first-day-map" aria-labelledby="first-day-map-title">
                        <div>
                            <p className="simulation-eyebrow">Recorrido del día</p>
                            <h2 id="first-day-map-title">Tu oficina</h2>
                            <p>{scenario.introduction}</p>
                        </div>
                        <div className="office-zones">
                            {[
                                { name: 'Políticas', time: '08:30' },
                                { name: 'Talento Humano', time: '11:00' },
                                { name: 'Operaciones', time: '15:30' },
                            ].map((zone, index) => {
                                const completed = index < progress.completedCount;
                                const active = index === progress.completedCount && !progress.completed;
                                return (
                                    <article className={`office-zone ${completed ? 'is-completed' : ''} ${active ? 'is-active' : ''}`} key={zone.name}>
                                        <div><small>{zone.time}</small><strong>{zone.name}</strong></div>
                                        <span aria-hidden="true">
                                            <StatusIcon name={completed ? 'check' : active ? 'active' : 'pending'} />
                                        </span>
                                    </article>
                                );
                            })}
                        </div>
                        <div className="simulation-progress">
                            <div><span>Jornada completada</span><strong>{progress.completedCount} de {progress.requiredCount}</strong></div>
                            <progress value={progress.completedCount} max={progress.requiredCount} />
                            <small>Es una práctica formativa: cada decisión genera una consecuencia y puede revisarse.</small>
                        </div>
                    </section>

                    <section className="decision-workbench" aria-live="polite">
                        {feedback ? (
                            <article className={`decision-consequence ${feedback.recommended ? 'is-positive' : 'is-warning'}`}>
                                <p className="simulation-eyebrow">Consecuencia de tu acción</p>
                                <div className="consequence-icon" aria-hidden="true">
                                    <StatusIcon name={feedback.recommended ? 'check' : 'retry'} />
                                </div>
                                <h2>{feedback.recommended ? 'Aplicaste la inducción' : 'Hay una opción más segura'}</h2>
                                <p>{feedback.feedback}</p>
                                <button type="button" onClick={() => setFeedback(null)}>
                                    {progress.completed ? 'Ver cierre de la jornada' : 'Continuar el recorrido'}
                                </button>
                            </article>
                        ) : progress.completed ? (
                            <article className="simulation-summary">
                                <p className="simulation-eyebrow">Jornada terminada</p>
                                <h2>Completaste tu primer día</h2>
                                <p>Aplicaste políticas, identificaste a quién pedir apoyo y practicaste las funciones de tu puesto.</p>
                                <div className="decision-log">
                                    {scenario.decisions.map((decision, index) => {
                                        const selection = progress.decisions.find((item) => item.decisionId === decision.id);
                                        const option = decision.options.find((item) => item.id === selection?.selectedOptionId);
                                        return (
                                            <article key={decision.id}>
                                                <span>{index + 1}</span>
                                                <div><strong>{decision.prompt.split('·')[0]}</strong><p>{option?.text ?? 'Sin respuesta'}</p></div>
                                            </article>
                                        );
                                    })}
                                </div>
                                <button className="evaluation-button" type="button" onClick={() => navigate('/evaluation')}>Iniciar evaluación final</button>
                            </article>
                        ) : currentDecision ? (
                            <article className="active-decision">
                                <p className="simulation-eyebrow">Momento {progress.completedCount + 1} de {progress.requiredCount}</p>
                                <h2>{currentDecision.prompt}</h2>
                                <p>Elige una acción para ver su consecuencia en la jornada.</p>
                                <div className="action-cards">
                                    {currentDecision.options.map((option, index) => (
                                        <button
                                            type="button"
                                            key={option.id}
                                            className={selectedOptionId === option.id ? 'is-selected' : ''}
                                            onClick={() => setSelectedOptionId(option.id)}
                                            disabled={saving}
                                        >
                                            <span>{String.fromCharCode(65 + index)}</span>
                                            {option.text}
                                        </button>
                                    ))}
                                </div>
                                <button className="execute-action" type="button" onClick={() => void submitDecision()} disabled={!selectedOptionId || saving}>
                                    {saving ? 'Registrando acción...' : 'Ejecutar esta acción'}
                                </button>
                            </article>
                        ) : null}
                    </section>
                </div>
            )}
        </main>
    );
}
