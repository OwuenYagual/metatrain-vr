export const AVATAR_IDS = ['avatar_01', 'avatar_02', 'avatar_03'] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export type AvatarOption = {
    id: AvatarId;
    label: string;
    modelUrl: string;
};

const THREE_MODELS_BASE_URL = 'https://threejs.org/examples/models/gltf';

export const AVAILABLE_AVATARS: readonly AvatarOption[] = Object.freeze([
    {
        id: 'avatar_01',
        label: 'Avatar Profesional Alex',
        modelUrl: `${THREE_MODELS_BASE_URL}/readyplayer.me.glb`,
    },
    {
        id: 'avatar_02',
        label: 'Avatar Profesional Michelle',
        modelUrl: `${THREE_MODELS_BASE_URL}/Michelle.glb`,
    },
    {
        id: 'avatar_03',
        label: 'Avatar Profesional X-Bot',
        modelUrl: `${THREE_MODELS_BASE_URL}/Xbot.glb`,
    },
]);

export function isAvatarId(value: unknown): value is AvatarId {
    return typeof value === 'string' && AVATAR_IDS.some((avatarId) => avatarId === value);
}
