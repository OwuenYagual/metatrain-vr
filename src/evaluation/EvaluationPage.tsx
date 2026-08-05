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
import {
    certificateService,
    type CertificateSummary,
} from '../certificate/certificateService';
import { useVoiceAnswer } from '../speech/useVoiceAnswer';
import { StatusIcon } from '../components/StatusIcon';
import './EvaluationPage.css';

const ignoreMicrophoneState = () => undefined;

export default function EvaluationPage({
    onMicrophoneActiveChange = ignoreMicrophoneState,
}: {
    onMicrophoneActiveChange?: (active: boolean) => void;
}) {
    const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [result, setResult] = useState<EvaluationResult | null>(null);
    const [certificate, setCertificate] = useState<CertificateSummary | null>(null);
    const [passingScore, setPassingScore] = useState<number>(APP_CONFIG.MIN_PASSING_SCORE);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [downloadingCertificate, setDownloadingCertificate] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const session = authService.getCurrentSession();
    const voice = useVoiceAnswer(onMicrophoneActiveChange);
    const answeredCount = useMemo(
        () => questions.filter((question) => Boolean(answers[question.id])).length,
        [answers, questions],
    );

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([
            evaluationService.getQuestions(APP_CONFIG.TRAINING_MODULE_ID, controller.signal),
            evaluationService.getLatestResult(APP_CONFIG.TRAINING_MODULE_ID, controller.signal),
            certificateService.getCertificate(APP_CONFIG.TRAINING_MODULE_ID, controller.signal),
        ])
            .then(([evaluation, latestResult, savedCertificate]) => {
                setQuestions(evaluation.questions);
                setPassingScore(evaluation.passingScore);
                setResult(latestResult);
                setCertificate(savedCertificate);
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
        voice.cancel();
        setAnswers({});
        setResult(null);
        setError('');
    };

    const downloadCertificate = async () => {
        setDownloadingCertificate(true);
        setError('');
        try {
            const issuedCertificate = await certificateService.issueCertificate(APP_CONFIG.TRAINING_MODULE_ID);
            const pdf = await certificateService.downloadCertificate(APP_CONFIG.TRAINING_MODULE_ID);
            const objectUrl = URL.createObjectURL(pdf);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = 'certificado-metatrain.pdf';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
            setCertificate(issuedCertificate);
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'No se pudo descargar el certificado.'));
        } finally {
            setDownloadingCertificate(false);
        }
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
                            <StatusIcon name={result.status === 'approved' ? 'check' : 'retry'} />
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
                        {result.status === 'approved' && APP_CONFIG.CERTIFICATE_ENABLED && (
                            <section aria-labelledby="certificate-title" style={{ marginTop: '1.25rem', padding: '1rem', background: '#eff6ff', color: '#1e3a8a', borderRadius: 10 }}>
                                <h3 id="certificate-title" style={{ margin: '0 0 0.5rem' }}>Certificado de aprobación</h3>
                                <p>El certificado incluye tu nombre, nota, fecha de emisión y un código único de verificación.</p>
                                {certificate && (
                                    <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
                                        Código: {certificate.certificateId}
                                    </p>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void downloadCertificate()}
                                    disabled={downloadingCertificate}
                                    style={{ marginTop: '0.8rem', padding: '0.75rem 1rem', background: '#1d4ed8', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700 }}
                                >
                                    {downloadingCertificate
                                        ? 'Preparando certificado...'
                                        : certificate
                                            ? 'Descargar certificado nuevamente'
                                            : 'Emitir y descargar certificado'}
                                </button>
                            </section>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button type="button" onClick={retryEvaluation} style={{ padding: '0.75rem 1rem', background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700 }}>
                                {result.status === 'approved'
                                    ? 'Volver a realizar la evaluación'
                                    : 'Intentar nuevamente'}
                            </button>
                        </div>
                    </section>
                )}

                {!loading && !result && questions.length > 0 && (
                    <form onSubmit={submitEvaluation}>
                        <p id="evaluation-instructions" style={{ padding: '0.85rem', background: '#eff6ff', color: '#1e40af', borderRadius: 8 }}>
                            Mantén pulsado el micrófono, di el número o el texto de una opción y confirma la respuesta
                            reconocida. Necesitas {passingScore}% para aprobar.
                        </p>
                        {voice.capabilities && !voice.capabilities.transcriptionAvailable && (
                            <p role="status" className="voice-answer-unavailable">
                                Las respuestas por voz no están disponibles en este momento.
                            </p>
                        )}
                        <p aria-live="polite" style={{ margin: '1rem 0', fontWeight: 700 }}>
                            {answeredCount} de {questions.length} respondidas
                        </p>
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            {questions.map((question, questionIndex) => (
                                <fieldset key={question.id} disabled={submitting} aria-describedby="evaluation-instructions" style={{ padding: '1rem', border: '1px solid #cbd5e1', borderRadius: 10 }}>
                                    <legend style={{ padding: '0 0.4rem', fontWeight: 700 }}>
                                        {questionIndex + 1}. {question.text}
                                    </legend>
                                    <div className="voice-answer-controls">
                                        <button
                                            type="button"
                                            className={voice.activeQuestionId === question.id && voice.status === 'listening' ? 'is-listening' : ''}
                                            disabled={submitting
                                                || voice.capabilities?.transcriptionAvailable === false
                                                || (voice.activeQuestionId !== null
                                                    && voice.activeQuestionId !== question.id
                                                    && ['requesting', 'listening', 'processing'].includes(voice.status))}
                                            aria-label={`Mantener para responder por voz la pregunta ${questionIndex + 1}`}
                                            onPointerDown={(event) => {
                                                event.preventDefault();
                                                event.currentTarget.setPointerCapture(event.pointerId);
                                                void voice.begin(question);
                                            }}
                                            onPointerUp={(event) => {
                                                event.preventDefault();
                                                voice.end();
                                            }}
                                            onPointerCancel={voice.end}
                                            onKeyDown={(event) => {
                                                if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                                                    event.preventDefault();
                                                    void voice.begin(question);
                                                }
                                            }}
                                            onKeyUp={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    voice.end();
                                                }
                                            }}
                                        >
                                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                                <rect x="9" y="3" width="6" height="11" rx="3" />
                                                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
                                            </svg>
                                        </button>

                                        <p className="voice-answer-status" aria-live="polite">
                                            {voice.activeQuestionId === question.id && voice.status === 'requesting'
                                                ? 'Permitiendo micrófono…'
                                                : voice.activeQuestionId === question.id && voice.status === 'listening'
                                                    ? 'Escuchando… suelta para enviar'
                                                    : voice.activeQuestionId === question.id && voice.status === 'processing'
                                                        ? 'Reconociendo respuesta…'
                                                        : answers[question.id]
                                                            ? 'Respuesta confirmada'
                                                            : 'Mantén pulsado para responder'}
                                        </p>

                                        {voice.activeQuestionId === question.id && voice.status === 'error' && (
                                            <div role="alert" className="voice-answer-feedback is-error">
                                                <p>{voice.error}</p>
                                                <button type="button" onClick={voice.cancel}>Cerrar</button>
                                            </div>
                                        )}

                                        {voice.activeQuestionId === question.id && voice.proposal && (
                                            <div role="status" aria-live="polite" className="voice-answer-feedback">
                                                <p><strong>Se entendió:</strong> “{voice.proposal.transcript}”</p>
                                                {voice.proposal.status === 'matched' && voice.proposal.optionId ? (
                                                    <p>
                                                        <strong>Opción propuesta:</strong>{' '}
                                                        {question.options.find(({ id }) => id === voice.proposal?.optionId)?.text}
                                                    </p>
                                                ) : (
                                                    <p>No hay una coincidencia clara. Di “opción uno”, “opción dos” o lee una respuesta.</p>
                                                )}
                                                <div>
                                                    {voice.proposal.status === 'matched' && voice.proposal.optionId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => voice.confirm((questionId, optionId) => {
                                                                setAnswers((current) => ({ ...current, [questionId]: optionId }));
                                                            })}
                                                        >
                                                            Confirmar opción
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={voice.cancel}>Cancelar o reintentar</button>
                                                </div>
                                            </div>
                                        )}
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
