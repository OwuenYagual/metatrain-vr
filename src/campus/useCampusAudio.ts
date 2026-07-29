import { useCallback, useEffect, useRef, useState } from 'react';

export type CampusSoundEffect = 'confirm' | 'denied' | 'door' | 'step';

export type SavedAudioPreference = {
    muted: boolean;
    ambientVolume: number;
    voiceVolume: number;
    narrationEnabled: boolean;
};

type CampusAudioGraph = {
    context: AudioContext;
    master: GainNode;
    ambience: GainNode;
    oscillators: OscillatorNode[];
    lastStepAt: number;
};

const AUDIO_STORAGE_KEY = 'metatrain.campus.audio';
const DEFAULT_PREFERENCE: SavedAudioPreference = {
    muted: false,
    ambientVolume: 0.45,
    voiceVolume: 0.85,
    narrationEnabled: true,
};

function clampVolume(value: number): number {
    return Math.min(1, Math.max(0, value));
}

const AMBIENT_FREQUENCIES: Readonly<Record<string, readonly [number, number]>> = {
    lobby: [92, 138],
    'induction-office': [105, 158],
    'simulation-lab': [74, 148],
    'assessment-room': [88, 132],
};

function readAudioPreference(): SavedAudioPreference {
    if (typeof window === 'undefined') return DEFAULT_PREFERENCE;
    try {
        const saved: unknown = JSON.parse(window.localStorage.getItem(AUDIO_STORAGE_KEY) ?? 'null');
        if (!saved || typeof saved !== 'object') return DEFAULT_PREFERENCE;
        const candidate = saved as Partial<SavedAudioPreference> & { volume?: unknown };
        if (typeof candidate.muted !== 'boolean') {
            return DEFAULT_PREFERENCE;
        }
        const legacyVolume = typeof candidate.volume === 'number' ? candidate.volume : null;
        return {
            muted: candidate.muted,
            ambientVolume: clampVolume(
                typeof candidate.ambientVolume === 'number'
                    ? candidate.ambientVolume
                    : legacyVolume ?? DEFAULT_PREFERENCE.ambientVolume,
            ),
            voiceVolume: clampVolume(
                typeof candidate.voiceVolume === 'number'
                    ? candidate.voiceVolume
                    : legacyVolume ?? DEFAULT_PREFERENCE.voiceVolume,
            ),
            narrationEnabled: typeof candidate.narrationEnabled === 'boolean'
                ? candidate.narrationEnabled
                : true,
        };
    } catch {
        return DEFAULT_PREFERENCE;
    }
}

function createAudioGraph(zoneId: string): CampusAudioGraph | null {
    if (typeof window === 'undefined' || !window.AudioContext) return null;
    const context = new AudioContext();
    const master = context.createGain();
    const ambience = context.createGain();
    const frequencies = AMBIENT_FREQUENCIES[zoneId] ?? AMBIENT_FREQUENCIES.lobby;
    const oscillators = frequencies.map((frequency, index) => {
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        oscillator.type = index === 0 ? 'sine' : 'triangle';
        oscillator.frequency.value = frequency;
        filter.type = 'lowpass';
        filter.frequency.value = 240;
        gain.gain.value = index === 0 ? 0.035 : 0.012;
        oscillator.connect(filter).connect(gain).connect(ambience);
        oscillator.start();
        return oscillator;
    });
    ambience.connect(master).connect(context.destination);
    return { context, master, ambience, oscillators, lastStepAt: 0 };
}

export function useCampusAudio(zoneId: string) {
    const [preference, setPreference] = useState<SavedAudioPreference>(readAudioPreference);
    const [started, setStarted] = useState(false);
    const [ducked, setDucked] = useState(false);
    const graphRef = useRef<CampusAudioGraph | null>(null);

    useEffect(() => {
        try {
            window.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(preference));
        } catch {
            // La preferencia permanece en memoria cuando el almacenamiento no está disponible.
        }
        const graph = graphRef.current;
        if (graph) {
            graph.master.gain.setTargetAtTime(
                preference.muted ? 0 : preference.ambientVolume * (ducked ? 0.2 : 1),
                graph.context.currentTime,
                0.025,
            );
        }
    }, [ducked, preference]);

    useEffect(() => {
        const graph = graphRef.current;
        if (!graph) return;
        const frequencies = AMBIENT_FREQUENCIES[zoneId] ?? AMBIENT_FREQUENCIES.lobby;
        graph.oscillators.forEach((oscillator, index) => {
            oscillator.frequency.setTargetAtTime(
                frequencies[index] ?? frequencies[0],
                graph.context.currentTime,
                0.35,
            );
        });
    }, [zoneId]);

    useEffect(() => () => {
        const graph = graphRef.current;
        graphRef.current = null;
        if (graph) void graph.context.close();
    }, []);

    const start = useCallback(async () => {
        let graph = graphRef.current;
        if (!graph) {
            graph = createAudioGraph(zoneId);
            graphRef.current = graph;
        }
        if (!graph) return;
        await graph.context.resume();
        graph.master.gain.setValueAtTime(
            preference.muted ? 0 : preference.ambientVolume,
            graph.context.currentTime,
        );
        setStarted(true);
    }, [preference.ambientVolume, preference.muted, zoneId]);

    const playEffect = useCallback((effect: CampusSoundEffect) => {
        const graph = graphRef.current;
        if (!graph || graph.context.state !== 'running' || preference.muted) return;
        const now = graph.context.currentTime;
        if (effect === 'step' && now - graph.lastStepAt < 0.28) return;
        if (effect === 'step') graph.lastStepAt = now;

        const oscillator = graph.context.createOscillator();
        const gain = graph.context.createGain();
        const settings = {
            confirm: { start: 520, end: 760, duration: 0.16, volume: 0.16 },
            denied: { start: 170, end: 105, duration: 0.24, volume: 0.13 },
            door: { start: 260, end: 430, duration: 0.22, volume: 0.11 },
            step: { start: 92, end: 58, duration: 0.08, volume: 0.045 },
        }[effect];
        oscillator.type = effect === 'step' ? 'square' : 'sine';
        oscillator.frequency.setValueAtTime(settings.start, now);
        oscillator.frequency.exponentialRampToValueAtTime(settings.end, now + settings.duration);
        gain.gain.setValueAtTime(settings.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
        oscillator.connect(gain).connect(graph.master);
        oscillator.start(now);
        oscillator.stop(now + settings.duration);
    }, [preference.muted]);

    return {
        started,
        muted: preference.muted,
        ambientVolume: preference.ambientVolume,
        voiceVolume: preference.voiceVolume,
        narrationEnabled: preference.narrationEnabled,
        start,
        playEffect,
        setDucked,
        setMuted: (muted: boolean) => setPreference((current) => ({ ...current, muted })),
        setAmbientVolume: (ambientVolume: number) => setPreference((current) => ({
            ...current,
            ambientVolume: clampVolume(ambientVolume),
        })),
        setVoiceVolume: (voiceVolume: number) => setPreference((current) => ({
            ...current,
            voiceVolume: clampVolume(voiceVolume),
        })),
        setNarrationEnabled: (narrationEnabled: boolean) => setPreference((current) => ({
            ...current,
            narrationEnabled,
        })),
    };
}
