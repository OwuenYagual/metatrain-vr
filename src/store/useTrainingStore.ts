import { create } from 'zustand';
import type { Content } from '../content/contentService';

type TrainingState = {
    contents: Content[];
    activeContent: Content | null;
    setContents: (contents: Content[]) => void;
    setActiveContent: (content: Content | null) => void;
};

export const useTrainingStore = create<TrainingState>((set) => ({
    contents: [],
    activeContent: null,
    setContents: (contents) => set({ contents }),
    setActiveContent: (activeContent) => set({ activeContent }),
}));
