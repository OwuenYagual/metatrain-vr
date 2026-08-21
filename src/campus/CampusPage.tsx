import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    CAMPUS_GUIDE_OBJECT_ID,
    CAMPUS_MANIFEST,
    getCampusSpawn,
    getCampusZone,
    isCampusZoneId,
    isCampusZoneUnlocked,
    normalizePlayerLocation,
    type CampusProgressState,
    type CampusZoneId,
    type PlayerLocation,
} from '../../shared/campus';
import {
    TRAINING_INTERACTION_OBJECT_IDS,
    TRAINING_STATIONS,
} from '../../shared/trainingModule';
import {
    SIMULATION_STAGE_IDS,
    type SimulationStageId,
} from '../../shared/simulation';
import { authService } from '../auth/authService';
import { getErrorMessage } from '../api/apiClient';
import { contentService } from '../content/contentService';
import InductionActivityPanel from '../induction/InductionActivityPanel';
import {
    getSavedNpcSpeechSpeed,
    saveNpcSpeechSpeed,
    type NpcSpeechSpeed,
} from '../induction/npcSpeech';
import {
    CAMPUS_GUIDE_BUBBLE_ID,
    CAMPUS_GUIDE_DIALOGUE,
    getSimulationGuideBubbleId,
    getSimulationGuideStationId,
} from '../../shared/speech';
import { getCompletedStationIds } from '../progress/contentProgress';
import { progressService, type TrainingProgress } from '../progress/progressService';
import { SceneErrorBoundary } from '../scene/SceneErrorBoundary';
import { interactionSystem } from '../scene/interactionSystem';
import { useTrainingStore } from '../store/useTrainingStore';
import { sendWithOfflineFallback } from '../utils/offlineSync';
import { CampusHud } from './CampusHud';
import { CampusOverlay } from './CampusOverlay';
import type { CampusCameraMode } from './CampusPlayer';
import {
    buildCampusInteractionTargets,
    getVisibleInteractionTarget,
    getTrainingGuideFocusPosition,
    type CampusInteractionTarget,
} from './campusTargets';
import { CampusWorld } from './CampusWorld';
import { useCampusAudio } from './useCampusAudio';
import { useCampusKeyboard } from './useCampusKeyboard';
import { useNpcNarration } from '../speech/useNpcNarration';
import { useSimulationStore } from '../simulation/useSimulationStore';
import {
    SIMULATION_LAB_STAGE_POSITIONS,
    type SimulationLabSceneState,
} from './simulationLabScene';
import './CampusPage.css';

const SimulationPage = lazy(() => import('../simulation/SimulationPage'));
const EvaluationPage = lazy(() => import('../evaluation/EvaluationPage'));

type CampusProgressRecord = TrainingProgress & {
    moduleVersion?: number;
    worldVersion?: number;
    lastLocation?: PlayerLocation;
};

type ExperienceKind = 'simulation' | 'evaluation' | 'certificate';

const PORTAL_TRANSITION_COOLDOWN_MS = 750;
const SIMULATION_STAGE_TARGET_PREFIX = 'simulation-stage-';

function getSimulationStageTargetId(stageId: SimulationStageId): string {
    return `${SIMULATION_STAGE_TARGET_PREFIX}${stageId}`;
}

function getSimulationStageId(targetId: string): SimulationStageId | null {
    if (!targetId.startsWith(SIMULATION_STAGE_TARGET_PREFIX)) return null;
    const stageId = targetId.slice(SIMULATION_STAGE_TARGET_PREFIX.length);
    return SIMULATION_STAGE_IDS.find((candidate) => candidate === stageId) ?? null;
}

function getNavigationSpawnId(state: unknown): string | null {
    if (!state || typeof state !== 'object') return null;
    const spawnId = (state as { spawnId?: unknown }).spawnId;
    return typeof spawnId === 'string' ? spawnId : null;
}

function getObjective(
    zoneId: CampusZoneId,
    progress: CampusProgressState,
    completedStationIds: readonly string[],
): string {
    if (zoneId === 'lobby') {
        if (!progress.trainingCompleted) return 'Entra al Centro de inducción y completa sus cuatro estaciones.';
        if (!progress.simulationCompleted) return 'Accede al Laboratorio de simulación.';
        if (!progress.approved) return 'Entra a la Sala de evaluación y demuestra lo aprendido.';
        return 'Tu recorrido está completo. Puedes descargar el certificado en la sala de evaluación.';
    }
    if (zoneId === 'induction-office') {
        const nextStation = TRAINING_STATIONS.find(({ id }) => !completedStationIds.includes(id));
        return nextStation
            ? `Dirígete a la capacitación: ${nextStation.title}.`
            : 'Regresa al vestíbulo para entrar al laboratorio de simulación.';
    }
    if (zoneId === 'simulation-lab') {
        return progress.simulationCompleted
            ? 'Regresa al vestíbulo; la Sala de evaluación ya está disponible.'
            : 'Acércate al terminal central y completa el reto del primer día.';
    }
    if (!progress.approved) return 'Usa el terminal izquierdo para realizar la evaluación final.';
    return 'Usa el kiosco derecho para emitir o descargar tu certificado.';
}

function getExperienceTitle(kind: ExperienceKind): string {
    if (kind === 'simulation') return 'Reto del primer día';
    if (kind === 'certificate') return 'Certificado de aprobación';
    return 'Evaluación final';
}

export default function CampusPage() {
    const { zoneId: routeZoneId } = useParams<{ zoneId: string }>();
    const routerLocation = useLocation();
    const navigate = useNavigate();
    const session = authService.getCurrentSession();
    const contents = useTrainingStore((state) => state.contents);
    const setContents = useTrainingStore((state) => state.setContents);
    const activeContent = useTrainingStore((state) => state.activeContent);
    const activeNpcSpeech = useTrainingStore((state) => state.activeNpcSpeech);
    const setActiveContent = useTrainingStore((state) => state.setActiveContent);
    const setActiveNpcSpeech = useTrainingStore((state) => state.setActiveNpcSpeech);
    const completedContentIds = useTrainingStore((state) => state.completedContentIds);
    const setCompletedContentIds = useTrainingStore((state) => state.setCompletedContentIds);
    const simulation = useSimulationStore((state) => state.simulation);
    const currentSimulationStage = useSimulationStore((state) => state.currentStage);
    const inspectSimulationStage = useSimulationStore((state) => state.inspectStage);
    const [savedProgress, setSavedProgress] = useState<CampusProgressRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingContent, setSavingContent] = useState(false);
    const [error, setError] = useState('');
    const [activeExperience, setActiveExperience] = useState<ExperienceKind | null>(null);
    const [nearbyTarget, setNearbyTarget] = useState<CampusInteractionTarget | null>(null);
    const nearbyTargetRef = useRef<CampusInteractionTarget | null>(null);
    const [cameraMode, setCameraMode] = useState<CampusCameraMode>('third-person');
    const [quality, setQuality] = useState<'high' | 'adaptive'>('high');
    const [controlsOpen, setControlsOpen] = useState(false);
    const [npcSpeechSpeed, setNpcSpeechSpeed] = useState<NpcSpeechSpeed>(getSavedNpcSpeechSpeed);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const locationEventIdsRef = useRef(new Map<string, string>());
    const locationSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
    const visitStartedAtRef = useRef(0);
    const baseDurationRef = useRef(0);
    const portalTransitionLockedUntilRef = useRef(0);
    const cameraModeBeforeTrainingRef = useRef<CampusCameraMode>('third-person');
    const refreshedSimulationRunRef = useRef<string | null>(null);

    const completedStationIds = useMemo(
        () => getCompletedStationIds(contents, completedContentIds),
        [completedContentIds, contents],
    );
    const trainingCompleted = contents.length >= TRAINING_STATIONS.length
        && completedStationIds.length === TRAINING_STATIONS.length;
    const campusProgress = useMemo<CampusProgressState>(() => ({
        trainingCompleted,
        simulationCompleted: savedProgress?.simulationCompleted ?? false,
        approved: savedProgress?.status === 'approved',
    }), [savedProgress?.simulationCompleted, savedProgress?.status, trainingCompleted]);

    const recoveredLocation = useMemo(
        () => normalizePlayerLocation(savedProgress?.lastLocation),
        [savedProgress?.lastLocation],
    );
    const fallbackZoneId = isCampusZoneUnlocked(recoveredLocation.zoneId, campusProgress)
        ? recoveredLocation.zoneId
        : CAMPUS_MANIFEST.defaultZoneId;
    const requestedZoneId = isCampusZoneId(routeZoneId) ? routeZoneId : null;
    const zoneId = requestedZoneId && isCampusZoneUnlocked(requestedZoneId, campusProgress)
        ? requestedZoneId
        : fallbackZoneId;
    const zone = getCampusZone(zoneId);
    const navigationSpawnId = getNavigationSpawnId(routerLocation.state);
    const requestedSpawnId = navigationSpawnId
        ?? (recoveredLocation.zoneId === zoneId ? recoveredLocation.spawnId : undefined);
    const spawn = getCampusSpawn(zoneId, requestedSpawnId ?? undefined);

    const simulationActive = activeExperience === 'simulation';
    const currentSimulationStageProgress = currentSimulationStage
        ? simulation?.stages.find(({ stageId }) => stageId === currentSimulationStage.id) ?? null
        : null;
    const targets = useMemo(() => {
        const zoneTargets = buildCampusInteractionTargets(
            zoneId,
            campusProgress,
            completedStationIds,
        );
        if (zoneId !== 'simulation-lab'
            || !simulationActive
            || simulation?.status !== 'in_progress'
            || !currentSimulationStage) {
            return zoneTargets;
        }
        return [
            ...zoneTargets,
            {
                id: getSimulationStageTargetId(currentSimulationStage.id),
                label: `Inspeccionar ${currentSimulationStage.evidence.label}`,
                kind: 'simulation_stage' as const,
                position: SIMULATION_LAB_STAGE_POSITIONS[currentSimulationStage.id],
                unlocked: true,
            },
        ];
    }, [
        campusProgress,
        completedStationIds,
        currentSimulationStage,
        simulation?.status,
        simulationActive,
        zoneId,
    ]);

    const simulationSceneState = useMemo<SimulationLabSceneState>(() => ({
        activeRun: simulation?.status === 'in_progress',
        currentStageId: simulation?.currentStageId ?? null,
        stages: simulation?.stages ?? [],
    }), [simulation]);

    const objective = useMemo(() => {
        if (zoneId === 'simulation-lab'
            && simulationActive
            && currentSimulationStage
            && currentSimulationStageProgress) {
            if (currentSimulationStageProgress.status === 'awaiting_inspection') {
                return `${currentSimulationStage.time}: acércate a ${currentSimulationStage.evidence.label} e inspecciónalo.`;
            }
            if (currentSimulationStageProgress.status === 'pending_correction') {
                return `${currentSimulationStage.time}: realiza una acción correctiva para resolver ${currentSimulationStage.title}.`;
            }
            return `${currentSimulationStage.time}: decide cómo actuar en ${currentSimulationStage.title}.`;
        }
        return getObjective(zoneId, campusProgress, completedStationIds);
    }, [
        campusProgress,
        completedStationIds,
        currentSimulationStage,
        currentSimulationStageProgress,
        simulationActive,
        zoneId,
    ]);
    const activeContentCompleted = activeContent
        ? completedContentIds.includes(activeContent._id)
        : false;
    const paused = Boolean(activeContent || (activeExperience && !simulationActive));
    const conversationFocusTarget = useMemo(
        () => activeContent
            ? getTrainingGuideFocusPosition(activeContent.interactionObjectId) ?? null
            : null,
        [activeContent],
    );
    const audio = useCampusAudio(zoneId);
    const narration = useNpcNarration({
        speech: activeNpcSpeech,
        audioStarted: audio.started,
        muted: audio.muted,
        enabled: true,
        voiceVolume: audio.voiceVolume,
        onDuckedChange: audio.setDucked,
    });

    useEffect(() => {
        saveNpcSpeechSpeed(npcSpeechSpeed);
    }, [npcSpeechSpeed]);

    const getDurationSeconds = useCallback(() => (
        baseDurationRef.current
        + Math.max(0, Math.floor((Date.now() - visitStartedAtRef.current) / 1000))
    ), []);

    const refreshProgress = useCallback(async (signal?: AbortSignal) => {
        if (!session?.participant.id) return null;
        const progress = await progressService.getParticipantProgress(
            session.participant.id,
            CAMPUS_MANIFEST.moduleId,
            signal,
        ) as CampusProgressRecord | null;
        if (progress) {
            setSavedProgress(progress);
            setCompletedContentIds(progress.completedContents);
            baseDurationRef.current = progress.durationSeconds;
            visitStartedAtRef.current = Date.now();
        }
        return progress;
    }, [session?.participant.id, setCompletedContentIds]);

    useEffect(() => {
        if (simulation?.status !== 'completed'
            || refreshedSimulationRunRef.current === simulation.runId) return;
        refreshedSimulationRunRef.current = simulation.runId;
        audio.playEffect('confirm');
        void refreshProgress().catch((requestError: unknown) => {
            setError(getErrorMessage(
                requestError,
                'La jornada terminó, pero no se pudo actualizar el progreso del campus.',
            ));
        });
    }, [audio, refreshProgress, simulation?.runId, simulation?.status]);

    useEffect(() => {
        if (!session?.participant.avatarId || !session.participant.id) {
            navigate('/avatar-selector', { replace: true });
        }
    }, [navigate, session?.participant.avatarId, session?.participant.id]);

    useEffect(() => {
        if (!session?.participant.avatarId || !session.participant.id) {
            return undefined;
        }
        const controller = new AbortController();
        setActiveContent(null);
        setContents([]);
        setCompletedContentIds([]);
        visitStartedAtRef.current = Date.now();
        Promise.all([
            contentService.getTrainingContents(CAMPUS_MANIFEST.moduleId, controller.signal),
            progressService.getParticipantProgress(
                session.participant.id,
                CAMPUS_MANIFEST.moduleId,
                controller.signal,
            ),
        ])
            .then(([loadedContents, progress]) => {
                setContents(loadedContents);
                if (progress) {
                    setSavedProgress(progress);
                    setCompletedContentIds(progress.completedContents);
                    baseDurationRef.current = progress.durationSeconds;
                    visitStartedAtRef.current = Date.now();
                }
            })
            .catch((requestError: unknown) => {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(requestError, 'No se pudo cargar el campus.'));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [
        session?.participant.avatarId,
        session?.participant.id,
        setActiveContent,
        setCompletedContentIds,
        setContents,
    ]);

    useEffect(() => {
        if (loading || routeZoneId === zoneId) return;
        navigate(`/campus/${zoneId}`, { replace: true, state: { spawnId: spawn.id } });
    }, [loading, navigate, routeZoneId, spawn.id, zoneId]);

    useEffect(() => {
        if (loading || routeZoneId !== zoneId || !session?.participant.id) return;
        const locationKey = `${routerLocation.key}:${zoneId}:${spawn.id}`;
        let clientEventId = locationEventIdsRef.current.get(locationKey);
        if (!clientEventId) {
            clientEventId = crypto.randomUUID();
            locationEventIdsRef.current.set(locationKey, clientEventId);
        }
        const saveRequest = locationSaveQueueRef.current.then(() => (
            sendWithOfflineFallback('/progress/location', {
                clientEventId,
                moduleId: CAMPUS_MANIFEST.moduleId,
                moduleVersion: CAMPUS_MANIFEST.moduleVersion,
                worldVersion: CAMPUS_MANIFEST.worldVersion,
                zoneId,
                spawnId: spawn.id,
                durationSeconds: getDurationSeconds(),
            }, 'PUT')
        ));
        locationSaveQueueRef.current = saveRequest.then(
            () => undefined,
            () => undefined,
        );
        void saveRequest.then((result) => {
            if (result === 'queued') console.info('Ubicación segura guardada en la cola offline.', { zoneId, spawnId: spawn.id });
        }).catch((requestError: unknown) => {
            setError(getErrorMessage(requestError, 'No se pudo guardar la ubicación segura.'));
        });
    }, [
        getDurationSeconds,
        loading,
        routeZoneId,
        routerLocation.key,
        session?.participant.id,
        spawn.id,
        zoneId,
    ]);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            nearbyTargetRef.current = null;
            setNearbyTarget(null);
            setActiveExperience(null);
            setActiveContent(null);
            setCameraMode('third-person');
            cameraModeBeforeTrainingRef.current = 'third-person';
            setQuality('high');
        });
        return () => window.cancelAnimationFrame(frame);
    }, [setActiveContent, zoneId]);

    useEffect(() => {
        if (!error) return undefined;
        const timeout = window.setTimeout(() => setError(''), 7_000);
        return () => window.clearTimeout(timeout);
    }, [error]);

    const restoreTrainingCamera = useCallback(() => {
        setCameraMode(cameraModeBeforeTrainingRef.current);
        window.requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
    }, []);

    const closePanel = useCallback(() => {
        if (activeContent) restoreTrainingCamera();
        if (simulationActive) setActiveNpcSpeech(null);
        setActiveContent(null);
        setActiveExperience(null);
        void refreshProgress().catch((requestError: unknown) => {
            setError(getErrorMessage(requestError, 'No se pudo actualizar el progreso.'));
        });
    }, [
        activeContent,
        refreshProgress,
        restoreTrainingCamera,
        setActiveContent,
        setActiveNpcSpeech,
        simulationActive,
    ]);

    useEffect(() => {
        if (paused || loading) return undefined;
        const frame = window.requestAnimationFrame(() => {
            canvasRef.current?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [loading, paused, zoneId]);

    useEffect(() => {
        if (!activeContent) return undefined;
        if (document.pointerLockElement) document.exitPointerLock();
        const frame = window.requestAnimationFrame(() => {
            document.querySelector<HTMLButtonElement>('.close-induction-panel')?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [activeContent]);

    const interactWithTarget = useCallback((target: CampusInteractionTarget) => {
        if (!targets.some(({ id }) => id === target.id)) {
            nearbyTargetRef.current = null;
            setNearbyTarget(null);
            setError('');
            return;
        }

        if (nearbyTargetRef.current?.id !== target.id) {
            audio.playEffect('denied');
            setError('Acércate al objeto antes de interactuar.');
            return;
        }

        if (!target.unlocked) {
            audio.playEffect('denied');
            setError(target.lockedMessage ?? 'Este acceso todavía está bloqueado.');
            return;
        }

        if (target.kind === 'portal' && target.portal) {
            if (Date.now() < portalTransitionLockedUntilRef.current) return;
            portalTransitionLockedUntilRef.current = Date.now() + PORTAL_TRANSITION_COOLDOWN_MS;
            audio.playEffect('door');
            nearbyTargetRef.current = null;
            setNearbyTarget(null);
            navigate(`/campus/${target.portal.targetZoneId}`, {
                state: { spawnId: target.portal.targetSpawnId },
            });
            return;
        }

        if (target.kind === 'simulation_stage') {
            const stageId = getSimulationStageId(target.id);
            if (!stageId || currentSimulationStage?.id !== stageId) {
                audio.playEffect('denied');
                setError('Esta situación ya no es el objetivo activo de la jornada.');
                return;
            }
            audio.setNarrationEnabled(true);
            void audio.start();
            setActiveNpcSpeech({
                zoneId: 'simulation-lab',
                stationId: getSimulationGuideStationId(stageId),
                bubbleId: getSimulationGuideBubbleId(stageId),
                kind: 'explanation',
                label: currentSimulationStage.title,
                visibleText: currentSimulationStage.guide.introduction,
                fullText: currentSimulationStage.guide.introduction,
                typing: false,
            });
            if (currentSimulationStageProgress?.status !== 'awaiting_inspection') {
                audio.playEffect('confirm');
                setError('Ya inspeccionaste esta estación. Elige tu acción en el panel de la jornada.');
                return;
            }
            audio.playEffect('confirm');
            void inspectSimulationStage(stageId);
            return;
        }

        audio.playEffect('confirm');
        void interactionSystem.registerInteraction(
            target.id,
            'click',
            zoneId,
            getDurationSeconds(),
        ).catch((requestError: unknown) => {
            setError(getErrorMessage(requestError, 'No se pudo registrar la interacción.'));
        });

        if (target.kind === 'training_station') {
            const content = contents.find(({ interactionObjectId }) => interactionObjectId === target.id);
            if (!content) {
                setError(`No existe contenido asociado a ${target.label}.`);
                return;
            }
            audio.setNarrationEnabled(true);
            void audio.start();
            cameraModeBeforeTrainingRef.current = cameraMode;
            setCameraMode('first-person');
            setActiveContent(content);
            void interactionSystem.registerInteraction(
                target.id,
                'content_opened',
                zoneId,
                getDurationSeconds(),
            );
            return;
        }
        if (target.kind === 'campus_guide') {
            if (activeNpcSpeech?.stationId === CAMPUS_GUIDE_OBJECT_ID) {
                setActiveNpcSpeech(null);
                return;
            }
            audio.setNarrationEnabled(true);
            void audio.start();
            setActiveNpcSpeech({
                stationId: CAMPUS_GUIDE_OBJECT_ID,
                bubbleId: CAMPUS_GUIDE_BUBBLE_ID,
                kind: 'greeting',
                label: 'Orientación del campus',
                visibleText: CAMPUS_GUIDE_DIALOGUE,
                fullText: CAMPUS_GUIDE_DIALOGUE,
                typing: false,
            });
            return;
        }
        if (target.kind === 'simulation_terminal') setActiveExperience('simulation');
        if (target.kind === 'evaluation_terminal') {
            audio.setNarrationEnabled(true);
            void audio.start();
            setActiveExperience('evaluation');
        }
        if (target.kind === 'certificate_kiosk') setActiveExperience('certificate');
    }, [
        audio,
        activeNpcSpeech?.stationId,
        cameraMode,
        contents,
        currentSimulationStage,
        currentSimulationStageProgress?.status,
        getDurationSeconds,
        inspectSimulationStage,
        navigate,
        setActiveContent,
        setActiveNpcSpeech,
        targets,
        zoneId,
    ]);

    const handleSimulationStageInteract = useCallback((stageId: SimulationStageId) => {
        const target = targets.find(({ id }) => id === getSimulationStageTargetId(stageId));
        if (target) interactWithTarget(target);
    }, [interactWithTarget, targets]);

    const handleNearbyTargetChange = useCallback((target: CampusInteractionTarget | null) => {
        nearbyTargetRef.current = target;
        setNearbyTarget(target);
        if (activeNpcSpeech?.stationId === CAMPUS_GUIDE_OBJECT_ID
            && target?.id !== CAMPUS_GUIDE_OBJECT_ID) {
            setActiveNpcSpeech(null);
        }
        if (!target?.unlocked || target.kind === 'portal' || target.kind === 'simulation_stage') return;
        void interactionSystem.registerInteraction(
            target.id,
            'proximity',
            zoneId,
            getDurationSeconds(),
        ).catch((requestError: unknown) => {
            console.warn('No se pudo registrar el sensor de proximidad.', requestError);
        });
    }, [activeNpcSpeech?.stationId, getDurationSeconds, setActiveNpcSpeech, zoneId]);

    const toggleCamera = useCallback(() => {
        if (paused) return;
        if (cameraMode === 'first-person') {
            if (document.pointerLockElement) document.exitPointerLock();
            setCameraMode('third-person');
            return;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        setCameraMode('first-person');
        canvas.focus({ preventScroll: true });
        const pointerLockRequest = canvas.requestPointerLock();
        if (pointerLockRequest && 'catch' in pointerLockRequest) {
            void pointerLockRequest.catch((requestError: unknown) => {
                console.warn('El navegador no permitió capturar el puntero.', requestError);
            });
        }
    }, [cameraMode, paused]);

    const handleEscape = useCallback(() => {
        if (activeContent || activeExperience) {
            closePanel();
            return;
        }
        if (document.pointerLockElement) document.exitPointerLock();
        setCameraMode('third-person');
        setControlsOpen(false);
    }, [activeContent, activeExperience, closePanel]);

    const handleKeyboardInteract = useCallback(() => {
        const target = nearbyTargetRef.current;
        if (target) interactWithTarget(target);
    }, [interactWithTarget]);
    const movementRef = useCampusKeyboard({
        paused,
        onInteract: handleKeyboardInteract,
        onToggleCamera: toggleCamera,
        onEscape: handleEscape,
    });

    useEffect(() => {
        const handlePointerLockChange = () => {
            if (cameraMode === 'first-person'
                && !activeContent
                && document.pointerLockElement !== canvasRef.current) {
                setCameraMode('third-person');
            }
        };
        document.addEventListener('pointerlockchange', handlePointerLockChange);
        return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
    }, [activeContent, cameraMode]);

    const completeActiveContent = async () => {
        if (!activeContent) return;
        if (activeContentCompleted) {
            closePanel();
            return;
        }
        setSavingContent(true);
        setError('');
        try {
            const nextProgress = await contentService.markContentCompleted(
                activeContent.moduleId,
                activeContent._id,
                getDurationSeconds(),
            ) as CampusProgressRecord;
            setSavedProgress((current) => ({ ...current, ...nextProgress } as CampusProgressRecord));
            setCompletedContentIds(nextProgress.completedContents);
            restoreTrainingCamera();
            setActiveContent(null);
            audio.playEffect('confirm');
            window.requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'No se pudo guardar la estación completada.'));
        } finally {
            setSavingContent(false);
        }
    };

    if (loading || !session?.participant.avatarId) {
        return (
            <main className="campus-loading" aria-busy="true">
                <h1>Preparando el campus virtual</h1>
                <p>Cargando tu avatar, zona segura y progreso…</p>
            </main>
        );
    }

    const hudZones = CAMPUS_MANIFEST.zones.map((campusZone) => ({
        id: campusZone.id,
        title: campusZone.title,
        current: campusZone.id === zoneId,
        unlocked: isCampusZoneUnlocked(campusZone.id, campusProgress),
        completed: campusZone.id === 'lobby'
            || (campusZone.id === 'induction-office' && campusProgress.trainingCompleted)
            || (campusZone.id === 'simulation-lab' && campusProgress.simulationCompleted)
            || (campusZone.id === 'assessment-room' && campusProgress.approved),
    }));

    return (
        <main className={`campus-page ${simulationActive ? 'is-simulation-active' : ''}`}>
            <div className={`campus-world-shell ${paused ? 'is-paused' : ''}`} aria-hidden={paused}>
                <SceneErrorBoundary>
                    <CampusWorld
                        key={`${zoneId}:${spawn.id}:${TRAINING_INTERACTION_OBJECT_IDS.join(':')}`}
                        zoneId={zoneId}
                        spawn={spawn}
                        avatarId={session.participant.avatarId}
                        progress={campusProgress}
                        completedStationIds={completedStationIds}
                        targets={targets}
                        movementRef={movementRef}
                        cameraMode={cameraMode}
                        paused={paused}
                        conversationFocusTarget={conversationFocusTarget}
                        nearbyTargetId={nearbyTarget?.id ?? null}
                        onNearbyTargetChange={handleNearbyTargetChange}
                        onInteract={interactWithTarget}
                        onStep={() => audio.playEffect('step')}
                        onCanvasReady={(canvas) => {
                            canvasRef.current = canvas;
                            canvas.tabIndex = 0;
                            canvas.setAttribute('role', 'application');
                            canvas.setAttribute('aria-label', `Campus 3D interactivo: ${zone.title}`);
                            if (!paused) {
                                window.requestAnimationFrame(() => {
                                    if (canvasRef.current === canvas) {
                                        canvas.focus({ preventScroll: true });
                                    }
                                });
                            }
                        }}
                        onQualityChange={setQuality}
                        hideSceneLabels={Boolean(activeContent || activeExperience)}
                        simulationSceneState={simulationSceneState}
                        onSimulationStageInteract={handleSimulationStageInteract}
                    />
                </SceneErrorBoundary>
            </div>

            {!paused && (
                <CampusHud
                    zoneTitle={zone.title}
                    objective={objective}
                    completedCount={completedStationIds.length}
                    totalCount={Math.max(TRAINING_STATIONS.length, contents.length)}
                    cameraMode={cameraMode}
                    quality={quality}
                    nearbyTarget={getVisibleInteractionTarget(nearbyTarget, simulationActive)}
                    hideStatusPanel={simulationActive}
                    zones={hudZones}
                    audio={{
                        started: audio.started,
                        muted: audio.muted,
                        ambientVolume: audio.ambientVolume,
                        voiceVolume: audio.voiceVolume,
                    }}
                    controlsOpen={controlsOpen}
                    onControlsToggle={() => setControlsOpen((current) => !current)}
                    onCameraToggle={toggleCamera}
                    onInteract={handleKeyboardInteract}
                    onAudioStart={() => void audio.start()}
                    onMutedChange={audio.setMuted}
                    onAmbientVolumeChange={audio.setAmbientVolume}
                    onVoiceVolumeChange={audio.setVoiceVolume}
                    speechSpeed={npcSpeechSpeed}
                    onSpeechSpeedChange={setNpcSpeechSpeed}
                />
            )}

            {activeContent && (
                <InductionActivityPanel
                    key={activeContent._id}
                    content={activeContent}
                    alreadyCompleted={activeContentCompleted}
                    saving={savingContent}
                    onComplete={() => void completeActiveContent()}
                    onClose={closePanel}
                    narration={narration}
                    audioStarted={audio.started}
                    speechSpeed={npcSpeechSpeed}
                />
            )}

            {simulationActive && (
                <aside className="campus-simulation-panel" aria-label="Jornada del primer día">
                    <header className="campus-simulation-panel-header campus-simulation-surface">
                        <div>
                            <p>Laboratorio de simulación</p>
                            <h2>{getExperienceTitle('simulation')}</h2>
                            <p className="campus-simulation-panel-guidance" role="note">
                                Mantén este panel abierto mientras recorres e interactúas con las demás estaciones.
                            </p>
                        </div>
                        <button type="button" aria-label="Cerrar jornada" onClick={closePanel}>
                            &times;
                        </button>
                    </header>
                    <div className="campus-simulation-panel-content">
                        <Suspense fallback={<p className="simulation-panel-loading">Cargando actividad...</p>}>
                            <SimulationPage />
                        </Suspense>
                    </div>
                </aside>
            )}

            {activeExperience && !simulationActive && (
                <CampusOverlay
                    title={getExperienceTitle(activeExperience)}
                    onClose={closePanel}
                >
                    <Suspense fallback={<p className="campus-loading">Cargando actividad…</p>}>
                        <EvaluationPage
                            onMicrophoneActiveChange={audio.setDucked}
                            audioStarted={audio.started}
                            narrationMuted={audio.muted}
                            voiceVolume={audio.voiceVolume}
                        />
                    </Suspense>
                </CampusOverlay>
            )}

            {error && <p className="campus-error-toast" role="alert">{error}</p>}
        </main>
    );
}
