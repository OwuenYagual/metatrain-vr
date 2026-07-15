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

    const shellStyle = {
        width: 'min(820px, calc(100% - 2rem))',
        margin: '2rem auto',
        padding: 'clamp(1.25rem, 4vw, 2.5rem)',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
        boxSizing: 'border-box' as const,
        textAlign: 'left' as const,
    };

    return (
        <main style={{ minHeight: '100vh', width: '100%', background: '#eef2ff', padding: '1px 0', color: '#172033' }}>
            <section style={shellStyle}>
                <header style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <p style={{ color: '#475569', marginBottom: '0.35rem' }}>Módulo 1 · Simulación formativa</p>
                    <h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 5vw, 2.5rem)' }}>
                        {scenario?.title ?? 'Simulación de decisiones'}
                    </h1>
                    {session?.participant.fullName && (
                        <p style={{ marginTop: '0.5rem' }}>Participante: {session.participant.fullName}</p>
                    )}
                </header>

                {loading && <p role="status">Cargando simulación...</p>}
                {error && (
                    <p role="alert" style={{ padding: '0.85rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 8 }}>
                        {error}
                    </p>
                )}

                {!loading && scenario && progress && (
                    <>
                        <p style={{ lineHeight: 1.6 }}>{scenario.introduction}</p>
                        <section aria-labelledby="simulation-progress-title" style={{ margin: '1.25rem 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                <h2 id="simulation-progress-title" style={{ fontSize: '1rem' }}>Avance de la simulación</h2>
                                <strong>{progress.completedCount} de {progress.requiredCount}</strong>
                            </div>
                            <progress value={progress.completedCount} max={progress.requiredCount} style={{ width: '100%', accentColor: '#4f46e5' }} />
                            <p style={{ marginTop: '0.35rem', color: '#475569', fontSize: '0.9rem' }}>
                                No tiene nota: el objetivo es practicar y revisar la retroalimentación.
                            </p>
                        </section>

                        {feedback ? (
                            <section aria-labelledby="feedback-title" style={{ padding: '1.25rem', background: feedback.recommended ? '#dcfce7' : '#fff7ed', color: feedback.recommended ? '#166534' : '#9a3412', borderRadius: 12 }}>
                                <h2 id="feedback-title" style={{ marginTop: 0 }}>
                                    {feedback.recommended ? 'Decisión recomendada' : 'Revisa esta decisión'}
                                </h2>
                                <p role="status" style={{ lineHeight: 1.6 }}>{feedback.feedback}</p>
                                <button type="button" onClick={() => setFeedback(null)} style={{ marginTop: '1rem', padding: '0.7rem 1rem', fontWeight: 700 }}>
                                    {progress.completed ? 'Ver resumen' : 'Continuar'}
                                </button>
                            </section>
                        ) : progress.completed ? (
                            <section aria-labelledby="simulation-summary-title">
                                <h2 id="simulation-summary-title">Simulación completada</h2>
                                <p style={{ marginBottom: '1rem' }}>Tus tres decisiones quedaron guardadas. Ya puedes iniciar la evaluación final.</p>
                                <ol style={{ display: 'grid', gap: '0.75rem', paddingLeft: '1.25rem' }}>
                                    {scenario.decisions.map((decision) => {
                                        const selection = progress.decisions.find((item) => item.decisionId === decision.id);
                                        const option = decision.options.find((item) => item.id === selection?.selectedOptionId);
                                        return (
                                            <li key={decision.id}>
                                                <strong>{decision.prompt}</strong>
                                                <p style={{ marginTop: '0.25rem', color: selection?.recommended ? '#166534' : '#9a3412' }}>
                                                    {option?.text ?? 'Sin respuesta'}
                                                </p>
                                            </li>
                                        );
                                    })}
                                </ol>
                                <button type="button" onClick={() => navigate('/evaluation')} style={{ width: '100%', marginTop: '1.25rem', padding: '0.9rem', background: '#166534', color: '#fff', border: 0, borderRadius: 8, fontWeight: 800 }}>
                                    Iniciar evaluación final
                                </button>
                            </section>
                        ) : currentDecision ? (
                            <section aria-labelledby="decision-title" style={{ padding: '1.25rem', border: '1px solid #cbd5e1', borderRadius: 12 }}>
                                <p style={{ color: '#4f46e5', fontWeight: 700, marginBottom: '0.5rem' }}>
                                    Decisión {progress.completedCount + 1} de {progress.requiredCount}
                                </p>
                                <h2 id="decision-title" style={{ lineHeight: 1.35 }}>{currentDecision.prompt}</h2>
                                <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
                                    {currentDecision.options.map((option) => (
                                        <label key={option.id} style={{ display: 'flex', gap: '0.65rem', padding: '0.8rem', background: selectedOptionId === option.id ? '#e0e7ff' : '#f8fafc', borderRadius: 8, cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name={`decision-${currentDecision.id}`}
                                                value={option.id}
                                                checked={selectedOptionId === option.id}
                                                onChange={() => setSelectedOptionId(option.id)}
                                                disabled={saving}
                                            />
                                            <span>{option.text}</span>
                                        </label>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void submitDecision()}
                                    disabled={!selectedOptionId || saving}
                                    style={{ width: '100%', marginTop: '1rem', padding: '0.85rem', background: selectedOptionId ? '#4f46e5' : '#94a3b8', color: '#fff', border: 0, borderRadius: 8, fontWeight: 800 }}
                                >
                                    {saving ? 'Guardando...' : 'Confirmar decisión'}
                                </button>
                            </section>
                        ) : null}
                    </>
                )}

                <footer style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.75rem', paddingTop: '1rem', borderTop: '1px solid #cbd5e1' }}>
                    <button type="button" onClick={() => navigate('/training')}>Volver al recorrido</button>
                    <button type="button" onClick={logout}>Cerrar sesión</button>
                </footer>
            </section>
        </main>
    );
}
