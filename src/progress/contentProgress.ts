export type ContentProgressSummary = {
    completedCount: number;
    totalCount: number;
    percentage: number;
};

export function calculateProgress(
    availableItemIds: readonly string[],
    completedItemIds: readonly string[],
): ContentProgressSummary {
    const availableIds = new Set(availableItemIds);
    const completedIds = new Set(
        completedItemIds.filter((itemId) => availableIds.has(itemId)),
    );
    const totalCount = availableIds.size;
    const completedCount = completedIds.size;

    return {
        completedCount,
        totalCount,
        percentage: totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100),
    };
}

export const calculateContentProgress = calculateProgress;
