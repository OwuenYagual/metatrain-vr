import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

type GlbJson = {
    animations?: Array<{ name?: string }>;
    images?: Array<{ uri?: string }>;
};

function readGlbJson(path: string): GlbJson {
    const data = readFileSync(path);
    assert.equal(data.toString('ascii', 0, 4), 'glTF');
    const jsonLength = data.readUInt32LE(12);
    const chunkType = data.toString('ascii', 16, 20);
    assert.equal(chunkType, 'JSON');
    return JSON.parse(data.toString('utf8', 20, 20 + jsonLength)) as GlbJson;
}

for (let index = 1; index <= 3; index += 1) {
    const paddedIndex = String(index).padStart(2, '0');
    test(`avatar_${paddedIndex} está alojado localmente y contiene locomoción`, () => {
        const avatarPath = resolve(`public/models/avatars/avatar_${paddedIndex}.glb`);
        assert.equal(existsSync(avatarPath), true);
        const glb = readGlbJson(avatarPath);
        const animationNames = new Set(glb.animations?.map(({ name }) => name));
        assert.equal(animationNames.has('Idle'), true);
        assert.equal(animationNames.has('Walk'), true);
        assert.equal(animationNames.has('Run'), true);

        for (const image of glb.images ?? []) {
            assert.equal(typeof image.uri, 'string');
            assert.equal(existsSync(resolve('public/models/avatars', image.uri!)), true);
        }
    });
}
