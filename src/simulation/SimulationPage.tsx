import { useEffect } from 'react';
import { StatusIcon } from '../components/StatusIcon';
import type {
    SimulationActionFeedback,
    SimulationInspectionFeedback,
    SimulationRun,
    SimulationScenario,
    SimulationStage,
    SimulationStageProgress,
} from './simulationService';
import {
    selectCurrentStageProgress,
    useSimulationStore,
} from './useSimulationStore';
import './SimulationPage.css';

function JourneySidebar({
    scenario,
    simulation,
}: {
    scenario: SimulationScenario;
    simulation: SimulationRun | null;
}) {
    const completedCount = simulation?.completedStageCount ?? 0;
    const requiredCount = simulation?.requiredStageCount ?? scenario.stages.length;
    const progressPercent = requiredCount > 0
        ? Math.min(100, (completedCount / requiredCount) * 100)
        : 0;

    return (
        <aside
            className="simulation-journey simulation-progress-panel"
            aria-label="Progreso de la jornada"
        >
            <p className="simulation-eyebrow">Primer día</p>
            <h1>{scenario.title}</h1>
            <div className="simulation-progress-copy">
                <span>Jornada</span>
                <strong>{completedCount} de {requiredCount}</strong>
            </div>
            <div
                className="simulation-progress-track"
                role="progressbar"
                aria-label="Progreso de la jornada"
                aria-valuemin={0}
                aria-valuemax={requiredCount}
                aria-valuenow={completedCount}
            >
                <span style={{ transform: `scaleX(${progressPercent / 100})` }} />
            </div>
            <ol className="simulation-stage-list">
                {scenario.stages.map((stage, index) => {
                    const stageProgress = simulation?.stages.find(
                        ({ stageId }) => stageId === stage.id,
                    );
                    const completed = stageProgress?.status === 'completed';
                    const current = simulation?.currentStageId === stage.id;
                    return (
                        <li
                            key={stage.id}
                            className={`simulation-stage-marker ${completed ? 'is-completed' : ''} ${current ? 'is-current' : ''}`}
                            aria-current={current ? 'step' : undefined}
                        >
                            <span aria-hidden="true">
                                {completed
                                    ? <StatusIcon name="check" />
                                    : current
                                        ? <StatusIcon name="active" />
                                        : index + 1}
                            </span>
                            <div>
                                <small>{stage.time}</small>
                                <strong>{stage.title}</strong>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </aside>
    );
}

function StartPanel({
    scenario,
    legacyCompleted,
    abandoned,
    saving,
    onStart,
}: {
    scenario: SimulationScenario;
    legacyCompleted: boolean;
    abandoned: boolean;
    saving: boolean;
    onStart: () => void;
}) {
    const title = legacyCompleted
        ? 'Tu progreso anterior está conservado'
        : abandoned
            ? 'Inicia una nueva jornada'
            : 'Todo listo para tu primer día';
    const description = legacyCompleted
        ? 'Esta actividad ya cuenta para tu progreso. Ahora puedes vivir la versión renovada sin perder lo que completaste.'
        : abandoned
            ? 'La jornada anterior terminó antes de completar el recorrido. Puedes empezar nuevamente desde la primera situación.'
            : scenario.introduction;

    return (
        <section className="simulation-empty" aria-labelledby="simulation-start-title">
            <p className="simulation-eyebrow">Simulación práctica</p>
            <h2 id="simulation-start-title">{title}</h2>
            <p>{description}</p>
            <button
                className="simulation-primary-button"
                type="button"
                disabled={saving}
                onClick={onStart}
            >
                {saving ? 'Preparando jornada...' : 'Comenzar la jornada'}
            </button>
        </section>
    );
}

function FeedbackPanel({
    feedback,
    journeyCompleted,
    onContinue,
}: {
    feedback: SimulationActionFeedback;
    journeyCompleted: boolean;
    onContinue: () => void;
}) {
    const resolved = feedback.resolved;
    return (
        <section
            className={`simulation-feedback ${resolved ? 'is-resolved' : 'is-correction'}`}
            aria-labelledby="simulation-feedback-title"
            aria-live="polite"
        >
            <div className="simulation-feedback-status" aria-hidden="true">
                <StatusIcon name={resolved ? 'check' : 'retry'} />
            </div>
            <p className="simulation-eyebrow">Consecuencia de tu acción</p>
            <h2 id="simulation-feedback-title">
                {resolved
                    ? 'La situación quedó resuelta'
                    : 'La situación requiere una corrección'}
            </h2>
            <p>{feedback.consequence}</p>
            {!resolved && (
                <p>
                    La jornada continúa. Revisa lo ocurrido y elige una acción que repare la situación.
                </p>
            )}
            <button className="simulation-primary-button" type="button" onClick={onContinue}>
                {resolved
                    ? journeyCompleted
                        ? 'Ver bitácora de la jornada'
                        : 'Continuar la jornada'
                    : 'Realizar una acción correctiva'}
            </button>
        </section>
    );
}

function StagePanel({
    stage,
    progress,
    inspectionFeedback,
    saving,
    onAction,
}: {
    stage: SimulationStage;
    progress: SimulationStageProgress | null;
    inspectionFeedback: SimulationInspectionFeedback | null;
    saving: boolean;
    onAction: (actionId: string) => void;
}) {
    const inspected = Boolean(progress?.inspections.length);
    const observation = inspectionFeedback?.stageId === stage.id
        ? inspectionFeedback.observation
        : progress?.inspections.at(-1)?.observation;
    const awaitingCorrection = progress?.status === 'pending_correction';
    const actionEnabled = progress?.status === 'ready_for_action' || awaitingCorrection;
    const attemptedActionIds = new Set(progress?.attempts.map(({ actionId }) => actionId));

    return (
        <section className="simulation-stage" aria-labelledby="simulation-stage-title">
            <div className="simulation-stage-heading">
                <div>
                    <p className="simulation-eyebrow">{stage.time} · Situación activa</p>
                    <h2 id="simulation-stage-title">{stage.title}</h2>
                </div>
                <span className="simulation-stage-location">Laboratorio</span>
            </div>
            <p className="simulation-stage-introduction"><strong>Objetivo:</strong> {stage.objective}</p>

            <blockquote className="simulation-dialogue">
                <strong>{stage.guide.name}</strong>
                <p>{stage.guide.introduction}</p>
            </blockquote>

            <div className={`simulation-object-card ${inspected ? 'is-inspected' : ''}`}>
                <div className="simulation-object-heading">
                    <strong>{stage.evidence.label}</strong>
                    {inspected && (
                        <span className="simulation-inspected-label">
                            <StatusIcon name="check" /> Inspeccionado
                        </span>
                    )}
                </div>
                {observation && <p role="status">{observation}</p>}
                {!inspected && (
                    <p className="simulation-proximity-instruction" role="status">
                        Acércate a la estación iluminada y presiona E para inspeccionarla.
                    </p>
                )}
            </div>

            {actionEnabled && (
                <div className="simulation-actions" aria-busy={saving}>
                    <h3>
                        {awaitingCorrection
                            ? '¿Cómo corriges la situación?'
                            : '¿Qué haces ahora?'}
                    </h3>
                    <div className="simulation-action-list">
                        {stage.actions.map((action) => {
                            const attempted = attemptedActionIds.has(action.id);
                            return (
                                <button
                                    key={action.id}
                                    className={`simulation-action-button ${attempted ? 'is-attempted' : ''}`}
                                    type="button"
                                    disabled={saving || attempted}
                                    aria-label={attempted
                                        ? `Acción ya realizada: ${action.label}`
                                        : action.label}
                                    onClick={() => onAction(action.id)}
                                >
                                    {action.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}

function SummaryPanel({
    scenario,
    simulation,
    canReplay,
    saving,
    onReplay,
}: {
    scenario: SimulationScenario;
    simulation: SimulationRun;
    canReplay: boolean;
    saving: boolean;
    onReplay: () => void;
}) {
    return (
        <section className="simulation-summary" aria-labelledby="simulation-summary-title">
            <p className="simulation-eyebrow">Jornada terminada</p>
            <h2 id="simulation-summary-title">Completaste tu primer día</h2>
            <p>
                Esta bitácora recoge lo que hiciste y cómo respondiste a las consecuencias de cada situación.
            </p>
            <div className="simulation-log">
                <h3>Bitácora de acciones</h3>
                <ol className="simulation-log-list">
                    {scenario.stages.map((stage) => {
                        const stageProgress = simulation.stages.find(
                            ({ stageId }) => stageId === stage.id,
                        );
                        return (
                            <li className="simulation-log-stage" key={stage.id}>
                                <div>
                                    <strong>{stage.title}</strong>
                                    <small>{stage.time}</small>
                                </div>
                                <ol className="simulation-attempt-list">
                                    {stageProgress?.attempts.map((attempt, index) => {
                                        const action = stage.actions.find(({ id }) => id === attempt.actionId);
                                        const correctionNumber = stageProgress.attempts
                                            .slice(0, index + 1)
                                            .filter(({ kind }) => kind === 'correction').length;
                                        return (
                                            <li key={`${attempt.timestamp}:${attempt.actionId}`}>
                                                <strong>
                                                    {attempt.kind === 'initial'
                                                        ? 'Acción inicial'
                                                        : `Corrección ${correctionNumber}`}
                                                    :{' '}
                                                </strong>
                                                {action?.label ?? 'Acción registrada'}. {attempt.consequence}
                                            </li>
                                        );
                                    })}
                                </ol>
                            </li>
                        );
                    })}
                </ol>
            </div>
            {canReplay && (
                <div className="simulation-summary-actions">
                    <button
                        className="simulation-secondary-button"
                        type="button"
                        disabled={saving}
                        onClick={onReplay}
                    >
                        {saving ? 'Preparando jornada...' : 'Repetir la jornada'}
                    </button>
                </div>
            )}
        </section>
    );
}

export default function SimulationPage() {
    const payload = useSimulationStore((state) => state.payload);
    const scenario = useSimulationStore((state) => state.scenario);
    const simulation = useSimulationStore((state) => state.simulation);
    const currentStage = useSimulationStore((state) => state.currentStage);
    const currentStageProgress = useSimulationStore(selectCurrentStageProgress);
    const feedback = useSimulationStore((state) => state.feedback);
    const loading = useSimulationStore((state) => state.loading);
    const saving = useSimulationStore((state) => state.saving);
    const error = useSimulationStore((state) => state.error);
    const loadSimulation = useSimulationStore((state) => state.loadSimulation);
    const startRun = useSimulationStore((state) => state.startRun);
    const replay = useSimulationStore((state) => state.replay);
    const submitAction = useSimulationStore((state) => state.submitAction);
    const clearFeedback = useSimulationStore((state) => state.clearFeedback);

    useEffect(() => {
        const controller = new AbortController();
        void loadSimulation(controller.signal);
        return () => controller.abort();
    }, [loadSimulation]);

    if (loading && !scenario) {
        return (
            <main className="simulation-page">
                <section className="simulation-loading simulation-activity-panel" role="status">
                    <p className="simulation-eyebrow">Laboratorio</p>
                    <h2>Preparando tu jornada...</h2>
                </section>
            </main>
        );
    }

    if (!scenario || !payload) {
        return (
            <main className="simulation-page">
                <section className="simulation-empty simulation-activity-panel">
                    <h2>No pudimos preparar la jornada</h2>
                    {error && <p className="simulation-error" role="alert">{error}</p>}
                    <button
                        className="simulation-secondary-button"
                        type="button"
                        disabled={loading}
                        onClick={() => void loadSimulation()}
                    >
                        Intentar nuevamente
                    </button>
                </section>
            </main>
        );
    }

    const actionFeedback = feedback?.type === 'action' ? feedback : null;
    const inspectionFeedback = feedback?.type === 'inspection' ? feedback : null;
    const completed = simulation?.status === 'completed';
    const abandoned = simulation?.status === 'abandoned';
    const busy = loading || saving;

    return (
        <main className={`simulation-page ${completed ? 'is-completed' : ''}`}>
            <div className="simulation-shell">
                <JourneySidebar scenario={scenario} simulation={simulation} />
                <section className="simulation-content simulation-activity-panel" aria-label="Actividad de la jornada">
                    {error && <p className="simulation-error" role="alert">{error}</p>}
                    {actionFeedback ? (
                        <FeedbackPanel
                            feedback={actionFeedback}
                            journeyCompleted={completed}
                            onContinue={clearFeedback}
                        />
                    ) : completed && simulation ? (
                        <SummaryPanel
                            scenario={scenario}
                            simulation={simulation}
                            canReplay={payload.canReplay}
                            saving={busy}
                            onReplay={() => void replay()}
                        />
                    ) : currentStage && currentStageProgress ? (
                        <StagePanel
                            stage={currentStage}
                            progress={currentStageProgress}
                            inspectionFeedback={inspectionFeedback}
                            saving={busy}
                            onAction={(actionId) => void submitAction(currentStage.id, actionId)}
                        />
                    ) : (
                        <StartPanel
                            scenario={scenario}
                            legacyCompleted={payload.legacyCompleted}
                            abandoned={abandoned}
                            saving={busy}
                            onStart={() => void startRun(abandoned)}
                        />
                    )}
                </section>
            </div>
        </main>
    );
}
