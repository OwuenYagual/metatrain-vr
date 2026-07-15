import { create } from 'zustand';
import type { Content } from '../content/contentService';

type TrainingState = {
    contents: Content[];
    activeContent: Content | null;
    completedContentIds: string[];
    visitedCheckpointIds: string[];
    setContents: (contents: Content[]) => void;
    setActiveContent: (content: Content | null) => void;
    setCompletedContentIds: (contentIds: string[]) => void;
    setVisitedCheckpointIds: (checkpointIds: string[]) => void;
};

export const useTrainingStore = create<TrainingState>((set) => ({
    contents: [],
    activeContent: null,
    completedContentIds: [],
    visitedCheckpointIds: [],
    setContents: (contents) => set({ contents }),
    setActiveContent: (activeContent) => set({ activeContent }),
    setCompletedContentIds: (contentIds) => set({ completedContentIds: [...new Set(contentIds)] }),
    setVisitedCheckpointIds: (checkpointIds) => set({ visitedCheckpointIds: [...new Set(checkpointIds)] }),
}));
