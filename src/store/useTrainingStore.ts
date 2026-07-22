import { create } from 'zustand';
import type { Content } from '../content/contentService';
import type { ActiveNpcSpeech } from '../induction/npcSpeech';

type TrainingState = {
    contents: Content[];
    activeContent: Content | null;
    activeNpcSpeech: ActiveNpcSpeech | null;
    completedContentIds: string[];
    setContents: (contents: Content[]) => void;
    setActiveContent: (content: Content | null) => void;
    setActiveNpcSpeech: (speech: ActiveNpcSpeech | null) => void;
    setCompletedContentIds: (contentIds: string[]) => void;
};

export const useTrainingStore = create<TrainingState>((set) => ({
    contents: [],
    activeContent: null,
    activeNpcSpeech: null,
    completedContentIds: [],
    setContents: (contents) => set({ contents }),
    setActiveContent: (activeContent) => set({ activeContent, activeNpcSpeech: null }),
    setActiveNpcSpeech: (activeNpcSpeech) => set({ activeNpcSpeech }),
    setCompletedContentIds: (contentIds) => set({ completedContentIds: [...new Set(contentIds)] }),
}));
