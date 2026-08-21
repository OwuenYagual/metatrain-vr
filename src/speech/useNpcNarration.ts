import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveNpcSpeech } from '../induction/npcSpeech';
import { getErrorMessage } from '../api/apiClient';
import { speechService } from './speechService';

export type NpcNarrationState = {
    available: boolean | null;
    status: 'idle' | 'loading' | 'playing' | 'error';
    error: string;
    replay: () => void;
    stop: () => void;
};

export function useNpcNarration({
    speech,
    audioStarted,
    muted,
    enabled,
    voiceVolume,
    onDuckedChange,
}: {
    speech: ActiveNpcSpeech | null;
    audioStarted: boolean;
    muted: boolean;
    enabled: boolean;
    voiceVolume: number;
    onDuckedChange: (ducked: boolean) => void;
}): NpcNarrationState {
    const [available, setAvailable] = useState<boolean | null>(null);
    const [status, setStatus] = useState<NpcNarrationState['status']>('idle');
    const [error, setError] = useState('');
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastAutomaticKeyRef = useRef('');
    const requestIdRef = useRef(0);
    const stationId = speech?.stationId ?? '';
    const bubbleId = speech?.bubbleId ?? '';
    const nextBubbleId = speech?.nextBubbleId;
    const zoneId = speech?.zoneId;

    useEffect(() => {
        const controller = new AbortController();
        speechService.getCapabilities(controller.signal)
            .then((capabilities) => setAvailable(capabilities.narrationAvailable))
            .catch(() => setAvailable(false));
        return () => controller.abort();
    }, []);

    const stop = useCallback(() => {
        requestIdRef.current += 1;
        const audio = audioRef.current;
        audioRef.current = null;
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
        }
        onDuckedChange(false);
        setStatus('idle');
    }, [onDuckedChange]);

    const play = useCallback(async (automatic: boolean) => {
        if (!stationId || !bubbleId || !available || !audioStarted || muted || !enabled) return;
        const key = `${stationId}:${bubbleId}`;
        if (automatic && lastAutomaticKeyRef.current === key) return;
        if (automatic) lastAutomaticKeyRef.current = key;
        stop();
        const requestId = requestIdRef.current;
        setError('');
        setStatus('loading');
        try {
            const source = await speechService.getNarration(stationId, bubbleId, zoneId);
            if (requestIdRef.current !== requestId) return;
            const audio = new Audio(source);
            audio.volume = voiceVolume;
            audioRef.current = audio;
            audio.onplaying = () => {
                setStatus('playing');
                onDuckedChange(true);
            };
            audio.onended = () => {
                audioRef.current = null;
                onDuckedChange(false);
                setStatus('idle');
            };
            audio.onerror = () => {
                audioRef.current = null;
                onDuckedChange(false);
                setStatus('error');
                setError('No se pudo reproducir la narración.');
            };
            await audio.play();
            if (nextBubbleId) {
                void speechService.preloadNarration(stationId, nextBubbleId, zoneId).catch(() => undefined);
            }
        } catch (requestError: unknown) {
            if (requestIdRef.current !== requestId) return;
            setStatus('error');
            setError(getErrorMessage(requestError, 'No se pudo cargar la narración.'));
            onDuckedChange(false);
        }
    }, [audioStarted, available, bubbleId, enabled, muted, nextBubbleId, onDuckedChange, stationId, stop, voiceVolume, zoneId]);

    useEffect(() => {
        void play(true);
        return stop;
    }, [play, stop]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = muted ? 0 : voiceVolume;
        if (!muted && enabled) return undefined;
        const frame = window.requestAnimationFrame(stop);
        return () => window.cancelAnimationFrame(frame);
    }, [enabled, muted, stop, voiceVolume]);

    return {
        available,
        status,
        error,
        replay: () => void play(false),
        stop,
    };
}
