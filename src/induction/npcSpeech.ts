import type { InductionActivity } from './inductionActivities';

export const NPC_SPEECH_SPEED_OPTIONS = [
    { value: 'slow', label: 'Lenta', intervalMs: 40 },
    { value: 'normal', label: 'Normal', intervalMs: 22 },
    { value: 'fast', label: 'Rápida', intervalMs: 14 },
] as const;

export type NpcSpeechSpeed = (typeof NPC_SPEECH_SPEED_OPTIONS)[number]['value'];

export const DEFAULT_NPC_SPEECH_SPEED: NpcSpeechSpeed = 'normal';
export const NPC_TEXT_REVEAL_INTERVAL_MS = NPC_SPEECH_SPEED_OPTIONS[1].intervalMs;
export const NPC_BUBBLE_PAUSE_MS = 650;

export function isNpcSpeechSpeed(value: string | null): value is NpcSpeechSpeed {
    return NPC_SPEECH_SPEED_OPTIONS.some((option) => option.value === value);
}

export function getNpcSpeechRevealInterval(speed: NpcSpeechSpeed): number {
    return NPC_SPEECH_SPEED_OPTIONS.find((option) => option.value === speed)?.intervalMs
        ?? NPC_TEXT_REVEAL_INTERVAL_MS;
}

export type NpcSpeechBubble = {
    id: string;
    kind: 'greeting' | 'explanation' | 'key-point';
    label: string;
    text: string;
};

export type ActiveNpcSpeech = {
    stationId: string;
    bubbleId: string;
    kind: NpcSpeechBubble['kind'];
    label: string;
    visibleText: string;
    fullText: string;
    typing: boolean;
};

export function buildNpcSpeechBubbles(
    activity: InductionActivity,
    lessonIndex: number,
): NpcSpeechBubble[] {
    const lesson = activity.training.lessons[lessonIndex];
    if (!lesson) return [];

    return [
        ...(lessonIndex === 0 ? [{
            id: `${lesson.id}-greeting`,
            kind: 'greeting' as const,
            label: 'Bienvenida',
            text: activity.training.greeting,
        }] : []),
        {
            id: `${lesson.id}-explanation`,
            kind: 'explanation' as const,
            label: lesson.title,
            text: lesson.explanation,
        },
        {
            id: `${lesson.id}-key-point`,
            kind: 'key-point' as const,
            label: 'Recuerda',
            text: lesson.keyPoint,
        },
    ];
}
