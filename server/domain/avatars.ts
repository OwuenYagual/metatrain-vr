export const AVATAR_IDS = ['avatar_01', 'avatar_02', 'avatar_03'] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export type AvatarOption = {
    id: AvatarId;
    label: string;
    modelUrl: string;
};

const LOCAL_AVATAR_BASE_URL = '/models/avatars';

export const AVAILABLE_AVATARS: readonly AvatarOption[] = Object.freeze([
    {
        id: 'avatar_01',
        label: 'Avatar corporativo A',
        modelUrl: `${LOCAL_AVATAR_BASE_URL}/avatar_01.glb`,
    },
    {
        id: 'avatar_02',
        label: 'Avatar corporativo B',
        modelUrl: `${LOCAL_AVATAR_BASE_URL}/avatar_02.glb`,
    },
    {
        id: 'avatar_03',
        label: 'Avatar corporativo C',
        modelUrl: `${LOCAL_AVATAR_BASE_URL}/avatar_03.glb`,
    },
]);

export function isAvatarId(value: unknown): value is AvatarId {
    return typeof value === 'string' && AVATAR_IDS.some((avatarId) => avatarId === value);
}
