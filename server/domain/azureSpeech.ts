import { env } from '../config/env';
import type { NarrationDescriptor, TranscriptionResult } from '../../shared/speech';
import { escapeSsml } from './ssml';

const AZURE_REQUEST_TIMEOUT_MS = 20_000;

function configuredVoice(descriptor: NarrationDescriptor): string {
    return descriptor.voice.voiceName.includes('Luis')
        ? env.azureSpeechMaleVoice
        : env.azureSpeechFemaleVoice;
}

export function buildNarrationSsml(descriptor: NarrationDescriptor): string {
    const voiceName = configuredVoice(descriptor);
    const rate = `${descriptor.voice.ratePercent >= 0 ? '+' : ''}${descriptor.voice.ratePercent}%`;
    const pitch = `${descriptor.voice.pitchPercent >= 0 ? '+' : ''}${descriptor.voice.pitchPercent}%`;
    return `<speak version="1.0" xml:lang="es-EC"><voice name="${escapeSsml(voiceName)}"><prosody rate="${rate}" pitch="${pitch}">${escapeSsml(descriptor.text)}</prosody></voice></speak>`;
}

async function azureFetch(endpoint: string, path: string, init: RequestInit): Promise<Response> {
    if (!env.speechEnabled) throw new Error('Azure Speech no está configurado.');
    const response = await fetch(`${endpoint}${path}`, {
        ...init,
        signal: AbortSignal.timeout(AZURE_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`Azure Speech respondió ${response.status}${detail ? `: ${detail}` : '.'}`);
    }
    return response;
}

export async function synthesizeNarration(descriptor: NarrationDescriptor): Promise<Buffer> {
    const response = await azureFetch(env.azureSpeechTtsEndpoint, '/cognitiveservices/v1', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/ssml+xml',
            'Ocp-Apim-Subscription-Key': env.azureSpeechKey,
            'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
            'User-Agent': 'MetaTrain-VR',
        },
        body: buildNarrationSsml(descriptor),
    });
    return Buffer.from(await response.arrayBuffer());
}

type AzureTranscriptionPayload = {
    combinedPhrases?: Array<{ text?: unknown; confidence?: unknown }>;
};

export async function transcribeEvaluationAnswer(
    audio: Buffer,
    mimeType: string,
): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append('audio', new Blob([audio], { type: mimeType }), `answer.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`);
    form.append('definition', JSON.stringify({ locales: ['es-EC'] }));
    const response = await azureFetch(
        env.azureSpeechEndpoint,
        `/speechtotext/transcriptions:transcribe?api-version=${encodeURIComponent(env.azureSpeechApiVersion)}`,
        {
            method: 'POST',
            headers: { 'Ocp-Apim-Subscription-Key': env.azureSpeechKey },
            body: form,
        },
    );
    const payload = await response.json() as AzureTranscriptionPayload;
    const phrase = payload.combinedPhrases?.find((candidate) => (
        typeof candidate.text === 'string' && candidate.text.trim().length > 0
    ));
    if (!phrase || typeof phrase.text !== 'string') {
        return { transcript: '' };
    }
    return {
        transcript: phrase.text.trim(),
        ...(typeof phrase.confidence === 'number' ? { confidence: phrase.confidence } : {}),
    };
}
