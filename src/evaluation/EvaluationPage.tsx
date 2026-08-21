import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useEvaluationNarration } from '../speech/useEvaluationNarration';
import { StatusIcon } from '../components/StatusIcon';
import './EvaluationPage.css';

const ignoreMicrophoneState = () => undefined;

function optionLabel(index: number): string {
    return String.fromCharCode(65 + index);
}

export default function EvaluationPage({
    onMicrophoneActiveChange = ignoreMicrophoneState,
    audioStarted = true,
    narrationMuted = false,
    voiceVolume = 0.85,
}: {
    onMicrophoneActiveChange?: (active: boolean) => void;
    audioStarted?: boolean;
    narrationMuted?: boolean;
    voiceVolume?: number;
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
    const [attemptId, setAttemptId] = useState(0);
    const [voiceTranscripts, setVoiceTranscripts] = useState<Record<string, string>>({});
    const questionElementsRef = useRef(new Map<string, HTMLFieldSetElement>());
    const submitButtonRef = useRef<HTMLButtonElement | null>(null);
    const navigate = useNavigate();
    const session = authService.getCurrentSession();
    const applyMatchedVoiceAnswer = useCallback((
        questionId: string,
        optionId: string,
        transcript: string,
    ) => {
        setAnswers((current) => ({ ...current, [questionId]: optionId }));
        setVoiceTranscripts((current) => ({ ...current, [questionId]: transcript }));
    }, []);
    const voice = useVoiceAnswer(onMicrophoneActiveChange, applyMatchedVoiceAnswer);
    const narrationEnabled = Boolean(
        voice.capabilities?.narrationAvailable && audioStarted && !narrationMuted && !result,
    );
    const narration = useEvaluationNarration({
        enabled: narrationEnabled,
        volume: voiceVolume,
        onDuckedChange: onMicrophoneActiveChange,
    });
    const beginVoiceAnswer = voice.begin;
    const cancelVoiceAnswer = voice.cancel;
    const transcriptionAvailable = voice.capabilities?.transcriptionAvailable;
    const playNarration = narration.play;
    const stopNarration = narration.stop;
    const answeredCount = useMemo(
        () => questions.filter((question) => Boolean(answers[question.id])).length,
        [answers, questions],
    );
    const activeQuestionIndex = useMemo(
        () => questions.findIndex((question) => !answers[question.id]),
        [answers, questions],
    );
    const activeQuestion = activeQuestionIndex >= 0 ? questions[activeQuestionIndex] : null;

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

    useEffect(() => {
        if (!activeQuestion || !narrationEnabled) return undefined;
        const question = activeQuestion;
        const timer = window.setTimeout(() => {
            playNarration(question, () => {
                if (transcriptionAvailable) {
                    void beginVoiceAnswer(question, 'automatic');
                }
            });
        }, 240);
        return () => {
            window.clearTimeout(timer);
            stopNarration();
        };
    }, [
        activeQuestion,
        attemptId,
        beginVoiceAnswer,
        narrationEnabled,
        playNarration,
        stopNarration,
        transcriptionAvailable,
    ]);

    useEffect(() => {
        if (loading || result || questions.length === 0) return undefined;
        const target = activeQuestion
            ? questionElementsRef.current.get(activeQuestion.id)
            : answeredCount === questions.length
                ? submitButtonRef.current
                : null;
        if (!target) return undefined;

        const frame = window.requestAnimationFrame(() => {
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            target.focus({ preventScroll: true });
            target.scrollIntoView({
                behavior: reduceMotion ? 'auto' : 'smooth',
                block: 'center',
                inline: 'nearest',
            });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [activeQuestion, answeredCount, loading, questions.length, result]);

    const submitEvaluation = async (event: FormEvent) => {
        event.preventDefault();
        if (answeredCount !== questions.length) return;
        stopNarration();
        cancelVoiceAnswer();
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
        stopNarration();
        cancelVoiceAnswer();
        setAnswers({});
        setVoiceTranscripts({});
        setAttemptId((current) => current + 1);
        setResult(null);
        setError('');
    };

    const selectAnswer = useCallback((questionId: string, optionId: string) => {
        if (questionId === activeQuestion?.id) {
            stopNarration();
            cancelVoiceAnswer();
        }
        setAnswers((current) => ({ ...current, [questionId]: optionId }));
        setVoiceTranscripts((current) => {
            if (!current[questionId]) return current;
            const next = { ...current };
            delete next[questionId];
            return next;
        });
    }, [activeQuestion?.id, cancelVoiceAnswer, stopNarration]);

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
                        <p id="evaluation-instructions" className="evaluation-instructions">
                            El NPC leerá cada pregunta y sus opciones. Cuando pregunte “¿Cuál es tu respuesta?”,
                            el micrófono se activará automáticamente. Responde únicamente “A”, “B” o la letra
                            correspondiente. Necesitas {passingScore}% para aprobar.
                        </p>
                        {voice.capabilities && !voice.capabilities.transcriptionAvailable && (
                            <p role="status" className="voice-answer-unavailable">
                                Las respuestas por voz no están disponibles en este momento. Puedes seleccionar
                                las opciones manualmente.
                            </p>
                        )}
                        <p aria-live="polite" className="evaluation-progress">
                            {answeredCount} de {questions.length} respondidas
                        </p>
                        <div className="evaluation-question-list">
                            {questions.map((question, questionIndex) => {
                                const isActiveQuestion = question.id === activeQuestion?.id;
                                const isListening = voice.activeQuestionId === question.id
                                    && voice.status === 'listening';
                                const isNarrating = narration.activeQuestionId === question.id
                                    && (narration.status === 'loading' || narration.status === 'playing');
                                const exampleId = `voice-answer-example-${question.id}`;

                                return (
                                    <fieldset
                                        key={question.id}
                                        ref={(element) => {
                                            if (element) questionElementsRef.current.set(question.id, element);
                                            else questionElementsRef.current.delete(question.id);
                                        }}
                                        tabIndex={-1}
                                        disabled={submitting}
                                        aria-describedby="evaluation-instructions"
                                        className={`evaluation-question ${isActiveQuestion ? 'is-active' : ''} ${answers[question.id] ? 'is-answered' : ''}`}
                                    >
                                        <legend>
                                            <span>Pregunta {questionIndex + 1}</span>
                                            {question.text}
                                        </legend>

                                        <div className="evaluation-options">
                                            {question.options.map((option, optionIndex) => (
                                                <label
                                                    className={answers[question.id] === option.id ? 'is-selected' : ''}
                                                    key={option.id}
                                                >
                                                    <input
                                                        type="radio"
                                                        name={`question-${question.id}`}
                                                        value={option.id}
                                                        checked={answers[question.id] === option.id}
                                                        onChange={() => selectAnswer(question.id, option.id)}
                                                    />
                                                    <span className="evaluation-option-letter" aria-hidden="true">
                                                        {optionLabel(optionIndex)}
                                                    </span>
                                                    <span>{option.text}</span>
                                                </label>
                                            ))}
                                        </div>

                                        {isActiveQuestion && (
                                            <div className="voice-answer-controls">
                                                <p className="npc-narration-status" aria-live="polite">
                                                    {narration.status === 'loading'
                                                        ? 'Preparando la voz del NPC…'
                                                        : narration.status === 'playing'
                                                            ? 'El NPC está leyendo la pregunta y las opciones…'
                                                            : isListening
                                                                ? 'Micrófono activo: te estamos escuchando'
                                                                : voice.status === 'requesting'
                                                                    ? 'Activando el micrófono…'
                                                                    : voice.status === 'processing'
                                                                        ? 'Reconociendo tu respuesta…'
                                                                        : 'Listo para tu respuesta'}
                                                </p>

                                                <button
                                                    type="button"
                                                    className={`voice-answer-button ${isListening ? 'is-listening' : ''}`}
                                                    disabled={submitting
                                                        || isNarrating
                                                        || voice.capabilities?.transcriptionAvailable === false
                                                        || voice.status === 'requesting'
                                                        || voice.status === 'processing'}
                                                    aria-label={isListening
                                                        ? `Detener respuesta por voz de la pregunta ${questionIndex + 1}`
                                                        : `Responder por voz la pregunta ${questionIndex + 1}`}
                                                    aria-describedby={exampleId}
                                                    aria-pressed={isListening}
                                                    onClick={() => {
                                                        if (isListening) {
                                                            voice.end();
                                                            return;
                                                        }
                                                        narration.stop();
                                                        void voice.begin(question, 'automatic');
                                                    }}
                                                >
                                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                                        <rect x="9" y="3" width="6" height="11" rx="3" />
                                                        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
                                                    </svg>
                                                </button>

                                                <p id={exampleId} className="voice-answer-example">
                                                    Responde solo con una letra, por ejemplo: <strong>“A”</strong>
                                                </p>

                                                {narration.status === 'error' && (
                                                    <div role="alert" className="voice-answer-feedback is-error">
                                                        <p>{narration.error}</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => narration.play(question, () => {
                                                                if (voice.capabilities?.transcriptionAvailable) {
                                                                    void voice.begin(question, 'automatic');
                                                                }
                                                            })}
                                                        >
                                                            Escuchar pregunta de nuevo
                                                        </button>
                                                    </div>
                                                )}

                                                {voice.activeQuestionId === question.id && voice.status === 'error' && (
                                                    <div role="alert" className="voice-answer-feedback is-error">
                                                        <p>{voice.error}</p>
                                                        <button type="button" onClick={voice.cancel}>Cerrar</button>
                                                    </div>
                                                )}

                                                {voice.activeQuestionId === question.id && voice.proposal && (
                                                    <div role="status" aria-live="polite" className="voice-answer-feedback">
                                                        <p><strong>Se entendió:</strong> “{voice.proposal.transcript}”</p>
                                                        <p>No hubo una coincidencia clara. Responde solamente “A”, “B” o selecciona una opción.</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                voice.cancel();
                                                                void voice.begin(question, 'automatic');
                                                            }}
                                                        >
                                                            Intentar de nuevo
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {answers[question.id] && (
                                            <p className="evaluation-answer-confirmation" aria-live="polite">
                                                Respuesta seleccionada: opción {optionLabel(question.options.findIndex(
                                                    (option) => option.id === answers[question.id],
                                                ))}
                                                {voiceTranscripts[question.id]
                                                    ? ` · Reconocida de “${voiceTranscripts[question.id]}”`
                                                    : ''}
                                            </p>
                                        )}
                                    </fieldset>
                                );
                            })}
                        </div>
                        <button
                            ref={submitButtonRef}
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
