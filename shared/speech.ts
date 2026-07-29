import { INDUCTION_ACTIVITIES } from './inductionActivities';
import { TRAINING_STATIONS } from './trainingModule';

export const SPEECH_LOCALE = 'es-EC';
export const MAX_TRANSCRIPTION_BYTES = 1024 * 1024;
export const MAX_RECORDING_SECONDS = 8;

export type SpeechCapabilities = {
    narrationAvailable: boolean;
    transcriptionAvailable: boolean;
    locale: typeof SPEECH_LOCALE;
    maxRecordingBytes: number;
    maxRecordingSeconds: number;
};

export type NpcVoiceProfile = {
    stationId: string;
    guideName: string;
    voiceName: string;
    ratePercent: number;
    pitchPercent: number;
};

export type NarrationDescriptor = {
    stationId: string;
    bubbleId: string;
    kind: 'greeting' | 'explanation' | 'key-point';
    label: string;
    text: string;
    voice: NpcVoiceProfile;
};

export type TranscriptionResult = {
    transcript: string;
    confidence?: number;
};

export type VoiceAnswerProposal = {
    questionId: string;
    optionId: string | null;
    transcript: string;
    status: 'matched' | 'ambiguous' | 'no-match';
};

const VOICE_PROFILES: Record<string, Omit<NpcVoiceProfile, 'stationId' | 'guideName'>> = {
    obj_manual: { voiceName: 'es-EC-AndreaNeural', ratePercent: 0, pitchPercent: 0 },
    obj_rrhh: { voiceName: 'es-EC-AndreaNeural', ratePercent: -4, pitchPercent: -2 },
    obj_funciones: { voiceName: 'es-EC-LuisNeural', ratePercent: -2, pitchPercent: 0 },
    obj_seguridad: { voiceName: 'es-EC-AndreaNeural', ratePercent: 2, pitchPercent: 2 },
    obj_examen: { voiceName: 'es-EC-LuisNeural', ratePercent: 1, pitchPercent: -2 },
};

export function getNpcVoiceProfile(stationId: string): NpcVoiceProfile | null {
    const station = TRAINING_STATIONS.find(({ id }) => id === stationId);
    const profile = VOICE_PROFILES[stationId];
    if (!station || !profile) return null;
    return {
        stationId,
        guideName: station.guide.name,
        ...profile,
    };
}

export function resolveNarration(
    stationId: string,
    bubbleId: string,
): NarrationDescriptor | null {
    const activity = INDUCTION_ACTIVITIES[stationId];
    const voice = getNpcVoiceProfile(stationId);
    if (!activity || !voice) return null;

    for (const [lessonIndex, lesson] of activity.training.lessons.entries()) {
        if (lessonIndex === 0 && bubbleId === `${lesson.id}-greeting`) {
            return {
                stationId,
                bubbleId,
                kind: 'greeting',
                label: 'Bienvenida',
                text: activity.training.greeting,
                voice,
            };
        }
        if (bubbleId === `${lesson.id}-explanation`) {
            return {
                stationId,
                bubbleId,
                kind: 'explanation',
                label: lesson.title,
                text: lesson.explanation,
                voice,
            };
        }
        if (bubbleId === `${lesson.id}-key-point`) {
            return {
                stationId,
                bubbleId,
                kind: 'key-point',
                label: 'Recuerda',
                text: lesson.keyPoint,
                voice,
            };
        }
    }
    return null;
}

export function normalizeSpokenText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const SPOKEN_INDEXES = [
    ['uno', 'un', 'primera', 'primero', 'a'],
    ['dos', 'segunda', 'segundo', 'b'],
    ['tres', 'tercera', 'tercero', 'c'],
    ['cuatro', 'cuarta', 'cuarto', 'd'],
    ['cinco', 'quinta', 'quinto', 'e'],
] as const;

function spokenOptionIndex(normalized: string): number | null {
    const match = normalized.match(/(?:opcion|respuesta|alternativa|numero)\s+([a-z0-9]+)/);
    const token = match?.[1] ?? (/^[1-5]$/.test(normalized) ? normalized : null);
    if (!token) return null;
    if (/^[1-5]$/.test(token)) return Number(token) - 1;
    const index = SPOKEN_INDEXES.findIndex((tokens) => tokens.includes(token as never));
    return index >= 0 ? index : null;
}

function tokenSimilarity(left: string, right: string): number {
    const leftTokens = new Set(left.split(' ').filter(Boolean));
    const rightTokens = new Set(right.split(' ').filter(Boolean));
    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union ? intersection / union : 0;
}

export function proposeVoiceAnswer(
    questionId: string,
    transcript: string,
    options: readonly { id: string; text: string }[],
): VoiceAnswerProposal {
    const normalized = normalizeSpokenText(transcript);
    const optionIndex = spokenOptionIndex(normalized);
    if (optionIndex !== null && options[optionIndex]) {
        return { questionId, optionId: options[optionIndex].id, transcript, status: 'matched' };
    }

    const scores = options
        .map((option) => {
            const optionText = normalizeSpokenText(option.text);
            const exact = normalized === optionText
                || normalized === `la respuesta es ${optionText}`
                || normalized === `respuesta ${optionText}`;
            return { option, score: exact ? 1 : tokenSimilarity(normalized, optionText) };
        })
        .sort((left, right) => right.score - left.score);
    const best = scores[0];
    const second = scores[1];
    if (!best || best.score < 0.6) {
        return { questionId, optionId: null, transcript, status: 'no-match' };
    }
    if (second && best.score - second.score < 0.15) {
        return { questionId, optionId: null, transcript, status: 'ambiguous' };
    }
    return { questionId, optionId: best.option.id, transcript, status: 'matched' };
}
