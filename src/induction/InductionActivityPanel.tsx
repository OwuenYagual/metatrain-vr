import { useEffect, useMemo, useRef, useState } from 'react';
import type { Content } from '../content/contentService';
import {
    INDUCTION_ACTIVITIES,
    isChecklistSelectionCorrect,
    type InductionActivity,
    type DirectoryActivity,
    type ScenarioActivity,
    type SequenceActivity,
    type ChecklistActivity,
} from './inductionActivities';
import { TRAINING_STATIONS } from '../../shared/trainingModule';
import {
    buildNpcSpeechBubbles,
    DEFAULT_NPC_SPEECH_SPEED,
    getNpcSpeechRevealInterval,
    isNpcSpeechSpeed,
    NPC_BUBBLE_PAUSE_MS,
    NPC_SPEECH_SPEED_OPTIONS,
    type NpcSpeechSpeed,
    type NpcSpeechBubble,
} from './npcSpeech';
import { useTrainingStore } from '../store/useTrainingStore';
import './InductionActivityPanel.css';

type InductionActivityPanelProps = {
    content: Content;
    alreadyCompleted: boolean;
    saving: boolean;
    onComplete: () => void;
    onClose: () => void;
};

type ScenarioFeedback = { correct: boolean; message: string; optionId: string } | null;

type GuideProfile = (typeof TRAINING_STATIONS)[number]['guide'];

const NPC_SPEECH_SPEED_STORAGE_KEY = 'metatrain:npc-speech-speed';

function getSavedNpcSpeechSpeed(): NpcSpeechSpeed {
    if (typeof window === 'undefined') return DEFAULT_NPC_SPEECH_SPEED;
    try {
        const savedSpeed = window.localStorage.getItem(NPC_SPEECH_SPEED_STORAGE_KEY);
        return isNpcSpeechSpeed(savedSpeed) ? savedSpeed : DEFAULT_NPC_SPEECH_SPEED;
    } catch {
        return DEFAULT_NPC_SPEECH_SPEED;
    }
}

function focusAndReveal(element: HTMLElement | null) {
    if (!element) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.focus({ preventScroll: true });
    element.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'nearest',
    });
}

function NpcSpeechLesson({
    bubbles,
    guide,
    stationId,
    revealIntervalMs,
    isLastLesson,
    onPrevious,
    onContinue,
}: {
    bubbles: NpcSpeechBubble[];
    guide: GuideProfile;
    stationId: string;
    revealIntervalMs: number;
    isLastLesson: boolean;
    onPrevious?: () => void;
    onContinue: () => void;
}) {
    const prefersReducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lastBubbleIndex = Math.max(0, bubbles.length - 1);
    const [bubbleIndex, setBubbleIndex] = useState(() => prefersReducedMotion ? lastBubbleIndex : 0);
    const [characterCount, setCharacterCount] = useState(() => (
        prefersReducedMotion ? (bubbles[lastBubbleIndex]?.text.length ?? 0) : 0
    ));
    const currentBubble = bubbles[bubbleIndex];
    const visibleText = currentBubble?.text.slice(0, characterCount) ?? '';
    const typing = Boolean(currentBubble && characterCount < currentBubble.text.length);
    const playbackComplete = bubbleIndex === lastBubbleIndex
        && characterCount >= (currentBubble?.text.length ?? 0);
    const setActiveNpcSpeech = useTrainingStore((state) => state.setActiveNpcSpeech);

    useEffect(() => {
        if (!currentBubble || playbackComplete) return undefined;

        if (characterCount < currentBubble.text.length) {
            const timer = window.setTimeout(
                () => setCharacterCount((current) => current + 1),
                revealIntervalMs,
            );
            return () => window.clearTimeout(timer);
        }

        const timer = window.setTimeout(() => {
            setBubbleIndex((current) => current + 1);
            setCharacterCount(0);
        }, NPC_BUBBLE_PAUSE_MS);
        return () => window.clearTimeout(timer);
    }, [characterCount, currentBubble, playbackComplete, revealIntervalMs]);

    useEffect(() => {
        if (!currentBubble) {
            setActiveNpcSpeech(null);
            return;
        }

        setActiveNpcSpeech({
            stationId,
            bubbleId: currentBubble.id,
            kind: currentBubble.kind,
            label: currentBubble.label,
            visibleText,
            fullText: currentBubble.text,
            typing,
        });
    }, [currentBubble, setActiveNpcSpeech, stationId, typing, visibleText]);

    useEffect(() => () => {
        setActiveNpcSpeech(null);
    }, [setActiveNpcSpeech]);

    return (
        <>
            <div className="npc-dialogue-location">
                <span aria-hidden="true">◉</span>
                <p>Observa a {guide.name}: el diálogo aparece sobre el NPC dentro de la estación.</p>
            </div>

            <div className="npc-speaking-status" role="status">
                <span className={playbackComplete ? 'is-complete' : 'is-speaking'} aria-hidden="true" />
                {playbackComplete ? `${guide.name} terminó de explicar este tema.` : `${guide.name} está hablando…`}
            </div>

            {!playbackComplete && (
                <button
                    type="button"
                    className="npc-show-complete-message"
                    onClick={() => {
                        setBubbleIndex(lastBubbleIndex);
                        setCharacterCount(bubbles[lastBubbleIndex]?.text.length ?? 0);
                    }}
                >
                    Mostrar diálogo completo
                </button>
            )}

            <div className="trainer-navigation">
                {onPrevious && (
                    <button type="button" className="trainer-secondary-action" onClick={onPrevious}>
                        Anterior
                    </button>
                )}
                <button
                    type="button"
                    className="trainer-primary-action"
                    onClick={onContinue}
                    disabled={!playbackComplete}
                >
                    {isLastLesson ? 'Comenzar actividad práctica' : 'Continuar capacitación'}
                </button>
            </div>
        </>
    );
}

function TrainerConversation({
    activity,
    guide,
    stationId,
    onComplete,
}: {
    activity: InductionActivity;
    guide: GuideProfile;
    stationId: string;
    onComplete: () => void;
}) {
    const [lessonIndex, setLessonIndex] = useState(0);
    const [speechSpeed, setSpeechSpeed] = useState<NpcSpeechSpeed>(getSavedNpcSpeechSpeed);
    const lesson = activity.training.lessons[lessonIndex];
    const isLastLesson = lessonIndex === activity.training.lessons.length - 1;
    const initials = guide.name.split(' ').map((part) => part[0]).join('').slice(0, 2);
    const speechBubbles = useMemo(
        () => buildNpcSpeechBubbles(activity, lessonIndex),
        [activity, lessonIndex],
    );
    const revealIntervalMs = getNpcSpeechRevealInterval(speechSpeed);

    useEffect(() => {
        try {
            window.localStorage.setItem(NPC_SPEECH_SPEED_STORAGE_KEY, speechSpeed);
        } catch {
            // La preferencia sigue activa durante esta visita aunque el navegador no permita persistirla.
        }
    }, [speechSpeed]);

    return (
        <section className="trainer-conversation" aria-labelledby="trainer-lesson-title">
            <div className="trainer-profile">
                <div className="trainer-avatar" style={{ background: guide.color }} aria-hidden="true">{initials}</div>
                <div>
                    <p>Tu capacitador</p>
                    <h3>{guide.name}</h3>
                    <span>{guide.role}</span>
                </div>
            </div>

            <div className="trainer-progress-row">
                <strong>Capacitación {lessonIndex + 1} de {activity.training.lessons.length}</strong>
                <div className="trainer-progress-dots" aria-hidden="true">
                    {activity.training.lessons.map((item, index) => (
                        <span key={item.id} className={index <= lessonIndex ? 'is-active' : ''} />
                    ))}
                </div>
            </div>

            <div className="npc-topic-controls">
                <h3 id="trainer-lesson-title" className="npc-current-topic">{lesson.title}</h3>
                <label className="npc-speech-speed-control">
                    <span>Velocidad del texto</span>
                    <select
                        aria-label="Velocidad de aparición del texto"
                        value={speechSpeed}
                        onChange={(event) => {
                            if (isNpcSpeechSpeed(event.target.value)) {
                                setSpeechSpeed(event.target.value);
                            }
                        }}
                    >
                        {NPC_SPEECH_SPEED_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </label>
            </div>
            <NpcSpeechLesson
                key={lesson.id}
                bubbles={speechBubbles}
                guide={guide}
                stationId={stationId}
                revealIntervalMs={revealIntervalMs}
                isLastLesson={isLastLesson}
                onPrevious={lessonIndex > 0 ? () => setLessonIndex((current) => current - 1) : undefined}
                onContinue={() => {
                    if (isLastLesson) onComplete();
                    else setLessonIndex((current) => current + 1);
                }}
            />
        </section>
    );
}

function ScenarioExperience({ activity, onReady }: { activity: ScenarioActivity; onReady: () => void }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [feedback, setFeedback] = useState<ScenarioFeedback>(null);
    const continueButtonRef = useRef<HTMLButtonElement>(null);
    const promptRef = useRef<HTMLHeadingElement>(null);
    const focusPromptAfterAdvance = useRef(false);
    const step = activity.steps[stepIndex];

    useEffect(() => {
        if (!feedback?.correct) return undefined;
        const frame = window.requestAnimationFrame(() => focusAndReveal(continueButtonRef.current));
        return () => window.cancelAnimationFrame(frame);
    }, [feedback?.correct]);

    useEffect(() => {
        if (!focusPromptAfterAdvance.current) return undefined;
        focusPromptAfterAdvance.current = false;
        const frame = window.requestAnimationFrame(() => focusAndReveal(promptRef.current));
        return () => window.cancelAnimationFrame(frame);
    }, [stepIndex]);

    const chooseOption = (optionId: string) => {
        const option = step.options.find((item) => item.id === optionId);
        setFeedback({
            correct: optionId === step.correctOptionId,
            message: option?.feedback ?? 'Revisa la política y vuelve a intentarlo.',
            optionId,
        });
    };

    const continueActivity = () => {
        if (stepIndex === activity.steps.length - 1) {
            onReady();
            return;
        }
        focusPromptAfterAdvance.current = true;
        setStepIndex((current) => current + 1);
        setFeedback(null);
    };

    return (
        <section className="induction-activity" aria-labelledby="scenario-prompt">
            <div className="induction-step-counter">Situación {stepIndex + 1} de {activity.steps.length}</div>
            <h3 id="scenario-prompt" ref={promptRef} tabIndex={-1}>{step.prompt}</h3>
            <div className="induction-option-grid">
                {step.options.map((option) => (
                    <button
                        className={`induction-option ${feedback?.correct && feedback.optionId === option.id ? 'is-correct' : ''}`}
                        type="button"
                        key={option.id}
                        onClick={() => chooseOption(option.id)}
                        disabled={feedback?.correct}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {feedback && (
                <div className={`induction-feedback ${feedback.correct ? 'is-correct' : 'is-retry'}`} role="status">
                    <strong>{feedback.correct ? 'Buena decisión' : 'Inténtalo nuevamente'}</strong>
                    <p>{feedback.message}</p>
                    {feedback.correct && (
                        <button ref={continueButtonRef} type="button" onClick={continueActivity}>
                            {stepIndex === activity.steps.length - 1 ? 'Finalizar actividad' : 'Siguiente situación'}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}

function DirectoryExperience({ activity, onReady }: { activity: DirectoryActivity; onReady: () => void }) {
    const [visitedIds, setVisitedIds] = useState<string[]>([]);
    const [selectedId, setSelectedId] = useState(activity.departments[0]?.id ?? '');
    const selectedDepartment = activity.departments.find((department) => department.id === selectedId);

    const visitDepartment = (departmentId: string) => {
        setSelectedId(departmentId);
        if (visitedIds.includes(departmentId)) return;

        const next = [...visitedIds, departmentId];
        setVisitedIds(next);
        if (next.length === activity.departments.length) onReady();
    };

    return (
        <section className="induction-activity" aria-labelledby="directory-title">
            <div className="induction-step-counter">Áreas exploradas: {visitedIds.length} de {activity.departments.length}</div>
            <h3 id="directory-title">Mapa de la empresa</h3>
            <div className="department-map" aria-label="Departamentos de la empresa">
                {activity.departments.map((department) => (
                    <button
                        type="button"
                        key={department.id}
                        className={`department-node ${department.id === selectedId ? 'is-active' : ''}`}
                        aria-pressed={department.id === selectedId}
                        onClick={() => visitDepartment(department.id)}
                    >
                        <span>{visitedIds.includes(department.id) ? '✓' : '○'}</span>
                        {department.name}
                    </button>
                ))}
            </div>
            {selectedDepartment && (
                <article className="person-card">
                    <div className="person-avatar" aria-hidden="true">
                        {selectedDepartment.person.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                        <p className="person-department">{selectedDepartment.name}</p>
                        <h4>{selectedDepartment.person}</h4>
                        <p><strong>{selectedDepartment.role}</strong></p>
                        <p>{selectedDepartment.purpose}</p>
                        <p className="person-channel">Canal: {selectedDepartment.channel}</p>
                    </div>
                </article>
            )}
        </section>
    );
}

function SequenceExperience({ activity, onReady }: { activity: SequenceActivity; onReady: () => void }) {
    const [orderedIds, setOrderedIds] = useState<string[]>([]);
    const [message, setMessage] = useState('Selecciona la primera acción de la jornada.');
    const orderedTasks = orderedIds.map((id) => activity.tasks.find((task) => task.id === id)).filter(Boolean);

    const chooseTask = (taskId: string) => {
        const expectedId = activity.correctOrder[orderedIds.length];
        if (taskId !== expectedId) {
            setMessage('Esa acción ocurre después. Revisa las prioridades antes de avanzar.');
            return;
        }
        const next = [...orderedIds, taskId];
        setOrderedIds(next);
        setMessage(next.length === activity.correctOrder.length
            ? 'Flujo completado: ya sabes cómo organizar y reportar tu trabajo.'
            : 'Correcto. Elige la siguiente acción.');
        if (next.length === activity.correctOrder.length) onReady();
    };

    return (
        <section className="induction-activity" aria-labelledby="sequence-title">
            <div className="induction-step-counter">Flujo construido: {orderedIds.length} de {activity.correctOrder.length}</div>
            <h3 id="sequence-title">Organiza tu jornada</h3>
            <div className="task-sequence" aria-label="Secuencia construida">
                {orderedTasks.length === 0 && <p>Aún no has agregado acciones.</p>}
                {orderedTasks.map((task, index) => task && (
                    <div className="ordered-task" key={task.id}><span>{index + 1}</span>{task.label}</div>
                ))}
            </div>
            <p className="sequence-message" role="status">{message}</p>
            <div className="induction-option-grid">
                {activity.tasks.filter((task) => !orderedIds.includes(task.id)).map((task) => (
                    <button className="induction-option" type="button" key={task.id} onClick={() => chooseTask(task.id)}>
                        {task.label}
                    </button>
                ))}
            </div>
        </section>
    );
}

function ChecklistExperience({ activity, onReady }: { activity: ChecklistActivity; onReady: () => void }) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [message, setMessage] = useState('');

    const toggleOption = (optionId: string) => {
        setSelectedIds((current) => current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId]);
        setMessage('');
    };

    const validate = () => {
        if (isChecklistSelectionCorrect(selectedIds, activity.correctOptionIds)) {
            setMessage('Reto superado. Identificaste las responsabilidades del puesto.');
            onReady();
        } else {
            setMessage('La selección incluye una acción ajena al puesto o todavía falta una responsabilidad.');
        }
    };

    return (
        <section className="induction-activity" aria-labelledby="checklist-title">
            <h3 id="checklist-title">Construye tu tarjeta de funciones</h3>
            <div className="checklist-grid">
                {activity.options.map((option) => (
                    <label className={selectedIds.includes(option.id) ? 'is-selected' : ''} key={option.id}>
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(option.id)}
                            onChange={() => toggleOption(option.id)}
                        />
                        <span>{option.label}</span>
                    </label>
                ))}
            </div>
            <button className="validate-activity" type="button" onClick={validate}>Validar selección</button>
            {message && <p className="sequence-message" role="status">{message}</p>}
        </section>
    );
}

export default function InductionActivityPanel({
    content,
    alreadyCompleted,
    saving,
    onComplete,
    onClose,
}: InductionActivityPanelProps) {
    const activity = INDUCTION_ACTIVITIES[content.interactionObjectId];
    const station = TRAINING_STATIONS.find(({ id }) => id === content.interactionObjectId);
    const [ready, setReady] = useState(alreadyCompleted);
    const [phase, setPhase] = useState<'training' | 'practice'>('training');
    const saveProgressButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (phase !== 'practice' || !ready) return undefined;
        const frame = window.requestAnimationFrame(() => focusAndReveal(saveProgressButtonRef.current));
        return () => window.cancelAnimationFrame(frame);
    }, [phase, ready]);

    let experience = null;
    if (activity?.kind === 'scenario') {
        experience = <ScenarioExperience activity={activity} onReady={() => setReady(true)} />;
    } else if (activity?.kind === 'directory') {
        experience = <DirectoryExperience activity={activity} onReady={() => setReady(true)} />;
    } else if (activity?.kind === 'sequence') {
        experience = <SequenceExperience activity={activity} onReady={() => setReady(true)} />;
    } else if (activity?.kind === 'checklist') {
        experience = <ChecklistExperience activity={activity} onReady={() => setReady(true)} />;
    }

    return (
        <aside className={`induction-panel is-${phase}`} aria-labelledby="induction-panel-title">
            <header className="induction-panel-header">
                <div>
                    <p>{phase === 'training' ? 'Capacitación con guía' : 'Actividad práctica'}</p>
                    <h2 id="induction-panel-title">{activity?.title ?? content.title}</h2>
                </div>
                <button type="button" className="close-induction-panel" onClick={onClose} aria-label="Cerrar actividad">×</button>
            </header>
            <p className="induction-introduction">{activity?.introduction ?? content.body}</p>
            {alreadyCompleted && <p className="completed-activity-note">✓ Esta actividad ya forma parte de tu progreso.</p>}
            {!activity || !station ? (
                <p role="alert">Esta estación todavía no tiene una capacitación configurada.</p>
            ) : phase === 'training' ? (
                <TrainerConversation
                    activity={activity}
                    guide={station.guide}
                    stationId={station.id}
                    onComplete={() => setPhase('practice')}
                />
            ) : (
                <>
                    <div className="practice-unlocked-note" role="status">
                        <span aria-hidden="true">✓</span>
                        <div>
                            <strong>Capacitación completada</strong>
                            <p>Ahora aplica lo explicado por {station.guide.name}.</p>
                        </div>
                        <button type="button" onClick={() => setPhase('training')}>Repasar</button>
                    </div>
                    {experience}
                </>
            )}
            {phase === 'practice' && ready && (
                <footer className="induction-panel-footer">
                    <p role="status">{alreadyCompleted ? 'Puedes volver a explorarla cuando quieras.' : 'Actividad superada. Guarda el resultado para continuar.'}</p>
                    <button
                        ref={saveProgressButtonRef}
                        type="button"
                        onClick={alreadyCompleted ? onClose : onComplete}
                        disabled={saving}
                    >
                        {saving ? 'Guardando...' : alreadyCompleted ? 'Cerrar estación' : 'Guardar y continuar'}
                    </button>
                </footer>
            )}
        </aside>
    );
}
