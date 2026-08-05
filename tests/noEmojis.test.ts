import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import test from 'node:test';

const SOURCE_DIRECTORIES = ['src', 'shared', 'server'];
const TEXT_EXTENSIONS = new Set(['.css', '.ts', '.tsx']);
const EMOJI_PATTERN = /\p{Emoji_Presentation}|\p{Extended_Pictographic}|[\u2600-\u27bf]/u;

function getTextFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return getTextFiles(path);
        return TEXT_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
    });
}

test('el sistema no contiene caracteres emoji', () => {
    const filesWithEmojis = SOURCE_DIRECTORIES
        .flatMap(getTextFiles)
        .filter((path) => EMOJI_PATTERN.test(readFileSync(path, 'utf8')));

    assert.deepEqual(filesWithEmojis, []);
});
