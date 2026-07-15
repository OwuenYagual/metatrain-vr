import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../auth/authService';
import { getErrorMessage } from '../api/apiClient';
import { APP_CONFIG } from '../config/appConfig';
import {
    evaluationService,
    type EvaluationQuestion,
    type EvaluationResult,
} from './evaluationService';

export default function EvaluationPage() {
    const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [result, setResult] = useState<EvaluationResult | null>(null);
    const [passingScore, setPassingScore] = useState<number>(APP_CONFIG.MIN_PASSING_SCORE);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const session = authService.getCurrentSession();
    const answeredCount = useMemo(
        () => questions.filter((question) => Boolean(answers[question.id])).length,
        [answers, questions],
    );

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([
            evaluationService.getQuestions(APP_CONFIG.TRAINING_MODULE_ID, controller.signal),
            evaluationService.getLatestResult(APP_CONFIG.TRAINING_MODULE_ID, controller.signal),
        ])
            .then(([evaluation, latestResult]) => {
                setQuestions(evaluation.questions);
                setPassingScore(evaluation.passingScore);
                setResult(latestResult);
            })
            .catch((requestError: unknown) => {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(requestError, 'No se pudo cargar la evaluación.'));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, []);

    const submitEvaluation = async (event: FormEvent) => {
        event.preventDefault();
        if (answeredCount !== questions.length) return;
        setSubmitting(true);
        setError('');
        try {
            const savedResult = await evaluationService.submit(
                APP_CONFIG.TRAINING_MODULE_ID,
                questions.map((question) => ({
                    questionId: question.id,
                    optionId: answers[question.id],
                })),
            );
            setResult(savedResult);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'No se pudo calificar la evaluación.'));
        } finally {
            setSubmitting(false);
        }
    };

    const retryEvaluation = () => {
        setAnswers({});
        setResult(null);
        setError('');
    };

    const logout = () => {
        authService.logout();
        navigate('/login', { replace: true });
    };

    const shellStyle = {
        width: 'min(780px, calc(100% - 2rem))',
        margin: '2rem auto',
        padding: 'clamp(1.25rem, 4vw, 2.5rem)',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
        boxSizing: 'border-box' as const,
        textAlign: 'left' as const,
    };

    return (
        <main style={{ minHeight: '100vh', width: '100%', background: '#f1f5f9', padding: '1px 0', color: '#172033' }}>
            <section style={shellStyle}>
                <header style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <p style={{ color: '#475569', marginBottom: '0.35rem' }}>Módulo 1 · Inducción</p>
                    <h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 5vw, 2.5rem)' }}>Evaluación final</h1>
                    {session?.participant.fullName && (
                        <p style={{ marginTop: '0.5rem' }}>Participante: {session.participant.fullName}</p>
                    )}
                </header>

                {loading && <p role="status">Cargando evaluación...</p>}
                {error && (
                    <p role="alert" style={{ padding: '0.85rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 8 }}>
                        {error}
                    </p>
                )}

                {!loading && result && (
                    <section aria-labelledby="evaluation-result-title" style={{ textAlign: 'center', padding: '1rem 0' }}>
                        <p aria-hidden="true" style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>
                            {result.status === 'approved' ? '✓' : '↻'}
                        </p>
                        <h2 id="evaluation-result-title" style={{ fontSize: '1.7rem' }}>
                            {result.status === 'approved' ? 'Evaluación aprobada' : 'Aún puedes intentarlo nuevamente'}
                        </h2>
                        <p style={{ fontSize: '2.6rem', fontWeight: 800, color: result.status === 'approved' ? '#166534' : '#b45309', margin: '1rem 0' }}>
                            {result.score}%
                        </p>
                        <p>
                            Respondiste correctamente {result.correctAnswers} de {result.totalQuestions} preguntas.
                            La nota mínima es {passingScore}%.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem' }}>
                            {result.status === 'failed' && (
                                <button type="button" onClick={retryEvaluation} style={{ padding: '0.75rem 1rem', background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700 }}>
                                    Intentar nuevamente
                                </button>
                            )}
                        </div>
                    </section>
                )}

                {!loading && !result && questions.length > 0 && (
                    <form onSubmit={submitEvaluation}>
                        <p id="evaluation-instructions" style={{ padding: '0.85rem', background: '#eff6ff', color: '#1e40af', borderRadius: 8 }}>
                            Selecciona una respuesta por pregunta. Necesitas {passingScore}% para aprobar.
                        </p>
                        <p aria-live="polite" style={{ margin: '1rem 0', fontWeight: 700 }}>
                            {answeredCount} de {questions.length} respondidas
                        </p>
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            {questions.map((question, questionIndex) => (
                                <fieldset key={question.id} disabled={submitting} aria-describedby="evaluation-instructions" style={{ padding: '1rem', border: '1px solid #cbd5e1', borderRadius: 10 }}>
                                    <legend style={{ padding: '0 0.4rem', fontWeight: 700 }}>
                                        {questionIndex + 1}. {question.text}
                                    </legend>
                                    <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.5rem' }}>
                                        {question.options.map((option) => (
                                            <label key={option.id} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', padding: '0.7rem', borderRadius: 8, background: answers[question.id] === option.id ? '#dbeafe' : '#f8fafc', cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name={`question-${question.id}`}
                                                    value={option.id}
                                                    checked={answers[question.id] === option.id}
                                                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                                                />
                                                <span>{option.text}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            ))}
                        </div>
                        <button
                            type="submit"
                            disabled={submitting || answeredCount !== questions.length}
                            style={{ width: '100%', marginTop: '1.25rem', padding: '0.9rem', background: answeredCount === questions.length ? '#2563eb' : '#94a3b8', color: '#fff', border: 0, borderRadius: 8, fontWeight: 800 }}
                        >
                            {submitting ? 'Calificando...' : 'Finalizar evaluación'}
                        </button>
                    </form>
                )}

                <footer style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.75rem', paddingTop: '1rem', borderTop: '1px solid #cbd5e1' }}>
                    <button type="button" onClick={() => navigate('/training')}>Volver al recorrido</button>
                    <button type="button" onClick={logout}>Cerrar sesión</button>
                </footer>
            </section>
        </main>
    );
}
