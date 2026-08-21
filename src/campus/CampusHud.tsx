import { useState } from 'react';
import type { CampusZoneId } from '../../shared/campus';
import {
    isNpcSpeechSpeed,
    NPC_SPEECH_SPEED_OPTIONS,
    type NpcSpeechSpeed,
} from '../induction/npcSpeech';
import type { CampusCameraMode } from './CampusPlayer';
import type { CampusInteractionTarget } from './campusTargets';
import { StatusIcon } from '../components/StatusIcon';
import { UserMenu } from '../auth/UserMenu';

type HudZone = {
    id: CampusZoneId;
    title: string;
    unlocked: boolean;
    current: boolean;
    completed: boolean;
};

function ViewSwitchIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9a8 8 0 0 1 13-4l2 2" />
            <path d="M19 3v4h-4" />
            <path d="M20 15a8 8 0 0 1-13 4l-2-2" />
            <path d="M5 21v-4h4" />
            <circle cx="12" cy="12" r="2.25" />
        </svg>
    );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4Z" />
            {muted ? (
                <>
                    <path d="m17 9 4 4" />
                    <path d="m21 9-4 4" />
                </>
            ) : (
                <>
                    <path d="M16 9.5a4 4 0 0 1 0 5" />
                    <path d="M18.5 7a7 7 0 0 1 0 10" />
                </>
            )}
        </svg>
    );
}

export function CampusHud({
    zoneTitle,
    objective,
    completedCount,
    totalCount,
    cameraMode,
    quality,
    nearbyTarget,
    hideStatusPanel,
    zones,
    audio,
    controlsOpen,
    onControlsToggle,
    onCameraToggle,
    onInteract,
    onAudioStart,
    onMutedChange,
    onAmbientVolumeChange,
    onVoiceVolumeChange,
    speechSpeed,
    onSpeechSpeedChange,
}: {
    zoneTitle: string;
    objective: string;
    completedCount: number;
    totalCount: number;
    cameraMode: CampusCameraMode;
    quality: 'high' | 'adaptive';
    nearbyTarget: CampusInteractionTarget | null;
    hideStatusPanel: boolean;
    zones: readonly HudZone[];
    audio: {
        started: boolean;
        muted: boolean;
        ambientVolume: number;
        voiceVolume: number;
    };
    controlsOpen: boolean;
    onControlsToggle: () => void;
    onCameraToggle: () => void;
    onInteract: () => void;
    onAudioStart: () => void;
    onMutedChange: (muted: boolean) => void;
    onAmbientVolumeChange: (volume: number) => void;
    onVoiceVolumeChange: (volume: number) => void;
    speechSpeed: NpcSpeechSpeed;
    onSpeechSpeedChange: (speed: NpcSpeechSpeed) => void;
}) {
    const percentage = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;
    const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
    return (
        <>
            {!hideStatusPanel && (
                <section className="campus-hud" aria-label="Estado del campus">
                    <header className="campus-hud-heading">
                        <div>
                            <p>Campus MetaTrain</p>
                            <h1>{zoneTitle}</h1>
                        </div>
                        <button
                            type="button"
                            className="campus-icon-button"
                            aria-label={controlsOpen ? 'Ocultar ayuda de controles' : 'Mostrar ayuda de controles'}
                            aria-expanded={controlsOpen}
                            onClick={onControlsToggle}
                        >
                            ?
                        </button>
                    </header>

                    <p className="campus-objective"><span>Siguiente objetivo</span>{objective}</p>
                    <div className="campus-progress-row">
                        <div>
                            <span>Inducción</span>
                            <strong>{completedCount}/{totalCount}</strong>
                        </div>
                        <progress aria-label="Progreso de inducción" value={completedCount} max={Math.max(1, totalCount)} />
                        <small>{percentage}% completado</small>
                    </div>

                    <ol className="campus-zone-route" aria-label="Etapas del campus">
                        {zones.map((zone, index) => (
                            <li
                                key={zone.id}
                                className={`${zone.current ? 'is-current' : ''} ${zone.completed ? 'is-completed' : ''} ${zone.unlocked ? '' : 'is-locked'}`}
                                aria-current={zone.current ? 'step' : undefined}
                            >
                                <span aria-hidden="true">
                                    {zone.completed
                                        ? <StatusIcon name="check" />
                                        : zone.unlocked ? index + 1 : <StatusIcon name="lock" />}
                                </span>
                                <span className="campus-zone-route-label">{zone.title}</span>
                            </li>
                        ))}
                    </ol>

                    <p className="campus-quality" title="La calidad se ajusta automáticamente según el rendimiento.">
                        Calidad: {quality === 'high' ? 'alta' : 'adaptable'}
                    </p>
                </section>
            )}

            <nav className="campus-quick-controls" aria-label="Acciones rápidas del campus">
                <button
                    type="button"
                    className={cameraMode === 'first-person' ? 'is-active' : ''}
                    aria-label={`Cambiar a cámara en ${cameraMode === 'third-person' ? 'primera' : 'tercera'} persona`}
                    aria-pressed={cameraMode === 'first-person'}
                    title="Cambiar cámara (V)"
                    onClick={onCameraToggle}
                >
                    <ViewSwitchIcon />
                </button>
                <button
                    type="button"
                    className={audio.started && !audio.muted ? 'is-active' : ''}
                    aria-label={!audio.started ? 'Activar audio' : audio.muted ? 'Activar sonido' : 'Silenciar sonido'}
                    aria-pressed={audio.started && !audio.muted}
                    title={!audio.started ? 'Activar audio' : audio.muted ? 'Activar sonido' : 'Silenciar sonido'}
                    onClick={!audio.started ? onAudioStart : () => onMutedChange(!audio.muted)}
                >
                    <SpeakerIcon muted={audio.muted} />
                </button>
                <button
                    type="button"
                    className={audioSettingsOpen ? 'is-active' : ''}
                    aria-label={audioSettingsOpen ? 'Ocultar ajustes' : 'Mostrar ajustes'}
                    aria-expanded={audioSettingsOpen}
                    title="Ajustes"
                    onClick={() => setAudioSettingsOpen((current) => !current)}
                >
                    <span aria-hidden="true">≡</span>
                </button>
                <UserMenu embedded />
            </nav>

            {audioSettingsOpen && (
                <section className="campus-audio-popover" aria-label="Ajustes del campus">
                    <label>
                        <span>Ambiente</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={audio.ambientVolume}
                            onChange={(event) => onAmbientVolumeChange(Number(event.target.value))}
                            aria-label="Volumen ambiental"
                        />
                    </label>
                    <label>
                        <span>Voces</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={audio.voiceVolume}
                            onChange={(event) => onVoiceVolumeChange(Number(event.target.value))}
                            aria-label="Volumen de voces"
                        />
                    </label>
                    <label>
                        <span>Texto</span>
                        <select
                            value={speechSpeed}
                            aria-label="Velocidad de aparición del texto"
                            onChange={(event) => {
                                if (isNpcSpeechSpeed(event.target.value)) {
                                    onSpeechSpeedChange(event.target.value);
                                }
                            }}
                        >
                            {NPC_SPEECH_SPEED_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                </section>
            )}

            {!hideStatusPanel && controlsOpen && (
                <section className="campus-controls-help" aria-label="Controles del campus">
                    <div><kbd>WASD</kbd><span>Caminar</span></div>
                    <div><kbd>Shift</kbd><span>Correr</span></div>
                    <div><kbd>E</kbd><span>Interactuar</span></div>
                    <div><kbd>Arrastrar</kbd><span>Girar cámara en tercera persona</span></div>
                    <div><kbd>V</kbd><span>Cambiar cámara</span></div>
                    <div><kbd>Esc</kbd><span>Cerrar o liberar cámara</span></div>
                </section>
            )}

            {nearbyTarget && (
                <button
                    type="button"
                    className={`campus-interaction-prompt ${nearbyTarget.unlocked ? '' : 'is-locked'}`}
                    onClick={onInteract}
                    aria-label={nearbyTarget.unlocked
                        ? `Interactuar con ${nearbyTarget.label}`
                        : `${nearbyTarget.label} bloqueado. ${nearbyTarget.lockedMessage}`}
                >
                    <kbd>{nearbyTarget.unlocked ? 'E' : '•'}</kbd>
                    <span>
                        <strong>{nearbyTarget.unlocked ? 'Interactuar' : 'Acceso bloqueado'}</strong>
                        {nearbyTarget.label}
                        {!nearbyTarget.unlocked && <small>{nearbyTarget.lockedMessage}</small>}
                    </span>
                </button>
            )}
        </>
    );
}
