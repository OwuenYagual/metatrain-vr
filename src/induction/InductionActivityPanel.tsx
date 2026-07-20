import { useState } from 'react';
import type { Content } from '../content/contentService';
import {
    INDUCTION_ACTIVITIES,
    isChecklistSelectionCorrect,
    type DirectoryActivity,
    type ScenarioActivity,
    type SequenceActivity,
    type ChecklistActivity,
} from './inductionActivities';
import './InductionActivityPanel.css';

type InductionActivityPanelProps = {
    content: Content;
    alreadyCompleted: boolean;
    saving: boolean;
    onComplete: () => void;
    onClose: () => void;
};

type ScenarioFeedback = { correct: boolean; message: string } | null;

function ScenarioExperience({ activity, onReady }: { activity: ScenarioActivity; onReady: () => void }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [feedback, setFeedback] = useState<ScenarioFeedback>(null);
    const step = activity.steps[stepIndex];

    const chooseOption = (optionId: string) => {
        const option = step.options.find((item) => item.id === optionId);
        setFeedback({
            correct: optionId === step.correctOptionId,
            message: option?.feedback ?? 'Revisa la política y vuelve a intentarlo.',
        });
    };

    const continueActivity = () => {
        if (stepIndex === activity.steps.length - 1) {
            onReady();
            return;
        }
        setStepIndex((current) => current + 1);
        setFeedback(null);
    };

    return (
        <section className="induction-activity" aria-labelledby="scenario-prompt">
            <div className="induction-step-counter">Situación {stepIndex + 1} de {activity.steps.length}</div>
            <h3 id="scenario-prompt">{step.prompt}</h3>
            <div className="induction-option-grid">
                {step.options.map((option) => (
                    <button
                        className="induction-option"
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
                        <button type="button" onClick={continueActivity}>
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
    const [ready, setReady] = useState(alreadyCompleted);

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
        <aside className="induction-panel" aria-labelledby="induction-panel-title">
            <header className="induction-panel-header">
                <div>
                    <p>Estación interactiva</p>
                    <h2 id="induction-panel-title">{activity?.title ?? content.title}</h2>
                </div>
                <button type="button" className="close-induction-panel" onClick={onClose} aria-label="Cerrar actividad">×</button>
            </header>
            <p className="induction-introduction">{activity?.introduction ?? content.body}</p>
            {alreadyCompleted && <p className="completed-activity-note">✓ Esta actividad ya forma parte de tu progreso.</p>}
            {experience ?? <p role="alert">Esta estación todavía no tiene una actividad configurada.</p>}
            {ready && (
                <footer className="induction-panel-footer">
                    <p role="status">{alreadyCompleted ? 'Puedes volver a explorarla cuando quieras.' : 'Actividad superada. Guarda el resultado para continuar.'}</p>
                    <button type="button" onClick={alreadyCompleted ? onClose : onComplete} disabled={saving}>
                        {saving ? 'Guardando...' : alreadyCompleted ? 'Cerrar estación' : 'Guardar y continuar'}
                    </button>
                </footer>
            )}
        </aside>
    );
}
