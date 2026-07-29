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
import { TRAINING_STATIONS } from '../../shared/trainingModule';
import { authService } from '../auth/authService';
import { getErrorMessage } from '../api/apiClient';
import { contentService } from '../content/contentService';
import InductionActivityPanel from '../induction/InductionActivityPanel';
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
    type CampusInteractionTarget,
} from './campusTargets';
import { CampusWorld } from './CampusWorld';
import { useCampusAudio } from './useCampusAudio';
import { useCampusKeyboard } from './useCampusKeyboard';
import { useNpcNarration } from '../speech/useNpcNarration';
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
        if (!progress.trainingCompleted) return 'Entra al Centro de inducción y completa sus cinco estaciones.';
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
    const completedContentIds = useTrainingStore((state) => state.completedContentIds);
    const setCompletedContentIds = useTrainingStore((state) => state.setCompletedContentIds);
    const [savedProgress, setSavedProgress] = useState<CampusProgressRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingContent, setSavingContent] = useState(false);
    const [error, setError] = useState('');
    const [activeExperience, setActiveExperience] = useState<ExperienceKind | null>(null);
    const [nearbyTarget, setNearbyTarget] = useState<CampusInteractionTarget | null>(null);
    const [cameraMode, setCameraMode] = useState<CampusCameraMode>('third-person');
    const [quality, setQuality] = useState<'high' | 'adaptive'>('high');
    const [controlsOpen, setControlsOpen] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const locationEventIdsRef = useRef(new Map<string, string>());
    const locationSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
    const visitStartedAtRef = useRef(0);
    const baseDurationRef = useRef(0);
    const portalTransitionLockedUntilRef = useRef(0);

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

    const targets = useMemo(() => buildCampusInteractionTargets(
        zoneId,
        campusProgress,
        completedStationIds,
    ), [campusProgress, completedStationIds, zoneId]);
    const objective = useMemo(
        () => getObjective(zoneId, campusProgress, completedStationIds),
        [campusProgress, completedStationIds, zoneId],
    );
    const activeContentCompleted = activeContent
        ? completedContentIds.includes(activeContent._id)
        : false;
    const paused = Boolean(activeContent || activeExperience);
    const audio = useCampusAudio(zoneId);
    const narration = useNpcNarration({
        speech: activeNpcSpeech,
        audioStarted: audio.started,
        muted: audio.muted,
        enabled: true,
        voiceVolume: audio.voiceVolume,
        onDuckedChange: audio.setDucked,
    });

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
            setNearbyTarget(null);
            setActiveExperience(null);
            setActiveContent(null);
            setCameraMode('third-person');
            setQuality('high');
        });
        return () => window.cancelAnimationFrame(frame);
    }, [setActiveContent, zoneId]);

    useEffect(() => {
        if (!error) return undefined;
        const timeout = window.setTimeout(() => setError(''), 7_000);
        return () => window.clearTimeout(timeout);
    }, [error]);

    const closePanel = useCallback(() => {
        setActiveContent(null);
        setActiveExperience(null);
        void refreshProgress().catch((requestError: unknown) => {
            setError(getErrorMessage(requestError, 'No se pudo actualizar el progreso.'));
        });
    }, [refreshProgress, setActiveContent]);

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
        if (nearbyTarget?.id !== target.id) {
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
            setNearbyTarget(null);
            navigate(`/campus/${target.portal.targetZoneId}`, {
                state: { spawnId: target.portal.targetSpawnId },
            });
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
            setActiveContent(content);
            void interactionSystem.registerInteraction(
                target.id,
                'content_opened',
                zoneId,
                getDurationSeconds(),
            );
            return;
        }
        if (target.kind === 'simulation_terminal') setActiveExperience('simulation');
        if (target.kind === 'evaluation_terminal') setActiveExperience('evaluation');
        if (target.kind === 'certificate_kiosk') setActiveExperience('certificate');
    }, [
        audio,
        contents,
        getDurationSeconds,
        navigate,
        nearbyTarget,
        setActiveContent,
        zoneId,
    ]);

    const handleNearbyTargetChange = useCallback((target: CampusInteractionTarget | null) => {
        setNearbyTarget(target);
        if (!target?.unlocked || target.kind === 'portal') return;
        void interactionSystem.registerInteraction(
            target.id,
            'proximity',
            zoneId,
            getDurationSeconds(),
        ).catch((requestError: unknown) => {
            console.warn('No se pudo registrar el sensor de proximidad.', requestError);
        });
    }, [getDurationSeconds, zoneId]);

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
        if (nearbyTarget) interactWithTarget(nearbyTarget);
    }, [interactWithTarget, nearbyTarget]);
    const movementRef = useCampusKeyboard({
        paused,
        onInteract: handleKeyboardInteract,
        onToggleCamera: toggleCamera,
        onEscape: handleEscape,
    });

    useEffect(() => {
        const handlePointerLockChange = () => {
            if (cameraMode === 'first-person' && document.pointerLockElement !== canvasRef.current) {
                setCameraMode('third-person');
            }
        };
        document.addEventListener('pointerlockchange', handlePointerLockChange);
        return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
    }, [cameraMode]);

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

    const experiencePanel = activeExperience === 'simulation'
        ? <SimulationPage />
        : <EvaluationPage onMicrophoneActiveChange={audio.setDucked} />;

    return (
        <main className="campus-page">
            <div className={`campus-world-shell ${paused ? 'is-paused' : ''}`} aria-hidden={paused}>
                <SceneErrorBoundary>
                    <CampusWorld
                        key={`${zoneId}:${spawn.id}`}
                        zoneId={zoneId}
                        spawn={spawn}
                        avatarId={session.participant.avatarId}
                        progress={campusProgress}
                        completedStationIds={completedStationIds}
                        targets={targets}
                        movementRef={movementRef}
                        cameraMode={cameraMode}
                        paused={paused}
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
                    nearbyTarget={nearbyTarget}
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
                    voiceVolume={audio.voiceVolume}
                    onVoiceVolumeChange={audio.setVoiceVolume}
                />
            )}

            {activeExperience && (
                <CampusOverlay
                    title={getExperienceTitle(activeExperience)}
                    onClose={closePanel}
                >
                    <Suspense fallback={<p className="campus-loading">Cargando actividad…</p>}>
                        {experiencePanel}
                    </Suspense>
                </CampusOverlay>
            )}

            {error && <p className="campus-error-toast" role="alert">{error}</p>}
        </main>
    );
}
