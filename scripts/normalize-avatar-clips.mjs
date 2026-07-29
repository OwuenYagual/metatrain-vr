import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const JSON_CHUNK_TYPE = 0x4e4f534a;
const CLIP_NAMES = new Map([
    ['idle', 'Idle'],
    ['walk', 'Walk'],
    ['sprint', 'Run'],
    ['Idle', 'Idle'],
    ['Walk', 'Walk'],
    ['Run', 'Run'],
]);

async function normalizeAvatar(assetPath) {
    const source = await readFile(assetPath);
    if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2) {
        throw new Error(`${assetPath} no es un archivo GLB 2 válido.`);
    }

    const chunks = [];
    let offset = 12;
    while (offset < source.length) {
        const length = source.readUInt32LE(offset);
        const type = source.readUInt32LE(offset + 4);
        const data = Buffer.from(source.subarray(offset + 8, offset + 8 + length));
        chunks.push({ type, data });
        offset += 8 + length;
    }

    const jsonChunk = chunks.find(({ type }) => type === JSON_CHUNK_TYPE);
    if (!jsonChunk) throw new Error(`${assetPath} no contiene un manifiesto JSON.`);
    const manifest = JSON.parse(jsonChunk.data.toString('utf8').trimEnd());
    for (const animation of manifest.animations ?? []) {
        const canonicalName = CLIP_NAMES.get(animation.name);
        if (canonicalName) animation.name = canonicalName;
    }
    const availableNames = new Set((manifest.animations ?? []).map(({ name }) => name));
    for (const requiredName of ['Idle', 'Walk', 'Run']) {
        if (!availableNames.has(requiredName)) {
            throw new Error(`${assetPath} no contiene la animación ${requiredName}.`);
        }
    }

    const json = Buffer.from(JSON.stringify(manifest), 'utf8');
    const padding = (4 - json.length % 4) % 4;
    jsonChunk.data = Buffer.concat([json, Buffer.alloc(padding, 0x20)]);

    const totalLength = 12 + chunks.reduce((total, chunk) => total + 8 + chunk.data.length, 0);
    const output = Buffer.alloc(totalLength);
    output.writeUInt32LE(0x46546c67, 0);
    output.writeUInt32LE(2, 4);
    output.writeUInt32LE(totalLength, 8);
    offset = 12;
    for (const chunk of chunks) {
        output.writeUInt32LE(chunk.data.length, offset);
        output.writeUInt32LE(chunk.type, offset + 4);
        chunk.data.copy(output, offset + 8);
        offset += 8 + chunk.data.length;
    }
    await writeFile(assetPath, output);
}

for (const avatarId of ['avatar_01', 'avatar_02', 'avatar_03']) {
    await normalizeAvatar(resolve('public/models/avatars', `${avatarId}.glb`));
}
