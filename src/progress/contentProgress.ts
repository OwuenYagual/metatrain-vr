export type ContentProgressSummary = {
    completedCount: number;
    totalCount: number;
    percentage: number;
};

export function calculateContentProgress(
    availableContentIds: string[],
    completedContentIds: string[],
): ContentProgressSummary {
    const availableIds = new Set(availableContentIds);
    const completedIds = new Set(
        completedContentIds.filter((contentId) => availableIds.has(contentId)),
    );
    const totalCount = availableIds.size;
    const completedCount = completedIds.size;

    return {
        completedCount,
        totalCount,
        percentage: totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100),
    };
}
