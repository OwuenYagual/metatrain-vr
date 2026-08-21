import { INDUCTION_ACTIVITIES } from './inductionActivities';
import { CAMPUS_GUIDE_OBJECT_ID, type CampusZoneId } from './campus';
import {
    SIMULATION_STAGE_CATALOG,
    SIMULATION_STAGE_IDS,
    type SimulationStageId,
} from './simulation';
import { TRAINING_STATIONS } from './trainingModule';

export const SPEECH_LOCALE = 'es-EC';
export const MAX_TRANSCRIPTION_BYTES = 1024 * 1024;
export const MAX_RECORDING_SECONDS = 8;
export const CAMPUS_GUIDE_BUBBLE_ID = 'campus-guide-welcome';
export const EVALUATION_NPC_STATION_ID = 'npc-evaluation';
export const EVALUATION_RESPONSE_INSTRUCTION = 'Responde solo con la letra de la opción.';
export const EVALUATION_RESPONSE_PROMPT = '¿Cuál es tu respuesta?';
const SIMULATION_GUIDE_STATION_PREFIX = 'sim-guide-';
const SIMULATION_GUIDE_BUBBLE_SUFFIX = '-briefing';

export function getSimulationGuideStationId(stageId: SimulationStageId): string {
    return `${SIMULATION_GUIDE_STATION_PREFIX}${stageId}`;
}

export function getSimulationGuideBubbleId(stageId: SimulationStageId): string {
    return `${stageId}${SIMULATION_GUIDE_BUBBLE_SUFFIX}`;
}

export function getSimulationGuideStageId(stationId: string): SimulationStageId | null {
    if (!stationId.startsWith(SIMULATION_GUIDE_STATION_PREFIX)) return null;
    const stageId = stationId.slice(SIMULATION_GUIDE_STATION_PREFIX.length);
    return SIMULATION_STAGE_IDS.find((candidate) => candidate === stageId) ?? null;
}
export const CAMPUS_GUIDE_DIALOGUE = 'Bienvenido al campus. Comienza en el Centro de inducción, continúa en el Laboratorio de simulación y finaliza en la Sala de evaluación. Acércate a cada acceso para consultar cuándo está disponible.';

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
    zoneId: CampusZoneId;
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
    [CAMPUS_GUIDE_OBJECT_ID]: { voiceName: 'es-EC-LuisNeural', ratePercent: -3, pitchPercent: 0 },
    obj_manual: { voiceName: 'es-EC-AndreaNeural', ratePercent: 0, pitchPercent: 0 },
    obj_rrhh: { voiceName: 'es-EC-AndreaNeural', ratePercent: -4, pitchPercent: -2 },
    obj_funciones: { voiceName: 'es-EC-LuisNeural', ratePercent: -2, pitchPercent: 0 },
    obj_seguridad: { voiceName: 'es-EC-AndreaNeural', ratePercent: 2, pitchPercent: 2 },
    [getSimulationGuideStationId('data_protection')]: { voiceName: 'es-EC-AndreaNeural', ratePercent: -2, pitchPercent: 0 },
    [getSimulationGuideStationId('human_resources')]: { voiceName: 'es-EC-AndreaNeural', ratePercent: -3, pitchPercent: -1 },
    [getSimulationGuideStationId('operations')]: { voiceName: 'es-EC-LuisNeural', ratePercent: -2, pitchPercent: 0 },
    [getSimulationGuideStationId('workplace_safety')]: { voiceName: 'es-EC-AndreaNeural', ratePercent: 0, pitchPercent: 1 },
    [EVALUATION_NPC_STATION_ID]: { voiceName: 'es-EC-AndreaNeural', ratePercent: -3, pitchPercent: 0 },
};

export function getNpcVoiceProfile(stationId: string): NpcVoiceProfile | null {
    const station = TRAINING_STATIONS.find(({ id }) => id === stationId);
    const simulationStageId = getSimulationGuideStageId(stationId);
    const simulationStage = SIMULATION_STAGE_CATALOG.find(({ id }) => id === simulationStageId);
    const profile = VOICE_PROFILES[stationId];
    const guideName = stationId === CAMPUS_GUIDE_OBJECT_ID
        ? 'Guía del campus'
        : stationId === EVALUATION_NPC_STATION_ID
            ? 'Guía de evaluación'
            : station?.guide.name ?? simulationStage?.guide.name;
    if (!guideName || !profile) return null;
    return {
        stationId,
        guideName,
        ...profile,
    };
}

const EVALUATION_OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function buildEvaluationNarrationText(question: {
    text: string;
    options: readonly { text: string }[];
}): string {
    const options = question.options.map((option, index) => (
        `Opción ${EVALUATION_OPTION_LABELS[index] ?? index + 1}: ${option.text}.`
    ));
    return [
        question.text,
        ...options,
        EVALUATION_RESPONSE_INSTRUCTION,
        EVALUATION_RESPONSE_PROMPT,
    ].join(' ');
}

export function resolveNarration(
    stationId: string,
    bubbleId: string,
): NarrationDescriptor | null {
    const voice = getNpcVoiceProfile(stationId);
    if (!voice) return null;
    if (stationId === CAMPUS_GUIDE_OBJECT_ID) {
        if (bubbleId !== CAMPUS_GUIDE_BUBBLE_ID) return null;
        return {
            zoneId: 'lobby',
            stationId,
            bubbleId,
            kind: 'greeting',
            label: 'Orientación del campus',
            text: CAMPUS_GUIDE_DIALOGUE,
            voice,
        };
    }

    const simulationStageId = getSimulationGuideStageId(stationId);
    const simulationStage = SIMULATION_STAGE_CATALOG.find(({ id }) => id === simulationStageId);
    if (simulationStageId && simulationStage) {
        if (bubbleId !== getSimulationGuideBubbleId(simulationStageId)) return null;
        return {
            zoneId: 'simulation-lab',
            stationId,
            bubbleId,
            kind: 'explanation',
            label: simulationStage.title,
            text: simulationStage.guide.introduction,
            voice,
        };
    }

    const activity = INDUCTION_ACTIVITIES[stationId];
    if (!activity) return null;

    for (const [lessonIndex, lesson] of activity.training.lessons.entries()) {
        if (lessonIndex === 0 && bubbleId === `${lesson.id}-greeting`) {
            return {
                zoneId: 'induction-office',
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
                zoneId: 'induction-office',
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
                zoneId: 'induction-office',
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
    ['uno', 'un', 'primera', 'primero', 'a', 'ah'],
    ['dos', 'segunda', 'segundo', 'b', 'be', 've'],
    ['tres', 'tercera', 'tercero', 'c', 'ce'],
    ['cuatro', 'cuarta', 'cuarto', 'd', 'de'],
    ['cinco', 'quinta', 'quinto', 'e', 'eh'],
] as const;

function spokenOptionIndex(normalized: string): number | null {
    const match = normalized.match(/(?:opcion|respuesta|alternativa|numero)\s+([a-z0-9]+)/);
    const standaloneLetter = SPOKEN_INDEXES.some((tokens) => tokens.includes(normalized as never));
    const token = match?.[1]
        ?? (/^[1-5]$/.test(normalized) || standaloneLetter ? normalized : null);
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
