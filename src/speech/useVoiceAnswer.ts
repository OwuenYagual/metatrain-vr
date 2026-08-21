import { useCallback, useEffect, useRef, useState } from 'react';
import {
    MAX_RECORDING_SECONDS,
    MAX_TRANSCRIPTION_BYTES,
    proposeVoiceAnswer,
    type SpeechCapabilities,
    type VoiceAnswerProposal,
} from '../../shared/speech';
import { getErrorMessage } from '../api/apiClient';
import type { EvaluationQuestion } from '../evaluation/evaluationService';
import { speechService } from './speechService';

type VoiceAnswerStatus = 'idle' | 'requesting' | 'listening' | 'processing' | 'proposal' | 'error';
type VoiceCaptureMode = 'hold' | 'automatic';

const SILENCE_AFTER_SPEECH_MS = 900;
const VOICE_ACTIVITY_THRESHOLD = 0.035;

function preferredMimeType(): string | null {
    if (typeof MediaRecorder === 'undefined') return null;
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
        .find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

export function useVoiceAnswer(
    onMicrophoneActiveChange: (active: boolean) => void,
    onMatchedAnswer?: (questionId: string, optionId: string, transcript: string) => void,
) {
    const [capabilities, setCapabilities] = useState<SpeechCapabilities | null>(null);
    const [status, setStatus] = useState<VoiceAnswerStatus>('idle');
    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
    const [proposal, setProposal] = useState<VoiceAnswerProposal | null>(null);
    const [error, setError] = useState('');
    const statusRef = useRef<VoiceAnswerStatus>('idle');
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const holdActiveRef = useRef(false);
    const timeoutRef = useRef<number | null>(null);
    const silenceFrameRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const requestGenerationRef = useRef(0);

    useEffect(() => {
        const controller = new AbortController();
        speechService.getCapabilities(controller.signal)
            .then(setCapabilities)
            .catch(() => setCapabilities({
                narrationAvailable: false,
                transcriptionAvailable: false,
                locale: 'es-EC',
                maxRecordingBytes: MAX_TRANSCRIPTION_BYTES,
                maxRecordingSeconds: MAX_RECORDING_SECONDS,
            }));
        return () => controller.abort();
    }, []);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    const releaseResources = useCallback(() => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        if (silenceFrameRef.current !== null) window.cancelAnimationFrame(silenceFrameRef.current);
        silenceFrameRef.current = null;
        if (audioContextRef.current) void audioContextRef.current.close();
        audioContextRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        onMicrophoneActiveChange(false);
    }, [onMicrophoneActiveChange]);

    const cancel = useCallback(() => {
        requestGenerationRef.current += 1;
        holdActiveRef.current = false;
        const recorder = recorderRef.current;
        if (recorder?.state === 'recording') {
            recorder.onstop = null;
            recorder.stop();
        }
        releaseResources();
        chunksRef.current = [];
        setActiveQuestionId(null);
        setProposal(null);
        setError('');
        setStatus('idle');
    }, [releaseResources]);

    useEffect(() => cancel, [cancel]);

    const begin = useCallback(async (
        question: EvaluationQuestion,
        mode: VoiceCaptureMode = 'hold',
    ) => {
        if (statusRef.current === 'requesting'
            || statusRef.current === 'listening'
            || statusRef.current === 'processing') return;
        const mimeType = preferredMimeType();
        if (!capabilities?.transcriptionAvailable || !mimeType || !navigator.mediaDevices?.getUserMedia) {
            setActiveQuestionId(question.id);
            setError('El micrófono por voz no está disponible. Selecciona una opción manualmente.');
            setStatus('error');
            return;
        }
        cancel();
        const generation = requestGenerationRef.current;
        holdActiveRef.current = true;
        setActiveQuestionId(question.id);
        setError('');
        setStatus('requesting');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
            });
            if (generation !== requestGenerationRef.current || !holdActiveRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                setStatus('idle');
                setActiveQuestionId(null);
                return;
            }
            const recorder = new MediaRecorder(stream, { mimeType });
            streamRef.current = stream;
            recorderRef.current = recorder;
            chunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const chunks = chunksRef.current;
                chunksRef.current = [];
                releaseResources();
                const audio = new Blob(chunks, { type: mimeType.split(';')[0] });
                if (audio.size === 0) {
                    setError('No se detectó audio. Intenta responder de nuevo.');
                    setStatus('error');
                    return;
                }
                if (audio.size > capabilities.maxRecordingBytes) {
                    setError('La grabación fue demasiado grande. Responde de forma más breve.');
                    setStatus('error');
                    return;
                }
                setStatus('processing');
                speechService.transcribe(question.id, audio)
                    .then((result) => {
                        if (generation !== requestGenerationRef.current) return;
                        const nextProposal = proposeVoiceAnswer(
                            question.id,
                            result.transcript,
                            question.options,
                        );
                        if (nextProposal.status === 'matched' && nextProposal.optionId) {
                            onMatchedAnswer?.(
                                nextProposal.questionId,
                                nextProposal.optionId,
                                nextProposal.transcript,
                            );
                            cancel();
                            return;
                        }
                        setProposal(nextProposal);
                        setStatus('proposal');
                    })
                    .catch((requestError: unknown) => {
                        if (generation !== requestGenerationRef.current) return;
                        setError(getErrorMessage(requestError, 'No se pudo reconocer la respuesta.'));
                        setStatus('error');
                    });
            };
            recorder.start(200);
            onMicrophoneActiveChange(true);
            setStatus('listening');
            if (mode === 'automatic') {
                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(stream);
                let heardSpeech = false;
                let lastVoiceAt = performance.now();
                analyser.fftSize = 1024;
                const samples = new Float32Array(analyser.fftSize);
                source.connect(analyser);
                audioContextRef.current = audioContext;
                void audioContext.resume();

                const detectSilence = () => {
                    if (recorder.state !== 'recording') return;
                    analyser.getFloatTimeDomainData(samples);
                    const rootMeanSquare = Math.sqrt(
                        samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
                    );
                    const now = performance.now();
                    if (rootMeanSquare >= VOICE_ACTIVITY_THRESHOLD) {
                        heardSpeech = true;
                        lastVoiceAt = now;
                    } else if (heardSpeech && now - lastVoiceAt >= SILENCE_AFTER_SPEECH_MS) {
                        holdActiveRef.current = false;
                        recorder.stop();
                        return;
                    }
                    silenceFrameRef.current = window.requestAnimationFrame(detectSilence);
                };
                silenceFrameRef.current = window.requestAnimationFrame(detectSilence);
            }
            timeoutRef.current = window.setTimeout(() => {
                holdActiveRef.current = false;
                if (recorder.state === 'recording') recorder.stop();
            }, capabilities.maxRecordingSeconds * 1000);
        } catch (requestError: unknown) {
            releaseResources();
            setError(requestError instanceof DOMException && requestError.name === 'NotAllowedError'
                ? 'Permiso de micrófono denegado. Puedes responder manualmente.'
                : getErrorMessage(requestError, 'No se pudo abrir el micrófono.'));
            setStatus('error');
        }
    }, [cancel, capabilities, onMatchedAnswer, onMicrophoneActiveChange, releaseResources]);

    const end = useCallback(() => {
        holdActiveRef.current = false;
        const recorder = recorderRef.current;
        if (recorder?.state === 'recording') recorder.stop();
    }, []);

    return {
        capabilities,
        status,
        activeQuestionId,
        proposal,
        error,
        begin,
        end,
        cancel,
        confirm(onConfirm: (questionId: string, optionId: string) => void) {
            if (!proposal?.optionId || proposal.status !== 'matched') return;
            onConfirm(proposal.questionId, proposal.optionId);
            cancel();
        },
    };
}
