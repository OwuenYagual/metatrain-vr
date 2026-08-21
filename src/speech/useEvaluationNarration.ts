import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../api/apiClient';
import type { EvaluationQuestion } from '../evaluation/evaluationService';
import { speechService } from './speechService';

export type EvaluationNarrationState = {
    activeQuestionId: string | null;
    status: 'idle' | 'loading' | 'playing' | 'error';
    error: string;
    play: (question: EvaluationQuestion, onEnded: () => void) => void;
    stop: () => void;
};

export function useEvaluationNarration({
    enabled,
    volume,
    onDuckedChange,
}: {
    enabled: boolean;
    volume: number;
    onDuckedChange: (ducked: boolean) => void;
}): EvaluationNarrationState {
    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
    const [status, setStatus] = useState<EvaluationNarrationState['status']>('idle');
    const [error, setError] = useState('');
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const requestIdRef = useRef(0);

    const stop = useCallback(() => {
        requestIdRef.current += 1;
        const audio = audioRef.current;
        audioRef.current = null;
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
        }
        onDuckedChange(false);
        setActiveQuestionId(null);
        setStatus('idle');
    }, [onDuckedChange]);

    const play = useCallback((question: EvaluationQuestion, onEnded: () => void) => {
        if (!enabled) return;
        stop();
        const requestId = requestIdRef.current;
        setActiveQuestionId(question.id);
        setError('');
        setStatus('loading');

        void speechService.getEvaluationNarration(question.id)
            .then(async (source) => {
                if (requestIdRef.current !== requestId) return;
                const audio = new Audio(source);
                audio.volume = volume;
                audioRef.current = audio;
                audio.onplaying = () => {
                    if (requestIdRef.current !== requestId) return;
                    setStatus('playing');
                    onDuckedChange(true);
                };
                audio.onended = () => {
                    if (requestIdRef.current !== requestId) return;
                    audioRef.current = null;
                    onDuckedChange(false);
                    setStatus('idle');
                    onEnded();
                };
                audio.onerror = () => {
                    if (requestIdRef.current !== requestId) return;
                    audioRef.current = null;
                    onDuckedChange(false);
                    setStatus('error');
                    setError('No se pudo reproducir la pregunta narrada.');
                };
                await audio.play();
            })
            .catch((requestError: unknown) => {
                if (requestIdRef.current !== requestId) return;
                audioRef.current = null;
                onDuckedChange(false);
                setStatus('error');
                setError(getErrorMessage(requestError, 'No se pudo cargar la pregunta narrada.'));
            });
    }, [enabled, onDuckedChange, stop, volume]);

    useEffect(() => stop, [stop]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
        if (enabled) return undefined;
        const frame = window.requestAnimationFrame(stop);
        return () => window.cancelAnimationFrame(frame);
    }, [enabled, stop, volume]);

    return { activeQuestionId, status, error, play, stop };
}
