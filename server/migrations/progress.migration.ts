import TrainingProgress, {
    LEGACY_MODULE_VERSION,
    LEGACY_WORLD_VERSION,
} from '../models/progress.model';

const LEGACY_INDEX_NAME = 'participantId_1_moduleId_1';
const VERSIONED_INDEX_NAME = 'participant_module_curriculum_unique';

export async function migrateLegacyProgress(): Promise<void> {
    await TrainingProgress.updateMany(
        {
            $or: [
                { moduleVersion: { $exists: false } },
                { worldVersion: { $exists: false } },
                { processedClientEventIds: { $exists: false } },
            ],
        },
        [
            {
                $set: {
                    moduleVersion: { $ifNull: ['$moduleVersion', LEGACY_MODULE_VERSION] },
                    worldVersion: { $ifNull: ['$worldVersion', LEGACY_WORLD_VERSION] },
                    processedClientEventIds: { $ifNull: ['$processedClientEventIds', []] },
                },
            },
        ],
    );

    await TrainingProgress.collection.createIndex(
        { participantId: 1, moduleId: 1, moduleVersion: 1 },
        { unique: true, name: VERSIONED_INDEX_NAME },
    );

    const indexes = await TrainingProgress.collection.indexes();
    if (indexes.some((index) => index.name === LEGACY_INDEX_NAME)) {
        await TrainingProgress.collection.dropIndex(LEGACY_INDEX_NAME);
    }
}
